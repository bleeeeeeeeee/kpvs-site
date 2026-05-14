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
  function modalNodeIsOpen(m) {
    if (!m || m.nodeType !== 1 || !m.classList || !m.classList.contains("modal")) return false;
    if (!m.classList.contains("show")) return false;
    if (m.style && m.style.display === "none") return false;
    return true;
  }
  function forceCloseOneModal(m) {
    if (!m || !m.parentNode) return;
    var id = m.id || "";
    m.classList.remove("show");
    m.style.display = "none";
    unlock();
    var removeIds = {
      "catalog-filter-modal": 1,
      "kpvs-favorites-modal": 1,
      "kpvs-cart-modal": 1,
      "admin-user-filter-modal": 1,
      "admin-filter-modal": 1
    };
    if (removeIds[id] && m.parentNode) m.parentNode.removeChild(m);
  }
  function shouldKeepModalForDismiss(m, primaryKeep, extraRoots) {
    if (primaryKeep && (m === primaryKeep || primaryKeep.contains(m) || m.contains(primaryKeep))) return true;
    if (extraRoots && extraRoots.length) {
      for (var i = 0; i < extraRoots.length; i++) {
        var r = extraRoots[i];
        if (!r) continue;
        if (m === r || r.contains(m) || m.contains(r)) return true;
      }
    }
    return false;
  }
  function dismissOpenModalsExcept(primaryKeep, extraRoots) {
    if (!global.document || !global.document.querySelectorAll) return;
    if (typeof global.KpvsDismissOauthPasswordPromptIfOpen === "function") {
      global.KpvsDismissOauthPasswordPromptIfOpen();
    }
    var modals = global.document.querySelectorAll(".modal");
    var toClose = [];
    var i;
    var m;
    for (i = 0; i < modals.length; i++) {
      m = modals[i];
      if (!modalNodeIsOpen(m)) continue;
      if (shouldKeepModalForDismiss(m, primaryKeep, extraRoots)) continue;
      toClose.push(m);
    }
    for (i = 0; i < toClose.length; i++) forceCloseOneModal(toClose[i]);
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
    },
    dismissOpenModalsExcept: dismissOpenModalsExcept
  };
  global.kpvsDismissTopModal = function(el) {
    if (!el || el.nodeType !== 1) return;
    var m = el.classList.contains("modal") ? el : el.closest ? el.closest(".modal") : null;
    if (!m || !m.parentNode) return;
    m.remove();
    unlock();
  };
})(typeof window !== "undefined" ? window : this);
