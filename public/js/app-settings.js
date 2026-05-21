(function() {
  var THEME_KEY = "kpvs.theme";
  var pushTimer = null;
  var pullInFlight = null;
  function applyTheme() {
    var t = "";
    try {
      t = localStorage.getItem(THEME_KEY) || "";
    } catch {
      t = "";
    }
    if (t !== "dark" && t !== "light") return;
    document.documentElement.setAttribute("data-theme", t);
  }
  function normalizeItems(input) {
    if (!Array.isArray(input)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < input.length; i++) {
      var item = input[i];
      var id = NaN;
      var source = "";
      if (typeof item === "number" || typeof item === "string") {
        id = Number(item);
      } else if (item && typeof item === "object") {
        id = Number(item.id);
        source = item.source != null ? String(item.source).trim().slice(0, 32) : "";
      }
      if (!Number.isFinite(id) || id <= 0) continue;
      if (seen[id]) continue;
      seen[id] = 1;
      out.push({ id: id, source: source });
    }
    return out;
  }
  function mergeById(a, b) {
    var out = [];
    var seen = {};
    var lists = [a, b];
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var i = 0; i < list.length; i++) {
        var id = list[i].id;
        if (seen[id]) continue;
        seen[id] = 1;
        out.push(list[i]);
      }
    }
    return out;
  }
  function readLocal() {
    var cart = [];
    var favorites = [];
    try {
      cart = JSON.parse(localStorage.getItem("cart") || "[]");
    } catch {
      cart = [];
    }
    try {
      favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
    } catch {
      favorites = [];
    }
    return { cart: normalizeItems(cart), favorites: normalizeItems(favorites) };
  }
  function persistLocal(cart, favorites) {
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
      localStorage.setItem("favorites", JSON.stringify(favorites));
    } catch {
    }
  }
  function fetchMe() {
    return fetch("/api/user/auth/me", { credentials: "include" }).then(function(r) {
      if (!r.ok) return null;
      return r.json();
    }).catch(function() {
      return null;
    });
  }
  function putLists(cart, favorites) {
    if (!window.KpvsApi || !window.KpvsApi.apiFetch) return Promise.resolve(false);
    return window.KpvsApi.apiFetch("/api/user/lists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart: cart, favorites: favorites })
    }).then(function(r) {
      return !!(r && r.ok);
    }).catch(function() {
      return false;
    });
  }
  function pull() {
    if (pullInFlight) return pullInFlight;
    pullInFlight = fetchMe().then(function(me) {
      if (!me || !me.id || String(me.role) !== "user") return false;
      if (!window.KpvsApi || !window.KpvsApi.apiFetch) return false;
      return window.KpvsApi.apiFetch("/api/user/lists").then(function(r) {
        if (!r || !r.ok) return false;
        return r.json();
      }).then(function(data) {
        if (!data) return false;
        var local = readLocal();
        var cart = mergeById(local.cart, normalizeItems(data.cart));
        var favorites = mergeById(local.favorites, normalizeItems(data.favorites));
        persistLocal(cart, favorites);
        return putLists(cart, favorites);
      });
    }).finally(function() {
      pullInFlight = null;
    });
    return pullInFlight;
  }
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function() {
      fetchMe().then(function(me) {
        if (!me || !me.id || String(me.role) !== "user") return;
        var local = readLocal();
        putLists(local.cart, local.favorites);
      });
    }, 400);
  }
  function pushNow() {
    clearTimeout(pushTimer);
    return fetchMe().then(function(me) {
      if (!me || !me.id || String(me.role) !== "user") return;
      var local = readLocal();
      return putLists(local.cart, local.favorites);
    });
  }
  window.KpvsListsSync = { pull: pull, push: push, pushNow: pushNow };
  document.addEventListener("DOMContentLoaded", function() {
    applyTheme();
    pull();
  });
})();
