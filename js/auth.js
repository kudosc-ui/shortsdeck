/* auth.js — "Connect YouTube" flow (UI). Talks to Google only through YT.connectYouTube().
   We never render a password field anywhere in this app. */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;

  const Auth = {
    open() {
      const configured = YT.isConfigured();
      const html =
        '<div class="stack">' +
        '<div class="row" style="align-items:flex-start"><span class="ico ok" style="width:42px;height:42px;border-radius:14px">' + U.icon('shield') + '</span>' +
        '<p style="font-weight:650;font-size:15.5px;line-height:1.4">Connect your YouTube account securely using Google OAuth.</p></div>' +
        '<ul class="checks">' +
        '<li>' + U.icon('check', 'sm') + '<span>You sign in on <b>Google\'s own page</b>. This app never asks for or sees your password.</span></li>' +
        '<li>' + U.icon('check', 'sm') + '<span>Each channel is connected separately — pick the channel you want in Google\'s account chooser.</span></li>' +
        '<li>' + U.icon('check', 'sm') + '<span>Revoke access any time at <b>myaccount.google.com/permissions</b>.</span></li></ul>' +
        '<div><div class="lbl" style="margin-bottom:8px">Permissions requested</div><div class="stack sm">' +
        YT.SCOPE_INFO.map(s => '<div class="scope">' + U.icon('lock', 'sm') + '<span>' + U.esc(s[0]) + '</span></div>').join('') + '</div></div>' +
        '<div id="oauth-status">' + (configured ? '' : Auth.notConfigured()) + '</div></div>';
      U.modal({
        title: 'Connect YouTube channel', html,
        actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Continue with Google', kind: 'primary', icon: 'key', onClick: (h) => { Auth.run(h); return false; } }]
      });
    },
    notConfigured() {
      return '<div class="banner">' + U.icon('info') + '<div><p><b>' + U.esc(YT.DEMO_MESSAGE) + '</b></p><p>Google sign-in is switched off until you add your OAuth Client ID (a public value) in Settings → YouTube accounts. No sign-in will be faked.</p>' +
        '<button type="button" class="btn sm" data-act="auth-settings">' + U.icon('settings', 'sm') + 'Open settings</button></div></div>';
    },
    async run(h) {
      const btn = h.btn(1), box = U.$('#oauth-status', h.el);
      if (!YT.isConfigured()) { box.innerHTML = Auth.notConfigured(); return; }
      U.busy(btn, true, 'Waiting for Google…');
      const r = await YT.connectYouTube();
      U.busy(btn, false);
      if (r.ok) {
        if (Store.isDemo()) { Store.setMode('live'); }
        const list = Store.channels();
        r.data.forEach(c => { const i = list.findIndex(x => x.id === c.id); if (i < 0) list.push(c); else list[i] = Object.assign({}, list[i], c, { status: 'connected' }); });
        Store.saveCol('channels', list);
        r.data.forEach(c => { w.Activity.add('auth', 'ok', 'Connected channel ' + c.name); w.Notify.add({ type: 'auth', title: 'Channel connected', body: c.name + ' is ready.' }); });
        U.toast('Connected ' + r.data.map(c => c.name).join(', ') + '.', 'ok');
        h.close(); location.hash = '#/channels'; w.App.rerender(); w.App.refreshChrome();
      } else if (r.demo) {
        box.innerHTML = Auth.notConfigured();
      } else {
        box.innerHTML = '<div class="banner err">' + U.icon('alert') + '<div><p><b>Couldn\'t connect</b></p><p>' + U.esc(r.message) + '</p></div></div>';
        w.Activity.add('auth', 'err', 'Connection attempt failed — ' + (r.code || 'error'));
      }
    }
  };
  U.act('connect', () => Auth.open());
  U.act('auth-settings', t => { const dlg = t.closest('.ov'); if (dlg) { const x = U.$('[data-close]', dlg); if (x) x.click(); } location.hash = '#/settings'; setTimeout(() => { const d = U.$('#set-accounts'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 450); });

  w.Auth = Auth;
})(window);
