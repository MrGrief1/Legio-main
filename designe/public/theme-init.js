// Applies the saved theme before the first paint.
//
// index.html ships with class="dark" on <html> so a no-JS load still gets a coherent page, but a
// user who picked the light theme would then see a dark flash until React mounted and corrected
// the class. This runs synchronously in <head>, before anything is painted, so the correction
// happens without a visible frame in the wrong theme.
//
// Its own file rather than an inline script for the same reason as custom-elements-guard.js: the
// Content-Security-Policy says script-src 'self' with no 'unsafe-inline'.
//
// The resolution rules here MUST stay identical to context/ThemeContext.tsx: same storage key,
// same treatment of an unknown/absent value ('system' — follow the OS).
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var isDark = stored === 'dark'
      ? true
      : stored === 'light'
        ? false
        : window.matchMedia('(prefers-color-scheme: dark)').matches;

    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {
    // Storage can throw (Safari private mode, blocked cookies). Keep the markup default.
  }
})();
