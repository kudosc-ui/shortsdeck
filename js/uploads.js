/* uploads.js — Short uploader (page 3) and upload queue (page 4).
   Demo mode never pretends anything was sent: jobs are saved as local "draft" / local-schedule entries.
   Live mode (OAuth configured + authorised) really calls YT.uploadVideo()/scheduleVideo(). */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;

  const CATS = [['28', 'Science & Technology'], ['27', 'Education'], ['22', 'People & Blogs'], ['24', 'Entertainment'], ['20', 'Gaming'], ['10', 'Music'], ['26', 'Howto & Style'], ['23', 'Comedy'], ['25', 'News & Politics'], ['17', 'Sports'], ['1', 'Film & Animation']];
  const VIS = [['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']];
  const LIM = { maxBytes: 512 * 1024 * 1024, types: ['video/mp4', 'video/quicktime', 'video/webm'], exts: ['mp4', 'mov', 'webm'], thumbBytes: 2 * 1024 * 1024, thumbTypes: ['image/jpeg', 'image/png'], maxSeconds: 180, title: 100, desc: 5000, tagsTotal: 500, tagMax: 30, tagCount: 15 };
  const ST = {
    uploading: ['Uploading', 'info', 'upload'], processing: ['Processing', 'warn', 'refresh'], scheduled: ['Scheduled', 'accent', 'clock'],
    published: ['Published', 'ok', 'check'], failed: ['Failed', 'err', 'alert'], cancelled: ['Cancelled', 'mute', 'x'], draft: ['Draft · not sent', 'mute', 'edit']
  };
  const statusBadge = s => { const m = ST[s] || ST.draft; return U.badge(m[0], m[1], m[2]); };
  const liveFiles = {};   // jobId -> File (memory only; files are never persisted)
  const aborters = {};    // targetId -> XMLHttpRequest

  const up = { file: null, fileUrl: null, thumb: null, thumbUrl: null, meta: null, tags: [], chans: [], mode: 'now', same: true, when: null, times: {} };

  function revoke() { [up.fileUrl, up.thumbUrl].forEach(u => { if (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } } }); }
  function reset() { revoke(); up.file = up.fileUrl = up.thumb = up.thumbUrl = up.meta = null; up.chans = []; up.mode = 'now'; up.same = true; up.when = null; up.times = {}; }
  const parseTags = str => { const seen = {}, out = []; String(str || '').split(/[,\n]/).forEach(t => { t = t.replace(/[<>#]/g, '').trim().slice(0, LIM.tagMax); if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push(t); } }); return out.slice(0, LIM.tagCount); };
  const usable = () => Store.channels().filter(c => c.status !== 'expired' && (Store.isDemo() || YT.hasToken(c.id)));

  /* ====================================================================== UPLOAD PAGE */
  const Uploads = {
    ST, statusBadge, CATS, VIS,

    renderUpload() {
      reset();
      const chans = Store.channels();
      if (!chans.length) return U.empty({ icon: 'channels', title: 'No YouTube channels connected yet.', body: 'Connect a channel to choose where your Short goes.', action: '<button type="button" class="btn primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube</button>' });
      const s = Store.settings(), d = Store.get('draft', {});
      const v = Object.assign({ title: '', description: s.defaults.description, visibility: s.defaults.visibility, category: s.defaults.category }, d);
      up.tags = Array.isArray(d.tags) ? d.tags.slice(0, LIM.tagCount) : parseTags(s.defaults.tags);
      let h = '';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — ' + U.esc(YT.DEMO_HINT) + ' You can fill this in and save a local draft; nothing is sent to YouTube.</p></div>';
      h += '<div class="cols upload"><div class="stack">';

      h += '<section class="card"><div class="card-h"><h2>1 · Video</h2><span class="sub">MP4, MOV, WebM</span></div><div id="up-file-area"></div>' +
        '<input class="vh" type="file" id="up-file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" data-chg="up-file" aria-label="Video file"><div id="up-file-note" class="stack sm" style="margin-top:10px"></div>' +
        '<div class="field" style="margin-top:16px"><label>Thumbnail <span class="counter">optional · JPG/PNG · 2 MB</span></label><div id="up-thumb-area"></div></div>' +
        '<input class="vh" type="file" id="up-thumb" accept="image/jpeg,image/png" data-chg="up-thumb" aria-label="Thumbnail image"></section>';

      h += '<section class="card"><div class="card-h"><h2>2 · Details</h2></div>' +
        '<div class="field"><label for="up-title">Title <span class="counter" id="up-title-c">0/' + LIM.title + '</span></label><input class="input" id="up-title" maxlength="' + LIM.title + '" placeholder="e.g. 5 AI Websites you can build today" value="' + U.esc(v.title) + '" data-inp="up-field" autocomplete="off"><div class="err-text" id="up-title-e" hidden></div></div>' +
        '<div class="field"><label for="up-desc">Description <span class="counter" id="up-desc-c">0/' + LIM.desc + '</span></label><textarea class="textarea" id="up-desc" maxlength="' + LIM.desc + '" data-inp="up-field">' + U.esc(v.description) + '</textarea><div class="err-text" id="up-desc-e" hidden></div></div>' +
        '<div class="field"><label for="up-tag-in">Tags <span class="counter" id="up-tags-c"></span></label><div class="tag-box"><span id="up-chips" style="display:contents"></span><input id="up-tag-in" placeholder="Add a tag, press Enter" enterkeyhint="done" autocomplete="off" data-inp="up-tag-typing"></div><div class="err-text" id="up-tags-e" hidden></div></div>' +
        '<div class="row2"><div class="field"><label for="up-vis">Visibility</label><select class="select" id="up-vis" data-chg="up-field">' + VIS.map(x => '<option value="' + x[0] + '" ' + (v.visibility === x[0] ? 'selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="up-cat">Category</label><select class="select" id="up-cat" data-chg="up-field">' + CATS.map(x => '<option value="' + x[0] + '" ' + (String(v.category) === x[0] ? 'selected' : '') + '>' + U.esc(x[1]) + '</option>').join('') + '</select></div></div>' +
        '<div class="set-row" style="margin-top:12px"><div class="t">Add #Shorts to the description<small>Helps YouTube classify vertical videos under 3 minutes as Shorts</small></div>' + U.sw('up-field', s.defaults.appendShorts, 'Add #Shorts', 'id="up-shorts"') + '</div></section>';

      h += '<section class="card"><div class="card-h"><h2>3 · Channels</h2><span class="sub" id="up-chan-count"></span></div><div class="stack sm" id="up-chans">' +
        chans.map(c => {
          const dis = !(c.status !== 'expired' && (Store.isDemo() || YT.hasToken(c.id)));
          return '<label class="pick ' + (dis ? 'dis' : '') + '"><input type="checkbox" class="vh" data-chg="up-chan" value="' + U.esc(c.id) + '" ' + (dis ? 'disabled' : '') + '><span class="pick-in">' + U.avatar(c.name, 'sm') +
            '<span class="pick-t"><b class="truncate">' + U.esc(c.name) + '</b><small class="truncate">' + U.esc(c.handle) + ' · ' + U.num(c.subs) + ' subscribers</small></span>' +
            (dis ? U.badge('Reconnect', 'warn') : '<span class="tick">' + U.icon('check', 'sm') + '</span>') + '</span></label>';
        }).join('') + '</div><div class="err-text" id="up-chans-e" hidden></div></section>';

      h += '<section class="card"><div class="card-h"><h2>4 · Publishing</h2></div><div class="seg" role="group" aria-label="Publishing option"><button type="button" data-act="up-mode" data-m="now" aria-pressed="true">Publish now</button><button type="button" data-act="up-mode" data-m="schedule" aria-pressed="false">Schedule</button></div><div id="up-sched"></div></section>';

      h += '</div><div class="sticky-col stack"><section class="card"><div class="card-h"><h2>Preview</h2><span class="sub">Before you publish</span></div><div class="preview"><div class="phone" id="pv-phone" style="--h:350"><div id="pv-media"></div><div class="rail" aria-hidden="true"><i></i><i></i><i></i></div><div class="ov-b"><b id="pv-handle">@channel</b><span id="pv-title">Your title appears here</span></div></div>' +
        '<dl class="kv" id="pv-kv"></dl></div><details class="fold" style="margin-top:12px"><summary>API request preview</summary><pre class="code" id="pv-json" tabindex="0"></pre><p class="hint" style="margin-top:8px">This is the exact JSON <code>videos.insert</code> would receive. The file itself is streamed separately.</p></details></section></div></div>';

      h += '<div class="cta-bar"><div id="up-errors" role="alert" class="err-text" hidden></div><button type="button" class="btn primary block" data-act="up-submit" id="up-submit">' + U.icon('upload') + '<span id="up-submit-l">Upload to Selected Channels</span></button>' +
        '<small>' + (Store.isDemo() ? 'Demo mode: saves a local draft only — nothing is sent to YouTube.' : 'Your video is uploaded directly from this browser to YouTube.') + '</small></div>';
      return h;
    },

    mountUpload() {
      if (!U.$('#up-title')) return;
      fileArea(); thumbArea(); chips(); schedArea(); counters(); preview();
    },

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
    mountQueue() { Uploads.qList(); },
    qMatch(t, f) { return f === 'all' || (f === 'active' ? (t.status === 'uploading' || t.status === 'processing') : t.status === f); },
    qList() {
      const box = U.$('#q-list'); if (!box) return;
      const jobs = Store.col('jobs').filter(j => j.targets.some(t => Uploads.qMatch(t, Uploads.qFilter)));
      box.innerHTML = jobs.length ? jobs.map(jobCard).join('') : '<div style="grid-column:1/-1">' + U.empty({ icon: 'queue', title: 'Nothing here', body: 'No Shorts match this filter.' }) + '</div>';
    },

    /* ================================================================== LIVE UPLOAD RUNNER */
    async run(jobId, onlyTid) {
      const file = liveFiles[jobId];
      if (!file) { U.toast('Select the video file again on the Upload page to retry — files are never stored.', 'warn'); return; }
      const job0 = Store.job(jobId); if (!job0) return;
      for (const t0 of job0.targets) {
        if (onlyTid && t0.id !== onlyTid) continue;
        const cur = () => { const j = Store.job(jobId); return j && j.targets.find(x => x.id === t0.id); };
        let t = cur(); if (!t || ['cancelled', 'published', 'processing'].indexOf(t.status) >= 0 || (t.status === 'scheduled' && t.videoId)) continue;
        patch(jobId, t0.id, { status: 'uploading', progress: 0, error: null });
        const job = Store.job(jobId);
        const req = YT.buildUploadRequest(job, cur(), { appendShorts: Store.settings().defaults.appendShorts });
        const call = cur().scheduledAt ? YT.scheduleVideo : YT.uploadVideo;
        let last = 0;
        const r = await call({
          channelId: t0.channelId, file, metadata: req.body,
          onXhr: x => { aborters[t0.id] = x; },
          onProgress: p => { if (p - last >= 3 || p === 100) { last = p; liveBar(t0.id, p); } }
        });
        delete aborters[t0.id];
        const name = Store.channelName(t0.channelId);
        t = cur();
        if (t && t.status === 'cancelled') { w.App.rerenderIf('queue'); continue; }
        if (r.ok) {
          const sched = !!(cur() && cur().scheduledAt);
          patch(jobId, t0.id, { status: sched ? 'scheduled' : 'processing', progress: 100, videoId: r.data && r.data.id, error: null });
          w.Activity.add(sched ? 'schedule' : 'upload', 'ok', (sched ? 'Uploaded & scheduled on ' : 'Short uploaded to ') + name + ' — "' + job.title + '"');
          w.Notify.add({ type: 'upload', title: 'Upload completed', body: '"' + job.title + '" finished uploading to ' + name + '.' });
        } else if (r.code === 'ABORTED') {
          patch(jobId, t0.id, { status: 'cancelled', error: null });
        } else {
          patch(jobId, t0.id, { status: 'failed', error: r.message || r.code });
          w.Activity.add('upload', 'err', 'Upload failed on ' + name + ' — ' + (r.code || 'error'));
          w.Notify.add({ type: 'error', title: 'Upload failed', body: '"' + job.title + '" failed on ' + name + ' (' + (r.code || 'error') + ').' });
          if (r.code === 'AUTH_REQUIRED') { const cs = Store.channels(); const c = cs.find(x => x.id === t0.channelId); if (c) { c.status = 'expired'; Store.saveCol('channels', cs); } }
        }
        w.App.rerenderIf('queue'); w.App.refreshBadges();
      }
    }
  };

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
    const acts = [];
    if (t.status === 'failed' || t.status === 'cancelled') acts.push('<button type="button" class="btn xs" data-act="q-retry" data-job="' + U.esc(job.id) + '" data-tid="' + U.esc(t.id) + '">' + U.icon('refresh', 'xs') + 'Retry</button>');
    if (t.status === 'uploading' || t.status === 'scheduled' || t.status === 'draft') acts.push('<button type="button" class="btn xs ghost" data-act="q-cancel" data-job="' + U.esc(job.id) + '" data-tid="' + U.esc(t.id) + '">' + U.icon('x', 'xs') + 'Cancel</button>');
    if (t.status === 'processing' && t.videoId) acts.push('<button type="button" class="btn xs ghost" data-act="q-check" data-job="' + U.esc(job.id) + '" data-tid="' + U.esc(t.id) + '">' + U.icon('refresh', 'xs') + 'Check status</button>');
    const local = (t.demoOnly || t.localOnly) ? ' <span class="tag demo">not sent</span>' : '';
    return '<li class="tgt"><div class="tgt-top">' + U.avatar(nm, 'xs') + '<div class="nm truncate">' + U.esc(nm) + '<small>' + sub + '</small></div>' + statusBadge(t.status) + '</div>' + x +
      (t.error ? '<div class="err-line">' + U.esc(t.error) + '</div>' : '') + (local ? '<div>' + local + '</div>' : '') + (acts.length ? '<div class="tgt-acts">' + acts.join('') + '</div>' : '') + '</li>';
  }
  function jobCard(job) {
    const n = job.targets.length;
    return '<article class="card job"><div class="job-h"><div class="thumb" style="--h:' + (job.hue != null ? job.hue : U.hash(job.id) % 360) + '">' + U.icon('play') + '</div>' +
      '<div class="grow"><h3 class="truncate" style="white-space:normal">' + U.esc(job.title) + '</h3><p>' + U.plural(n, 'channel') + ' · ' + U.esc(U.rel(job.createdAt)) + (job.demo ? ' <span class="tag demo">demo</span>' : '') + (job.noFile ? ' <span class="tag">no video attached</span>' : '') + '</p></div>' +
      '<button type="button" class="btn xs ghost" data-act="q-edit" data-job="' + U.esc(job.id) + '" aria-label="Edit ' + U.esc(job.title) + '">' + U.icon('edit', 'xs') + 'Edit</button></div>' +
      '<ul class="tgt-list">' + job.targets.map(t => targetRow(job, t)).join('') + '</ul></article>';
  }

  /* ---------- helpers: upload form ---------- */
  function fileArea() {
    const box = U.$('#up-file-area'); if (!box) return;
    if (!up.file) {
      box.innerHTML = '<label class="drop" for="up-file"><span class="ic">' + U.icon('upload', 'lg') + '</span><b>Choose a video</b><span class="hint">Tap to browse' + (matchMedia && matchMedia('(hover:hover)').matches ? ' or drag a file here' : '') + '<br>Vertical 9:16 · up to 3 minutes · max ' + U.bytes(LIM.maxBytes) + '</span></label>';
    } else {
      const m = up.meta || {};
      box.innerHTML = '<div class="file-row"><span class="ico accent">' + U.icon('film') + '</span><div class="grow"><b class="truncate" style="display:block">' + U.esc(up.file.name) + '</b><span class="hint">' + U.bytes(up.file.size) + (m.duration ? ' · ' + U.dur(m.duration) : '') + (m.w ? ' · ' + m.w + '×' + m.h : '') + '</span></div>' +
        '<button type="button" class="btn icon ghost sm" data-act="up-file-rm" aria-label="Remove video">' + U.icon('trash', 'sm') + '</button></div>';
    }
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
    const box = U.$('#up-chips'); if (!box) return;
    box.innerHTML = up.tags.map((t, i) => '<span class="tchip">' + U.esc(t) + '<button type="button" data-act="up-tag-del" data-i="' + i + '" aria-label="Remove tag ' + U.esc(t) + '">' + U.icon('x', 'xs') + '</button></span>').join('');
    const c = U.$('#up-tags-c'); if (c) c.textContent = up.tags.join(',').length + '/' + LIM.tagsTotal;
  }
  function addTag(raw) {
    const added = parseTags(raw);
    added.forEach(t => { if (up.tags.length < LIM.tagCount && up.tags.every(x => x.toLowerCase() !== t.toLowerCase())) up.tags.push(t); });
    chips(); saveDraft(); preview();
  }
  function counters() {
    const t = U.$('#up-title'), d = U.$('#up-desc');
    if (t) U.$('#up-title-c').textContent = t.value.length + '/' + LIM.title;
    if (d) U.$('#up-desc-c').textContent = d.value.length + '/' + LIM.desc;
  }
  function saveDraft() {
    const g = id => { const e = U.$('#' + id); return e ? e.value : ''; };
    try { Store.set('draft', { title: g('up-title'), description: g('up-desc'), visibility: g('up-vis'), category: g('up-cat'), tags: up.tags }); } catch (e) { /* ignore */ }
  }
  function readSched() {
    if (up.mode !== 'schedule') return;
    const d = U.$('#up-d'), t = U.$('#up-t');
    if (d && t) up.when = { date: d.value, time: t.value };
    up.chans.forEach(id => { const dd = U.$('#up-d-' + id), tt = U.$('#up-t-' + id); if (dd && tt) up.times[id] = { date: dd.value, time: tt.value }; });
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
      h += '<p class="hint">Select channels above, then set a time for each.</p>';
    } else {
      up.chans.forEach((id, i) => {
        const c = Store.channel(id); if (!c) return;
        const cur = up.times[id] || (up.times[id] = { date: up.when.date, time: String(13 + i).padStart(2, '0') + ':00' });
        h += '<div class="sched-row"><div class="row">' + U.avatar(c.name, 'xs') + '<b>' + U.esc(c.name) + '</b></div><div class="row2"><input class="input" type="date" id="up-d-' + U.esc(id) + '" min="' + today + '" value="' + U.esc(cur.date) + '" data-chg="up-sched" aria-label="' + U.esc(c.name) + ' date"><input class="input" type="time" id="up-t-' + U.esc(id) + '" value="' + U.esc(cur.time) + '" data-chg="up-sched" aria-label="' + U.esc(c.name) + ' time"></div></div>';
      });
    }
    h += '<p class="hint">Times are in ' + U.esc(tz) + ' (' + U.esc(U.tzAbbr(tz)) + '). ' + (Store.isDemo() ? 'In demo mode a schedule is only saved on this device — nothing will publish.' : 'YouTube publishes at the chosen time after the upload completes, even if you close this tab.') + '</p></div>';
    box.innerHTML = h;
  }
  function selected() { return up.chans.map(Store.channel).filter(Boolean); }
  function whenFor(id) {
    if (up.mode !== 'schedule') return null;
    const tz = U.tz(), x = up.same ? up.when : (up.times[id] || up.when);
    return x ? U.zonedToUtc(x.date, x.time, tz) : NaN;
  }
  function collect() {
    const g = id => { const e = U.$('#' + id); return e ? e.value : ''; };
    return { title: U.clean(g('up-title'), LIM.title), description: U.clean(g('up-desc'), LIM.desc), visibility: g('up-vis') || 'public', category: g('up-cat') || '28', tags: up.tags.slice(), appendShorts: !!(U.$('#up-shorts') && U.$('#up-shorts').checked) };
  }
  function buildJob(f, targets) {
    return { id: U.uid('j'), title: f.title, description: f.description, tags: f.tags, visibility: f.visibility, category: f.category, hue: U.hash(f.title) % 360, createdAt: Date.now(), demo: Store.isDemo(),
      file: up.file ? { name: up.file.name, size: up.file.size, type: up.file.type, duration: up.meta && up.meta.duration ? Math.round(up.meta.duration) : null } : null, targets };
  }
  function preview() {
    if (!U.$('#pv-kv')) return;
    const f = collect(), sel = selected();
    const first = sel[0];
    U.$('#pv-handle').textContent = first ? first.handle || first.name : '@channel';
    U.$('#pv-title').textContent = f.title || 'Your title appears here';
    U.$('#pv-phone').style.setProperty('--h', String(U.hash(f.title || 'x') % 360));
    const catName = (CATS.find(c => c[0] === String(f.category)) || [0, ''])[1];
    const chList = sel.length ? sel.map(c => {
      const t = whenFor(c.id);
      return '<div>' + U.esc(c.name) + (t && !isNaN(t) ? ' <span class="muted">→ ' + U.esc(U.dateShort(t) + ', ' + U.time(t)) + '</span>' : '') + '</div>';
    }).join('') : '<span class="dim">None selected</span>';
    U.$('#pv-kv').innerHTML = '<div><dt>Title</dt><dd>' + (f.title ? U.esc(f.title) : '<span class="dim">—</span>') + '</dd></div><div><dt>Visibility · Category</dt><dd>' + U.esc((VIS.find(v => v[0] === f.visibility) || [0, ''])[1]) + ' · ' + U.esc(catName) + '</dd></div>' +
      '<div><dt>Channels</dt><dd>' + chList + '</dd></div><div><dt>Publish</dt><dd>' + (up.mode === 'schedule' ? 'Scheduled' : 'Immediately') + '</dd></div>';
    const target = { scheduledAt: first ? whenFor(first.id) : null };
    const req = YT.buildUploadRequest({ title: f.title || '(untitled)', description: f.description, tags: f.tags, visibility: f.visibility, category: f.category, file: up.file ? { type: up.file.type } : null }, isNaN(target.scheduledAt) ? { scheduledAt: null } : target, { appendShorts: f.appendShorts });
    U.$('#pv-json').textContent = JSON.stringify({ method: req.method, url: req.url, body: req.body }, null, 2);
    const cnt = sel.length, l = U.$('#up-submit-l'), cc = U.$('#up-chan-count');
    if (l) l.textContent = cnt ? 'Upload to ' + (cnt === 1 ? sel[0].name : cnt + ' channels') : 'Upload to Selected Channels';
    if (cc) cc.textContent = cnt ? cnt + ' selected' : '';
  }
  function previewMedia() {
    const box = U.$('#pv-media'); if (!box) return;
    box.innerHTML = up.fileUrl ? '<video src="' + U.esc(up.fileUrl) + '" muted playsinline loop autoplay preload="metadata"></video>' : up.thumbUrl ? '<img class="cover" src="' + U.esc(up.thumbUrl) + '" alt="">' : '<div class="empty-ph">' + U.icon('film', 'lg') + '</div>';
    const v = U.$('video', box); if (v) { const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
  }
  function mark(id, msg) {
    const el = U.$('#' + id), er = U.$('#' + id + '-e');
    if (el) el.classList.toggle('invalid', !!msg);
    if (er) { er.hidden = !msg; er.textContent = msg || ''; }
  }
  function validate() {
    const f = collect(), errors = [];
    const bad = /[<>]/;
    ['up-title', 'up-desc', 'up-tags', 'up-chans'].forEach(i => mark(i, ''));
    if (!up.file) errors.push('Choose a video file first.');
    if (!f.title) { errors.push('Add a title.'); mark('up-title', 'A title is required.'); }
    else if (bad.test(f.title)) { errors.push('Titles can\'t contain < or >.'); mark('up-title', 'YouTube doesn\'t allow < or > in titles.'); }
    if (bad.test(f.description)) { errors.push('Descriptions can\'t contain < or >.'); mark('up-desc', 'YouTube doesn\'t allow < or > in descriptions.'); }
    if (f.tags.join(',').length > LIM.tagsTotal) { errors.push('Tags are too long.'); mark('up-tags', 'Keep tags under ' + LIM.tagsTotal + ' characters in total.'); }
    const sel = selected();
    if (!sel.length) { errors.push('Select at least one channel.'); mark('up-chans', 'Select at least one channel.'); }
    const times = {};
    if (up.mode === 'schedule') {
      readSched();
      sel.forEach(c => { const t = whenFor(c.id); if (isNaN(t)) errors.push('Pick a date and time for ' + c.name + '.'); else if (t < Date.now() + 5 * 60e3) errors.push('The time for ' + c.name + ' must be at least 5 minutes from now.'); else if (t > Date.now() + 6 * 30 * 86400e3) errors.push('YouTube schedules at most ~6 months ahead (' + c.name + ').'); times[c.id] = t; });
    }
    return { errors, f, sel, times };
  }

  /* ---------- actions ---------- */
  U.act('goto', t => { location.hash = '#/' + t.dataset.to; });
  U.act('up-mode', t => { readSched(); up.mode = t.dataset.m; U.$$('[data-act="up-mode"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); schedArea(); preview(); });
  U.act('up-file-rm', () => { if (up.fileUrl) { try { URL.revokeObjectURL(up.fileUrl); } catch (e) { /* ignore */ } } up.file = up.fileUrl = up.meta = null; const i = U.$('#up-file'); if (i) i.value = ''; fileArea(); fileNote(); previewMedia(); preview(); });
  U.act('up-thumb-rm', () => { if (up.thumbUrl) { try { URL.revokeObjectURL(up.thumbUrl); } catch (e) { /* ignore */ } } up.thumb = up.thumbUrl = null; const i = U.$('#up-thumb'); if (i) i.value = ''; thumbArea(); previewMedia(); });
  U.act('up-tag-del', t => { up.tags.splice(+t.dataset.i, 1); chips(); saveDraft(); preview(); });
  U.chg('up-field', () => { counters(); saveDraft(); preview(); });
  U.inp('up-field', () => { counters(); saveDraft(); preview(); });
  U.inp('up-tag-typing', t => { if (/[,\n]/.test(t.value)) { addTag(t.value); t.value = ''; } });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'up-tag-in') { if (e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); e.target.value = ''; } else if (e.key === 'Backspace' && !e.target.value && up.tags.length) { up.tags.pop(); chips(); saveDraft(); preview(); } } });
  document.addEventListener('focusout', e => { if (e.target && e.target.id === 'up-tag-in' && e.target.value.trim()) { addTag(e.target.value); e.target.value = ''; } });
  U.chg('up-chan', t => { readSched(); if (t.checked) { if (up.chans.indexOf(t.value) < 0) up.chans.push(t.value); } else up.chans = up.chans.filter(x => x !== t.value); schedArea(); preview(); });
  U.chg('up-tz', t => { readSched(); Store.saveSettings({ timezone: t.value }); schedArea(); preview(); });
  U.chg('up-same', t => { readSched(); up.same = t.checked; schedArea(); preview(); });
  U.chg('up-sched', () => { readSched(); preview(); });
  U.chg('up-file', t => { const f = t.files && t.files[0]; if (f) pickFile(f); });
  U.chg('up-thumb', t => {
    const f = t.files && t.files[0]; if (!f) return;
    if (LIM.thumbTypes.indexOf(f.type) < 0) { U.toast('Thumbnails must be JPG or PNG.', 'err'); t.value = ''; return; }
    if (f.size > LIM.thumbBytes) { U.toast('Thumbnail is ' + U.bytes(f.size) + ' — the limit is 2 MB.', 'err'); t.value = ''; return; }
    if (up.thumbUrl) { try { URL.revokeObjectURL(up.thumbUrl); } catch (e) { /* ignore */ } }
    up.thumb = f; up.thumbUrl = URL.createObjectURL(f); thumbArea(); previewMedia();
  });
  function pickFile(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (LIM.types.indexOf(f.type) < 0 && LIM.exts.indexOf(ext) < 0) { U.toast('Unsupported file type. Use MP4, MOV or WebM.', 'err'); return; }
    if (f.size > LIM.maxBytes) { U.toast('That file is ' + U.bytes(f.size) + '. The limit in this app is ' + U.bytes(LIM.maxBytes) + '.', 'err'); return; }
    if (f.size < 1024) { U.toast('That file looks empty.', 'err'); return; }
    if (up.fileUrl) { try { URL.revokeObjectURL(up.fileUrl); } catch (e) { /* ignore */ } }
    up.file = f; up.fileUrl = URL.createObjectURL(f); up.meta = null;
    fileArea(); fileNote(); previewMedia(); preview();
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { up.meta = { duration: v.duration, w: v.videoWidth, h: v.videoHeight }; fileArea(); fileNote(); };
    v.onerror = () => { up.meta = {}; fileNote('Couldn\'t read this video\'s details in your browser. You can still try uploading it.'); };
    v.src = up.fileUrl;
  }
  document.addEventListener('dragover', e => { const d = e.target.closest && e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('.drop'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) pickFile(f); } });

  U.act('up-submit', async btn => {
    const v = validate(), box = U.$('#up-errors');
    if (v.errors.length) { box.hidden = false; box.textContent = v.errors[0]; U.toast(v.errors[0], 'err'); const bad = U.$('.invalid'); if (bad) bad.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    box.hidden = true;
    const demo = Store.isDemo();
    if (!demo && !v.sel.every(c => YT.hasToken(c.id))) { U.toast('Authorization expired for a selected channel. Reconnect it first.', 'err'); return; }
    const targets = v.sel.map(c => {
      const at = v.times[c.id] || null;
      return { id: U.uid('t'), channelId: c.id, status: demo ? (at ? 'scheduled' : 'draft') : 'uploading', progress: 0, scheduledAt: at, error: null, demoOnly: demo };
    });
    const job = buildJob(v.f, targets);
    Store.saveJob(job);
    const names = v.sel.map(c => c.name).join(', ');
    try { Store.remove('draft'); } catch (e) { /* ignore */ }
    if (demo) {
      w.Activity.add(v.times[v.sel[0].id] ? 'schedule' : 'upload', 'info', (v.times[v.sel[0].id] ? 'Scheduled locally' : 'Saved demo draft') + ' "' + job.title + '" for ' + names + ' — not sent to YouTube');
      U.toast('Saved as a local demo draft. Nothing was sent to YouTube — ' + YT.DEMO_HINT, 'warn', 6500);
    } else {
      liveFiles[job.id] = up.file;
      w.Activity.add('upload', 'info', 'Upload started "' + job.title + '" → ' + names);
      U.toast('Upload started. Keep this tab open until it finishes.', 'info');
    }
    const keep = up.file; location.hash = '#/queue';
    if (!demo) { liveFiles[job.id] = keep; Uploads.run(job.id); }
  });

  U.act('q-filter', t => { Uploads.qFilter = t.dataset.f; U.$$('[data-act="q-filter"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); Uploads.qList(); });
  U.act('q-retry', async t => {
    const j = Store.job(t.dataset.job); if (!j) return;
    if (Store.isDemo() || j.demo) {
      const r = await YT.uploadVideo({ channelId: (j.targets.find(x => x.id === t.dataset.tid) || {}).channelId });
      U.toast(r.message || YT.DEMO_MESSAGE, 'warn'); return;
    }
    patch(j.id, t.dataset.tid, { status: 'uploading', progress: 0, error: null }); w.App.rerenderIf('queue'); Uploads.run(j.id, t.dataset.tid);
  });
  U.act('q-cancel', async t => {
    const j = Store.job(t.dataset.job); if (!j) return;
    const tg = j.targets.find(x => x.id === t.dataset.tid); if (!tg) return;
    const extra = tg.videoId ? ' The video was already uploaded to YouTube and will stay there as a scheduled private video until you delete it in YouTube Studio.' : '';
    if (!await U.confirm({ title: 'Cancel this upload?', body: 'This stops "' + j.title + '" on ' + Store.channelName(tg.channelId) + '.' + extra, confirmText: 'Cancel upload', cancelText: 'Keep it', danger: true })) return;
    if (aborters[tg.id]) { try { aborters[tg.id].abort(); } catch (e) { /* ignore */ } }
    patch(j.id, tg.id, { status: 'cancelled', error: null });
    w.Activity.add('upload', 'warn', 'Cancelled "' + j.title + '" on ' + Store.channelName(tg.channelId));
    w.App.rerender(); U.toast('Cancelled.', 'ok');
  });
  U.act('q-check', async t => {
    const j = Store.job(t.dataset.job); const tg = j && j.targets.find(x => x.id === t.dataset.tid); if (!tg) return;
    const r = await YT.getVideoStatus(tg.channelId, tg.videoId);
    if (!r.ok) { U.toast(r.message || YT.DEMO_MESSAGE, r.demo ? 'warn' : 'err'); return; }
    if (r.data.uploadStatus === 'processed') { patch(j.id, tg.id, { status: 'published', publishedAt: Date.now() }); U.toast('Published on YouTube.', 'ok'); w.App.rerender(); }
    else U.toast('YouTube status: ' + (r.data.uploadStatus || 'processing') + '.', 'info');
  });

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
