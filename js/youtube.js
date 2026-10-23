/* youtube.js — YouTube Data API v3 / YouTube Analytics API / Google OAuth integration layer.
   This is the ONLY file that talks to Google. Everything else calls these functions.

   HONESTY RULES
   • No function here ever returns ok:true unless Google actually answered with success.
   • When the API is not configured (no OAuth client ID) every call returns the DEMO result:
        { ok:false, demo:true, code:'DEMO_MODE', message:'Demo mode — connect YouTube to enable this feature.' }
   • Only the 1-hour access token is cached in this browser (so a reload does not sign you out). No password or client secret is ever stored.
   • There is NO client secret anywhere in this app. The browser flow below (Google Identity Services token model)
     only needs the PUBLIC client ID. Refresh tokens, server-side scheduling and 24/7 automation require a backend
     (see README → "What needs a backend"). */
(function (w) {
  'use strict';
  const Store = w.Store;

  const CONFIG = Object.freeze({
    CLIENT_ID: '',                      // ← Optional: paste your PUBLIC OAuth Web client ID (or set it in Settings). NEVER a secret.
    API_BASE: 'https://www.googleapis.com/youtube/v3',
    UPLOAD_BASE: 'https://www.googleapis.com/upload/youtube/v3',
    ANALYTICS_BASE: 'https://youtubeanalytics.googleapis.com/v2',
    GIS_SRC: 'https://accounts.google.com/gsi/client',
    BACKEND_URL: '',                    // ← Optional: your server (token exchange, queued uploads, 24/7 reply bot).
    SCOPES: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'openid', 'email'
    ]
  });
  const SCOPE_INFO = [
    ['Upload videos to your channel', 'youtube.upload'],
    ['Read, reply to and moderate comments', 'youtube.force-ssl'],
    ['View your channel and videos', 'youtube.readonly'],
    ['View YouTube Analytics reports', 'yt-analytics.readonly'],
    ['See which Google account is signed in (email)', 'email']
  ];
  const DEMO_MESSAGE = 'Demo mode — connect YouTube to enable this feature.';
  const DEMO_HINT = 'Connect YouTube to enable this feature.';
  const DEMO = Object.freeze({ ok: false, demo: true, code: 'DEMO_MODE', message: DEMO_MESSAGE });

  const tokens = {};                    // channelId -> { token, exp }   (1-hour access tokens; cached in this browser so a reload doesn't sign you out)
  const fail = (code, message, extra) => Object.assign({ ok: false, code, message }, extra || {});

  const clientId = () => (CONFIG.CLIENT_ID || (Store.settings().clientId || '')).trim();
  const isConfigured = () => !!clientId();
  const backend = () => String(CONFIG.BACKEND_URL || (Store.settings().backendUrl || '')).trim().replace(/\/+$/, '');
  const hasToken = id => !!(tokens[id] && tokens[id].exp > Date.now());
  const isLive = () => Object.keys(tokens).some(hasToken);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- friendly error text ---------- */
  const FRIENDLY = {
    quotaExceeded: 'YouTube\'s daily quota for this Google Cloud project is used up (each upload costs 1,600 of 10,000 units). It resets at midnight Pacific Time.',
    dailyLimitExceeded: 'YouTube\'s daily quota for this Google Cloud project is used up. It resets at midnight Pacific Time.',
    uploadLimitExceeded: 'This channel has reached YouTube\'s daily upload limit. Try again later.',
    rateLimitExceeded: 'Too many requests too quickly. Wait a minute and retry.',
    userRateLimitExceeded: 'Too many requests too quickly. Wait a minute and retry.',
    accessNotConfigured: 'YouTube Data API v3 is not enabled for your Google Cloud project. Enable it in Google Cloud Console → APIs & Services → Library.',
    insufficientPermissions: 'A permission is missing. Reconnect the channel and tick every permission box (especially "Upload videos").',
    forbidden: 'YouTube refused this request. Reconnect the channel, or check that the channel is allowed to upload.',
    youtubeSignupRequired: 'That Google account has no YouTube channel yet.',
    channelClosed: 'This YouTube channel is closed.', channelSuspended: 'This YouTube channel is suspended.', channelNotFound: 'YouTube channel not found.',
    invalidTitle: 'YouTube rejected the title (empty, too long, or contains < >).',
    invalidDescription: 'YouTube rejected the description (over 5,000 bytes — emoji and Hindi letters count as several bytes — or contains < >).',
    invalidTags: 'YouTube rejected the tags (too long in total, or contain < >).',
    invalidCategoryId: 'YouTube rejected the category. Pick another category.',
    invalidVideoMetadata: 'YouTube rejected the video details. Check title, description and tags.',
    invalidPublishAt: 'YouTube rejected the schedule time. Pick a time at least a few minutes ahead.',
    mediaBodyRequired: 'The video file was empty.', unsupportedMediaType: 'YouTube does not accept this file type. Use MP4, MOV or WebM.',
    uploadNotEligible: 'This channel isn\'t eligible to upload. Verify the channel in YouTube Studio.',
    videoNotFound: 'That video no longer exists on YouTube.', unauthorized: 'Authorization expired. Reconnect this channel.', authError: 'Authorization expired. Reconnect this channel.',
    thumbnailsNotAllowed: 'Custom thumbnails need a verified channel (verify at youtube.com/verify).'
  };
  function explain(reason, msg, status) {
    if (reason && FRIENDLY[reason]) return FRIENDLY[reason];
    if (status === 401) return FRIENDLY.unauthorized;
    if (status === 403 && /quota/i.test(msg || '')) return FRIENDLY.quotaExceeded;
    return msg || 'The YouTube API request failed.';
  }
  async function readErr(res) {
    let d = null; try { d = await res.json(); } catch (e) { /* empty */ }
    const err = d && d.error, reason = err && err.errors && err.errors[0] && err.errors[0].reason;
    return { reason, message: explain(reason, err && err.message, res.status) };
  }

  /* ---------- cached session (1 h access tokens only) ---------- */
  const SESS_KEY = 'shortsdeck:v1:sess';
  function loadSess() {
    try {
      const o = JSON.parse(localStorage.getItem(SESS_KEY) || '{}'), now = Date.now();
      Object.keys(o).forEach(id => { if (o[id] && o[id].t && o[id].e > now + 30000 && !tokens[id]) tokens[id] = { token: o[id].t, exp: o[id].e }; });
    } catch (e) { /* storage blocked */ }
  }
  function saveSess() {
    try {
      const o = {}, now = Date.now();
      Object.keys(tokens).forEach(id => { if (tokens[id].exp > now) o[id] = { t: tokens[id].token, e: tokens[id].exp }; });
      localStorage.setItem(SESS_KEY, JSON.stringify(o));
    } catch (e) { /* ignore */ }
  }
  loadSess();

  /* ---------- low-level ---------- */
  function loadGIS() {
    return new Promise((res, rej) => {
      if (w.google && w.google.accounts && w.google.accounts.oauth2) return res();
      const ex = document.querySelector('script[data-gis]');
      if (ex) { ex.addEventListener('load', () => res()); ex.addEventListener('error', () => rej(new Error('GIS failed to load'))); return; }
      const s = document.createElement('script');
      s.src = CONFIG.GIS_SRC; s.async = true; s.defer = true; s.setAttribute('data-gis', '1');
      s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('GIS failed to load')); };
      document.head.appendChild(s);
    });
  }
  function markExpired(token) {
    const ids = Object.keys(tokens).filter(k => tokens[k].token === token);
    ids.forEach(k => { tokens[k].exp = 0; });
    if (ids.length) { saveSess(); document.dispatchEvent(new CustomEvent('yt:auth-expired', { detail: { channelIds: ids } })); }
  }
  /* Returns {ok,token} or an error. Quietly renews first when the saved token is missing/stale and renewal needs no tap. */
  async function guard(channelId) {
    if (!isConfigured() || String(channelId || '').indexOf('demo_') === 0) return DEMO;
    let t = tokens[channelId];
    if ((!t || t.exp - Date.now() < 60000) && getLinks()[channelId]) { await renewOne(channelId, false); t = tokens[channelId]; }
    if (!t || t.exp <= Date.now()) return fail('AUTH_REQUIRED', 'Your YouTube session needs a quick refresh. Tap "Resume" and try again.');
    return { ok: true, token: t.token };
  }
  async function api(path, o) {
    o = o || {};
    const url = new URL((o.base || CONFIG.API_BASE) + path);
    Object.keys(o.params || {}).forEach(k => { if (o.params[k] != null && o.params[k] !== '') url.searchParams.set(k, o.params[k]); });
    const tries = (o.method && o.method !== 'GET') ? 1 : 2;
    let res;
    for (let i = 0; i < tries; i++) {
      try {
        res = await fetch(url.toString(), {
          method: o.method || 'GET',
          headers: Object.assign({ Authorization: 'Bearer ' + o.token, Accept: 'application/json' }, o.body ? { 'Content-Type': 'application/json' } : {}),
          body: o.body ? JSON.stringify(o.body) : undefined
        });
        if (res.status < 500) break;
      } catch (e) { res = null; }
      if (i < tries - 1) await sleep(900);
    }
    if (!res) return fail('NETWORK', 'Network error — check your connection and try again.');
    let data = null; try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = data && data.error;
      const reason = err && err.errors && err.errors[0] && err.errors[0].reason;
      if (res.status === 401) markExpired(o.token);
      return fail(reason || ('HTTP_' + res.status), explain(reason, err && err.message, res.status), { status: res.status });
    }
    return { ok: true, data };
  }
  const normChannel = it => ({
    id: it.id, name: it.snippet.title, handle: it.snippet.customUrl || '', subs: +(it.statistics && it.statistics.subscriberCount) || 0,
    videos: +(it.statistics && it.statistics.videoCount) || 0, views: +(it.statistics && it.statistics.viewCount) || 0,
    avatar: it.snippet.thumbnails && ((it.snippet.thumbnails.medium || it.snippet.thumbnails.default || {}).url) || '',
    status: 'connected', automation: false, addedAt: Date.now(), demo: false
  });

  /* ---------- remembered links (public ids + account hint; with a sign-in server also an opaque link id) ---------- */
  const LINK_KEY = 'authlink';
  function getLinks() { const v = Store.get(LINK_KEY, {}); if (Array.isArray(v)) { const o = {}; v.forEach(i => { o[i] = {}; }); return o; } return v && typeof v === 'object' ? v : {}; }
  function setLink(id, patch) { const l = getLinks(); l[id] = Object.assign({}, l[id], patch); Store.set(LINK_KEY, l); }
  function dropLink(id) { const l = getLinks(); delete l[id]; Store.set(LINK_KEY, l); }

  /* ---------- 1. OAuth ---------- */
  async function fetchEmail(token) {
    try { const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token } }); if (r.ok) { const d = await r.json(); return d.email || ''; } } catch (e) { /* ignore */ }
    return '';
  }
  /* Turn an access token into connected channels. extra = { email, link } */
  async function adopt(accessToken, expiresIn, extra) {
    extra = extra || {};
    const exp = Date.now() + ((expiresIn || 3600) * 1000) - 30000;
    const r = await api('/channels', { token: accessToken, params: { part: 'snippet,statistics', mine: 'true' } });
    if (!r.ok) return r;
    const list = (r.data.items || []).map(normChannel);
    if (!list.length) return fail('NO_CHANNEL', 'That Google account has no YouTube channel.');
    const email = extra.email || await fetchEmail(accessToken);
    list.forEach(c => { tokens[c.id] = { token: accessToken, exp }; setLink(c.id, { hint: email || (getLinks()[c.id] || {}).hint || '', link: extra.link || (getLinks()[c.id] || {}).link || '' }); });
    saveSess();
    return { ok: true, data: list };
  }
  /* Browser-only mode: Google's token popup. */
  function popupToken(o) {
    return new Promise(resolve => {
      let client;
      try {
        client = w.google.accounts.oauth2.initTokenClient({
          client_id: clientId(), scope: CONFIG.SCOPES.join(' '), prompt: o.prompt, hint: o.hint || undefined,
          callback: resp => {
            if (!resp || resp.error) return resolve(fail((resp && resp.error) || 'AUTH_DENIED', 'Authorization was not completed.'));
            if ((resp.scope || '').indexOf('youtube.upload') < 0) return resolve(fail('SCOPE_MISSING', 'You need to allow "Upload videos to your channel". Connect again and tick every permission box.'));
            resolve({ ok: true, token: resp.access_token, expires_in: resp.expires_in });
          },
          error_callback: e => resolve(fail((e && e.type) || 'POPUP_CLOSED', (e && e.type === 'popup_failed_to_open') ? 'Your browser blocked the Google window.' : 'The Google sign-in window was closed or blocked.'))
        });
        client.requestAccessToken();
      } catch (e) { resolve(fail('GIS_INIT', 'Google Sign-In could not start.')); }
    });
  }
  /* Sign-in-server mode: authorization-code popup, the server keeps the refresh token → never expires. */
  function codePopup() {
    return new Promise(resolve => {
      try {
        const client = w.google.accounts.oauth2.initCodeClient({
          client_id: clientId(), scope: CONFIG.SCOPES.join(' '), ux_mode: 'popup', select_account: true,
          callback: resp => { if (!resp || resp.error || !resp.code) resolve(fail((resp && resp.error) || 'AUTH_DENIED', 'Authorization was not completed.')); else resolve({ ok: true, code: resp.code, scope: resp.scope }); },
          error_callback: e => resolve(fail((e && e.type) || 'POPUP_CLOSED', 'The Google sign-in window was closed or blocked.'))
        });
        client.requestCode();
      } catch (e) { resolve(fail('GIS_INIT', 'Google Sign-In could not start.')); }
    });
  }
  async function bx(path, body) {
    let res;
    try { res = await fetch(backend() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { return fail('NETWORK', 'Could not reach your sign-in server. Check the address in Settings.'); }
    let d = null; try { d = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) return fail((d && d.code) || 'HTTP_' + res.status, (d && d.message) || 'The sign-in server refused the request.', { status: res.status });
    return { ok: true, data: d };
  }
  async function connectYouTube(opts) {
    if (!isConfigured()) return Object.assign({}, DEMO, { code: 'NOT_CONFIGURED' });
    try { await loadGIS(); } catch (e) { return fail('GIS_LOAD', 'Could not load Google Sign-In. Check your connection or disable content blockers.'); }
    if (backend()) {
      const c = await codePopup(); if (!c.ok) return c;
      if ((c.scope || '').indexOf('youtube.upload') < 0) return fail('SCOPE_MISSING', 'You need to allow "Upload videos to your channel". Connect again and tick every permission box.');
      const x = await bx('/auth/exchange', { code: c.code });
      if (!x.ok) return x;
      const r = await adopt(x.data.access_token, x.data.expires_in, { link: x.data.link, email: x.data.email });
      if (r.ok) { r.data.forEach(ch => setLink(ch.id, { link: x.data.link })); }
      return r;
    }
    const t = await popupToken({ prompt: (opts && opts.hint) ? '' : 'select_account', hint: opts && opts.hint });
    if (!t.ok) return t;
    return adopt(t.token, t.expires_in);
  }
  async function disconnect(channelId) {
    const L = getLinks()[channelId], t = tokens[channelId];
    if (backend() && L && L.link) { try { await bx('/auth/revoke', { link: L.link }); } catch (e) { /* ignore */ } }
    if (t && w.google && w.google.accounts && w.google.accounts.oauth2) { try { w.google.accounts.oauth2.revoke(t.token, () => {}); } catch (e) { /* ignore */ } }
    delete tokens[channelId]; saveSess();
    dropLink(channelId);
    return { ok: true };
  }

  /* ---------- Stay connected ----------
     With a sign-in server (Settings → Sign-in server): refresh happens silently on the server — you stay signed in for months.
     Browser-only: the 1-hour token is cached so reloads keep you signed in, renewed quietly when the browser allows,
     otherwise a "Resume" bar appears and ONE tap renews everything. Nothing here ever pops up on its own. */
  const stale = id => !tokens[id] || tokens[id].exp - Date.now() < 5 * 60 * 1000;
  const staleIds = () => isConfigured() ? Object.keys(getLinks()).filter(stale) : [];
  let needTap = false, running = null;
  async function renewOne(id, interactive) {
    const L = getLinks()[id] || {};
    if (!isConfigured() || navigator.onLine === false) return fail('OFFLINE', 'No connection.');
    if (backend() && L.link) {
      const r = await bx('/auth/refresh', { link: L.link });
      if (r.ok) { tokens[id] = { token: r.data.access_token, exp: Date.now() + ((r.data.expires_in || 3600) * 1000) - 30000 }; saveSess(); return { ok: true }; }
      if (r.status === 400 || r.status === 401 || r.status === 404) { setLink(id, { link: '' }); needTap = true; }   // access was revoked → reconnect needed
      return r;
    }
    if (!interactive && needTap) return fail('NEEDS_TAP', 'Tap to resume.');
    try { await loadGIS(); } catch (e) { return fail('GIS_LOAD', 'Could not load Google Sign-In.'); }
    const t = await popupToken({ prompt: '', hint: L.hint });
    if (!t.ok) { needTap = true; return t; }
    const r = await adopt(t.token, t.expires_in);
    if (!r.ok) { needTap = true; return r; }
    if (!r.data.some(c => c.id === id)) { needTap = true; return fail('WRONG_ACCOUNT', 'Google signed in a different channel. Pick the right account.'); }
    needTap = false;
    return { ok: true };
  }
  /* interactive=true must be called straight from a tap (browser-only mode opens Google's window). */
  function renewAll(interactive) {
    if (running) return running;
    const todo = staleIds(); if (!todo.length) return Promise.resolve({ ok: true, renewed: [] });
    running = (async () => {
      const done = [], tried = {};
      for (const id of todo) {
        if (!stale(id) || tried[id]) continue; tried[id] = 1;
        const r = await renewOne(id, !!interactive);
        if (r.ok) done.push(id); else if (r.code === 'NEEDS_TAP' || !interactive) break;
      }
      running = null;
      if (done.length) { needTap = staleIds().length > 0 && needTap; document.dispatchEvent(new CustomEvent('yt:auth-restored', { detail: { channelIds: done } })); }
      document.dispatchEvent(new CustomEvent('yt:auth-state'));
      return { ok: staleIds().length === 0, renewed: done };
    })();
    return running;
  }
  const renew = () => renewAll(false);
  /* Used by the UI: how many linked channels need a tap right now? */
  const canRenew = id => !!getLinks()[id];
  const needsAttention = () => (needTap || !backend()) ? staleIds().length : 0;
  const mode = () => backend() ? 'server' : 'browser';
  async function ensure(ids) {
    const out = { ok: true, missing: [] };
    for (const id of ids) { if (String(id).indexOf('demo_') === 0) continue; const g = await guard(id); if (!g.token) { out.ok = false; out.missing.push(id); } }
    return out;
  }
  function startKeepAlive() {
    loadSess();
    if (!Object.keys(getLinks()).length && !Object.keys(tokens).length) return;
    const tick = () => { if (!document.hidden) renewAll(false).then(() => document.dispatchEvent(new CustomEvent('yt:auth-state'))); };
    if (isConfigured()) loadGIS().catch(() => {});
    tick();
    setInterval(tick, 45 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    w.addEventListener('online', tick);
    w.addEventListener('focus', tick);
  }
  w.addEventListener('DOMContentLoaded', () => setTimeout(startKeepAlive, 0));
  if (document.readyState !== 'loading') setTimeout(startKeepAlive, 0);

  /* ---------- 2. Channels & videos ---------- */
  /* GET /youtube/v3/channels?part=snippet,statistics&mine=true  (1 quota unit) */
  async function getChannels() {
    if (!isLive()) return DEMO;
    const seen = {}, out = [];
    for (const id of Object.keys(tokens)) {
      if (!hasToken(id) || seen[tokens[id].token]) continue; seen[tokens[id].token] = 1;
      const r = await api('/channels', { token: tokens[id].token, params: { part: 'snippet,statistics', mine: 'true' } });
      if (!r.ok) return r;
      (r.data.items || []).forEach(i => out.push(normChannel(i)));
    }
    return { ok: true, data: out };
  }
  /* channels.list(contentDetails) → uploads playlist → playlistItems.list  (cheaper than search.list = 100 units) */
  async function getChannelVideos(channelId, opts) {
    const g = await guard(channelId); if (!g.token) return g;
    const c = await api('/channels', { token: g.token, params: { part: 'contentDetails', id: channelId } });
    if (!c.ok) return c;
    const pl = c.data.items && c.data.items[0] && c.data.items[0].contentDetails.relatedPlaylists.uploads;
    if (!pl) return fail('NO_UPLOADS', 'No uploads playlist found.');
    const r = await api('/playlistItems', { token: g.token, params: { part: 'snippet', playlistId: pl, maxResults: (opts && opts.max) || 25 } });
    if (!r.ok) return r;
    return { ok: true, data: (r.data.items || []).map(i => ({ id: i.snippet.resourceId.videoId, title: i.snippet.title, publishedAt: Date.parse(i.snippet.publishedAt) })) };
  }

  /* ---------- 3. Upload / schedule ---------- */
  /* Builds the exact request the API expects. Used for the "API request preview" in the UI and by uploadVideo().
     videos.insert costs 1,600 quota units (default quota is 10,000/day) and API projects that have not passed
     Google's audit force uploads to private — see README. */
  const bytesOf = s => { try { return new TextEncoder().encode(String(s)).length; } catch (e) { return String(s).length; } };
  const tagsLen = tags => (tags || []).reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, (tags || []).length - 1);
  function buildDescription(job, appendShorts) {
    const d = job.description || '';
    return d + (appendShorts && !/#shorts/i.test((job.title || '') + d) ? ((d ? '\n\n' : '') + '#Shorts') : '');
  }
  function buildUploadRequest(job, target, opts) {
    const o = opts || {};
    const sched = target && target.scheduledAt && target.scheduledAt > Date.now();
    const status = { privacyStatus: sched ? 'private' : job.visibility, selfDeclaredMadeForKids: false };
    if (sched) status.publishAt = new Date(target.scheduledAt).toISOString();
    return {
      method: 'POST',
      url: CONFIG.UPLOAD_BASE + '/videos?uploadType=resumable&part=snippet,status',
      headers: { Authorization: 'Bearer <access token — kept in memory, never shown>', 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': (job.file && job.file.type) || 'video/mp4' },
      body: { snippet: { title: job.title, description: buildDescription(job, o.appendShorts), tags: job.tags || [], categoryId: String(job.category) }, status }
    };
  }
  /* Chunked resumable upload: 8 MB pieces, automatic retry with back-off, resumes after a dropped connection,
     waits while offline. ctl = { aborted, xhr, abort() } lets the UI cancel. */
  const CHUNK = 8 * 1024 * 1024;   // must be a multiple of 256 KiB
  const waitOnline = async ctl => { for (let i = 0; i < 600 && navigator.onLine === false && !ctl.aborted; i++) await sleep(1000); };
  function putChunk(loc, file, start, end, ctl, onBytes) {
    return new Promise(resolve => {
      const x = new XMLHttpRequest(); ctl.xhr = x;
      x.open('PUT', loc);
      x.setRequestHeader('Content-Range', 'bytes ' + start + '-' + (end - 1) + '/' + file.size);
      x.upload.onprogress = e => { if (e.lengthComputable) onBytes(start + e.loaded); };
      x.onload = () => resolve({ status: x.status, range: x.getResponseHeader('Range'), text: x.responseText });
      x.onerror = () => resolve({ status: 0 }); x.ontimeout = () => resolve({ status: 0 }); x.onabort = () => resolve({ status: -1 });
      x.send(file.slice(start, end));
    });
  }
  function queryOffset(loc, total, ctl) {
    return new Promise(resolve => {
      const x = new XMLHttpRequest(); ctl.xhr = x;
      x.open('PUT', loc);
      x.setRequestHeader('Content-Range', 'bytes */' + total);
      x.onload = () => resolve({ status: x.status, range: x.getResponseHeader('Range'), text: x.responseText });
      x.onerror = () => resolve({ status: 0 }); x.onabort = () => resolve({ status: -1 });
      x.send();
    });
  }
  const parseRange = (h, fallback) => { const m = /bytes=\d+-(\d+)/.exec(h || ''); return m ? (+m[1] + 1) : fallback; };
  const parseJson = t => { try { return JSON.parse(t); } catch (e) { return {}; } };
  async function resumableUpload(channelId, file, metadata, onProgress, onCtl) {
    const ctl = { aborted: false, xhr: null, abort() { ctl.aborted = true; if (ctl.xhr) { try { ctl.xhr.abort(); } catch (e) { /* ignore */ } } } };
    if (onCtl) onCtl(ctl);
    const g = await guard(channelId); if (!g.token) return g;
    let init;
    try {
      init = await fetch(CONFIG.UPLOAD_BASE + '/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + g.token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(file.size), 'X-Upload-Content-Type': file.type || 'video/*' },
        body: JSON.stringify(metadata)
      });
    } catch (e) { return fail('NETWORK', 'Network error while starting the upload.'); }
    if (!init.ok) {
      if (init.status === 401) markExpired(g.token);
      const er = await readErr(init);
      return fail(er.reason || 'HTTP_' + init.status, er.message);
    }
    const loc = init.headers.get('Location');
    if (!loc) return fail('NO_SESSION', 'YouTube did not return an upload session URL.');
    let offset = 0, attempts = 0, lastPct = -1;
    const report = b => { const p = Math.min(99, Math.floor(b / file.size * 100)); if (onProgress && p !== lastPct) { lastPct = p; onProgress(p, b); } };
    while (offset < file.size) {
      if (ctl.aborted) return fail('ABORTED', 'Upload cancelled.');
      const end = Math.min(offset + CHUNK, file.size);
      const res = await putChunk(loc, file, offset, end, ctl, report);
      if (res.status === -1 || ctl.aborted) return fail('ABORTED', 'Upload cancelled.');
      if (res.status === 200 || res.status === 201) { if (onProgress) onProgress(100, file.size); return { ok: true, data: parseJson(res.text) }; }
      if (res.status === 308) { offset = parseRange(res.range, end); attempts = 0; continue; }
      if (res.status === 0 || res.status >= 500 || res.status === 429) {
        if (++attempts > 8) return fail('NETWORK', 'The connection kept dropping. Check your internet and tap Retry — it will start again.');
        await waitOnline(ctl); await sleep(Math.min(30000, 1000 * Math.pow(2, attempts - 1)));
        if (ctl.aborted) return fail('ABORTED', 'Upload cancelled.');
        const q = await queryOffset(loc, file.size, ctl);
        if (q.status === 200 || q.status === 201) { if (onProgress) onProgress(100, file.size); return { ok: true, data: parseJson(q.text) }; }
        if (q.status === 308) offset = parseRange(q.range, offset);
        else if (q.status === 404 || q.status === 410) return fail('SESSION_EXPIRED', 'The upload session expired. Tap Retry to start again.');
        continue;
      }
      if (res.status === 404 || res.status === 410) return fail('SESSION_EXPIRED', 'The upload session expired. Tap Retry to start again.');
      const d = parseJson(res.text), err = d && d.error, reason = err && err.errors && err.errors[0] && err.errors[0].reason;
      return fail(reason || 'UPLOAD_' + res.status, explain(reason, err && err.message, res.status));
    }
    return fail('UPLOAD_INCOMPLETE', 'YouTube did not confirm the upload. Tap Retry.');
  }
  /* args: { channelId, file (File), metadata (from buildUploadRequest().body), onProgress(pct), onCtl(ctl) } */
  async function uploadVideo(a) { return resumableUpload(a.channelId, a.file, a.metadata, a.onProgress, a.onCtl); }
  /* Scheduling is done by YouTube itself: upload as private + status.publishAt (RFC 3339, UTC, in the future).
     Once uploaded, YouTube publishes on time even if your browser is closed. */
  async function scheduleVideo(a) {
    const when = a.metadata && a.metadata.status && a.metadata.status.publishAt;
    if (!when || Date.parse(when) <= Date.now()) return fail('BAD_PUBLISH_AT', 'The scheduled time must be in the future.');
    if (a.metadata.status.privacyStatus !== 'private') a.metadata.status.privacyStatus = 'private';
    return resumableUpload(a.channelId, a.file, a.metadata, a.onProgress, a.onCtl);
  }
  /* thumbnails.set (50 units). Needs a verified channel. Failure never fails the upload. */
  async function setThumbnail(channelId, videoId, file) {
    const g = await guard(channelId); if (!g.token) return g;
    let res;
    try { res = await fetch(CONFIG.UPLOAD_BASE + '/thumbnails/set?uploadType=media&videoId=' + encodeURIComponent(videoId), { method: 'POST', headers: { Authorization: 'Bearer ' + g.token, 'Content-Type': file.type || 'image/jpeg' }, body: file }); }
    catch (e) { return fail('NETWORK', 'Network error while setting the thumbnail.'); }
    if (!res.ok) { const er = await readErr(res); return fail(er.reason || 'HTTP_' + res.status, er.reason === 'forbidden' ? FRIENDLY.thumbnailsNotAllowed : er.message); }
    return { ok: true };
  }
  async function rescheduleVideo(channelId, videoId, publishAtMs) {
    const g = await guard(channelId); if (!g.token) return g;
    return api('/videos', { method: 'PUT', token: g.token, params: { part: 'status' }, body: { id: videoId, status: { privacyStatus: 'private', publishAt: new Date(publishAtMs).toISOString(), selfDeclaredMadeForKids: false } } });
  }
  const FAIL_WHY = { codec: 'unsupported video codec', conversion: 'YouTube could not convert the file', emptyFile: 'the file is empty', invalidFile: 'the file is not a valid video', tooSmall: 'the file is too small', uploadAborted: 'the upload was interrupted' };
  const REJECT_WHY = { duplicate: 'this video was already uploaded to the channel', copyright: 'copyright claim', inappropriate: 'inappropriate content', length: 'the video is too long', termsOfUse: 'it breaks YouTube\'s terms', trademark: 'trademark claim', uploaderAccountClosed: 'the channel is closed', uploaderAccountSuspended: 'the channel is suspended', claim: 'a rights claim', legal: 'a legal removal' };
  async function getVideoStatus(channelId, videoId) {
    const g = await guard(channelId); if (!g.token) return g;
    const r = await api('/videos', { token: g.token, params: { part: 'status,processingDetails', id: videoId } });
    if (!r.ok) return r;
    const v = r.data.items && r.data.items[0]; if (!v) return fail('NOT_FOUND', 'Video not found — it may have been deleted on YouTube.');
    const s = v.status || {};
    return { ok: true, data: { uploadStatus: s.uploadStatus, privacy: s.privacyStatus, processing: v.processingDetails && v.processingDetails.processingStatus,
      failure: s.failureReason ? (FAIL_WHY[s.failureReason] || s.failureReason) : '', rejection: s.rejectionReason ? (REJECT_WHY[s.rejectionReason] || s.rejectionReason) : '' } };
  }

  /* ---------- 4. Comments ---------- */
  /* commentThreads.list (1 unit). Pass videoId for one video, otherwise all threads related to the channel. */
  async function getComments(channelId, opts) {
    const g = await guard(channelId); if (!g.token) return g;
    opts = opts || {};
    const params = { part: 'snippet,replies', maxResults: opts.max || 50, order: 'time', textFormat: 'plainText', pageToken: opts.pageToken };
    if (opts.videoId) params.videoId = opts.videoId; else params.allThreadsRelatedToChannelId = channelId;
    const r = await api('/commentThreads', { token: g.token, params });
    if (!r.ok) return r;
    const comments = (r.data.items || []).map(it => {
      const s = it.snippet.topLevelComment.snippet;
      return { id: it.snippet.topLevelComment.id, channelId, video: { id: it.snippet.videoId || s.videoId || '', title: '' }, author: s.authorDisplayName, text: s.textDisplay || s.textOriginal || '', at: Date.parse(s.publishedAt), likes: s.likeCount || 0, status: it.snippet.totalReplyCount > 0 ? 'replied' : 'new', read: false, flagged: false, demo: false };
    });
    return { ok: true, data: { comments, nextPageToken: r.data.nextPageToken || null } };
  }
  /* comments.insert (50 units) with snippet.parentId = the top-level comment id. */
  async function replyToComment(channelId, parentId, text) {
    const g = await guard(channelId); if (!g.token) return g;
    const r = await api('/comments', { method: 'POST', token: g.token, params: { part: 'snippet' }, body: { snippet: { parentId, textOriginal: text } } });
    return r.ok ? { ok: true, data: { id: r.data.id } } : r;
  }

  /* ---------- 5. Analytics (YouTube Analytics API v2) ---------- */
  async function getAnalytics(channelId, o) {
    const g = await guard(channelId); if (!g.token) return g;
    o = o || {};
    const r = await api('/reports', {
      base: CONFIG.ANALYTICS_BASE, token: g.token,
      params: { ids: 'channel==MINE', startDate: o.startDate, endDate: o.endDate, metrics: o.metrics || 'views,likes,comments,subscribersGained,estimatedMinutesWatched,averageViewDuration', dimensions: o.dimensions || 'day', sort: 'day', filters: o.filters }
    });
    if (!r.ok) return r;
    const cols = (r.data.columnHeaders || []).map(c => c.name);
    return { ok: true, data: { columns: cols, rows: r.data.rows || [] } };
  }

  w.YT = { CONFIG: { SCOPES: CONFIG.SCOPES, BACKEND_URL: CONFIG.BACKEND_URL }, SCOPE_INFO, DEMO_MESSAGE, DEMO_HINT, DEMO, isConfigured, isLive, hasToken, clientId,
    connectYouTube, renew, renewAll, ensure, canRenew, needsAttention, mode, backend, disconnect, setThumbnail, bytesOf, tagsLen, buildDescription, getChannels, getChannelVideos, uploadVideo, scheduleVideo, rescheduleVideo, getVideoStatus, getComments, replyToComment, getAnalytics, buildUploadRequest };
})(window);
