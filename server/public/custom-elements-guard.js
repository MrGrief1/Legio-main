// Re-registering a custom element name throws and takes the page down with it. During dev the
// module graph can be evaluated twice (HMR, a double-mounted StrictMode tree), so make the second
// registration a warning instead of a fatal error.
//
// This lives in its own file rather than inline in index.html so the Content-Security-Policy can
// say script-src 'self' with no 'unsafe-inline' — which is what stops an injected <script> from
// running at all. Keep it that way: moving this back inline would require reopening that hole.
(function () {
  var originalDefine = customElements.define;

  customElements.define = function (name, constructor, options) {
    if (customElements.get(name)) {
      console.warn('Custom element ' + name + ' has already been defined.');
      return;
    }
    return originalDefine.call(customElements, name, constructor, options);
  };
})();
