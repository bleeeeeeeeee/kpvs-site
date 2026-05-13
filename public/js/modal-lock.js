(function(global) {
  var depth = 0;
  function sync() {
    var on = depth > 0;
    var docEl = document.documentElement;
    if (on) {
      docEl.classList.add("modal-open");
      document.body.classList.add("modal-open");
    } else {
      docEl.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
    }
  }
  function lock() {
    depth += 1;
    if (depth === 1) sync();
  }
  function unlock() {
    if (depth <= 0) return;
    depth -= 1;
    if (depth === 0) sync();
  }
  global.KpvsModalOverlay = {
    lock,
    unlock,
    reset: function() {
      depth = 0;
      sync();
    },
    getDepth: function() {
      return depth;
    }
  };
  global.kpvsDismissTopModal = function(el) {
    if (!el || el.nodeType !== 1) return;
    var m = el.classList.contains("modal") ? el : el.closest ? el.closest(".modal") : null;
    if (!m || !m.parentNode) return;
    m.remove();
    unlock();
  };
})(typeof window !== "undefined" ? window : this);
