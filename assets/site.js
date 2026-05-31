// Shared site behaviour: mobile nav, homepage filter, copy-to-clipboard.
(function () {
  // mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // homepage tool filter
  var filter = document.getElementById('tool-filter');
  if (filter) {
    filter.addEventListener('input', function () {
      var q = filter.value.trim().toLowerCase();
      document.querySelectorAll('.card').forEach(function (c) {
        c.style.display = c.dataset.name.indexOf(q) > -1 ? '' : 'none';
      });
      document.querySelectorAll('.cat').forEach(function (s) {
        var any = Array.prototype.some.call(s.querySelectorAll('.card'),
          function (c) { return c.style.display !== 'none'; });
        s.style.display = any ? '' : 'none';
      });
    });
  }

  // generic copy buttons: <button data-copy="#elementId">
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.querySelector(btn.dataset.copy);
      if (!el) return;
      var text = el.value !== undefined && el.tagName !== 'DIV' ? el.value : el.textContent;
      navigator.clipboard.writeText(text.trim()).then(function () {
        var old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = old; }, 1200);
      });
    });
  });
})();
