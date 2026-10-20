/* youtube.js — YouTube Data API v3 / YouTube Analytics API / Google OAuth integration layer.
   This is the ONLY file that talks to Google. Everything else calls these functions.

   HONESTY RULES
   • No function here ever returns ok:true unless Google actually answered with success.
   • When the API is not configured (no OAuth client ID) every call returns the DEMO result:
        { ok:false, demo:true, code:'DEMO_MODE', message:'Demo mode — connect YouTube to enable this feature.' }
   • Access tokens live in memory only (this closure). They are never written to localStorage and are lost on reload.
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
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ]
  });
  const SCOPE_INFO = [
    ['Upload videos to your channel', 'youtube.upload'],
    ['Read, reply to and moderate comments', 'youtube.force-ssl'],
    ['View your channel and videos', 'youtube.readonly'],
    ['View YouTube Analytics reports', 'yt-analytics.readonly']
  ];
  const DEMO_MESSAGE = 'Demo mode — connect YouTube to enable this feature.';
  const DEMO_HINT = 'Connect YouTube to enable this feature.';
  const DEMO = Object.freeze({ ok: false, demo: true, code: 'DEMO_MODE', message: DEMO_MESSAGE });

  const tokens = {};                    // channelId -> { token, exp }   (MEMORY ONLY)
  const fail = (code, message, extra) => Object.assign({ ok: false, code, message }, extra || {});

  const clientId = () => (CONFIG.CLIENT_ID || (Store.settings().clientId || '')).trim();
  const isConfigured = () => !!clientId();
  const hasToken = id => !!(tokens[id] && tokens[id].exp > Date.now());
  const isLive = () => Object.keys(tokens).some(hasToken);

  /* ---------- low-level ---------- */
  function loadGIS() {
    return new Promise((res, rej) => {
      if (w.google && w.google.accounts && w.google.accounts.oauth2) return res();
      const s = document.createElement('script');
      s.src = CONFIG.GIS_SRC; s.async = true; s.defer = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('GIS failed to load'));
      document.head.appendChild(s);
    });
  }
  function markExpired(token) {
    const ids = Object.keys(tokens).filter(k => tokens[k].token === token);
    ids.forEach(k => { tokens[k].exp = 0; });
    if (ids.length) document.dispatchEvent(new CustomEvent('yt:auth-expired', { detail: { channelIds: ids } }));
  }
  function guard(channelId) {
    if (!isConfigured() || String(channelId || '').indexOf('demo_') === 0) return DEMO;
    const t = tokens[channelId];
    if (!t || t.exp <= Date.now()) return fail('AUTH_REQUIRED', 'Authorization expired. Reconnect this channel to continue.');
    return { ok: true, token: t.token };
  }
  async function api(path, o) {
    o = o || {};
    const url = new URL((o.base || CONFIG.API_BASE) + path);
    Object.keys(o.params || {}).forEach(k => { if (o.params[k] != null && o.params[k] !== '') url.searchParams.set(k, o.params[k]); });
    let res;
    try {
      res = await fetch(url.toString(), {
        method: o.method || 'GET',
        headers: Object.assign({ Authorization: 'Bearer ' + o.token, Accept: 'application/json' }, o.body ? { 'Content-Type': 'application/json' } : {}),
        body: o.body ? JSON.stringify(o.body) : undefined
      });
    } catch (e) { return fail('NETWORK', 'Network error — check your connection and try again.'); }
    let data = null; try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = data && data.error;
      const reason = err && err.errors && err.errors[0] && err.errors[0].reason;
      if (res.status === 401) markExpired(o.token);
      return fail(reason || ('HTTP_' + res.status), (err && err.message) || 'The YouTube API request failed.', { status: res.status });
    }
    return { ok: true, data };
  }
  const normChannel = it => ({
    id: it.id, name: it.snippet.title, handle: it.snippet.customUrl || '', subs: +(it.statistics && it.statistics.subscriberCount) || 0,
    videos: +(it.statistics && it.statistics.videoCount) || 0, views: +(it.statistics && it.statistics.viewCount) || 0,
    avatar: it.snippet.thumbnails && ((it.snippet.thumbnails.medium || it.snippet.thumbnails.default || {}).url) || '',
    status: 'connected', automation: false, addedAt: Date.now(), demo: false
  });

  /* ---------- 1. OAuth ---------- */
  /* Google Identity Services "token model": opens Google's own consent popup. We never see a password.
     Returns the channel(s) the signed-in account selected. Access token (≈1 h) is kept in memory.
     For refresh tokens / long-lived access, use the authorization-code flow on a backend instead. */
  async function connectYouTube(opts) {
    const silent = !!(opts && opts.silent);
    if (!isConfigured()) return Object.assign({}, DEMO, { code: 'NOT_CONFIGURED' });
    try { await loadGIS(); } catch (e) { return fail('GIS_LOAD', 'Could not load Google Sign-In. Check your connection or disable content blockers.'); }
    return new Promise(resolve => {
      const client = w.google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: CONFIG.SCOPES.join(' '), prompt: silent ? '' : 'select_account',
        callback: async resp => {
          if (!resp || resp.error) return resolve(fail((resp && resp.error) || 'AUTH_DENIED', 'Authorization was not completed.'));
          const exp = Date.now() + ((resp.expires_in || 3600) * 1000) - 30000;
          const r = await api('/channels', { token: resp.access_token, params: { part: 'snippet,statistics', mine: 'true' } });
          if (!r.ok) return resolve(r);
          const list = (r.data.items || []).map(normChannel);
          if (!list.length) return resolve(fail('NO_CHANNEL', 'That Google account has no YouTube channel.'));
          list.forEach(c => { tokens[c.id] = { token: resp.access_token, exp }; });
          rememberLinks(list.map(c => c.id));
          resolve({ ok: true, data: list });
        },
        error_callback: e => resolve(fail((e && e.type) || 'POPUP_CLOSED', 'The Google sign-in window was closed or blocked.'))
      });
      client.requestAccessToken();
    });
  }
  async function disconnect(channelId) {
    const t = tokens[channelId];
    if (t && w.google && w.google.accounts && w.google.accounts.oauth2) { try { w.google.accounts.oauth2.revoke(t.token, () => {}); } catch (e) { /* ignore */ } }
    delete tokens[channelId];
    forgetLink(channelId);
    return { ok: true };
  }


  /* ---------- Stay connected (connect once, keep working) ----------
     Google browser tokens last ~1 h and cannot be extended without a server. So we renew them silently:
     the linked channel ids (public, non-sensitive) are remembered; a fresh token is requested quietly
       • on app start, • ~5 min before expiry, • when the app comes back to the foreground / network returns,
       • on the first tap after a renewal was blocked (browsers only allow Google's quiet window after a user gesture).
     No password, secret or token is ever stored. */
  const LINK_KEY = 'authlink';
  const linked = () => { const v = Store.get(LINK_KEY, []); return Array.isArray(v) ? v : []; };
  function rememberLinks(ids) { const a = linked(); ids.forEach(i => { if (a.indexOf(i) < 0) a.push(i); }); Store.set(LINK_KEY, a); }
  function forgetLink(id) { Store.set(LINK_KEY, linked().filter(i => i !== id)); }
  const needsRenewal = () => isConfigured() && linked().some(id => !tokens[id] || tokens[id].exp - Date.now() < 5 * 60 * 1000);
  let renewing = null, blocked = false;
  function renew() {
    if (renewing || !needsRenewal() || navigator.onLine === false) return renewing || Promise.resolve(null);
    renewing = connectYouTube({ silent: true }).then(r => {
      renewing = null;
      if (r.ok) { blocked = false; document.dispatchEvent(new CustomEvent('yt:auth-restored', { detail: { channelIds: r.data.map(c => c.id) } })); }
      else blocked = true;                       // popup blocked / needs a tap → retry on next user gesture
      return r;
    }).catch(() => { renewing = null; blocked = true; return null; });
    return renewing;
  }
  function startKeepAlive() {
    if (!linked().length) return;
    renew();
    setInterval(renew, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renew(); });
    w.addEventListener('online', renew);
    w.addEventListener('focus', renew);
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (blocked) renew(); }, { capture: true, passive: true }));
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
    const g = guard(channelId); if (!g.token) return g;
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
  function buildUploadRequest(job, target, opts) {
    const o = opts || {};
    const sched = target && target.scheduledAt && target.scheduledAt > Date.now();
    const desc = (job.description || '') + (o.appendShorts && !/#shorts/i.test((job.title || '') + (job.description || '')) ? ((job.description ? '\n\n' : '') + '#Shorts') : '');
    const status = { privacyStatus: sched ? 'private' : job.visibility, selfDeclaredMadeForKids: false };
    if (sched) status.publishAt = new Date(target.scheduledAt).toISOString();
    return {
      method: 'POST',
      url: CONFIG.UPLOAD_BASE + '/videos?uploadType=resumable&part=snippet,status',
      headers: { Authorization: 'Bearer <access token — kept in memory, never shown>', 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': (job.file && job.file.type) || 'video/mp4' },
      body: { snippet: { title: job.title, description: desc, tags: job.tags || [], categoryId: String(job.category) }, status }
    };
  }
  async function resumableUpload(channelId, file, metadata, onProgress, onXhr) {
    const g = guard(channelId); if (!g.token) return g;
    let init;
    try {
      init = await fetch(CONFIG.UPLOAD_BASE + '/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + g.token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(file.size), 'X-Upload-Content-Type': file.type || 'video/*' },
        body: JSON.stringify(metadata)
      });
    } catch (e) { return fail('NETWORK', 'Network error while starting the upload.'); }
    if (!init.ok) {
      let d = null; try { d = await init.json(); } catch (e) { /* ignore */ }
      const err = d && d.error; if (init.status === 401) markExpired(g.token);
      return fail((err && err.errors && err.errors[0] && err.errors[0].reason) || 'HTTP_' + init.status, (err && err.message) || 'YouTube refused to start the upload.');
    }
    const loc = init.headers.get('Location');
    if (!loc) return fail('NO_SESSION', 'YouTube did not return an upload session URL.');
    return new Promise(resolve => {
      const x = new XMLHttpRequest();
      x.open('PUT', loc);
      x.setRequestHeader('Content-Type', file.type || 'video/*');
      x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* ignore */ } resolve({ ok: true, data: d }); }
        else resolve(fail('UPLOAD_' + x.status, 'The upload was rejected (HTTP ' + x.status + ').'));
      };
      x.onerror = () => resolve(fail('NETWORK', 'Network error during upload.'));
      x.onabort = () => resolve(fail('ABORTED', 'Upload cancelled.'));
      if (onXhr) onXhr(x);
      x.send(file);
    });
  }
  /* args: { channelId, file (File), metadata (from buildUploadRequest().body), onProgress(pct), onXhr(xhr) } */
  async function uploadVideo(a) { return resumableUpload(a.channelId, a.file, a.metadata, a.onProgress, a.onXhr); }
  /* Scheduling is done by YouTube itself: upload as private + status.publishAt (RFC 3339, UTC, in the future).
     Once uploaded, YouTube publishes on time even if your browser is closed. */
  async function scheduleVideo(a) {
    const when = a.metadata && a.metadata.status && a.metadata.status.publishAt;
    if (!when || Date.parse(when) <= Date.now()) return fail('BAD_PUBLISH_AT', 'The scheduled time must be in the future.');
    if (a.metadata.status.privacyStatus !== 'private') a.metadata.status.privacyStatus = 'private';
    return resumableUpload(a.channelId, a.file, a.metadata, a.onProgress, a.onXhr);
  }
  async function rescheduleVideo(channelId, videoId, publishAtMs) {
    const g = guard(channelId); if (!g.token) return g;
    return api('/videos', { method: 'PUT', token: g.token, params: { part: 'status' }, body: { id: videoId, status: { privacyStatus: 'private', publishAt: new Date(publishAtMs).toISOString(), selfDeclaredMadeForKids: false } } });
  }
  async function getVideoStatus(channelId, videoId) {
    const g = guard(channelId); if (!g.token) return g;
    const r = await api('/videos', { token: g.token, params: { part: 'status,processingDetails', id: videoId } });
    if (!r.ok) return r;
    const v = r.data.items && r.data.items[0]; if (!v) return fail('NOT_FOUND', 'Video not found.');
    return { ok: true, data: { uploadStatus: v.status.uploadStatus, privacy: v.status.privacyStatus, processing: v.processingDetails && v.processingDetails.processingStatus } };
  }

  /* ---------- 4. Comments ---------- */
  /* commentThreads.list (1 unit). Pass videoId for one video, otherwise all threads related to the channel. */
  async function getComments(channelId, opts) {
    const g = guard(channelId); if (!g.token) return g;
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
    const g = guard(channelId); if (!g.token) return g;
    const r = await api('/comments', { method: 'POST', token: g.token, params: { part: 'snippet' }, body: { snippet: { parentId, textOriginal: text } } });
    return r.ok ? { ok: true, data: { id: r.data.id } } : r;
  }

  /* ---------- 5. Analytics (YouTube Analytics API v2) ---------- */
  async function getAnalytics(channelId, o) {
    const g = guard(channelId); if (!g.token) return g;
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
    connectYouTube, renew, disconnect, getChannels, getChannelVideos, uploadVideo, scheduleVideo, rescheduleVideo, getVideoStatus, getComments, replyToComment, getAnalytics, buildUploadRequest };
})(window);
