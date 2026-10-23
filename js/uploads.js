/* uploads.js — full-screen Short uploader (page 3) and upload queue (page 4).
   Demo mode never pretends anything was sent: jobs are saved as local "draft" / local-schedule entries.
   Live mode (OAuth configured + authorised) really calls YT.uploadVideo()/scheduleVideo(). */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;

  const CATS = [['28', 'Science & Technology'], ['27', 'Education'], ['22', 'People & Blogs'], ['24', 'Entertainment'], ['20', 'Gaming'], ['10', 'Music'], ['26', 'Howto & Style'], ['23', 'Comedy'], ['25', 'News & Politics'], ['17', 'Sports'], ['1', 'Film & Animation']];
  const VIS = [['public', 'Public', 'Everyone can watch'], ['unlisted', 'Unlisted', 'Anyone with the link'], ['private', 'Private', 'Only you']];
  const LIM = { maxBytes: 512 * 1024 * 1024, types: ['video/mp4', 'video/quicktime', 'video/webm'], exts: ['mp4', 'mov', 'webm', 'm4v'], thumbBytes: 2 * 1024 * 1024, thumbTypes: ['image/jpeg', 'image/png'], maxSeconds: 180, title: 100, descBytes: 5000, desc: 5000, tagsTotal: 500, tagMax: 30, tagCount: 15 };
  const ST = {
    uploading: ['Uploading', 'info', 'upload'], processing: ['Processing', 'warn', 'refresh'], scheduled: ['Scheduled', 'accent', 'clock'],
    published: ['Published', 'ok', 'check'], failed: ['Failed', 'err', 'alert'], cancelled: ['Cancelled', 'mute', 'x'], draft: ['Draft · not sent', 'mute', 'edit'], waiting: ['Waiting', 'mute', 'clock']
  };
  const statusBadge = s => { const m = ST[s] || ST.draft; return U.badge(m[0], m[1], m[2]); };
  const liveFiles = {};   // jobId -> { file, thumb }   (memory only; files are never persisted)
  const ctls = {};        // targetId -> upload controller (for cancel)
  const STEPS = [['1', 'Details'], ['2', 'Channels'], ['3', 'Visibility']];

  const up = { file: null, fileUrl: null, thumb: null, thumbUrl: null, meta: null, tags: null, chans: [], mode: 'now', same: true, when: null, times: {}, step: 1, f: null, busy: false };

  const parseTags = str => { const seen = {}, out = []; String(str || '').split(/[,\n]/).forEach(t => { t = t.replace(/[<>#]/g, '').trim().slice(0, LIM.tagMax); if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push(t); } }); return out.slice(0, LIM.tagCount); };
  const revokeUrl = u => { if (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } } };
  function reset() { revokeUrl(up.fileUrl); revokeUrl(up.thumbUrl); up.file = up.fileUrl = up.thumb = up.thumbUrl = up.meta = null; up.tags = null; up.f = null; up.chans = []; up.mode = 'now'; up.same = true; up.when = null; up.times = {}; up.step = 1; up.busy = false; }
  const canUse = c => Store.isDemo() ? c.status !== 'expired' : (YT.hasToken(c.id) || YT.canRenew(c.id));
  const stale = c => !Store.isDemo() && !YT.hasToken(c.id) && YT.canRenew(c.id);
  function initForm() {
    if (up.f) return;
    const s = Store.settings(), d = Store.get('draft', {});
    up.f = Object.assign({ title: '', desc: s.defaults.description, vis: s.defaults.visibility, cat: s.defaults.category, shorts: s.defaults.appendShorts !== false }, { title: d.title || '', desc: d.description != null ? d.description : s.defaults.description, vis: d.visibility || s.defaults.visibility, cat: d.category || s.defaults.category });
    up.tags = Array.isArray(d.tags) ? d.tags.slice(0, LIM.tagCount) : parseTags(s.defaults.tags);
  }

  /* ====================================================================== UPLOAD PAGE */
  const Uploads = {
    ST, statusBadge, CATS, VIS,

    renderUpload() {
      const chans = Store.channels();
      if (!chans.length) return U.empty({ icon: 'channels', title: 'No YouTube channels connected yet.', body: 'Connect a channel to choose where your Short goes.', action: '<button type="button" class="btn primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube</button>' });
      initForm();
      const demo = Store.isDemo();
      let h = '<div class="up-shell" id="up-shell">';
      h += '<header class="up-head"><button type="button" class="btn icon ghost" data-act="up-close" aria-label="Close upload">' + U.icon('x') + '</button><h1>Upload Short</h1>' +
        '<nav class="up-steps" aria-label="Upload steps">' + STEPS.map(x => '<button type="button" data-act="up-step" data-s="' + x[0] + '" aria-current="' + (up.step === +x[0]) + '"><i>' + x[0] + '</i><span>' + x[1] + '</span></button>').join('<em></em>') + '</nav></header>';
      if (demo) h += '<div class="banner" style="margin:12px var(--pad) 0">' + U.icon('info') + '<p><b>Demo mode</b> — ' + U.esc(YT.DEMO_HINT) + ' You can try the whole flow; nothing is sent to YouTube.</p></div>';
      h += '<div id="up-hero" class="up-hero" ' + (up.file ? 'hidden' : '') + '><label class="up-drop drop" for="up-file"><span class="ic">' + U.icon('upload', 'lg') + '</span><b>Select your Short</b>' +
        '<span class="hint">Tap to choose a video' + (matchMedia && matchMedia('(hover:hover)').matches ? ' or drag and drop it here' : '') + '<br>Vertical 9:16 · up to 3 minutes · MP4, MOV, WebM · max ' + U.bytes(LIM.maxBytes) + '</span><span class="btn primary" style="margin-top:8px">Select file</span></label>' +
        '<p class="hint" style="text-align:center">Post one video to all your channels at once. ' + U.plural(chans.length, 'channel') + ' connected.</p></div>';
      h += '<input class="vh" type="file" id="up-file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" data-chg="up-file" aria-label="Video file">';
      h += '<div id="up-work" class="up-work" ' + (up.file ? '' : 'hidden') + '><aside class="up-side"><div class="up-pv"><div class="phone" id="pv-phone" style="--h:350"><div id="pv-media"></div><div class="rail" aria-hidden="true"><i></i><i></i><i></i></div><div class="ov-b"><b id="pv-handle">@channel</b><span id="pv-title">Your title appears here</span></div></div>' +
        '<div class="up-pv-info"><div id="up-file-area"></div><div id="up-file-note" class="stack sm"></div><dl class="kv" id="pv-kv"></dl></div></div></aside><div class="up-forms">';

      /* step 1 */
      h += '<section class="up-step" data-step="1" ' + (up.step === 1 ? '' : 'hidden') + '><h2>Details</h2>' +
        '<div class="field"><label for="up-title">Title <span class="counter" id="up-title-c">0/' + LIM.title + '</span></label><input class="input" id="up-title" maxlength="' + LIM.title + '" placeholder="e.g. 5 AI websites you can build today" value="' + U.esc(up.f.title) + '" data-inp="up-field" autocomplete="off" enterkeyhint="next"><div class="err-text" id="up-title-e" hidden></div></div>' +
        '<div class="field"><label for="up-desc">Description <span class="counter" id="up-desc-c"></span></label><textarea class="textarea" id="up-desc" rows="4" data-inp="up-field" placeholder="Tell viewers about your Short">' + U.esc(up.f.desc) + '</textarea><div class="err-text" id="up-desc-e" hidden></div></div>' +
        '<div class="field"><label>Thumbnail <span class="counter">optional · JPG/PNG · 2 MB</span></label><div id="up-thumb-area"></div><input class="vh" type="file" id="up-thumb" accept="image/jpeg,image/png" data-chg="up-thumb" aria-label="Thumbnail image"></div>' +
        '<div class="field"><label for="up-tag-in">Tags <span class="counter" id="up-tags-c"></span></label><div class="tag-box"><span id="up-chips" style="display:contents"></span><input id="up-tag-in" placeholder="Add a tag, press Enter" enterkeyhint="done" autocomplete="off" data-inp="up-tag-typing"></div><div class="err-text" id="up-tags-e" hidden></div></div>' +
        '<div class="field"><label for="up-cat">Category</label><select class="select" id="up-cat" data-chg="up-field">' + CATS.map(x => '<option value="' + x[0] + '" ' + (String(up.f.cat) === x[0] ? 'selected' : '') + '>' + U.esc(x[1]) + '</option>').join('') + '</select></div>' +
        '<div class="set-row"><div class="t">Add #Shorts to the description<small>Helps YouTube treat vertical videos under 3 minutes as Shorts</small></div>' + U.sw('up-field', up.f.shorts, 'Add #Shorts', 'id="up-shorts"') + '</div></section>';

      /* step 2 */
      h += '<section class="up-step" data-step="2" ' + (up.step === 2 ? '' : 'hidden') + '><div class="row between wrap"><h2>Channels</h2><div class="row"><button type="button" class="btn xs" data-act="up-all">' + U.icon('check', 'xs') + 'Select all</button><button type="button" class="btn xs ghost" data-act="up-none">Clear</button></div></div>' +
        '<p class="hint" id="up-chan-count"></p><div class="stack sm" id="up-chans"></div><div class="err-text" id="up-chans-e" hidden></div></section>';

      /* step 3 */
      h += '<section class="up-step" data-step="3" ' + (up.step === 3 ? '' : 'hidden') + '><h2>Visibility</h2>' +
        '<div class="vis-grid" role="radiogroup" aria-label="Visibility">' + VIS.map(x => '<label class="vis"><input class="vh" type="radio" name="up-vis" value="' + x[0] + '" data-chg="up-vis" ' + (up.f.vis === x[0] ? 'checked' : '') + '><span class="vis-in"><b>' + x[1] + '</b><small>' + x[2] + '</small></span></label>').join('') + '</div>' +
        '<div class="field" style="margin-top:6px"><label>Publishing</label><div class="seg" role="group" aria-label="Publishing option"><button type="button" data-act="up-mode" data-m="now" aria-pressed="' + (up.mode === 'now') + '">Publish now</button><button type="button" data-act="up-mode" data-m="schedule" aria-pressed="' + (up.mode === 'schedule') + '">Schedule</button></div><div id="up-sched"></div></div>' +
        '<div class="field"><label>Audience</label><p class="hint">Each Short is marked <b>“No, it’s not made for kids”</b>. Change it in YouTube Studio if that is wrong.</p></div>' +
        '<div class="field"><label>Checks</label><div class="stack sm" id="up-checks"></div></div>' +
        '<details class="fold"><summary>API request preview</summary><pre class="code" id="pv-json" tabindex="0"></pre></details></section>';

      h += '</div></div>';
      h += '<div class="up-bar" id="up-bar" ' + (up.file ? '' : 'hidden') + '><div id="up-errors" role="alert" class="err-text" hidden></div><div class="row2"><button type="button" class="btn" data-act="up-back" id="up-back">Back</button><button type="button" class="btn primary" data-act="up-next" id="up-next"><span id="up-next-l">Next</span></button></div></div>';
      return h + '</div>';
    },

    mountUpload() {
      if (!U.$('#up-shell')) return;
      document.body.classList.add('up-page');
      fileArea(); thumbArea(); chips(); chanList(); schedArea(); counters(); previewMedia(); preview(); fileNote(); bar();
    },
    refreshChannels() { chanList(); preview(); },
    leave() { document.body.classList.remove('up-page'); },

    /* ================================================================== QUEUE PAGE */
    qFilter: 'all',
    renderQueue() {
      const jobs = Store.col('jobs');
      let h = '<div class="row between wrap"><p class="lead">Every Short and its status on each channel.</p><button type="button" class="btn primary sm" data-act="goto" data-to="upload">' + U.icon('plus', 'sm') + 'New upload</button></div>';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — these are sample entries and local drafts. Nothing here was sent to YouTube.</p></div>';
      if (!jobs.length) return h + U.empty({ icon: 'queue', title: 'Your queue is empty', body: 'Uploads and scheduled Shorts will appear here with live status per channel.', action: '<button type="button" class="btn primary" data-act="goto" data-to="upload">Upload a Short</button>' });
      const all = [].concat.apply([], jobs.map(j => j.targets));
      const cnt = f => all.filter(t => Uploads.qMatch(t, f)).length;
      const chips = [['all', 'All'], ['active', 'Active'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['failed', 'Failed']];
      h += '<div class="chips" role="group" aria-label="Filter queue">' + chips.map(c => '<button type="button" class="chip" aria-pressed="' + (Uploads.qFilter === c[0]) + '" data-act="q-filter" data-f="' + c[0] + '">' + c[1] + '<span class="n">' + cnt(c[0]) + '</span></button>').join('') + '</div>';
      h += '<div id="q-list" class="grid-cards"></div>';
      return h;
    },
    mountQueue() { Uploads.qList(); watch(); },
    qMatch(t, f) { return f === 'all' || (f === 'active' ? (t.status === 'uploading' || t.status === 'processing' || t.status === 'waiting') : t.status === f); },
    qList() {
      const box = U.$('#q-list'); if (!box) return;
      const jobs = Store.col('jobs').filter(j => j.targets.some(t => Uploads.qMatch(t, Uploads.qFilter)));
      box.innerHTML = jobs.length ? jobs.map(jobCard).join('') : '<div style="grid-column:1/-1">' + U.empty({ icon: 'queue', title: 'Nothing here', body: 'No Shorts match this filter.' }) + '</div>';
    },

    /* ================================================================== LIVE UPLOAD RUNNER */
    async run(jobId, onlyTid) {
      const fl = liveFiles[jobId];
      if (!fl || !fl.file) { U.toast('Select the video file again on the Upload page to retry — files are never stored.', 'warn'); return; }
      const job0 = Store.job(jobId); if (!job0) return;
      const todo = job0.targets.filter(t => (!onlyTid || t.id === onlyTid) && ['cancelled', 'published', 'processing'].indexOf(t.status) < 0 && !(t.status === 'scheduled' && t.videoId));
      todo.forEach(t => patch(jobId, t.id, { status: 'waiting', progress: 0, error: null, note: null }));
      w.App.rerenderIf('queue');
      let lock = null; try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed */ }
      const queue = todo.slice(), POOL = 2;
      const worker = async () => { while (queue.length) { await one(jobId, queue.shift().id, fl); } };
      await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, worker));
      if (lock) { try { lock.release(); } catch (e) { /* ignore */ } }
      watch();
    }
  };

  async function one(jobId, tid, fl) {
    const cur = () => { const j = Store.job(jobId); return j && j.targets.find(x => x.id === tid); };
    let t = cur(); if (!t || t.status === 'cancelled') return;
    patch(jobId, tid, { status: 'uploading', progress: 0, error: null }); w.App.rerenderIf('queue');
    const job = Store.job(jobId);
    const appendShorts = job.appendShorts != null ? job.appendShorts : Store.settings().defaults.appendShorts;
    const req = YT.buildUploadRequest(job, cur(), { appendShorts });
    const call = cur().scheduledAt ? YT.scheduleVideo : YT.uploadVideo;
    let last = 0;
    const r = await call({
      channelId: t.channelId, file: fl.file, metadata: req.body,
      onCtl: c => { ctls[tid] = c; },
      onProgress: p => { if (p - last >= 2 || p === 100) { last = p; liveBar(tid, p); } }
    });
    delete ctls[tid];
    const name = Store.channelName(t.channelId);
    t = cur();
    if (t && t.status === 'cancelled') { w.App.rerenderIf('queue'); return; }
    if (r.ok) {
      const sched = !!(t && t.scheduledAt), vid = r.data && r.data.id;
      patch(jobId, tid, { status: sched ? 'scheduled' : 'processing', progress: 100, videoId: vid, error: null });
      w.Activity.add(sched ? 'schedule' : 'upload', 'ok', (sched ? 'Uploaded & scheduled on ' : 'Short uploaded to ') + name + ' — "' + job.title + '"');
      w.Notify.add({ type: 'upload', title: 'Upload completed', body: '"' + job.title + '" finished uploading to ' + name + '.' });
      if (fl.thumb && vid) {
        const tr = await YT.setThumbnail(t.channelId, vid, fl.thumb);
        if (!tr.ok) patch(jobId, tid, { note: 'Video uploaded, but the thumbnail was not set: ' + tr.message });
      }
    } else if (r.code === 'ABORTED') {
      patch(jobId, tid, { status: 'cancelled', error: null });
    } else {
      patch(jobId, tid, { status: 'failed', error: r.message || r.code });
      w.Activity.add('upload', 'err', 'Upload failed on ' + name + ' — ' + (r.code || 'error'));
      w.Notify.add({ type: 'error', title: 'Upload failed', body: '"' + job.title + '" failed on ' + name + ' (' + (r.code || 'error') + ').' });
      if (r.code === 'AUTH_REQUIRED') { const cs = Store.channels(); const c = cs.find(x => x.id === t.channelId); if (c) { c.status = 'expired'; Store.saveCol('channels', cs); } w.App.authBar && w.App.authBar(); }
    }
    w.App.rerenderIf('queue'); w.App.refreshBadges();
  }

  /* ---------- processing watcher: moves "Processing" → Published / Failed on its own ---------- */
  let watchT = null;
  async function checkTarget(jobId, tid, quiet) {
    const j = Store.job(jobId), tg = j && j.targets.find(x => x.id === tid); if (!tg || !tg.videoId) return null;
    const r = await YT.getVideoStatus(tg.channelId, tg.videoId);
    if (!r.ok) { if (!quiet) U.toast(r.message || YT.DEMO_MESSAGE, r.demo ? 'warn' : 'err'); return null; }
    const d = r.data, name = Store.channelName(tg.channelId);
    if (d.uploadStatus === 'processed') {
      const wanted = j.visibility, locked = !tg.scheduledAt && wanted !== 'private' && d.privacy === 'private';
      patch(jobId, tid, { status: 'published', publishedAt: Date.now(), note: locked ? 'YouTube kept this video Private. Google locks uploads from API projects that have not passed its audit. Open YouTube Studio to make it public.' : null });
      w.Notify.add({ type: 'upload', title: 'Short is live', body: '"' + j.title + '" finished processing on ' + name + '.' });
    } else if (d.uploadStatus === 'failed' || d.uploadStatus === 'rejected' || d.uploadStatus === 'deleted') {
      const why = d.uploadStatus === 'deleted' ? 'The video was deleted on YouTube.' : d.uploadStatus === 'rejected' ? 'YouTube rejected it' + (d.rejection ? ': ' + d.rejection + '.' : '.') : 'YouTube could not process it' + (d.failure ? ': ' + d.failure + '.' : '.');
      patch(jobId, tid, { status: 'failed', error: why });
      w.Activity.add('upload', 'err', 'YouTube problem on ' + name + ' — ' + why);
      w.Notify.add({ type: 'error', title: 'YouTube problem', body: '"' + j.title + '" on ' + name + ': ' + why });
    } else if (!quiet) U.toast('YouTube is still processing it.', 'info');
    w.App.rerenderIf('queue'); w.App.refreshBadges();
    return d;
  }
  function watch() {
    if (watchT) return;
    const any = () => Store.col('jobs').some(j => !j.demo && j.targets.some(t => t.status === 'processing' && t.videoId));
    if (!any()) return;
    const tick = async () => {
      if (document.hidden) return;
      for (const j of Store.col('jobs')) { if (j.demo) continue; for (const t of j.targets) { if (t.status === 'processing' && t.videoId) await checkTarget(j.id, t.id, true); } }
      if (!any()) { clearInterval(watchT); watchT = null; }
    };
    watchT = setInterval(tick, 20000); tick();
  }
  document.addEventListener('yt:auth-restored', watch);
  w.addEventListener('DOMContentLoaded', () => setTimeout(watch, 1500));
  if (document.readyState !== 'loading') setTimeout(watch, 1500);

  /* ---------- helpers: queue ---------- */
  function patch(jobId, tid, p) { const j = Store.job(jobId); if (!j) return; const t = j.targets.find(x => x.id === tid); if (t) Object.assign(t, p); Store.saveJob(j); }
  function liveBar(tid, p) {
    U.$$('[data-tbar="' + tid + '"]').forEach(el => { const i = U.$('i', el); if (i) i.style.width = p + '%'; });
    U.$$('[data-tpct="' + tid + '"]').forEach(el => { el.textContent = p + '%'; });
  }
  function targetRow(job, t) {
    const ch = Store.channel(t.channelId);
    const nm = ch ? ch.name : 'Removed channel';
    let x = '';
    if (t.status === 'uploading' || t.status === 'processing') {
      x += '<div><div class="bar" data-tbar="' + U.esc(t.id) + '"><i style="width:' + (t.progress || 0) + '%"></i></div><div class="prog-l"><span>' + (t.status === 'processing' ? 'Processing on YouTube' : 'Uploading') + '</span><span data-tpct="' + U.esc(t.id) + '">' + (t.progress || 0) + '%</span></div></div>';
    }
    let sub = '';
    if (t.scheduledAt && t.status === 'scheduled') sub = U.icon('clock', 'xs') + ' ' + U.esc(U.date(t.scheduledAt) + ' · ' + U.time(t.scheduledAt) + ' ' + U.tzAbbr(U.tz(), t.scheduledAt));
    else if (t.status === 'published' && t.publishedAt) sub = 'Published ' + U.esc(U.rel(t.publishedAt));
    else if (ch) sub = U.esc(ch.handle);
    const acts = [], jid = U.esc(job.id), tid = U.esc(t.id);
    if (t.status === 'failed' || t.status === 'cancelled') acts.push('<button type="button" class="btn xs" data-act="q-retry" data-job="' + jid + '" data-tid="' + tid + '">' + U.icon('refresh', 'xs') + 'Retry</button>');
    if (t.status === 'uploading' || t.status === 'waiting' || t.status === 'scheduled' || t.status === 'draft') acts.push('<button type="button" class="btn xs ghost" data-act="q-cancel" data-job="' + jid + '" data-tid="' + tid + '">' + U.icon('x', 'xs') + 'Cancel</button>');
    if (t.status === 'processing' && t.videoId) acts.push('<button type="button" class="btn xs ghost" data-act="q-check" data-job="' + jid + '" data-tid="' + tid + '">' + U.icon('refresh', 'xs') + 'Check status</button>');
    if (t.videoId && (t.status === 'published' || t.status === 'processing' || t.status === 'scheduled')) acts.push('<a class="btn xs ghost" target="_blank" rel="noopener noreferrer" href="https://studio.youtube.com/video/' + encodeURIComponent(t.videoId) + '/edit">' + U.icon('link', 'xs') + 'Studio</a>');
    const local = (t.demoOnly || t.localOnly) ? ' <span class="tag demo">not sent</span>' : '';
    return '<li class="tgt"><div class="tgt-top">' + U.avatar(nm, 'xs') + '<div class="nm truncate">' + U.esc(nm) + '<small>' + sub + '</small></div>' + statusBadge(t.status) + '</div>' + x +
      (t.error ? '<div class="err-line">' + U.esc(t.error) + '</div>' : '') + (t.note ? '<div class="hint" style="color:var(--warn)">' + U.esc(t.note) + '</div>' : '') + (local ? '<div>' + local + '</div>' : '') + (acts.length ? '<div class="tgt-acts">' + acts.join('') + '</div>' : '') + '</li>';
  }
  function jobCard(job) {
    const n = job.targets.length;
    return '<article class="card job"><div class="job-h"><div class="thumb" style="--h:' + (job.hue != null ? job.hue : U.hash(job.id) % 360) + '">' + U.icon('play') + '</div>' +
      '<div class="grow"><h3 class="truncate" style="white-space:normal">' + U.esc(job.title) + '</h3><p>' + U.plural(n, 'channel') + ' · ' + U.esc(U.rel(job.createdAt)) + (job.demo ? ' <span class="tag demo">demo</span>' : '') + (job.noFile ? ' <span class="tag">no video attached</span>' : '') + '</p></div>' +
      '<button type="button" class="btn xs ghost" data-act="q-edit" data-job="' + U.esc(job.id) + '" aria-label="Edit ' + U.esc(job.title) + '">' + U.icon('edit', 'xs') + 'Edit</button></div>' +
      '<ul class="tgt-list">' + job.targets.map(t => targetRow(job, t)).join('') + '</ul></article>';
  }

  /* ---------- helpers: upload form ---------- */
  function syncForm() {
    if (!up.f) return;
    const g = id => { const e = U.$('#' + id); return e ? e.value : null; };
    const t = g('up-title'), d = g('up-desc'), c = g('up-cat'), sh = U.$('#up-shorts'), v = U.$('input[name="up-vis"]:checked');
    if (t != null) up.f.title = t; if (d != null) up.f.desc = d; if (c != null) up.f.cat = c; if (sh) up.f.shorts = sh.checked; if (v) up.f.vis = v.value;
  }
  function fileArea() {
    const box = U.$('#up-file-area'); if (!box) return;
    if (!up.file) { box.innerHTML = ''; return; }
    const m = up.meta || {};
    box.innerHTML = '<div class="file-row"><span class="ico accent">' + U.icon('film') + '</span><div class="grow"><b class="truncate" style="display:block">' + U.esc(up.file.name) + '</b><span class="hint">' + U.bytes(up.file.size) + (m.duration ? ' · ' + U.dur(m.duration) : '') + (m.w ? ' · ' + m.w + '×' + m.h : '') + '</span></div>' +
      '<button type="button" class="btn icon ghost sm" data-act="up-file-rm" aria-label="Remove video">' + U.icon('trash', 'sm') + '</button></div>';
  }
  function thumbArea() {
    const box = U.$('#up-thumb-area'); if (!box) return;
    box.innerHTML = !up.thumb ? '<label class="btn ghost sm" for="up-thumb" style="justify-self:start">' + U.icon('image', 'sm') + 'Add thumbnail</label>'
      : '<div class="file-row"><img src="' + U.esc(up.thumbUrl) + '" alt="Thumbnail preview" style="width:44px;height:78px;object-fit:cover;border-radius:8px"><div class="grow"><b class="truncate" style="display:block">' + U.esc(up.thumb.name) + '</b><span class="hint">' + U.bytes(up.thumb.size) + '</span></div><button type="button" class="btn icon ghost sm" data-act="up-thumb-rm" aria-label="Remove thumbnail">' + U.icon('trash', 'sm') + '</button></div>';
  }
  function fileNote(extra) {
    const box = U.$('#up-file-note'); if (!box) return;
    const m = up.meta || {}, notes = [];
    if (m.duration && m.duration > LIM.maxSeconds) notes.push('This video is ' + U.dur(m.duration) + ' long. YouTube only treats videos up to 3 minutes as Shorts.');
    if (m.w && m.h && m.w > m.h) notes.push('This video is landscape. Shorts should be vertical or square (9:16 is best).');
    if (extra) notes.push(extra);
    box.innerHTML = notes.map(n => '<div class="banner">' + U.icon('info') + '<p>' + U.esc(n) + '</p></div>').join('');
  }
  function chips() {
    const box = U.$('#up-chips'); if (!box || !up.tags) return;
    box.innerHTML = up.tags.map((t, i) => '<span class="tchip">' + U.esc(t) + '<button type="button" data-act="up-tag-del" data-i="' + i + '" aria-label="Remove tag ' + U.esc(t) + '">' + U.icon('x', 'xs') + '</button></span>').join('');
    const c = U.$('#up-tags-c'); if (c) c.textContent = YT.tagsLen(up.tags) + '/' + LIM.tagsTotal;
  }
  function addTag(raw) {
    const added = parseTags(raw);
    added.forEach(t => { if (up.tags.length < LIM.tagCount && up.tags.every(x => x.toLowerCase() !== t.toLowerCase())) up.tags.push(t); });
    chips(); saveDraft(); preview();
  }
  function counters() {
    const t = U.$('#up-title'), d = U.$('#up-desc');
    if (t) U.$('#up-title-c').textContent = t.value.length + '/' + LIM.title;
    if (d) { const b = YT.bytesOf(YT.buildDescription({ title: t ? t.value : '', description: d.value }, up.f && up.f.shorts)); const el = U.$('#up-desc-c'); el.textContent = b + '/' + LIM.descBytes + ' bytes'; el.style.color = b > LIM.descBytes ? 'var(--err)' : ''; }
  }
  function saveDraft() {
    syncForm();
    try { Store.set('draft', { title: up.f.title, description: up.f.desc, visibility: up.f.vis, category: up.f.cat, tags: up.tags }); } catch (e) { /* ignore */ }
  }
  function readSched() {
    if (up.mode !== 'schedule') return;
    const d = U.$('#up-d'), t = U.$('#up-t');
    if (d && t) up.when = { date: d.value, time: t.value };
    up.chans.forEach(id => { const dd = U.$('#up-d-' + id), tt = U.$('#up-t-' + id); if (dd && tt) up.times[id] = { date: dd.value, time: tt.value }; });
  }
  function chanList() {
    const box = U.$('#up-chans'); if (!box) return;
    const chans = Store.channels();
    up.chans = up.chans.filter(id => { const c = chans.find(x => x.id === id); return c && canUse(c); });
    box.innerHTML = chans.map(c => {
      const dis = !canUse(c), on = up.chans.indexOf(c.id) >= 0;
      return '<label class="pick ' + (dis ? 'dis' : '') + '"><input type="checkbox" class="vh" data-chg="up-chan" value="' + U.esc(c.id) + '" ' + (dis ? 'disabled' : '') + (on ? ' checked' : '') + '><span class="pick-in">' + U.avatar(c.name, 'sm') +
        '<span class="pick-t"><b class="truncate">' + U.esc(c.name) + '</b><small class="truncate">' + U.esc(c.handle) + ' · ' + U.num(c.subs) + ' subscribers</small></span>' +
        (dis ? U.badge('Reconnect', 'warn') : '<span class="tick">' + U.icon('check', 'sm') + '</span>') + '</span></label>';
    }).join('') + (chans.some(c => stale(c)) ? '<p class="hint">Some sessions are paused — they refresh automatically when you upload.</p>' : '');
    const cc = U.$('#up-chan-count'); if (cc) cc.textContent = up.chans.length ? up.chans.length + ' of ' + chans.length + ' selected' : 'Choose where this Short should be posted.';
  }
  function schedArea() {
    const box = U.$('#up-sched'); if (!box) return;
    if (up.mode !== 'schedule') { box.innerHTML = ''; return; }
    const tz = U.tz(), tmr = U.zoned(Date.now() + 86400e3, tz).date, today = U.zoned(Date.now(), tz).date;
    if (!up.when) up.when = { date: tmr, time: '13:00' };
    let h = '<div class="sched-box"><div class="field"><label for="up-tz">Timezone</label><select class="select" id="up-tz" data-chg="up-tz">' + U.tzOptions(tz) + '</select></div>' +
      '<div class="set-row" style="padding:0;border:0"><div class="t">Same time for all channels<small>Turn off to pick a different time per channel</small></div>' + U.sw('up-same', up.same, 'Same time for all channels') + '</div>';
    if (up.same) {
      h += '<div class="row2"><div class="field"><label for="up-d">Date</label><input class="input" type="date" id="up-d" min="' + today + '" value="' + U.esc(up.when.date) + '" data-chg="up-sched"></div><div class="field"><label for="up-t">Time</label><input class="input" type="time" id="up-t" value="' + U.esc(up.when.time) + '" data-chg="up-sched"></div></div>';
    } else if (!up.chans.length) {
      h += '<p class="hint">Select channels first, then set a time for each.</p>';
    } else {
      up.chans.forEach((id, i) => {
        const c = Store.channel(id); if (!c) return;
        const cur = up.times[id] || (up.times[id] = { date: up.when.date, time: String((13 + i) % 24).padStart(2, '0') + ':00' });
        h += '<div class="sched-row"><div class="row">' + U.avatar(c.name, 'xs') + '<b>' + U.esc(c.name) + '</b></div><div class="row2"><input class="input" type="date" id="up-d-' + U.esc(id) + '" min="' + today + '" value="' + U.esc(cur.date) + '" data-chg="up-sched" aria-label="' + U.esc(c.name) + ' date"><input class="input" type="time" id="up-t-' + U.esc(id) + '" value="' + U.esc(cur.time) + '" data-chg="up-sched" aria-label="' + U.esc(c.name) + ' time"></div></div>';
      });
    }
    h += '<p class="hint">Times are in ' + U.esc(tz) + ' (' + U.esc(U.tzAbbr(tz)) + '). ' + (Store.isDemo() ? 'In demo mode a schedule is only saved on this device.' : 'YouTube publishes at the chosen time after the upload finishes, even if you close this tab.') + '</p></div>';
    box.innerHTML = h;
  }
  function selected() { return up.chans.map(Store.channel).filter(Boolean); }
  function whenFor(id) {
    if (up.mode !== 'schedule') return null;
    const tz = U.tz(), x = up.same ? up.when : (up.times[id] || up.when);
    return x ? U.zonedToUtc(x.date, x.time, tz) : NaN;
  }
  function collect() {
    syncForm();
    return { title: U.clean(up.f.title, LIM.title), description: U.clean(up.f.desc, LIM.desc), visibility: up.f.vis || 'public', category: up.f.cat || '28', tags: (up.tags || []).slice(), appendShorts: !!up.f.shorts };
  }
  function buildJob(f, targets) {
    return { id: U.uid('j'), title: f.title, description: f.description, tags: f.tags, visibility: f.visibility, category: f.category, appendShorts: f.appendShorts, hue: U.hash(f.title) % 360, createdAt: Date.now(), demo: Store.isDemo(),
      file: up.file ? { name: up.file.name, size: up.file.size, type: up.file.type, duration: up.meta && up.meta.duration ? Math.round(up.meta.duration) : null } : null, targets };
  }
  function preview() {
    if (!U.$('#pv-kv')) return;
    const f = collect(), sel = selected(), first = sel[0];
    U.$('#pv-handle').textContent = first ? first.handle || first.name : '@channel';
    U.$('#pv-title').textContent = f.title || 'Your title appears here';
    U.$('#pv-phone').style.setProperty('--h', String(U.hash(f.title || 'x') % 360));
    const catName = (CATS.find(c => c[0] === String(f.category)) || [0, ''])[1];
    const chList = sel.length ? sel.map(c => { const t = whenFor(c.id); return '<div>' + U.esc(c.name) + (t && !isNaN(t) ? ' <span class="muted">→ ' + U.esc(U.dateShort(t) + ', ' + U.time(t)) + '</span>' : '') + '</div>'; }).join('') : '<span class="dim">None selected</span>';
    U.$('#pv-kv').innerHTML = '<div><dt>Channels</dt><dd>' + chList + '</dd></div><div><dt>Visibility · Category</dt><dd>' + U.esc((VIS.find(v => v[0] === f.visibility) || [0, ''])[1]) + ' · ' + U.esc(catName) + '</dd></div><div><dt>Publish</dt><dd>' + (up.mode === 'schedule' ? 'Scheduled' : 'Immediately') + '</dd></div>';
    const pj = U.$('#pv-json');
    if (pj) {
      const target = { scheduledAt: first ? whenFor(first.id) : null };
      const req = YT.buildUploadRequest({ title: f.title || '(untitled)', description: f.description, tags: f.tags, visibility: f.visibility, category: f.category, file: up.file ? { type: up.file.type } : null }, isNaN(target.scheduledAt) ? { scheduledAt: null } : target, { appendShorts: f.appendShorts });
      pj.textContent = JSON.stringify({ method: req.method, url: req.url, body: req.body }, null, 2);
    }
    if (up.step === 3) renderChecks();
    bar();
  }
  function previewMedia() {
    const box = U.$('#pv-media'); if (!box) return;
    box.innerHTML = up.fileUrl ? '<video src="' + U.esc(up.fileUrl) + '#t=0.3" muted playsinline loop preload="metadata"></video><button type="button" class="pv-play" data-act="pv-toggle" aria-label="Play preview">' + U.icon('play') + '</button>' : up.thumbUrl ? '<img class="cover" src="' + U.esc(up.thumbUrl) + '" alt="">' : '<div class="empty-ph">' + U.icon('film', 'lg') + '</div>';
  }
  function mark(id, msg) {
    const el = U.$('#' + id), er = U.$('#' + id + '-e');
    if (el) el.classList.toggle('invalid', !!msg);
    if (er) { er.hidden = !msg; er.textContent = msg || ''; }
  }
  /* Returns every problem as { msg, step, field } plus warnings. */
  function validate(maxStep) {
    maxStep = maxStep || 3;
    const f = collect(), errors = [], bad = /[<>]/;
    ['up-title', 'up-desc', 'up-tags', 'up-chans'].forEach(i => mark(i, ''));
    const E = (msg, step, field) => { if (step > maxStep) return; errors.push({ msg, step, field }); if (field) mark(field, msg); };
    if (!up.file) E('Choose a video file first.', 1);
    if (!f.title) E('A title is required.', 1, 'up-title');
    else if (bad.test(f.title)) E('YouTube doesn\'t allow < or > in titles.', 1, 'up-title');
    if (bad.test(f.description)) E('YouTube doesn\'t allow < or > in descriptions.', 1, 'up-desc');
    const dbytes = YT.bytesOf(YT.buildDescription({ title: f.title, description: f.description }, f.appendShorts));
    if (dbytes > LIM.descBytes) E('Description is ' + dbytes + ' bytes — YouTube allows 5,000 (emoji and Hindi letters use several bytes each). Shorten it.', 1, 'up-desc');
    if (YT.tagsLen(f.tags) > LIM.tagsTotal) E('Tags are too long — keep them under ' + LIM.tagsTotal + ' characters in total.', 1, 'up-tags');
    const sel = selected();
    if (!sel.length) E('Select at least one channel.', 2, 'up-chans');
    const times = {};
    if (up.mode === 'schedule') {
      readSched();
      sel.forEach(c => { const t = whenFor(c.id); if (isNaN(t)) E('Pick a date and time for ' + c.name + '.', 3); else if (t < Date.now() + 5 * 60e3) E('The time for ' + c.name + ' must be at least 5 minutes from now.', 3); else if (t > Date.now() + 6 * 30 * 86400e3) E('YouTube schedules at most ~6 months ahead (' + c.name + ').', 3); times[c.id] = t; });
    }
    return { errors, f, sel, times };
  }
  function renderChecks() {
    const box = U.$('#up-checks'); if (!box) return;
    const m = up.meta || {}, out = [];
    const row = (tone, text) => out.push('<div class="chk ' + tone + '">' + U.icon(tone === 'ok' ? 'check' : tone === 'err' ? 'alert' : 'info', 'sm') + '<span>' + U.esc(text) + '</span></div>');
    if (up.file) {
      if (m.duration) row(m.duration <= LIM.maxSeconds ? 'ok' : 'warn', m.duration <= LIM.maxSeconds ? 'Length ' + U.dur(m.duration) + ' — can be a Short.' : 'Length ' + U.dur(m.duration) + ' — over 3 minutes, so it will be a normal video, not a Short.');
      if (m.w && m.h) row(m.w <= m.h ? 'ok' : 'warn', m.w <= m.h ? 'Vertical or square (' + m.w + '×' + m.h + ') — good for Shorts.' : 'Landscape (' + m.w + '×' + m.h + ') — YouTube will not treat it as a Short.');
      row('ok', 'File ' + U.bytes(up.file.size) + ' — within the limit.');
    }
    const v = validate();
    v.errors.forEach(e => row('err', e.msg));
    if (!v.errors.length) row('ok', 'Title, description, tags and channels look good.');
    if (!Store.isDemo()) row('info', 'Each upload uses 1,600 of your Google project\'s 10,000 daily quota units (about 6 uploads a day in total).');
    box.innerHTML = out.join('');
  }
  /* bottom bar buttons */
  function bar() {
    const nx = U.$('#up-next-l'), bk = U.$('#up-back'), b = U.$('#up-bar'); if (!nx) return;
    if (b) b.hidden = !up.file;
    const n = up.chans.length, demo = Store.isDemo();
    bk.textContent = up.step === 1 ? 'Cancel' : 'Back';
    nx.textContent = up.step < 3 ? 'Next' : (demo ? 'Save demo draft' : up.mode === 'schedule' ? 'Schedule on ' + (n === 1 ? '1 channel' : n + ' channels') : 'Upload to ' + (n === 1 ? '1 channel' : n ? n + ' channels' : 'channels'));
  }
  function goStep(n) {
    syncForm(); readSched();
    up.step = U.clamp(+n || 1, 1, 3);
    U.$$('.up-step').forEach(s => { s.hidden = +s.dataset.step !== up.step; });
    U.$$('.up-steps button').forEach(b => b.setAttribute('aria-current', String(+b.dataset.s === up.step)));
    if (up.step === 3) renderChecks();
    bar(); const e = U.$('#up-errors'); if (e) e.hidden = true;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  function showError(e) {
    const box = U.$('#up-errors'); if (box) { box.hidden = false; box.textContent = e.msg; }
    U.toast(e.msg, 'err');
    if (e.step && e.step !== up.step) goStep(e.step);
    const bad = U.$('.invalid'); if (bad) { try { bad.scrollIntoView({ block: 'center' }); } catch (x) { /* ignore */ } }
  }

  /* ---------- actions ---------- */
  U.act('goto', t => { location.hash = '#/' + t.dataset.to; });
  U.act('up-close', async () => {
    if (up.file && !await U.confirm({ title: 'Discard this upload?', body: 'The selected video and details on this screen will be cleared.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true })) return;
    reset(); location.hash = '#/dashboard';
  });
  U.act('up-step', t => {
    const n = +t.dataset.s;
    if (!up.file) { U.toast('Choose a video first.', 'info'); return; }
    if (n > up.step) { const v = validate(n - 1), e = v.errors[0]; if (e) return showError(e); }
    goStep(n);
  });
  U.act('up-back', () => { if (up.step === 1) U.$('[data-act="up-close"]').click(); else goStep(up.step - 1); });
  U.act('up-next', () => {
    if (up.step < 3) { const v = validate(up.step), e = v.errors[0]; if (e) return showError(e); goStep(up.step + 1); }
    else submit();
  });
  U.act('up-all', () => { up.chans = Store.channels().filter(canUse).map(c => c.id); chanList(); schedArea(); preview(); });
  U.act('up-none', () => { readSched(); up.chans = []; chanList(); schedArea(); preview(); });
  U.act('up-mode', t => { readSched(); up.mode = t.dataset.m; U.$$('[data-act="up-mode"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); schedArea(); preview(); });
  U.act('up-file-rm', () => { revokeUrl(up.fileUrl); up.file = up.fileUrl = up.meta = null; const i = U.$('#up-file'); if (i) i.value = ''; U.$('#up-hero').hidden = false; U.$('#up-work').hidden = true; bar(); fileArea(); fileNote(); previewMedia(); });
  U.act('up-thumb-rm', () => { revokeUrl(up.thumbUrl); up.thumb = up.thumbUrl = null; const i = U.$('#up-thumb'); if (i) i.value = ''; thumbArea(); previewMedia(); });
  U.act('up-tag-del', t => { up.tags.splice(+t.dataset.i, 1); chips(); saveDraft(); preview(); });
  U.act('pv-toggle', t => { const v = U.$('#pv-media video'); if (!v) return; if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); t.style.opacity = 0; } else { v.pause(); t.style.opacity = 1; } });
  U.chg('up-field', () => { counters(); saveDraft(); preview(); });
  U.inp('up-field', () => { counters(); saveDraft(); preview(); });
  U.chg('up-vis', () => { syncForm(); preview(); });
  U.inp('up-tag-typing', t => { if (/[,\n]/.test(t.value)) { addTag(t.value); t.value = ''; } });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'up-tag-in') { if (e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); e.target.value = ''; } else if (e.key === 'Backspace' && !e.target.value && up.tags && up.tags.length) { up.tags.pop(); chips(); saveDraft(); preview(); } } });
  document.addEventListener('focusout', e => { if (e.target && e.target.id === 'up-tag-in' && e.target.value.trim()) { addTag(e.target.value); e.target.value = ''; } });
  U.chg('up-chan', t => { readSched(); if (t.checked) { if (up.chans.indexOf(t.value) < 0) up.chans.push(t.value); } else up.chans = up.chans.filter(x => x !== t.value); const cc = U.$('#up-chan-count'); if (cc) cc.textContent = up.chans.length ? up.chans.length + ' of ' + Store.channels().length + ' selected' : 'Choose where this Short should be posted.'; schedArea(); preview(); });
  U.chg('up-tz', t => { readSched(); Store.saveSettings({ timezone: t.value }); schedArea(); preview(); });
  U.chg('up-same', t => { readSched(); up.same = t.checked; schedArea(); preview(); });
  U.chg('up-sched', () => { readSched(); preview(); });
  U.chg('up-file', t => { const f = t.files && t.files[0]; if (f) pickFile(f); });
  U.chg('up-thumb', t => {
    const f = t.files && t.files[0]; if (!f) return;
    if (LIM.thumbTypes.indexOf(f.type) < 0) { U.toast('Thumbnails must be JPG or PNG.', 'err'); t.value = ''; return; }
    if (f.size > LIM.thumbBytes) { U.toast('Thumbnail is ' + U.bytes(f.size) + ' — the limit is 2 MB.', 'err'); t.value = ''; return; }
    revokeUrl(up.thumbUrl);
    up.thumb = f; up.thumbUrl = URL.createObjectURL(f); thumbArea(); if (!up.fileUrl) previewMedia();
  });
  function pickFile(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (LIM.types.indexOf(f.type) < 0 && LIM.exts.indexOf(ext) < 0) { U.toast('Unsupported file type. Use MP4, MOV or WebM.', 'err'); return; }
    if (f.size > LIM.maxBytes) { U.toast('That file is ' + U.bytes(f.size) + '. The limit in this app is ' + U.bytes(LIM.maxBytes) + '.', 'err'); return; }
    if (f.size < 1024) { U.toast('That file looks empty.', 'err'); return; }
    initForm(); revokeUrl(up.fileUrl);
    up.file = f; up.fileUrl = URL.createObjectURL(f); up.meta = null;
    const ti = U.$('#up-title');
    if (ti && !ti.value.trim()) { ti.value = f.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/[<>]/g, '').trim().slice(0, LIM.title); up.f.title = ti.value; }
    U.$('#up-hero').hidden = true; U.$('#up-work').hidden = false;
    goStep(1); fileArea(); fileNote(); previewMedia(); counters(); preview();
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { up.meta = { duration: v.duration, w: v.videoWidth, h: v.videoHeight }; fileArea(); fileNote(); if (up.step === 3) renderChecks(); };
    v.onerror = () => { up.meta = {}; fileNote('Couldn\'t read this video\'s details in your browser. You can still try uploading it.'); };
    v.src = up.fileUrl;
  }
  const dropT = e => e.target.closest && e.target.closest('.up-hero, .drop');
  document.addEventListener('dragover', e => { const d = dropT(e); if (d) { e.preventDefault(); d.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const d = dropT(e); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', e => { const d = dropT(e); if (d) { e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) pickFile(f); } });

  async function submit() {
    if (up.busy) return;
    const btn = U.$('#up-next');
    const v = validate();
    if (v.errors.length) return showError(v.errors[0]);
    U.$('#up-errors').hidden = true;
    const demo = Store.isDemo();
    if (!demo) {
      up.busy = true; U.busy(btn, true, 'Checking sign-in…');
      const ids = v.sel.map(c => c.id);
      let e = await YT.ensure(ids);
      if (!e.ok) { await YT.renewAll(true); e = await YT.ensure(ids); }
      up.busy = false; U.busy(btn, false); bar();
      if (!e.ok) { const names = e.missing.map(Store.channelName).join(', '); U.toast('Couldn\'t refresh the sign-in for ' + names + '. Allow pop-ups for this site and tap again, or reconnect the channel.', 'err', 7000); w.App.authBar && w.App.authBar(); return; }
    }
    const targets = v.sel.map(c => {
      const at = v.times[c.id] || null;
      return { id: U.uid('t'), channelId: c.id, status: demo ? (at ? 'scheduled' : 'draft') : 'waiting', progress: 0, scheduledAt: at, error: null, demoOnly: demo };
    });
    const job = buildJob(v.f, targets);
    Store.saveJob(job);
    const names = v.sel.map(c => c.name).join(', ');
    try { Store.remove('draft'); } catch (e2) { /* ignore */ }
    const file = up.file, thumb = up.thumb;
    if (demo) {
      w.Activity.add(v.times[v.sel[0].id] ? 'schedule' : 'upload', 'info', (v.times[v.sel[0].id] ? 'Scheduled locally' : 'Saved demo draft') + ' "' + job.title + '" for ' + names + ' — not sent to YouTube');
      U.toast('Saved as a local demo draft. Nothing was sent to YouTube — ' + YT.DEMO_HINT, 'warn', 6500);
    } else {
      liveFiles[job.id] = { file, thumb };
      w.Activity.add('upload', 'info', 'Upload started "' + job.title + '" → ' + names);
      U.toast('Upload started. Keep this tab open until it finishes.', 'info');
    }
    up.file = null; revokeUrl(up.fileUrl); up.fileUrl = null;     // keep File alive via liveFiles only
    reset();
    location.hash = '#/queue';
    if (!demo) Uploads.run(job.id);
  }

  U.act('q-filter', t => { Uploads.qFilter = t.dataset.f; U.$$('[data-act="q-filter"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); Uploads.qList(); });
  U.act('q-retry', async t => {
    const j = Store.job(t.dataset.job); if (!j) return;
    if (Store.isDemo() || j.demo) {
      const r = await YT.uploadVideo({ channelId: (j.targets.find(x => x.id === t.dataset.tid) || {}).channelId });
      U.toast(r.message || YT.DEMO_MESSAGE, 'warn'); return;
    }
    const tg = j.targets.find(x => x.id === t.dataset.tid);
    if (tg && tg.videoId && tg.status === 'failed') { patch(j.id, tg.id, { status: 'processing', error: null }); w.App.rerenderIf('queue'); watch(); return; }
    if (!tg) return;
    const e = await YT.ensure([tg.channelId]); if (!e.ok) { await YT.renewAll(true); }
    patch(j.id, t.dataset.tid, { status: 'waiting', progress: 0, error: null }); w.App.rerenderIf('queue'); Uploads.run(j.id, t.dataset.tid);
  });
  U.act('q-cancel', async t => {
    const j = Store.job(t.dataset.job); if (!j) return;
    const tg = j.targets.find(x => x.id === t.dataset.tid); if (!tg) return;
    const extra = tg.videoId ? ' The video was already uploaded to YouTube and will stay there as a scheduled private video until you delete it in YouTube Studio.' : '';
    if (!await U.confirm({ title: 'Cancel this upload?', body: 'This stops "' + j.title + '" on ' + Store.channelName(tg.channelId) + '.' + extra, confirmText: 'Cancel upload', cancelText: 'Keep it', danger: true })) return;
    patch(j.id, tg.id, { status: 'cancelled', error: null });
    if (ctls[tg.id]) { try { ctls[tg.id].abort(); } catch (e) { /* ignore */ } }
    w.Activity.add('upload', 'warn', 'Cancelled "' + j.title + '" on ' + Store.channelName(tg.channelId));
    w.App.rerender(); U.toast('Cancelled.', 'ok');
  });
  U.act('q-check', async t => { await checkTarget(t.dataset.job, t.dataset.tid, false); });

  U.act('q-edit', t => editJob(t.dataset.job));
  function editJob(id) {
    const j = Store.job(id); if (!j) return;
    const uploaded = j.targets.some(t => t.videoId);
    const editable = j.targets.filter(t => t.status === 'scheduled' || t.status === 'draft');
    const html = '<div class="stack">' +
      (uploaded ? '<div class="banner info">' + U.icon('info') + '<p>This video is already on YouTube. Edit its title and description in YouTube Studio — only schedule times can change here.</p></div>' : '') +
      '<div class="field"><label for="ed-title">Title</label><input class="input" id="ed-title" maxlength="' + LIM.title + '" value="' + U.esc(j.title) + '" ' + (uploaded ? 'disabled' : '') + '></div>' +
      '<div class="field"><label for="ed-desc">Description</label><textarea class="textarea" id="ed-desc" maxlength="' + LIM.desc + '" ' + (uploaded ? 'disabled' : '') + '>' + U.esc(j.description || '') + '</textarea></div>' +
      '<div class="field"><label for="ed-vis">Visibility</label><select class="select" id="ed-vis" ' + (uploaded ? 'disabled' : '') + '>' + VIS.map(x => '<option value="' + x[0] + '" ' + (j.visibility === x[0] ? 'selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>' +
      (editable.length ? '<div class="lbl">Schedule · ' + U.esc(U.tz()) + '</div>' + editable.map(t => '<div class="sched-row"><div class="row">' + U.avatar(Store.channelName(t.channelId), 'xs') + '<b>' + U.esc(Store.channelName(t.channelId)) + '</b></div>' + U.dtFields('ed-' + t.id, t.scheduledAt || (Date.now() + 86400e3)) + '</div>').join('') : '<p class="hint">No editable schedule on this Short.</p>') + '</div>';
    U.modal({
      title: 'Edit Short', html,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save changes', kind: 'primary', onClick: async h => {
          const root = h.el, title = U.clean(U.$('#ed-title', root).value, LIM.title);
          if (!title) { U.toast('A title is required.', 'err'); return false; }
          if (/[<>]/.test(title + U.$('#ed-desc', root).value)) { U.toast('Titles and descriptions can\'t contain < or >.', 'err'); return false; }
          const times = {};
          for (const t of editable) {
            const at = U.readDt(root, 'ed-' + t.id);
            if (isNaN(at)) { U.toast('Pick a valid date and time.', 'err'); return false; }
            if (t.status === 'scheduled' && at < Date.now() + 5 * 60e3 && at !== t.scheduledAt) { U.toast('Scheduled times must be in the future.', 'err'); return false; }
            times[t.id] = at;
          }
          const cur = Store.job(id);
          for (const t of cur.targets) {
            if (times[t.id] != null && times[t.id] !== t.scheduledAt) {
              if (t.videoId && !cur.demo) { const r = await YT.rescheduleVideo(t.channelId, t.videoId, times[t.id]); if (!r.ok) { U.toast(r.message || 'Could not reschedule on YouTube.', 'err'); return false; } }
              t.scheduledAt = times[t.id]; if (t.status === 'draft') t.status = 'scheduled';
            }
          }
          if (!uploaded) { cur.title = title; cur.description = U.clean(U.$('#ed-desc', root).value, LIM.desc); cur.visibility = U.$('#ed-vis', root).value; }
          Store.saveJob(cur);
          w.Activity.add('schedule', 'info', 'Edited "' + cur.title + '"' + (cur.demo ? ' (demo — local only)' : ''));
          U.toast(cur.demo ? 'Saved locally (demo).' : 'Saved.', 'ok'); w.App.rerender();
        }
      }]
    });
  }
  Uploads.editJob = editJob;

  w.Uploads = Uploads;
})(window);
