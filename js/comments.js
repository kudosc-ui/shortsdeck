/* comments.js — Comment inbox (6), automation rules (7) and reply templates (8).
   SAFETY: replies are only ever marked "sent" when YouTube confirmed it (YT.replyToComment → ok:true).
   In demo mode a reply is kept as a local draft / pending approval and the UI says so.
   Anti-spam: duplicate detection (never the same comment twice), hourly cap, per-user daily cap, manual approval by default. */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;
  const HOUR = 3600e3, DAY = 86400e3;
  const f = { status: 'all', channel: 'all', q: '' };
  const MATCH = [['contains', 'Contains'], ['exact', 'Exact match'], ['starts', 'Starts with'], ['ends', 'Ends with']];

  /* ------------------------------------------------------------ rule engine */
  const norm = s => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}'\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  function matches(rule, text) {
    const t = norm(text);
    return (rule.keywords || []).some(k => {
      k = norm(k); if (!k) return false;
      return rule.type === 'exact' ? t === k : rule.type === 'starts' ? t.indexOf(k) === 0 : rule.type === 'ends' ? t.slice(-k.length) === k && (t.length === k.length || t[t.length - k.length - 1] === ' ') : t.indexOf(k) >= 0;
    });
  }
  const rules = () => Store.get('rules', []);
  const templates = () => Store.get('templates', []);
  const pending = () => Store.col('pending');
  const log = () => Store.col('replyLog');
  const ruleApplies = (r, chId) => r.enabled && (r.channels === 'all' || (Array.isArray(r.channels) && r.channels.indexOf(chId) >= 0));
  const chanState = c => Store.isDemo() ? c.status : (YT.hasToken(c.id) ? 'connected' : 'expired');

  /* Decide whether a comment may be auto-replied to. Returns {ok, rule, reply} or {ok:false, reason}. */
  function evaluate(c) {
    const ch = Store.channel(c.channelId), a = Store.settings().automation;
    if (!ch) return { ok: false, reason: 'Channel no longer connected.' };
    if (!ch.automation) return { ok: false, reason: 'Automation is off for ' + ch.name + '.' };
    if (c.status === 'replied') return { ok: false, reason: 'Already replied — skipped to avoid duplicates.' };
    if (c.status === 'ignored') return { ok: false, reason: 'You ignored this comment.' };
    if (pending().some(p => p.commentId === c.id)) return { ok: false, reason: 'A reply is already waiting for approval.' };
    if (log().some(l => l.commentId === c.id)) return { ok: false, reason: 'Already auto-replied (duplicate blocked).' };
    const rule = rules().find(r => ruleApplies(r, c.channelId) && matches(r, c.text));
    if (!rule) return { ok: false, reason: 'No enabled rule matches this comment.' };
    const L = log(), now = Date.now();
    if (L.filter(l => now - l.at < HOUR).length >= a.maxPerHour) return { ok: false, reason: 'Hourly limit reached (' + a.maxPerHour + '/hour). Try again later.', limit: true };
    if (L.filter(l => l.author === c.author && now - l.at < DAY).length >= a.maxPerUserPerDay) return { ok: false, reason: 'Daily limit for ' + c.author + ' reached — not replying again.' };
    return { ok: true, rule, reply: rule.reply };
  }

  /* Really post (live) or refuse honestly (demo). Never fakes success. */
  async function send(c, text, via) {
    const r = await YT.replyToComment(c.channelId, c.id, text);
    if (r.ok) {
      const cur = Store.comment(c.id) || c;
      Object.assign(cur, { status: 'replied', replyText: text, repliedAt: Date.now(), read: true, draftReply: null });
      Store.saveComment(cur);
      Store.saveCol('replyLog', [{ commentId: c.id, author: c.author, at: Date.now(), via: via || 'manual' }].concat(log()).slice(0, 500));
      w.Activity.add('comment', 'ok', (via === 'auto' ? 'Auto-reply sent to ' : 'Reply sent to ') + c.author);
      w.Notify.add({ type: 'comment', title: 'Reply sent', body: 'Replied to ' + c.author + ' on ' + Store.channelName(c.channelId) + '.' });
    } else if (!r.demo) {
      w.Activity.add('comment', 'err', 'Reply to ' + c.author + ' failed — ' + (r.code || 'error'));
    }
    return r;
  }
  function queue(c, ev) {
    Store.saveCol('pending', pending().concat([{ id: U.uid('p'), commentId: c.id, channelId: c.channelId, author: c.author, comment: c.text, reply: ev.reply, rule: ev.rule.name, at: Date.now() }]));
    w.Activity.add('comment', 'info', 'Prepared reply for ' + c.author + ' (rule: ' + ev.rule.name + ') — awaiting approval' + (Store.isDemo() ? ' · demo' : ''));
  }
  /* Apply automation to one comment. */
  async function auto(c) {
    const ev = evaluate(c);
    if (!ev.ok) return ev;
    const mode = Store.settings().automation.mode;
    if (mode === 'auto' && !Store.isDemo() && YT.hasToken(c.channelId)) {
      const r = await send(c, ev.reply, 'auto');
      return r.ok ? { ok: true, sent: true, rule: ev.rule } : { ok: false, reason: r.message || 'Could not send.' };
    }
    queue(c, ev);
    return { ok: true, queued: true, rule: ev.rule };
  }

  const Comments = {
    matches, evaluate,

    /* ============================================================ INBOX */
    renderInbox() {
      const chans = Store.channels();
      if (!chans.length) return U.empty({ icon: 'chat', title: 'No YouTube channels connected yet.', body: 'Connect a channel to see and manage its comments.', action: '<button type="button" class="btn primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube</button>' });
      const all = Store.col('comments');
      const cnt = k => all.filter(c => Comments.inFilter(c, k)).length;
      const chips = [['all', 'All'], ['unread', 'Unread'], ['needs', 'Needs reply'], ['replied', 'Replied'], ['ignored', 'Ignored']];
      let h = '';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — sample comments. ' + U.esc(YT.DEMO_HINT) + ' Replies you write stay as drafts on this device.</p></div>';
      else h += '<div class="row between wrap"><span class="muted">Live comments from YouTube</span><button type="button" class="btn sm" data-act="cm-refresh">' + U.icon('refresh', 'sm') + 'Refresh</button></div>';
      h += '<div class="stack sm"><div class="search">' + U.icon('search', 'sm') + '<input class="input" type="search" id="cm-q" placeholder="Search comments, people, videos" value="' + U.esc(f.q) + '" data-inp="cm-search" aria-label="Search comments" autocomplete="off"></div>' +
        '<select class="select" id="cm-ch" data-chg="cm-channel" aria-label="Filter by channel"><option value="all">All channels</option>' + chans.map(c => '<option value="' + U.esc(c.id) + '" ' + (f.channel === c.id ? 'selected' : '') + '>' + U.esc(c.name) + '</option>').join('') + '</select></div>';
      h += '<div class="chips" role="group" aria-label="Filter comments">' + chips.map(c => '<button type="button" class="chip" aria-pressed="' + (f.status === c[0]) + '" data-act="cm-filter" data-f="' + c[0] + '">' + c[1] + '<span class="n">' + cnt(c[0]) + '</span></button>').join('') + '</div>';
      return h + '<div id="cm-list" class="grid-cards"></div>';
    },
    mountInbox() { Comments.paint(); },
    inFilter(c, k) {
      return k === 'all' || (k === 'unread' && !c.read) || (k === 'needs' && c.status === 'new') || (k === 'replied' && c.status === 'replied') || (k === 'ignored' && c.status === 'ignored');
    },
    list() {
      const q = norm(f.q);
      return Store.col('comments').filter(c => Comments.inFilter(c, f.status) && (f.channel === 'all' || c.channelId === f.channel) &&
        (!q || norm([c.author, c.text, c.video && c.video.title, Store.channelName(c.channelId)].join(' ')).indexOf(q) >= 0)).sort((a, b) => b.at - a.at);
    },
    paint() {
      const box = U.$('#cm-list'); if (!box) return;
      const L = Comments.list();
      box.innerHTML = L.length ? L.map(card).join('') : '<div style="grid-column:1/-1">' + U.empty({ icon: 'chat', title: f.q || f.status !== 'all' || f.channel !== 'all' ? 'No comments match' : 'No comments yet', body: f.q ? 'Try a different search or clear the filters.' : 'New comments will appear here.' }) + '</div>';
      U.$$('[data-act="cm-filter"]').forEach(b => { const n = U.$('.n', b); if (n) n.textContent = Store.col('comments').filter(c => Comments.inFilter(c, b.dataset.f)).length; });
      w.App.refreshBadges();
    },

    /* ============================================================ AUTOMATION */
    renderAutomation() {
      const s = Store.settings().automation, R = rules(), P = pending(), chans = Store.channels();
      let h = '';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — rules are real and editable, but replies can\'t be posted. Matching comments are prepared for approval only. ' + U.esc(YT.DEMO_HINT) + '</p></div>';
      h += '<div class="banner info">' + U.icon('server') + '<p>This app can only check comments <b>while it is open</b>. For 24/7 automatic replies run the same rules on a backend worker — see the README.</p></div>';
      h += '<section class="card"><div class="card-h"><h2>Reply mode</h2></div><div class="seg" role="group" aria-label="Reply mode"><button type="button" data-act="auto-mode" data-m="manual" aria-pressed="' + (s.mode === 'manual') + '">Manual approval</button><button type="button" data-act="auto-mode" data-m="auto" aria-pressed="' + (s.mode === 'auto') + '">Automatic</button></div>' +
        '<p class="hint" style="margin-top:10px">' + (s.mode === 'manual' ? 'Matching comments get a prepared reply that waits for your approval. Safest option.' : 'Matching comments are replied to automatically within the limits below' + (Store.isDemo() ? ' (demo: replies are only prepared, never posted).' : ' while this tab is open.')) + '</p>' +
        '<div class="row2" style="margin-top:14px"><div class="field"><label for="al-h">Max replies / hour</label><input class="input" type="number" id="al-h" min="1" max="60" inputmode="numeric" value="' + s.maxPerHour + '" data-chg="auto-limit" data-k="maxPerHour"></div>' +
        '<div class="field"><label for="al-u">Max per user / day</label><input class="input" type="number" id="al-u" min="1" max="5" inputmode="numeric" value="' + s.maxPerUserPerDay + '" data-chg="auto-limit" data-k="maxPerUserPerDay"></div></div>' +
        '<ul class="checks" style="margin-top:14px"><li>' + U.icon('shield', 'sm') + '<span>Never replies twice to the same comment</span></li><li>' + U.icon('shield', 'sm') + '<span>Skips ignored and already-replied comments</span></li><li>' + U.icon('shield', 'sm') + '<span>Honors hourly and per-user caps</span></li></ul></section>';
      h += '<section class="card"><div class="card-h"><div><h2>Waiting for approval</h2><div class="sub">' + U.plural(P.length, 'prepared reply', 'prepared replies') + '</div></div><button type="button" class="btn sm primary" data-act="auto-run">' + U.icon('bolt', 'sm') + 'Run rules now</button></div>';
      h += P.length ? '<div class="list">' + P.map(p => '<div class="item" style="display:grid;gap:10px"><div class="row">' + U.avatar(p.author.replace('@', ''), 'xs') + '<div class="grow"><b>' + U.esc(p.author) + '</b> <span class="dim">· ' + U.esc(Store.channelName(p.channelId)) + '</span></div><span class="tag">' + U.esc(p.rule) + '</span></div>' +
        '<div class="quote"><small>Comment</small>' + U.esc(p.comment) + '</div><div class="reply-prev"><small class="dim">Reply</small><br>' + U.esc(p.reply) + '</div>' +
        '<div class="row"><button type="button" class="btn sm primary grow" data-act="pend-ok" data-id="' + U.esc(p.id) + '">' + U.icon('send', 'sm') + 'Approve &amp; send</button><button type="button" class="btn sm ghost" data-act="pend-no" data-id="' + U.esc(p.id) + '">' + U.icon('x', 'sm') + 'Reject</button></div></div>').join('') + '</div>'
        : '<p class="muted">Nothing waiting. Tap “Run rules now” to scan new comments.</p>';
      h += '</section>';
      h += '<div class="sec-h"><h2>Rules</h2><button type="button" class="btn primary sm" data-act="rule-new">' + U.icon('plus', 'sm') + 'Add Rule</button></div>';
      h += R.length ? '<div class="grid-cards">' + R.map(r => '<article class="card rule"><div class="row between"><h3 class="truncate">' + U.esc(r.name) + '</h3>' + U.sw('rule-toggle', r.enabled, (r.enabled ? 'Disable ' : 'Enable ') + r.name, 'data-id="' + U.esc(r.id) + '"') + '</div>' +
        '<div><div class="lbl" style="margin-bottom:6px">IF comment ' + U.esc((MATCH.find(m => m[0] === r.type) || MATCH[0])[1].toLowerCase()) + '</div><div class="kw">' + r.keywords.map(k => '<span>' + U.esc(k) + '</span>').join('') + '</div></div>' +
        '<div><div class="lbl" style="margin-bottom:6px">THEN reply</div><div class="reply-prev">' + U.esc(r.reply) + '</div></div>' +
        '<div class="row wrap">' + U.icon('channels', 'xs') + '<span class="dim" style="font-size:12.5px">' + (r.channels === 'all' ? 'All channels' : r.channels.map(Store.channelName).map(U.esc).join(', ')) + '</span></div>' +
        '<div class="rule-acts"><button type="button" class="btn xs" data-act="rule-edit" data-id="' + U.esc(r.id) + '">' + U.icon('edit', 'xs') + 'Edit</button><button type="button" class="btn xs ghost" data-act="rule-dup" data-id="' + U.esc(r.id) + '">' + U.icon('copy', 'xs') + 'Duplicate</button><button type="button" class="btn xs danger" data-act="rule-del" data-id="' + U.esc(r.id) + '">' + U.icon('trash', 'xs') + 'Delete</button></div></article>').join('') + '</div>'
        : U.empty({ icon: 'bolt', title: 'No rules yet', body: 'Create a rule to prepare replies for comments that contain certain words.', action: '<button type="button" class="btn primary" data-act="rule-new">' + U.icon('plus', 'sm') + 'Add Rule</button>' });
      if (!chans.some(c => c.automation)) h += '<div class="banner">' + U.icon('alert') + '<p>Automation is off on every channel. Turn it on from <a href="#/channels">Channels → Automation</a>.</p></div>';
      return h;
    },

    /* ============================================================ TEMPLATES */
    renderTemplates() {
      const T = templates();
      let h = '<div class="row between wrap"><p class="lead">Reusable replies for the inbox and rules.</p><button type="button" class="btn primary sm" data-act="tpl-new">' + U.icon('plus', 'sm') + 'New template</button></div>';
      if (!T.length) return h + U.empty({ icon: 'template', title: 'No templates yet', body: 'Save replies you send often, then reuse them in one tap.', action: '<button type="button" class="btn primary" data-act="tpl-new">New template</button>' });
      return h + '<div class="grid-cards">' + T.map(t => '<article class="card stack"><div class="row between"><h3 class="truncate">' + U.esc(t.name) + '</h3><span class="tag num">' + t.text.length + ' chars</span></div><div class="reply-prev">' + U.esc(t.text) + '</div>' +
        '<div class="rule-acts"><button type="button" class="btn xs" data-act="tpl-edit" data-id="' + U.esc(t.id) + '">' + U.icon('edit', 'xs') + 'Edit</button><button type="button" class="btn xs ghost" data-act="tpl-dup" data-id="' + U.esc(t.id) + '">' + U.icon('copy', 'xs') + 'Duplicate</button><button type="button" class="btn xs ghost" data-act="tpl-copy" data-id="' + U.esc(t.id) + '">' + U.icon('link', 'xs') + 'Copy</button><button type="button" class="btn xs danger" data-act="tpl-del" data-id="' + U.esc(t.id) + '">' + U.icon('trash', 'xs') + 'Delete</button></div></article>').join('') + '</div>';
    }
  };

  /* ------------------------------------------------------------ comment card */
  function card(c) {
    const ch = Store.channel(c.channelId);
    const st = c.status === 'replied' ? U.badge('Replied', 'ok', 'check') : c.status === 'ignored' ? U.badge('Ignored', 'mute', 'ban') : U.badge('Needs reply', 'warn', 'chat');
    return '<article class="card cm ' + (c.read ? '' : 'unread') + '" aria-label="Comment from ' + U.esc(c.author) + '"><div class="cm-h">' + U.avatar(String(c.author).replace('@', ''), 'sm') +
      '<div class="cm-who"><b class="truncate">' + U.esc(c.author) + '</b><small class="truncate">' + U.esc(ch ? ch.name : 'Removed channel') + ' · ' + U.esc(U.rel(c.at)) + '</small></div>' + st + (c.flagged ? '<span class="ico warn" style="width:28px;height:28px" aria-label="Marked">' + U.icon('flag', 'xs') + '</span>' : '') + '</div>' +
      '<p class="cm-t">' + U.esc(c.text) + '</p><div class="cm-v"><span class="truncate">' + U.icon('film', 'xs') + U.esc((c.video && c.video.title) || 'Video') + '</span><span>' + U.icon('heart', 'xs') + c.likes + '</span>' + (c.demo ? '<span class="tag demo">demo</span>' : '') + '</div>' +
      (c.replyText ? '<div class="quote"><small>Your reply</small>' + U.esc(c.replyText) + '</div>' : '') +
      (c.draftReply && c.status !== 'replied' ? '<div class="quote" style="background:var(--warn-soft);border-color:var(--warn)"><small>Draft · not sent</small>' + U.esc(c.draftReply) + '</div>' : '') +
      '<div class="cm-a"><button type="button" class="btn sm primary" data-act="cm-reply" data-id="' + U.esc(c.id) + '">' + U.icon('send') + 'Reply</button>' +
      '<button type="button" class="btn sm" data-act="cm-ignore" data-id="' + U.esc(c.id) + '">' + U.icon(c.status === 'ignored' ? 'refresh' : 'ban') + (c.status === 'ignored' ? 'Restore' : 'Ignore') + '</button>' +
      '<button type="button" class="btn sm" data-act="cm-mark" data-id="' + U.esc(c.id) + '" aria-pressed="' + !!c.flagged + '">' + U.icon('flag') + (c.flagged ? 'Unmark' : 'Mark') + '</button>' +
      '<button type="button" class="btn sm" data-act="cm-auto" data-id="' + U.esc(c.id) + '">' + U.icon('bolt') + 'Auto</button></div></article>';
  }
  const upd = (id, p) => { const c = Store.comment(id); if (c) { Object.assign(c, p); Store.saveComment(c); } return c; };

  /* ------------------------------------------------------------ inbox actions */
  U.inp('cm-search', U.debounce(t => { f.q = t.value; Comments.paint(); }, 160));
  U.chg('cm-channel', t => { f.channel = t.value; Comments.paint(); });
  U.act('cm-filter', t => { f.status = t.dataset.f; U.$$('[data-act="cm-filter"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); Comments.paint(); });
  U.act('cm-ignore', t => { const c = Store.comment(t.dataset.id); if (!c) return; const ign = c.status !== 'ignored'; upd(c.id, { status: ign ? 'ignored' : 'new', read: true }); Comments.paint(); U.toast(ign ? 'Ignored. It won\'t get automatic replies.' : 'Restored to “Needs reply”.', 'ok'); });
  U.act('cm-mark', t => { const c = Store.comment(t.dataset.id); if (!c) return; upd(c.id, { flagged: !c.flagged, read: true }); Comments.paint(); });
  U.act('cm-refresh', async t => {
    U.busy(t, true, 'Refreshing');
    const chans = Store.channels().filter(c => YT.hasToken(c.id)); let added = 0, err = null;
    for (const ch of chans) {
      const r = await YT.getComments(ch.id, { max: 50 });
      if (!r.ok) { err = r.message; continue; }
      const have = Store.col('comments'), ids = {}; have.forEach(c => { ids[c.id] = 1; });
      const fresh = r.data.comments.filter(c => !ids[c.id]);
      added += fresh.length; if (fresh.length) Store.saveCol('comments', fresh.concat(have));
    }
    U.busy(t, false);
    if (!chans.length) U.toast('Reconnect a channel to refresh comments.', 'warn');
    else if (err && !added) U.toast(err, 'err');
    else { U.toast(added ? added + ' new comment' + (added > 1 ? 's' : '') + '.' : 'You\'re up to date.', 'ok'); if (added) w.Notify.add({ type: 'comment', title: added + ' new comment' + (added > 1 ? 's' : ''), body: 'Fetched from YouTube.' }); }
    w.App.rerender();
  });
  U.act('cm-reply', t => {
    const c = Store.comment(t.dataset.id); if (!c) return; upd(c.id, { read: true });
    const T = templates(), demo = Store.isDemo();
    U.modal({
      title: 'Reply to ' + c.author,
      html: '<div class="stack"><div class="quote"><small>Comment</small>' + U.esc(c.text) + '</div>' +
        (T.length ? '<div class="field"><label for="rp-t">Template</label><select class="select" id="rp-t"><option value="">Choose a template…</option>' + T.map(x => '<option value="' + U.esc(x.id) + '">' + U.esc(x.name) + '</option>').join('') + '</select></div>' : '') +
        '<div class="field"><label for="rp-x">Your reply <span class="counter" id="rp-c">0/500</span></label><textarea class="textarea" id="rp-x" maxlength="500" placeholder="Write a reply…">' + U.esc(c.draftReply || '') + '</textarea></div>' +
        (demo ? '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — this reply can\'t be posted to YouTube. It will be saved as a local draft. ' + U.esc(YT.DEMO_HINT) + '</p></div>' : '') + '</div>',
      onOpen: h => {
        const x = U.$('#rp-x', h.el), t2 = U.$('#rp-t', h.el), cc = U.$('#rp-c', h.el), up = () => { cc.textContent = x.value.length + '/500'; }; up();
        x.addEventListener('input', up);
        if (t2) t2.addEventListener('change', () => { const tp = templates().find(z => z.id === t2.value); if (tp) { x.value = tp.text.slice(0, 500); up(); x.focus(); } });
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: demo ? 'Save draft' : 'Send reply', kind: 'primary', icon: demo ? 'edit' : 'send', onClick: async h => {
          const text = U.clean(U.$('#rp-x', h.el).value, 500);
          if (!text) { U.toast('Write a reply first.', 'err'); return false; }
          const cur = Store.comment(c.id) || c;
          if (cur.status === 'replied') { U.toast('You already replied to this comment.', 'warn'); return false; }
          const btn = h.btn(1); U.busy(btn, true, demo ? 'Saving' : 'Sending');
          const r = await send(cur, text, 'manual'); U.busy(btn, false);
          if (r.ok) { U.toast('Reply posted to YouTube.', 'ok'); Comments.paint(); return true; }
          if (r.demo) { upd(c.id, { draftReply: text }); U.toast('Saved as a draft — NOT posted. ' + YT.DEMO_HINT, 'warn', 6500); Comments.paint(); return true; }
          U.toast(r.message || 'Could not post the reply.', 'err'); return false;
        }
      }]
    });
  });
  U.act('cm-auto', async t => {
    const c = Store.comment(t.dataset.id); if (!c) return;
    U.busy(t, true); const r = await auto(c); U.busy(t, false);
    upd(c.id, { read: true });
    if (!r.ok) U.toast(r.reason, 'warn', 5200);
    else if (r.sent) U.toast('Auto-reply sent using “' + r.rule.name + '”.', 'ok');
    else U.toast('Reply prepared (“' + r.rule.name + '”). Approve it in Automation' + (Store.isDemo() ? ' — demo: it can\'t be posted.' : '.'), 'info', 5200);
    Comments.paint();
  });

  /* ------------------------------------------------------------ automation actions */
  U.act('auto-mode', t => { Store.saveSettings({ automation: { mode: t.dataset.m } }); w.App.rerender(); });
  U.chg('auto-limit', t => {
    const max = t.dataset.k === 'maxPerHour' ? 60 : 5; let v = parseInt(t.value, 10);
    if (isNaN(v) || v < 1) v = 1; v = Math.min(v, max); t.value = v;
    Store.saveSettings({ automation: { [t.dataset.k]: v } }); U.toast('Limit saved.', 'ok', 1500);
  });
  U.act('auto-run', async t => {
    U.busy(t, true, 'Scanning');
    const cs = Store.col('comments').filter(c => c.status === 'new'), res = { q: 0, s: 0, skip: 0 }; let limit = false;
    for (const c of cs) { const r = await auto(c); if (r.ok) { if (r.sent) res.s++; else res.q++; } else { res.skip++; if (r.limit) { limit = true; break; } } }
    U.busy(t, false);
    U.toast(res.q + res.s ? (res.s ? res.s + ' sent, ' : '') + res.q + ' prepared · ' + res.skip + ' skipped.' : 'No new matches' + (limit ? ' — hourly limit reached.' : ' (' + res.skip + ' checked).'), res.q + res.s ? 'ok' : 'info');
    w.App.rerender();
  });
  U.act('pend-ok', async t => {
    const p = pending().find(x => x.id === t.dataset.id), c = p && Store.comment(p.commentId); if (!p) return;
    if (!c) { Store.saveCol('pending', pending().filter(x => x.id !== p.id)); w.App.rerender(); return; }
    if (c.status === 'replied') { Store.saveCol('pending', pending().filter(x => x.id !== p.id)); U.toast('Already replied — removed.', 'warn'); w.App.rerender(); return; }
    const a = Store.settings().automation, L = log(), now = Date.now();
    if (L.filter(l => now - l.at < HOUR).length >= a.maxPerHour) { U.toast('Hourly limit reached (' + a.maxPerHour + '). Try again later.', 'warn'); return; }
    if (L.filter(l => l.author === c.author && now - l.at < DAY).length >= a.maxPerUserPerDay) { U.toast('Daily limit for ' + c.author + ' reached.', 'warn'); return; }
    U.busy(t, true, 'Sending');
    const r = await send(c, p.reply, 'approved'); U.busy(t, false);
    if (r.ok) { Store.saveCol('pending', pending().filter(x => x.id !== p.id)); U.toast('Reply posted to YouTube.', 'ok'); w.App.rerender(); }
    else U.toast(r.demo ? 'Not sent — ' + YT.DEMO_HINT : (r.message || 'Could not post the reply.'), r.demo ? 'warn' : 'err', 6000);
  });
  U.act('pend-no', t => { Store.saveCol('pending', pending().filter(x => x.id !== t.dataset.id)); w.Activity.add('comment', 'info', 'Rejected a prepared reply'); w.App.rerender(); U.toast('Reply discarded.', 'ok'); });

  U.chg('rule-toggle', t => { const R = rules(), r = R.find(x => x.id === t.dataset.id); if (r) { r.enabled = t.checked; Store.set('rules', R); U.toast('Rule ' + (r.enabled ? 'enabled' : 'disabled') + '.', 'ok', 1600); } });
  U.act('rule-new', () => ruleModal(null));
  U.act('rule-edit', t => ruleModal(rules().find(r => r.id === t.dataset.id)));
  U.act('rule-dup', t => { const R = rules(), r = R.find(x => x.id === t.dataset.id); if (!r) return; R.push(Object.assign({}, r, { id: U.uid('r'), name: r.name + ' (copy)', keywords: r.keywords.slice(), channels: r.channels === 'all' ? 'all' : r.channels.slice(), enabled: false })); Store.set('rules', R); w.App.rerender(); U.toast('Duplicated (disabled).', 'ok'); });
  U.act('rule-del', async t => { const r = rules().find(x => x.id === t.dataset.id); if (r && await U.confirm({ title: 'Delete rule?', body: '“' + r.name + '” will be removed. Prepared replies already waiting stay in the list.', confirmText: 'Delete', danger: true })) { Store.set('rules', rules().filter(x => x.id !== r.id)); w.App.rerender(); U.toast('Rule deleted.', 'ok'); } });
  function ruleModal(r) {
    const chans = Store.channels(), all = !r || r.channels === 'all';
    U.modal({
      title: r ? 'Edit rule' : 'Add rule',
      html: '<div class="stack"><div class="field"><label for="rl-n">Rule name</label><input class="input" id="rl-n" maxlength="60" placeholder="e.g. Source code requests" value="' + U.esc(r ? r.name : '') + '"></div>' +
        '<div class="field"><label for="rl-k">Keywords <span class="counter">separate with commas</span></label><textarea class="textarea" id="rl-k" placeholder="source, code, github, repository" style="min-height:76px">' + U.esc(r ? r.keywords.join(', ') : '') + '</textarea></div>' +
        '<div class="field"><label for="rl-m">Matching type</label><select class="select" id="rl-m">' + MATCH.map(m => '<option value="' + m[0] + '" ' + (r && r.type === m[0] ? 'selected' : '') + '>' + m[1] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="rl-r">Reply text <span class="counter" id="rl-c">0/500</span></label><textarea class="textarea" id="rl-r" maxlength="500" placeholder="Source code is available in the video description! 🚀">' + U.esc(r ? r.reply : '') + '</textarea></div>' +
        (templates().length ? '<div class="field"><label for="rl-t">Fill from template</label><select class="select" id="rl-t"><option value="">Choose…</option>' + templates().map(x => '<option value="' + U.esc(x.id) + '">' + U.esc(x.name) + '</option>').join('') + '</select></div>' : '') +
        '<div class="field"><label>Channels</label><div class="stack sm"><label class="pick"><input type="checkbox" class="vh" id="rl-all" ' + (all ? 'checked' : '') + '><span class="pick-in"><span class="pick-t"><b>All channels</b></span><span class="tick">' + U.icon('check', 'sm') + '</span></span></label>' +
        '<div id="rl-chs" class="stack sm" ' + (all ? 'hidden' : '') + '>' + chans.map(c => '<label class="pick"><input type="checkbox" class="vh" value="' + U.esc(c.id) + '" ' + (r && r.channels !== 'all' && r.channels.indexOf(c.id) >= 0 ? 'checked' : '') + '><span class="pick-in">' + U.avatar(c.name, 'xs') + '<span class="pick-t"><b>' + U.esc(c.name) + '</b></span><span class="tick">' + U.icon('check', 'sm') + '</span></span></label>').join('') + '</div></div></div>' +
        '<div class="set-row"><div class="t">Enabled</div>' + U.sw('x', !r || r.enabled, 'Enabled', 'id="rl-e"') + '</div></div>',
      onOpen: h => {
        const rr = U.$('#rl-r', h.el), cc = U.$('#rl-c', h.el), up = () => { cc.textContent = rr.value.length + '/500'; }; up(); rr.addEventListener('input', up);
        U.$('#rl-all', h.el).addEventListener('change', e => { U.$('#rl-chs', h.el).hidden = e.target.checked; });
        const tt = U.$('#rl-t', h.el); if (tt) tt.addEventListener('change', () => { const x = templates().find(z => z.id === tt.value); if (x) { rr.value = x.text.slice(0, 500); up(); } });
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save rule', kind: 'primary', onClick: h => {
          const name = U.clean(U.$('#rl-n', h.el).value, 60), reply = U.clean(U.$('#rl-r', h.el).value, 500);
          const kws = []; U.$('#rl-k', h.el).value.split(/[,\n]/).forEach(k => { k = U.clean(k, 60); if (k && kws.map(x => x.toLowerCase()).indexOf(k.toLowerCase()) < 0) kws.push(k); });
          const allCh = U.$('#rl-all', h.el).checked, ids = U.$$('#rl-chs input:checked', h.el).map(i => i.value);
          if (!name) { U.toast('Give the rule a name.', 'err'); return false; }
          if (!kws.length) { U.toast('Add at least one keyword.', 'err'); return false; }
          if (!reply) { U.toast('Write the reply text.', 'err'); return false; }
          if (!allCh && !ids.length) { U.toast('Pick at least one channel.', 'err'); return false; }
          const R = rules(), obj = { id: r ? r.id : U.uid('r'), name, keywords: kws, type: U.$('#rl-m', h.el).value, reply, channels: allCh ? 'all' : ids, enabled: U.$('#rl-e', h.el).checked };
          const i = R.findIndex(x => x.id === obj.id); if (i < 0) R.push(obj); else R[i] = obj;
          Store.set('rules', R); U.toast('Rule saved.', 'ok'); w.App.rerender();
        }
      }]
    });
  }

  /* ------------------------------------------------------------ templates actions */
  U.act('tpl-new', () => tplModal(null));
  U.act('tpl-edit', t => tplModal(templates().find(x => x.id === t.dataset.id)));
  U.act('tpl-dup', t => { const T = templates(), x = T.find(z => z.id === t.dataset.id); if (!x) return; T.push({ id: U.uid('tp'), name: x.name + ' (copy)', text: x.text }); Store.set('templates', T); w.App.rerender(); U.toast('Template duplicated.', 'ok'); });
  U.act('tpl-copy', async t => { const x = templates().find(z => z.id === t.dataset.id); if (x) U.toast((await U.copy(x.text)) ? 'Copied to clipboard.' : 'Couldn\'t copy — select the text manually.', 'ok'); });
  U.act('tpl-del', async t => { const x = templates().find(z => z.id === t.dataset.id); if (x && await U.confirm({ title: 'Delete template?', body: '“' + x.name + '” will be removed.', confirmText: 'Delete', danger: true })) { Store.set('templates', templates().filter(z => z.id !== x.id)); w.App.rerender(); U.toast('Template deleted.', 'ok'); } });
  function tplModal(x) {
    U.modal({
      title: x ? 'Edit template' : 'New template',
      html: '<div class="stack"><div class="field"><label for="tp-n">Template name</label><input class="input" id="tp-n" maxlength="40" placeholder="e.g. Thank You" value="' + U.esc(x ? x.name : '') + '"></div>' +
        '<div class="field"><label for="tp-x">Reply <span class="counter" id="tp-c">0/500</span></label><textarea class="textarea" id="tp-x" maxlength="500" placeholder="Thanks for watching! ❤️">' + U.esc(x ? x.text : '') + '</textarea></div></div>',
      onOpen: h => { const a = U.$('#tp-x', h.el), c = U.$('#tp-c', h.el), up = () => { c.textContent = a.value.length + '/500'; }; up(); a.addEventListener('input', up); },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: h => {
          const name = U.clean(U.$('#tp-n', h.el).value, 40), text = U.clean(U.$('#tp-x', h.el).value, 500);
          if (!name || !text) { U.toast('Add a name and a reply.', 'err'); return false; }
          const T = templates(), obj = { id: x ? x.id : U.uid('tp'), name, text }, i = T.findIndex(z => z.id === obj.id);
          if (i < 0) T.push(obj); else T[i] = obj; Store.set('templates', T); U.toast('Template saved.', 'ok'); w.App.rerender();
        }
      }]
    });
  }

  Comments.chanState = chanState;
  w.Comments = Comments;
})(window);
