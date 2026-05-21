(function() {
  var THEME_KEY = "kpvs.theme";
  var pushTimer = null;
  var pullInFlight = null;
  var pullFocusTimer = null;
  var lastFingerprint = "";
  var csrfReady = null;
  function ensureCsrf() {
    if (!csrfReady) {
      csrfReady = fetch("/api/csrf-token", { credentials: "include" }).catch(function() {});
    }
    return csrfReady;
  }
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
  function fingerprint(cart, favorites) {
    function sig(list) {
      return list
        .map(function(i) {
          return String(i.id) + ":" + (i.source || "");
        })
        .sort()
        .join(",");
    }
    return sig(cart) + ";" + sig(favorites);
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
  function persistLocal(cart, favorites, notify) {
    var fp = fingerprint(cart, favorites);
    var changed = fp !== lastFingerprint;
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
      localStorage.setItem("favorites", JSON.stringify(favorites));
    } catch {
    }
    lastFingerprint = fp;
    if (notify && changed) {
      try {
        document.dispatchEvent(new CustomEvent("kpvs-lists-synced", { detail: { cart: cart, favorites: favorites } }));
      } catch {
      }
    }
    return changed;
  }
  function resolveList(serverList, localList) {
    var server = normalizeItems(serverList);
    var local = normalizeItems(localList);
    if (!server.length && local.length) return { list: local, upload: true };
    return { list: server, upload: false };
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
    if (!window.KpvsApi || !window.KpvsApi.apiFetch) return Promise.resolve(null);
    return ensureCsrf().then(function() {
      return window.KpvsApi.apiFetch("/api/user/lists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart: cart, favorites: favorites })
    });
    }).then(function(r) {
        if (!r || !r.ok) return null;
        return r.json();
      })
      .catch(function() {
        return null;
      });
  }
  function getLists() {
    if (!window.KpvsApi || !window.KpvsApi.apiFetch) return Promise.resolve(null);
    return ensureCsrf().then(function() {
      return window.KpvsApi.apiFetch("/api/user/lists");
    })
      .then(function(r) {
        if (!r || !r.ok) return null;
        return r.json();
      })
      .catch(function() {
        return null;
      });
  }
  function pull() {
    if (pushTimer) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve(pull());
        }, 450);
      });
    }
    if (pullInFlight) return pullInFlight;
    pullInFlight = fetchMe()
      .then(function(me) {
        if (!me || !me.id || String(me.role) !== "user") {
          lastFingerprint = fingerprint(readLocal().cart, readLocal().favorites);
          return false;
        }
        return getLists().then(function(data) {
          if (!data) return false;
          var local = readLocal();
          var cartResolved = resolveList(data.cart, local.cart);
          var favResolved = resolveList(data.favorites, local.favorites);
          var outCart = cartResolved.list;
          var outFav = favResolved.list;
          var needUpload = cartResolved.upload || favResolved.upload;
          if (needUpload) {
            return putLists(outCart, outFav).then(function(saved) {
              if (saved) {
                persistLocal(saved.cart, saved.favorites, true);
                return true;
              }
              persistLocal(outCart, outFav, true);
              return true;
            });
          }
          persistLocal(outCart, outFav, true);
          return true;
        });
      })
      .finally(function() {
        pullInFlight = null;
      });
    return pullInFlight;
  }
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function() {
      pushTimer = null;
      pushNow();
    }, 250);
  }
  function pushNow() {
    clearTimeout(pushTimer);
    pushTimer = null;
    return fetchMe().then(function(me) {
      if (!me || !me.id || String(me.role) !== "user") return false;
      var local = readLocal();
      return putLists(local.cart, local.favorites).then(function(saved) {
        if (saved) lastFingerprint = fingerprint(saved.cart, saved.favorites);
        return !!saved;
      });
    });
  }
  function refreshBefore(action) {
    if (typeof action !== "function") return Promise.resolve();
    return pull().then(function() {
      action();
    });
  }
  window.KpvsListsSync = { pull: pull, push: push, pushNow: pushNow, refreshBefore: refreshBefore };
  document.addEventListener("DOMContentLoaded", function() {
    applyTheme();
    var local = readLocal();
    lastFingerprint = fingerprint(local.cart, local.favorites);
    pull();
  });
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState !== "visible") return;
    clearTimeout(pullFocusTimer);
    pullFocusTimer = setTimeout(function() {
      pull();
    }, 200);
  });
  window.addEventListener("focus", function() {
    clearTimeout(pullFocusTimer);
    pullFocusTimer = setTimeout(function() {
      pull();
    }, 200);
  });
})();
