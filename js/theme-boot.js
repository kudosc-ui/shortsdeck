/* Applies the saved theme before first paint (avoids a dark/light flash). Non-sensitive UI preference only. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('shortsdeck:v1:settings') || '{}');
    var t = s.theme || 'dark';
    if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f5f5f8' : '#09090b');
  } catch (e) {}
})();
