/* ShortsDeck sign-in server — Cloudflare Worker (free plan is enough).
   Keeps Google's long-lived refresh tokens on the server so the app can renew its 1-hour access tokens silently.
   The browser only ever holds an opaque random "link" id; the refresh token and client secret never leave this Worker.

   Bindings (see BACKEND.md):  KV namespace  LINKS
                               secret        GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
                               variable      ALLOWED_ORIGIN   e.g. https://yourname.github.io  (comma-separate several) */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const origins = env => String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

function cors(req, env) {
  const o = req.headers.get('Origin') || '';
  const ok = origins(env).includes(o);
  return { ok, headers: { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } };
}
const json = (body, status, h) => new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, h) });
const bad = (code, message, status, h) => json({ code, message }, status || 400, h);

async function google(params, env) {
  const body = new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, params));
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  let d = {}; try { d = await r.json(); } catch (e) { /* empty */ }
  return { ok: r.ok, status: r.status, data: d };
}
function emailFrom(idToken) {
  try { const p = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.email || ''; } catch (e) { return ''; }
}

export default {
  async fetch(req, env) {
    const c = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    const path = new URL(req.url).pathname;
    if (req.method !== 'POST') return bad('METHOD', 'POST only', 405, c.headers);
    if (!c.ok) return bad('ORIGIN', 'This website is not allowed to use this server.', 403, c.headers);
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.LINKS) return bad('SETUP', 'The server is missing its secrets or KV binding. See BACKEND.md.', 500, c.headers);
    let b = {}; try { b = await req.json(); } catch (e) { return bad('JSON', 'Bad request body.', 400, c.headers); }

    if (path === '/auth/exchange') {
      if (!b.code || typeof b.code !== 'string') return bad('CODE', 'Missing authorization code.', 400, c.headers);
      const g = await google({ code: b.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' }, env);
      if (!g.ok) return bad('GOOGLE_' + (g.data.error || g.status), g.data.error_description || 'Google refused the sign-in.', 400, c.headers);
      if (!g.data.refresh_token) return bad('NO_REFRESH_TOKEN', 'Google did not return long-term access because this app was approved before. Open myaccount.google.com/permissions, remove ShortsDeck, then connect again.', 409, c.headers);
      const link = hex(32), email = emailFrom(g.data.id_token || '');
      await env.LINKS.put('l:' + link, JSON.stringify({ rt: g.data.refresh_token, email, at: Date.now() }));
      return json({ link, access_token: g.data.access_token, expires_in: g.data.expires_in, email }, 200, c.headers);
    }
    if (path === '/auth/refresh') {
      const raw = typeof b.link === 'string' && /^[0-9a-f]{64}$/.test(b.link) ? await env.LINKS.get('l:' + b.link) : null;
      if (!raw) return bad('LINK_UNKNOWN', 'This connection is unknown. Reconnect the channel.', 404, c.headers);
      const rec = JSON.parse(raw);
      const g = await google({ refresh_token: rec.rt, grant_type: 'refresh_token' }, env);
      if (!g.ok) {
        if (g.data.error === 'invalid_grant') { await env.LINKS.delete('l:' + b.link); return bad('LINK_REVOKED', 'Google access was removed. Reconnect the channel.', 401, c.headers); }
        return bad('GOOGLE_' + (g.data.error || g.status), 'Google could not renew the session. Try again shortly.', 502, c.headers);
      }
      return json({ access_token: g.data.access_token, expires_in: g.data.expires_in }, 200, c.headers);
    }
    if (path === '/auth/revoke') {
      const raw = typeof b.link === 'string' && /^[0-9a-f]{64}$/.test(b.link) ? await env.LINKS.get('l:' + b.link) : null;
      if (raw) {
        const rec = JSON.parse(raw);
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: rec.rt }) }).catch(() => {});
        await env.LINKS.delete('l:' + b.link);
      }
      return json({ ok: true }, 200, c.headers);
    }
    return bad('NOT_FOUND', 'Unknown path.', 404, c.headers);
  }
};
