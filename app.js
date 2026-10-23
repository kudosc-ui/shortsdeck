/* app.js — shell, router, Dashboard (1), Channels (2), Settings (12). Other pages live in js/*.js. */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;

  const PAGES = {
    dashboard: { title: 'Dashboard', icon: 'home' }, channels: { title: 'Channels', icon: 'channels' }, upload: { title: 'Upload Short', icon: 'upload' },
    queue: { title: 'Upload Queue', icon: 'queue' }, schedule: { title: 'Scheduler', icon: 'calendar' }, comments: { title: 'Comments', icon: 'chat' },
    automation: { title: 'Automation', icon: 'bolt' }, templates: { title: 'Reply Templates', icon: 'template' }, analytics: { title: 'Analytics', icon: 'chart' },
    history: { title: 'History', icon: 'history' }, notifications: { title: 'Notifications', icon: 'bell' }, settings: { title: 'Settings', icon: 'settings' }
  };
  const SIDEBAR = ['dashboard', 'channels', 'upload', 'queue', 'schedule', 'comments', 'automation', 'templates', 'analytics', 'history', 'notifications', 'settings'];
  let current = 'dashboard';

  /* ------------------------------------------------------------ chrome */
  const modePill = () => '<button type="button" class="pill-mode ' + (Store.isDemo() ? 'demo' : 'live') + '" data-act="mode-info" aria-label="' + (Store.isDemo() ? 'Demo mode. Tap for details' : 'Live mode. Tap for details') + '">' + (Store.isDemo() ? 'DEMO<span class="pm-x"> MODE</span>' : 'LIVE') + '</button>';
  const badgeCounts = () => ({ comments: Store.col('comments').filter(c => !c.read && c.status === 'new').length, notifications: w.Notify.unread() });
  const bdg = k => { const n = badgeCounts()[k]; return '<span class="dot-badge" data-badge="' + k + '" aria-label="' + n + ' new">' + (n ? (n > 99 ? '99+' : n) : '') + '</span>'; };

  function chrome() {
    U.$('#sidebar').innerHTML = '<div class="brand"><span class="logo-mark">' + U.icon('play') + '</span>ShortsDeck</div>' +
      SIDEBAR.map(k => '<a class="sb-link" href="#/' + k + '" data-page="' + k + '">' + U.icon(PAGES[k].icon) + '<span>' + PAGES[k].title + '</span>' + (k === 'comments' || k === 'notifications' ? bdg(k) : '') + '</a>').join('') +
      '<div class="sb-foot">' + modePill() + '<span>' + (Store.isDemo() ? 'Sample data only. Nothing is sent to YouTube.' : 'Connected through Google OAuth.') + '</span></div>';
    U.$('#topbar').innerHTML = '<span class="logo-mark">' + U.icon('play') + '</span><h1 id="page-title"></h1><div class="top-actions">' + modePill() +
      '<a class="btn icon ghost bell-btn" href="#/notifications" aria-label="Notifications" data-page="notifications">' + U.icon('bell') + bdg('notifications') + '</a>' +
      '<button type="button" class="btn icon ghost" data-act="theme" aria-label="Toggle light or dark theme">' + U.icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun') + '</button></div>';
    const bn = (k, lbl) => '<a class="bn" href="#/' + k + '" data-page="' + k + '">' + U.icon(PAGES[k].icon) + '<span>' + lbl + '</span>' + (k === 'comments' ? bdg(k) : '') + '</a>';
    U.$('#bottom-nav').innerHTML = bn('dashboard', 'Home') + bn('channels', 'Channels') +
      '<a class="bn fab" href="#/upload" data-page="upload" aria-label="Upload Short"><span class="fab-btn">' + U.icon('plus') + '</span><span class="lbl">Upload</span></a>' + bn('comments', 'Comments') +
      '<button type="button" class="bn" data-act="more" aria-haspopup="dialog">' + U.icon('grid') + '<span>More</span></button>';
    markNav();
  }
  function markNav() {
    U.$$('[data-page]').forEach(a => { if (a.dataset.page === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const more = U.$('[data-act="more"]'); if (more) { const inMore = ['dashboard', 'channels', 'upload', 'comments'].indexOf(current) < 0; if (inMore) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current'); }
  }
  function refreshBadges() {
    const c = badgeCounts();
    U.$$('.dot-badge[data-badge]').forEach(el => { const n = c[el.dataset.badge]; el.textContent = n ? (n > 99 ? '99+' : n) : ''; el.setAttribute('aria-label', n + ' new'); });
  }

  /* ------------------------------------------------------------ router */
  function route() {
    const k = (location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'dashboard');
    return PAGES[k] ? k : 'dashboard';
  }
  function render(opts) {
    opts = opts || {};
    current = route();
    const main = U.$('#main'), y = window.scrollY;
    w.Analytics.Charts.q = [];
    document.body.classList.remove('up-page');
    let html = '', mount = null;
    try {
      switch (current) {
        case 'dashboard': html = Dashboard.render(); mount = Dashboard.mount; break;
        case 'channels': html = Channels.render(); break;
        case 'upload': html = w.Uploads.renderUpload(); mount = w.Uploads.mountUpload; break;
        case 'queue': html = w.Uploads.renderQueue(); mount = w.Uploads.mountQueue; break;
        case 'schedule': html = w.Scheduler.render(); mount = w.Scheduler.mount; break;
        case 'comments': html = w.Comments.renderInbox(); mount = w.Comments.mountInbox; break;
        case 'automation': html = w.Comments.renderAutomation(); break;
        case 'templates': html = w.Comments.renderTemplates(); break;
        case 'analytics': html = w.Analytics.render(); mount = w.Analytics.mount; break;
        case 'history': html = w.Activity.render(); mount = w.Activity.renderList; break;
        case 'notifications': html = w.Notify.render(); break;
        case 'settings': html = Settings.render(); break;
      }
    } catch (e) { console.error(e); html = U.errorState('This page failed to load.', 'reload'); }
    main.innerHTML = '<div class="page' + (opts.keepScroll ? ' still' : '') + '">' + html + '</div>';
    U.$('#page-title').textContent = PAGES[current].title;
    document.title = PAGES[current].title + ' · ShortsDeck';
    markNav(); refreshBadges(); authBar();
    if (mount) { try { mount(); } catch (e) { console.error(e); } }
    if (opts.keepScroll) window.scrollTo({ top: y, left: 0, behavior: 'instant' }); else { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); if (!opts.silent) main.focus({ preventScroll: true }); }
  }
  window.addEventListener('hashchange', () => { const m = U.$('#modal-root'); if (m) m.innerHTML = ''; document.body.classList.remove('lock'); render(); });

  const App = {
    /* The Upload page keeps its own live form (selected video, channels, text). A background refresh must never wipe it,
       so it is skipped there unless forced (e.g. after the user changed channels). */
    rerender(force) { if (current === 'upload' && force !== true) { if (w.Uploads && w.Uploads.refreshChannels) w.Uploads.refreshChannels(); return; } render({ keepScroll: true, silent: true }); },
    rerenderIf(p) { if (current === p) App.rerender(); },
    refreshBadges,
    refreshChrome() { chrome(); },
    current: () => current
  };
  w.App = App;

  /* ------------------------------------------------------------ dashboard */
  const dState = { metric: 'views' };
  const Dashboard = {
    stats() {
      const chans = Store.channels(), jobs = Store.col('jobs'), all = [].concat.apply([], jobs.map(j => j.targets));
      return {
        channels: chans.length, uploaded: all.filter(t => t.status === 'published' || t.status === 'processing').length,
        scheduled: all.filter(t => t.status === 'scheduled').length, comments: Store.col('comments').filter(c => c.status === 'new').length, failed: all.filter(t => t.status === 'failed').length
      };
    },
    render() {
      const s = Dashboard.stats(), chans = Store.channels();
      let h = '';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<div><p><b>DEMO MODE</b> — everything here is sample data. ' + U.esc(YT.DEMO_HINT) + '</p><button type="button" class="btn sm" data-act="connect">' + U.icon('key', 'sm') + 'Connect YouTube</button></div></div>';
      else if (!chans.length) h += U.empty({ icon: 'channels', title: 'No YouTube channels connected yet.', body: 'Connect a channel to start uploading, scheduling and managing comments.', action: '<button type="button" class="btn primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube</button>' });
      const st = (href, tone, icon, label, v, sub) => '<a class="stat t-' + tone + '" href="#/' + href + '"><div class="k"><span class="ic">' + U.icon(icon, 'sm') + '</span>' + label + '</div><div class="v">' + v + '</div><div class="s">' + sub + '</div></a>';
      h += '<div class="stats">' + st('channels', 'info', 'channels', 'Connected Channels', s.channels, 'Manage channels') + st('queue', 'ok', 'upload', 'Shorts Uploaded', s.uploaded, 'Published or processing') +
        st('schedule', 'accent', 'clock', 'Scheduled Shorts', s.scheduled, 'Upcoming') + st('comments', 'warn', 'chat', 'New Comments', s.comments, 'Need a reply') + st('queue', 'err', 'alert', 'Failed Uploads', s.failed, s.failed ? 'Tap to retry' : 'All good') + '</div>';
      h += '<section><div class="sec-h" style="margin-bottom:10px"><h2>Quick actions</h2></div><div class="qa-grid">' +
        qa('upload', 'upload', 'Upload Short', 'To many channels', true) + qa('schedule', 'calendar', 'Schedule Short', 'Pick a time') + qa('comments', 'chat', 'Manage Comments', 'Inbox & replies') +
        '<button type="button" class="qa" data-act="connect"><span class="ic">' + U.icon('plus') + '</span><span><b>Connect Channel</b><small>Google OAuth</small></span></button></div></section>';
      h += '<section class="card"><div class="card-h"><div><h2>Performance</h2><div class="sub">Last 7 days' + (Store.isDemo() ? ' · demo data' : '') + '</div></div><a class="btn xs ghost" href="#/analytics">Details ' + U.icon('chev', 'xs') + '</a></div>' +
        '<div class="seg" role="group" aria-label="Metric" style="margin-bottom:12px">' + Object.keys(w.Analytics.METRICS).map(k => '<button type="button" data-act="dash-metric" data-m="' + k + '" aria-pressed="' + (dState.metric === k) + '">' + w.Analytics.METRICS[k] + '</button>').join('') + '</div>' +
        '<div class="row between" style="margin-bottom:4px"><div><div class="num" style="font-size:26px;font-weight:800" id="dash-total">—</div></div><span id="dash-delta"></span></div><div id="dash-chart"><div class="sk" style="height:150px"></div></div></section>';
      h += '<section class="card"><div class="card-h"><h2>Recent activity</h2><a class="btn xs ghost" href="#/history">View all ' + U.icon('chev', 'xs') + '</a></div>';
      const A = w.Activity.list().slice(0, 6);
      h += A.length ? '<div class="list">' + A.map(e => w.Activity.item(e)).join('') + '</div>' : '<p class="muted">No activity yet.</p>';
      return h + '</section>';
    },
    mount() { Dashboard.chart(); },
    async chart() {
      const box = U.$('#dash-chart'); if (!box) return;
      const d = await w.Analytics.load({ range: 7, channel: 'all', video: 'all' });
      const b2 = U.$('#dash-chart'); if (!b2) return;
      if (!d || d.empty || d.error) { b2.innerHTML = '<p class="muted">' + U.esc((d && (d.message || d.error)) || 'No data.') + '</p>'; U.$('#dash-total').textContent = '—'; return; }
      const m = dState.metric, key = m;
      U.$('#dash-total').textContent = U.num(d.totals[key]);
      U.$('#dash-delta').innerHTML = w.Analytics.deltaHtml(d.delta && d.delta[key]);
      w.Analytics.Charts.q = [];
      b2.innerHTML = w.Analytics.Charts.add({ type: m === 'views' ? 'area' : 'bar', labels: d.labels, values: d.series[key], color: { views: 'var(--accent)', likes: 'var(--info)', comments: 'var(--warn)', subs: 'var(--ok)' }[m], height: 150, aria: w.Analytics.METRICS[m] + ' over 7 days' });
      w.Analytics.Charts.flush();
    }
  };
  const qa = (href, icon, t, sub, primary) => '<a class="qa ' + (primary ? 'primary' : '') + '" href="#/' + href + '"><span class="ic">' + U.icon(icon) + '</span><span><b>' + t + '</b><small>' + sub + '</small></span></a>';
  U.act('dash-metric', t => { dState.metric = t.dataset.m; U.$$('[data-act="dash-metric"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); Dashboard.chart(); });

  /* ------------------------------------------------------------ channels */
  const Channels = {
    render() {
      const chans = Store.channels();
      let h = '<div class="row between wrap"><p class="lead">' + U.plural(chans.length, 'channel') + ' connected</p><button type="button" class="btn primary sm" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube Channel</button></div>';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — these are sample channels. ' + U.esc(YT.DEMO_HINT) + '</p></div>';
      if (!chans.length) return h + U.empty({ icon: 'channels', title: 'No YouTube channels connected yet.', body: 'Connect your YouTube account securely using Google OAuth. We never ask for your password.', action: '<button type="button" class="btn primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube</button>' });
      h += '<div class="ch-grid">' + chans.map(c => {
        const st = w.Comments.chanState(c), ok = st === 'connected';
        return '<article class="ch"><div class="ch-h">' + U.avatar(c.name, 'lg') + '<div class="grow"><b class="truncate" style="display:block">' + U.esc(c.name) + '</b><small class="truncate" style="display:block">' + U.esc(c.handle) + '</small></div></div>' +
          '<div class="ch-stats"><span class="badge b-mute">' + U.icon('user') + U.num(c.subs) + ' subscribers</span>' + (ok ? U.badge('Connected', 'ok', 'check') : U.badge('Authorization expired', 'warn', 'lock')) + U.badge(c.automation ? 'Automation on' : 'Automation off', c.automation ? 'accent' : 'mute', 'bolt') + (c.demo ? '<span class="tag demo">demo</span>' : '') + '</div>' +
          (ok ? '' : '<button type="button" class="btn sm soft block" data-act="connect">' + U.icon('refresh', 'sm') + 'Reconnect with Google</button>') +
          '<div class="ch-acts"><button type="button" class="btn sm" data-act="ch-manage" data-id="' + U.esc(c.id) + '">Manage</button><button type="button" class="btn sm" data-act="ch-auto" data-id="' + U.esc(c.id) + '">Automation</button><button type="button" class="btn sm danger" data-act="ch-del" data-id="' + U.esc(c.id) + '">Disconnect</button></div></article>';
      }).join('') + '</div>';
      return h + '<button type="button" class="connect-card" data-act="connect"><span class="ico accent" style="width:44px;height:44px;border-radius:14px">' + U.icon('plus') + '</span><span><b style="display:block">Connect another channel</b><span class="muted" style="font-size:13.5px">Connect your YouTube account securely using Google OAuth.</span></span></button>';
    }
  };
  U.act('ch-manage', t => {
    const c = Store.channel(t.dataset.id); if (!c) return;
    const jobs = Store.col('jobs').filter(j => j.targets.some(x => x.channelId === c.id)).length, cm = Store.col('comments').filter(x => x.channelId === c.id && x.status === 'new').length, ok = w.Comments.chanState(c) === 'connected';
    U.modal({
      title: c.name,
      html: '<div class="stack"><div class="row">' + U.avatar(c.name, 'lg') + '<div class="grow"><b>' + U.esc(c.name) + '</b><div class="muted">' + U.esc(c.handle) + '</div></div>' + (ok ? U.badge('Connected', 'ok', 'check') : U.badge('Expired', 'warn', 'lock')) + '</div>' +
        '<div class="mini-stats"><div><b>' + U.num(c.subs) + '</b><small>Subscribers</small></div><div><b>' + U.num(c.videos) + '</b><small>Videos</small></div><div><b>' + U.num(c.views) + '</b><small>Total views</small></div></div>' +
        '<dl class="kv"><div><dt>Shorts in queue</dt><dd>' + jobs + '</dd></div><div><dt>Comments needing a reply</dt><dd>' + cm + '</dd></div><div><dt>Added</dt><dd>' + U.esc(U.date(c.addedAt)) + '</dd></div></dl>' +
        (c.demo ? '<div class="banner">' + U.icon('info') + '<p>Demo channel — numbers are samples.</p></div>' : '') + '</div>',
      actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Upload here', kind: 'primary', icon: 'upload', onClick: () => { location.hash = '#/upload'; } }]
    });
  });
  U.act('ch-auto', t => {
    const c = Store.channel(t.dataset.id); if (!c) return;
    const a = Store.settings().automation, R = Store.get('rules', []).filter(r => r.enabled && (r.channels === 'all' || r.channels.indexOf(c.id) >= 0));
    U.modal({
      title: 'Automation · ' + c.name,
      html: '<div class="stack"><div class="set-row"><div class="t">Comment automation<small>Prepare keyword replies for this channel</small></div>' + U.sw('x', c.automation, 'Automation for ' + c.name, 'id="ca-sw"') + '</div>' +
        '<div class="kv"><div><span class="k">Reply mode</span><span class="v">' + (a.mode === 'auto' ? 'Automatic' : 'Manual approval') + '</span></div><div><span class="k">Limits</span><span class="v">' + a.maxPerHour + ' / hour · ' + a.maxPerUserPerDay + ' per user / day</span></div><div><span class="k">Active rules</span><span class="v">' + (R.length ? R.map(r => U.esc(r.name)).join(', ') : 'None') + '</span></div></div>' +
        '<a class="btn sm block" href="#/automation" data-close>' + U.icon('bolt', 'sm') + 'Edit rules &amp; limits</a></div>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary', onClick: h => { const L = Store.channels(), x = L.find(z => z.id === c.id); x.automation = U.$('#ca-sw', h.el).checked; Store.saveCol('channels', L); U.toast('Automation ' + (x.automation ? 'on' : 'off') + ' for ' + c.name + '.', 'ok'); App.rerender(); } }]
    });
  });
  U.act('ch-del', async t => {
    const c = Store.channel(t.dataset.id); if (!c) return;
    if (!await U.confirm({ title: 'Disconnect ' + c.name + '?', body: 'It will be removed from this app and its session revoked. Videos on YouTube are not touched. Queued items for this channel stay in your history.', confirmText: 'Disconnect', danger: true })) return;
    await YT.disconnect(c.id);
    Store.saveCol('channels', Store.channels().filter(x => x.id !== c.id));
    w.Activity.add('auth', 'warn', 'Disconnected channel ' + c.name);
    U.toast(c.name + ' disconnected.', 'ok'); App.rerender();
  });

  /* ------------------------------------------------------------ settings */
  const Settings = {
    render() {
      const s = Store.settings(), d = s.defaults, n = s.notify, tz = U.tz();
      const acc = (id, icon, title, body, open) => '<details class="acc" id="' + id + '" ' + (open ? 'open' : '') + '><summary><span class="ic">' + U.icon(icon, 'sm') + '</span><span>' + title + '</span><span class="chev">' + U.icon('chev', 'sm') + '</span></summary><div class="acc-b">' + body + '</div></details>';
      const sr = (t, sub, sw) => '<div class="set-row"><div class="t">' + t + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + sw + '</div>';
      let h = '<div class="stack">';
      h += acc('set-accounts', 'key', 'YouTube accounts', '<div class="stack"><div class="row between wrap"><span class="muted">Mode</span>' + modePill() + '</div>' +
        '<div class="field"><label for="s-cid">Google OAuth Client ID <span class="counter">public value</span></label><input class="input" id="s-cid" placeholder="123456-abc.apps.googleusercontent.com" value="' + U.esc(s.clientId) + '" data-chg="set-cid" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="hint">Paste only the <b>Client ID</b>. Never paste a client secret here — it would be exposed to anyone who opens the page.</div></div>' +
        '<div class="field"><label for="s-bu">Sign-in server <span class="counter">optional · stays signed in</span></label><input class="input" id="s-bu" inputmode="url" placeholder="https://shortsdeck-auth.yourname.workers.dev" value="' + U.esc(s.backendUrl) + '" data-chg="set-bu" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="hint">' + (YT.mode() === 'server' ? '<b>On</b> — your channels renew themselves silently; no more re-login.' : 'Off — Google only allows 1-hour browser sign-ins, so ShortsDeck renews them with one tap. Deploy <code>worker/</code> (see BACKEND.md) and paste its address here to never be asked again.') + ' After changing it, reconnect your channels once.</div></div>' +
        '<div class="row wrap"><button type="button" class="btn sm primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect channel</button>' + (Store.isDemo() ? '' : '<button type="button" class="btn sm" data-act="to-demo">Switch to demo data</button>') + '</div></div>');
      h += acc('set-defaults', 'upload', 'Default upload settings', '<div class="stack"><div class="row2"><div class="field"><label for="s-vis">Default privacy</label><select class="select" id="s-vis" data-chg="set-field" data-k="defaults.visibility">' + w.Uploads.VIS.map(x => '<option value="' + x[0] + '" ' + (d.visibility === x[0] ? 'selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="s-cat">Default category</label><select class="select" id="s-cat" data-chg="set-field" data-k="defaults.category">' + w.Uploads.CATS.map(x => '<option value="' + x[0] + '" ' + (String(d.category) === x[0] ? 'selected' : '') + '>' + U.esc(x[1]) + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label for="s-tags">Default tags</label><input class="input" id="s-tags" value="' + U.esc(d.tags) + '" maxlength="300" data-chg="set-field" data-k="defaults.tags" placeholder="shorts, coding"></div>' +
        '<div class="field"><label for="s-desc">Default description</label><textarea class="textarea" id="s-desc" maxlength="1000" data-chg="set-field" data-k="defaults.description">' + U.esc(d.description) + '</textarea></div>' + sr('Add #Shorts automatically', 'Appended to the description if missing', U.sw('set-field', d.appendShorts, 'Add #Shorts', 'data-k="defaults.appendShorts"')) + '</div>');
      h += acc('set-tz', 'clock', 'Timezone', '<div class="field"><label for="s-tz">Schedule timezone</label><select class="select" id="s-tz" data-chg="set-tz">' + U.tzOptions(tz) + '</select><div class="hint">Used for the scheduler, uploader and history. Detected: ' + U.esc(U.detectTz()) + '</div></div>');
      h += acc('set-auto', 'bolt', 'Comment automation', '<div class="stack"><div class="kv"><div><span class="k">Mode</span><span class="v">' + (s.automation.mode === 'auto' ? 'Automatic' : 'Manual approval') + '</span></div><div><span class="k">Limits</span><span class="v">' + s.automation.maxPerHour + ' per hour · ' + s.automation.maxPerUserPerDay + ' per user per day</span></div></div><a class="btn sm" href="#/automation">' + U.icon('bolt', 'sm') + 'Open Automation</a></div>');
      h += acc('set-notify', 'bell', 'Notifications', ['upload:Upload results', 'comment:New comments', 'error:Failures', 'auth:Authorization alerts', 'schedule:Scheduled Shorts'].map(x => { const p = x.split(':'); return sr(p[1], '', U.sw('set-field', n[p[0]], p[1], 'data-k="notify.' + p[0] + '"')); }).join(''));
      h += acc('set-theme', 'sun', 'Theme', '<div class="seg" role="group" aria-label="Theme">' + [['dark', 'Dark mode'], ['light', 'Light mode'], ['system', 'System']].map(x => '<button type="button" data-act="set-theme" data-t="' + x[0] + '" aria-pressed="' + (s.theme === x[0]) + '">' + x[1] + '</button>').join('') + '</div>');
      h += acc('set-sec', 'shield', 'Security & data', '<div class="stack"><ul class="checks"><li>' + U.icon('check', 'sm') + '<span>No password is ever requested. Sign-in happens on Google\'s page.</span></li><li>' + U.icon('check', 'sm') + '<span>Only Google\'s 1-hour access token is cached on this device so a reload does not sign you out. It is never sent anywhere except Google.</span></li><li>' + U.icon('check', 'sm') + '<span>No client secret exists in this app. Only the public Client ID is stored.</span></li><li>' + U.icon('check', 'sm') + '<span>Drafts, schedules, rules and templates are stored on this device (' + (Store.persistent ? 'localStorage' : 'memory only — storage is blocked') + ').</span></li></ul>' +
        '<div class="row wrap"><button type="button" class="btn sm" data-act="reset-demo">' + U.icon('refresh', 'sm') + 'Reset demo data</button><button type="button" class="btn sm danger" data-act="wipe">' + U.icon('trash', 'sm') + 'Clear all local data</button></div></div>');
      return h + '</div>';
    }
  };
  function setPath(k, v) { const parts = k.split('.'), patch = {}; let o = patch; parts.forEach((p, i) => { if (i === parts.length - 1) o[p] = v; else o = o[p] = {}; }); Store.saveSettings(patch); }
  U.chg('set-field', t => {
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.k === 'defaults.tags') v = U.clean(v, 300); if (t.dataset.k === 'defaults.description') v = U.clean(v, 1000);
    setPath(t.dataset.k, v); U.toast('Saved.', 'ok', 1400);
  });
  U.chg('set-tz', t => { Store.saveSettings({ timezone: t.value }); U.toast('Timezone set to ' + t.value + '.', 'ok'); });
  U.chg('set-bu', t => {
    const v = t.value.trim().replace(/\/+$/, '');
    if (v && !/^https:\/\/[^\s/]+(\/\S*)?$/.test(v)) { U.toast('The sign-in server address must start with https://', 'err'); return; }
    Store.saveSettings({ backendUrl: v }); U.toast(v ? 'Sign-in server saved. Reconnect your channels once.' : 'Sign-in server removed.', 'ok'); App.rerender(true);
  });
  U.chg('set-cid', t => {
    const v = t.value.trim();
    if (/GOCSPX|client_secret/i.test(v)) { t.value = ''; U.toast('That looks like a client SECRET. Never put secrets in a web page — only the Client ID.', 'err', 7000); return; }
    if (v && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(v)) { U.toast('A Client ID ends with .apps.googleusercontent.com', 'err'); return; }
    Store.saveSettings({ clientId: v }); U.toast(v ? 'Client ID saved.' : 'Client ID cleared.', 'ok'); chrome();
  });
  U.act('set-theme', t => { Store.saveSettings({ theme: t.dataset.t }); applyTheme(); U.$$('[data-act="set-theme"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); });
  U.act('theme', () => { const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; Store.saveSettings({ theme: next }); applyTheme(); if (current === 'settings') App.rerender(); });
  function applyTheme() {
    let t = Store.settings().theme; if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    const m = U.$('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#f5f5f8' : '#09090b';
    chrome();
  }
  U.act('to-demo', () => { Store.setMode('demo'); chrome(); App.rerender(); U.toast('Switched to demo data.', 'ok'); });
  U.act('reload', () => location.reload());
  U.act('reset-demo', async () => { if (await U.confirm({ title: 'Reset demo data?', body: 'Sample channels, comments, queue and history are restored. Your rules and templates are reset too.', confirmText: 'Reset' })) { Store.resetDemo(); chrome(); App.rerender(); U.toast('Demo data restored.', 'ok'); } });
  U.act('wipe', async () => { if (await U.confirm({ title: 'Clear all local data?', body: 'Removes every setting, draft, schedule, rule and template stored by this app on this device. Your YouTube account is not affected.', confirmText: 'Clear everything', danger: true })) { Store.clear(); location.hash = '#/dashboard'; location.reload(); } });
  U.act('more', () => {
    U.modal({ title: 'All pages', html: '<div class="more-grid">' + SIDEBAR.map(k => '<a class="tile" href="#/' + k + '" data-close ' + (k === current ? 'aria-current="page"' : '') + '><span class="ic">' + U.icon(PAGES[k].icon) + '</span><span>' + PAGES[k].title.replace('Upload Short', 'Upload').replace('Reply Templates', 'Templates').replace('Upload Queue', 'Queue') + '</span>' + (k === 'comments' || k === 'notifications' ? bdg(k) : '') + '</a>').join('') + '</div>' });
  });
  U.act('mode-info', () => {
    const demo = Store.isDemo();
    U.modal({
      title: demo ? 'Demo mode' : 'Live mode',
      html: '<div class="stack"><div class="banner ' + (demo ? '' : 'ok') + '">' + U.icon(demo ? 'info' : 'check') + '<p>' + (demo ? 'You\'re looking at <b>sample data</b>. No upload, schedule or comment reply reaches YouTube, and nothing is marked as sent.' : 'You\'re working with <b>real YouTube data</b> through Google OAuth. Actions here affect your real channels.') + '</p></div>' +
        '<ul class="checks"><li>' + U.icon('check', 'sm') + '<span>Google OAuth Client ID: <b>' + (YT.isConfigured() ? 'configured' : 'not set') + '</b></span></li><li>' + U.icon('check', 'sm') + '<span>Authorized channels in this session: <b>' + Store.channels().filter(c => YT.hasToken(c.id)).length + '</b></span></li></ul></div>',
      actions: [{ label: 'Close', kind: 'ghost' }, demo ? { label: 'Connect YouTube', kind: 'primary', icon: 'key', onClick: () => { setTimeout(() => w.Auth.open(), 220); } } : { label: 'Switch to demo', kind: 'primary', onClick: () => { Store.setMode('demo'); chrome(); App.rerender(); } }]
    });
  });

  /* auth-expiry from the API layer */
  document.addEventListener('yt:auth-expired', e => {
    (e.detail.channelIds || []).forEach(id => { w.Activity.add('auth', 'warn', 'Authorization expired for ' + Store.channelName(id)); w.Notify.add({ type: 'auth', title: 'YouTube authorization expired', body: 'Reconnect ' + Store.channelName(id) + ' to continue.' }); });
    if (w.YT.renew) w.YT.renew(); authBar(); App.rerender();
  });

  document.addEventListener('yt:auth-restored', () => {
    try { const L = Store.channels(); let ch = false; L.forEach(c => { if (c.status === 'expired' && YT.hasToken(c.id)) { c.status = 'connected'; ch = true; } }); if (ch) Store.saveCol('channels', L); } catch (e) { /* ignore */ }
    authBar(); App.rerender(); if (App.refreshChrome) App.refreshChrome();
  });
  function authBar() {
    const el = U.$('#auth-bar'); if (!el) return;
    const n = Store.isDemo() ? 0 : YT.needsAttention();
    if (!n) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<div class="authbar" role="status">' + U.icon('lock', 'sm') + '<span>YouTube session paused for ' + U.plural(n, 'channel') + '. One tap resumes it.</span><button type="button" class="btn xs primary" data-act="auth-resume">Resume</button></div>';
  }
  U.act('auth-resume', async t => {
    U.busy(t, true);
    const r = await YT.renewAll(true);
    U.busy(t, false); authBar();
    U.toast(r.ok ? 'YouTube session resumed.' : (r.renewed && r.renewed.length ? 'Some channels resumed — tap Resume again for the rest.' : 'Could not resume. Allow pop-ups for this site, then tap Resume again.'), r.ok ? 'ok' : 'warn');
  });
  document.addEventListener('yt:auth-state', authBar);
  App.authBar = authBar;

  /* ------------------------------------------------------------ boot */
  function boot() {
    try { Store.init(); } catch (e) { console.error(e); }
    applyTheme();
    if (!location.hash) history.replaceState(null, '', '#/dashboard');
    render();
    if (!Store.persistent) setTimeout(() => U.toast('Browser storage is blocked — changes will be lost when you close this tab.', 'warn', 6000), 600);
    if ('matchMedia' in w) matchMedia('(prefers-color-scheme: light)').addEventListener && matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (Store.settings().theme === 'system') applyTheme(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
