(function() {
  var THEME_KEY = "kpvs.theme";
  var PERSIST_KEY = "kpvs.catalog.persist";
  var LISTS_SYNCED_FP_KEY = "kpvs.lists.synced";
  var CATALOG_GENDERS = ["mens", "womens", "all"];
  var pushTimer = null;
  var pullInFlight = null;
  var pullFocusTimer = null;
  var lastFingerprint = "";
  var csrfReady = null;
  var xsrfToken = "";

  function resetCsrf() {
    csrfReady = null;
    xsrfToken = "";
  }

  function ensureCsrf() {
    if (!csrfReady) {
      csrfReady = fetch("/api/csrf-token", { credentials: "include" })
        .then(function(r) {
          if (!r || !r.ok) {
            resetCsrf();
            return "";
          }
          return r.json().then(function(data) {
            var t = data && data.csrfToken ? String(data.csrfToken) : "";
            if (t) xsrfToken = t;
            else if (window.KpvsApi && window.KpvsApi.readCookie) {
              xsrfToken = window.KpvsApi.readCookie("XSRF-TOKEN") || "";
            }
            return xsrfToken;
          });
        })
        .catch(function() {
          resetCsrf();
          return "";
        });
    }
    return csrfReady;
  }

  function mutatingHeaders(jsonBody) {
    var h = jsonBody ? { "Content-Type": "application/json" } : {};
    var t = xsrfToken || (window.KpvsApi && window.KpvsApi.readCookie ? window.KpvsApi.readCookie("XSRF-TOKEN") : "");
    if (t) h["X-XSRF-TOKEN"] = t;
    return h;
  }

  function getSyncedFingerprint() {
    try {
      return localStorage.getItem(LISTS_SYNCED_FP_KEY) || "";
    } catch {
      return "";
    }
  }

  function setSyncedFingerprint(fp) {
    try {
      localStorage.setItem(LISTS_SYNCED_FP_KEY, String(fp || ""));
    } catch {
    }
  }

  function clearSyncedFingerprint() {
    try {
      localStorage.removeItem(LISTS_SYNCED_FP_KEY);
    } catch {
    }
  }

  function normalizeTheme(t) {
    return t === "dark" ? "dark" : "light";
  }

  function readPreferencesLocal() {
    var theme = "light";
    try {
      var raw = localStorage.getItem(THEME_KEY) || "";
      if (raw === "dark" || raw === "light") theme = raw;
    } catch {
    }
    var catalogPersist = true;
    try {
      catalogPersist = localStorage.getItem(PERSIST_KEY) !== "0";
    } catch {
    }
    var catalogState = {};
    for (var gi = 0; gi < CATALOG_GENDERS.length; gi++) {
      var g = CATALOG_GENDERS[gi];
      try {
        var blockRaw = localStorage.getItem("kpvs.catalogState.v1." + g);
        if (!blockRaw) continue;
        var block = JSON.parse(blockRaw);
        if (block && typeof block === "object") catalogState[g] = block;
      } catch {
      }
    }
    return { theme: theme, catalogPersist: catalogPersist, catalogState: catalogState };
  }

  function applyPreferencesLocal(prefs) {
    if (!prefs || typeof prefs !== "object") return;
    var theme = normalizeTheme(prefs.theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
    }
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(PERSIST_KEY, prefs.catalogPersist === false ? "0" : "1");
    } catch {
    }
    var cs = prefs.catalogState && typeof prefs.catalogState === "object" ? prefs.catalogState : {};
    for (var gi = 0; gi < CATALOG_GENDERS.length; gi++) {
      var g = CATALOG_GENDERS[gi];
      var block = cs[g];
      if (block && typeof block === "object") {
        try {
          localStorage.setItem("kpvs.catalogState.v1." + g, JSON.stringify(block));
        } catch {
        }
      }
    }
  }

  function isEmptyPreferences(prefs) {
    if (!prefs || typeof prefs !== "object") return true;
    if (prefs.theme === "dark") return false;
    if (prefs.catalogPersist === false) return false;
    var cs = prefs.catalogState;
    return !(cs && typeof cs === "object" && Object.keys(cs).length > 0);
  }

  function resolvePreferences(server, local) {
    var s = server && typeof server === "object" ? server : {};
    var l = local && typeof local === "object" ? local : readPreferencesLocal();
    if (isEmptyPreferences(s) && !isEmptyPreferences(l)) {
      return { preferences: l, upload: true };
    }
    return { preferences: s, upload: false };
  }

  function applyTheme() {
    applyPreferencesLocal(readPreferencesLocal());
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

  function fingerprint(cart, favorites, preferences) {
    function sig(list) {
      return list
        .map(function(i) {
          return String(i.id) + ":" + (i.source || "");
        })
        .sort()
        .join(",");
    }
    return sig(cart) + ";" + sig(favorites) + ";" + JSON.stringify(preferences || {});
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
    return {
      cart: normalizeItems(cart),
      favorites: normalizeItems(favorites),
      preferences: readPreferencesLocal()
    };
  }

  function persistLocal(cart, favorites, preferences, notify) {
    var fp = fingerprint(cart, favorites, preferences);
    var changed = fp !== lastFingerprint;
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
      localStorage.setItem("favorites", JSON.stringify(favorites));
    } catch {
    }
    applyPreferencesLocal(preferences);
    lastFingerprint = fp;
    if (notify && changed) {
      try {
        document.dispatchEvent(
          new CustomEvent("kpvs-lists-synced", {
            detail: { cart: cart, favorites: favorites, preferences: preferences }
          })
        );
      } catch {
      }
    }
    return changed;
  }

  function applyServerPayload(data, local) {
    var prefResolved = resolvePreferences(data.preferences, local.preferences);
    var outCart = normalizeItems(data.cart);
    var outFav = normalizeItems(data.favorites);
    var outPrefs = prefResolved.preferences;
    persistLocal(outCart, outFav, outPrefs, true);
    var fp = fingerprint(outCart, outFav, outPrefs);
    setSyncedFingerprint(fp);
    lastFingerprint = fp;
    return true;
  }

  function fetchMe() {
    return fetch("/api/user/auth/me", { credentials: "include" }).then(function(r) {
      if (!r.ok) return null;
      return r.json();
    }).catch(function() {
      return null;
    });
  }

  function putUserData(cart, favorites, preferences, isRetry) {
    if (!window.KpvsApi || !window.KpvsApi.apiFetch) return Promise.resolve(null);
    return ensureCsrf()
      .then(function() {
        return window.KpvsApi.apiFetch("/api/user/lists", {
          method: "PUT",
          headers: mutatingHeaders(true),
          body: JSON.stringify({
            cart: cart,
            favorites: favorites,
            preferences: preferences
          })
        });
      })
      .then(function(r) {
        if (r && r.status === 403 && !isRetry) {
          resetCsrf();
          return putUserData(cart, favorites, preferences, true);
        }
        if (!r || !r.ok) return null;
        return r.json();
      })
      .catch(function() {
        return null;
      });
  }

  function getLists() {
    if (!window.KpvsApi || !window.KpvsApi.apiFetch) return Promise.resolve(null);
    return window.KpvsApi.apiFetch("/api/user/lists")
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
          clearSyncedFingerprint();
          var guest = readLocal();
          lastFingerprint = fingerprint(guest.cart, guest.favorites, guest.preferences);
          return false;
        }
        return getLists().then(function(data) {
          if (!data) return false;
          var local = readLocal();
          var localFp = fingerprint(local.cart, local.favorites, local.preferences);
          var syncedFp = getSyncedFingerprint();

          if (!syncedFp) {
            return applyServerPayload(data, local);
          }

          if (syncedFp !== localFp) {
            return pushNow().then(function(ok) {
              return !!ok;
            });
          }

          return applyServerPayload(data, local);
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
      var local = readLocal();
      if (!me || !me.id || String(me.role) !== "user") {
        var localFp = fingerprint(local.cart, local.favorites, local.preferences);
        lastFingerprint = localFp;
        return true;
      }
      return putUserData(local.cart, local.favorites, local.preferences).then(function(saved) {
        if (!saved) {
          lastFingerprint = fingerprint(local.cart, local.favorites, local.preferences);
          return true;
        }
        var fp = fingerprint(saved.cart, saved.favorites, saved.preferences || local.preferences);
        setSyncedFingerprint(fp);
        lastFingerprint = fp;
        return true;
      });
    });
  }

  function writeLists(cart, favorites) {
    var prefs = readPreferencesLocal();
    persistLocal(cart, favorites, prefs, true);
  }

  function commitLists() {
    return pushNow();
  }

  function refreshBefore(action) {
    if (typeof action !== "function") return Promise.resolve();
    return pull().then(function() {
      action();
    });
  }

  function pruneListItems(items, products) {
    if (!items.length) return items;
    var valid = {};
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      if (p && p.id != null) valid[Number(p.id)] = 1;
    }
    return items.filter(function(it) {
      return valid[Number(it.id)];
    });
  }

  function persistPrunedList(listKey, items, products) {
    var pruned = pruneListItems(items, products);
    if (pruned.length === items.length) return false;
    var cart = readLocal().cart;
    var favorites = readLocal().favorites;
    var prefs = readPreferencesLocal();
    if (listKey === "cart") cart = pruned;
    else if (listKey === "favorites") favorites = pruned;
    else return false;
    writeLists(cart, favorites);
    push();
    return true;
  }

  function clearSyncState() {
    clearSyncedFingerprint();
  }

  window.KpvsListsSync = {
    pull: pull,
    push: push,
    pushNow: pushNow,
    writeLists: writeLists,
    commitLists: commitLists,
    refreshBefore: refreshBefore,
    applyTheme: applyTheme,
    persistPrunedList: persistPrunedList,
    clearSyncState: clearSyncState
  };

  document.addEventListener("DOMContentLoaded", function() {
    applyTheme();
    var local = readLocal();
    lastFingerprint = fingerprint(local.cart, local.favorites, local.preferences);
    ensureCsrf();
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
