(function() {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function ce(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }
  var TOKEN_KEY = "kpvs.user.jwt";
  var THEME_KEY = "kpvs.theme";
  var OAUTH_PWD_PROMPT_KEY = "kpvs.oauthPasswordPrompt";
  var modalState = null;
  function apiFetchAccount(url, init) {
    if (window.KpvsApi && window.KpvsApi.apiFetch) {
      return window.KpvsApi.apiFetch(url, init);
    }
    return fetch(url, Object.assign({}, init || {}, { credentials: "include" }));
  }
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }
  function setTheme(theme) {
    var t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
    }
  }
  function loadTheme() {
    var t = "";
    try {
      t = localStorage.getItem(THEME_KEY) || "";
    } catch {
    }
    if (t) setTheme(t);
  }
  function openLogin(nextPath) {
    var p = nextPath || window.location.pathname;
    window.location.href = "/login.html?mode=user&next=" + encodeURIComponent(p);
  }
  function lock() {
    if (window.KpvsModalOverlay && typeof window.KpvsModalOverlay.lock === "function") window.KpvsModalOverlay.lock();
    else document.documentElement.classList.add("modal-open");
  }
  function unlock() {
    if (window.KpvsModalOverlay && typeof window.KpvsModalOverlay.unlock === "function") window.KpvsModalOverlay.unlock();
    else document.documentElement.classList.remove("modal-open");
  }
  function userHasPasswordSet(me) {
    if (!me) return false;
    var v = me.password_set;
    return v === true || v === 1 || v === "1";
  }
  function collapseAccountPasswordPanel(built) {
    if (!built) return;
    if (built.pwdPanel) built.pwdPanel.hidden = true;
    if (built.btnPwdToggle) {
      built.btnPwdToggle.setAttribute("aria-expanded", "false");
      built.btnPwdToggle.removeAttribute("hidden");
      built.btnPwdToggle.style.display = "";
    }
  }
  function syncPasswordOldRow(built, me) {
    if (!built || !built.rowOldWrap || !built.pwdPanel) return;
    var needsOld = !!(me && userHasPasswordSet(me));
    if (needsOld) {
      if (!built.rowOldWrap.parentNode) {
        built.pwdPanel.insertBefore(built.rowOldWrap, built.pwdPanel.firstChild);
      }
      built.rowOldWrap.hidden = false;
      built.rowOldWrap.removeAttribute("aria-hidden");
      if (built.inpOld) built.inpOld.disabled = false;
    } else {
      if (built.inpOld) {
        built.inpOld.value = "";
        built.inpOld.disabled = true;
      }
      built.rowOldWrap.remove();
    }
  }
  function fetchMe() {
    return apiFetchAccount("/api/user/auth/me?t=" + String(Date.now()), {
      cache: "no-store"
    }).then(function(r) {
      return r.ok ? r.json() : null;
    }).catch(function() {
      return null;
    });
  }
  function looksLikeEmail(s) {
    if (!s || typeof s !== "string") return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim().toLowerCase());
  }
  function resolveDisplayEmail(me) {
    if (!me) return "";
    var em = me.email != null ? String(me.email).trim().toLowerCase() : "";
    if (em && looksLikeEmail(em)) return em;
    var un = me.username != null ? String(me.username).trim().toLowerCase() : "";
    if (un && looksLikeEmail(un)) return un;
    return "";
  }
  function dismissOauthPasswordPrompt() {
    try {
      sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY);
    } catch {
    }
    var modal = document.getElementById("oauth-password-prompt-modal");
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    unlock();
    if (window.__kpvsOauthPwdOnEscape) {
      document.removeEventListener("keydown", window.__kpvsOauthPwdOnEscape);
      window.__kpvsOauthPwdOnEscape = null;
    }
  }
  window.KpvsDismissOauthPasswordPromptIfOpen = function() {
    if (document.getElementById("oauth-password-prompt-modal")) dismissOauthPasswordPrompt();
  };
  function buildAndShowOauthPasswordModal() {
    if (document.getElementById("oauth-password-prompt-modal")) return;
    var modal = ce("div", "modal oauth-password-modal");
    modal.id = "oauth-password-prompt-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "oauth-password-prompt-title");
    var header = ce("div", "modal-header");
    var title = ce("h2");
    title.id = "oauth-password-prompt-title";
    title.textContent = "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C \u0434\u043B\u044F \u0432\u0445\u043E\u0434\u0430";
    var btnClose = ce("button", "modal-close ui-xbtn");
    btnClose.type = "button";
    btnClose.setAttribute("aria-label", "\u0417\u0430\u043A\u0440\u044B\u0442\u044C");
    btnClose.innerHTML = "&times;";
    btnClose.addEventListener("click", function() {
      dismissOauthPasswordPrompt();
    });
    header.appendChild(title);
    header.appendChild(btnClose);
    var body = ce("div", "modal-body");
    var intro = ce("p", "oauth-pwd-intro");
    intro.textContent = "\u0412\u044B \u0432\u043E\u0448\u043B\u0438 \u0447\u0435\u0440\u0435\u0437 Google. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C \u2014 \u0442\u043E\u0433\u0434\u0430 \u043C\u043E\u0436\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0432\u0445\u043E\u0434\u0438\u0442\u044C \u043F\u043E \u043B\u043E\u0433\u0438\u043D\u0443 \u0438\u043B\u0438 email \u0431\u0435\u0437 Google. \u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u044D\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0438 \u043F\u043E\u0437\u0436\u0435 \u0432 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0435.";
    var hint = ce("div", "oauth-pwd-hint account-security-hint");
    hint.textContent = "";
    var row1 = ce("label", "account-setting account-setting--password");
    var row1L = ce("span", "account-setting-label");
    row1L.textContent = "\u041D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C";
    var inp1 = ce("input", "account-input");
    inp1.type = "password";
    inp1.autocomplete = "new-password";
    inp1.id = "oauth-pwd-new";
    row1.appendChild(row1L);
    row1.appendChild(inp1);
    var row2 = ce("label", "account-setting account-setting--password");
    var row2L = ce("span", "account-setting-label");
    row2L.textContent = "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C";
    var inp2 = ce("input", "account-input");
    inp2.type = "password";
    inp2.autocomplete = "new-password";
    inp2.id = "oauth-pwd-new2";
    row2.appendChild(row2L);
    row2.appendChild(inp2);
    var actions = ce("div", "oauth-pwd-actions");
    var btnSave = ce("button", "btn btn--primary");
    btnSave.type = "button";
    btnSave.id = "oauth-pwd-save";
    btnSave.textContent = "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C";
    var btnDismiss = ce("button", "btn btn--secondary");
    btnDismiss.type = "button";
    btnDismiss.id = "oauth-pwd-dismiss";
    btnDismiss.textContent = "\u041F\u043E\u0437\u0436\u0435";
    actions.appendChild(btnSave);
    actions.appendChild(btnDismiss);
    body.appendChild(intro);
    body.appendChild(hint);
    body.appendChild(row1);
    body.appendChild(row2);
    body.appendChild(actions);
    var content = ce("div", "modal-content modal-content--oauth-pwd");
    content.appendChild(header);
    content.appendChild(body);
    modal.appendChild(content);
    modal.addEventListener("click", function(e) {
      if (e.target === modal) dismissOauthPasswordPrompt();
    });
    btnDismiss.addEventListener("click", function() {
      dismissOauthPasswordPrompt();
    });
    btnSave.addEventListener("click", function() {
      var p = String(inp1.value || "");
      var p2 = String(inp2.value || "");
      if (!p || p.length < 6) {
        hint.textContent = "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432";
        return;
      }
      if (p !== p2) {
        hint.textContent = "\u041F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442";
        return;
      }
      hint.textContent = "";
      btnSave.disabled = true;
      btnDismiss.disabled = true;
      apiFetchAccount("/api/csrf-token", { method: "GET" }).catch(function() {
      }).then(function() {
        return apiFetchAccount("/api/user/auth/password", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: p })
        });
      }).then(function(r) {
        return r.text().then(function(text) {
          var j = null;
          try {
            j = text ? JSON.parse(text) : null;
          } catch (e) {
            j = null;
          }
          return { ok: r.ok, json: j };
        });
      }).then(function(res) {
        btnSave.disabled = false;
        btnDismiss.disabled = false;
        if (!res || !res.ok) {
          hint.textContent = res && res.json && res.json.error ? res.json.error : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
          return;
        }
        try {
          sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY);
        } catch {
        }
        dismissOauthPasswordPrompt();
      }).catch(function() {
        hint.textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
        btnSave.disabled = false;
        btnDismiss.disabled = false;
      });
    });
    inp1.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSave.click();
      }
    });
    inp2.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSave.click();
      }
    });
    window.__kpvsOauthPwdOnEscape = function(e) {
      if (e.key === "Escape") dismissOauthPasswordPrompt();
    };
    document.addEventListener("keydown", window.__kpvsOauthPwdOnEscape);
    document.body.appendChild(modal);
    lock();
    modal.classList.add("show");
    setTimeout(function() {
      try {
        inp1.focus();
      } catch (e) {
      }
    }, 50);
  }
  function syncOauthPwdIntentFromHash() {
    try {
      var raw = (window.location.hash || "").replace(/^#/, "");
      if (raw === "oauthPasswordPrompt" || raw.indexOf("oauthPasswordPrompt") === 0) {
        try {
          sessionStorage.setItem(OAUTH_PWD_PROMPT_KEY, "1");
        } catch (e1) {
        }
        try {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (e2) {
        }
      }
    } catch (e) {
    }
  }
  function maybeShowOAuthPasswordPrompt() {
    syncOauthPwdIntentFromHash();
    var wantsPrompt = false;
    try {
      wantsPrompt = sessionStorage.getItem(OAUTH_PWD_PROMPT_KEY) === "1";
    } catch (e) {
    }
    if (!wantsPrompt) return;
    fetchMe().then(function(me) {
      if (!me) {
        try {
          sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY);
        } catch {
        }
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
        }
        return;
      }
      if (userHasPasswordSet(me)) {
        try {
          sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY);
        } catch {
        }
        return;
      }
      buildAndShowOauthPasswordModal();
    });
  }
  function buildLogoutConfirmUI() {
    var layer = ce("div", "account-logout-confirm");
    layer.id = "account-logout-confirm";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("role", "presentation");
    var card = ce("div", "account-logout-confirm__card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "account-logout-confirm-title");
    var title = ce("p", "account-logout-confirm__title");
    title.id = "account-logout-confirm-title";
    title.textContent = "\u0412\u044B\u0439\u0442\u0438 \u0438\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430?";
    var text = ce("p", "account-logout-confirm__text");
    text.textContent =
      "\u0412\u0430\u043C \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0441\u043D\u043E\u0432\u0430 \u0432\u043E\u0439\u0442\u0438, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u043A\u043E\u0440\u0437\u0438\u043D\u043E\u0439 \u0438 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435\u043C \u0437\u0430\u043A\u0430\u0437\u0430.";
    var actions = ce("div", "account-logout-confirm__actions");
    var btnCancel = ce("button", "btn btn--outline account-logout-confirm__btn");
    btnCancel.type = "button";
    btnCancel.id = "account-logout-cancel";
    btnCancel.textContent = "\u041E\u0442\u043C\u0435\u043D\u0430";
    var btnGo = ce("button", "btn btn--danger account-logout-confirm__btn");
    btnGo.type = "button";
    btnGo.id = "account-logout-confirm-go";
    btnGo.textContent = "\u0412\u044B\u0439\u0442\u0438";
    actions.appendChild(btnCancel);
    actions.appendChild(btnGo);
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(actions);
    layer.appendChild(card);
    return { layer, btnCancel, btnGo, card };
  }
  function ensureLogoutConfirmAttached(built) {
    if (!built || !built.modal) return;
    if (built.logoutConfirmLayer && built.logoutConfirmLayer.isConnected) return;
    var content = qs(".modal-content.modal-content--account", built.modal);
    if (!content) return;
    var existingLayer = qs("#account-logout-confirm", content);
    if (existingLayer) {
      built.logoutConfirmLayer = existingLayer;
      built.btnLogoutConfirmCancel = qs("#account-logout-cancel", content);
      built.btnLogoutConfirmGo = qs("#account-logout-confirm-go", content);
      return;
    }
    var u = buildLogoutConfirmUI();
    content.appendChild(u.layer);
    built.logoutConfirmLayer = u.layer;
    built.btnLogoutConfirmCancel = u.btnCancel;
    built.btnLogoutConfirmGo = u.btnGo;
  }
  function hideLogoutConfirm(built) {
    if (!built || !built.logoutConfirmLayer) return;
    built.logoutConfirmLayer.classList.remove("is-visible");
    built.logoutConfirmLayer.hidden = true;
    built.logoutConfirmLayer.setAttribute("aria-hidden", "true");
    built.__logoutConfirmOpen = false;
    if (built.__logoutConfirmKeydown) {
      document.removeEventListener("keydown", built.__logoutConfirmKeydown, true);
    }
  }
  function showLogoutConfirm(built) {
    ensureLogoutConfirmAttached(built);
    if (!built.logoutConfirmLayer) return;
    if (built.__logoutConfirmOpen) return;
    if (window.KpvsModalOverlay && typeof window.KpvsModalOverlay.dismissOpenModalsExcept === "function") {
      try {
        window.KpvsModalOverlay.dismissOpenModalsExcept(built.modal);
      } catch (_) {
      }
    }
    built.logoutConfirmLayer.hidden = false;
    built.logoutConfirmLayer.setAttribute("aria-hidden", "false");
    built.logoutConfirmLayer.classList.add("is-visible");
    built.__logoutConfirmOpen = true;
    if (!built.__logoutConfirmKeydown) {
      built.__logoutConfirmKeydown = function(ev) {
        if (!built.__logoutConfirmOpen) return;
        if (ev.key !== "Tab") return;
        var ring = [built.btnLogoutConfirmCancel, built.btnLogoutConfirmGo].filter(function(el) {
          return el && !el.disabled;
        });
        if (ring.length < 2) return;
        var i = ring.indexOf(document.activeElement);
        if (ev.shiftKey) {
          if (i <= 0) {
            ev.preventDefault();
            ring[ring.length - 1].focus();
          }
        } else if (i >= ring.length - 1) {
          ev.preventDefault();
          ring[0].focus();
        }
      };
    }
    document.addEventListener("keydown", built.__logoutConfirmKeydown, true);
    setTimeout(function() {
      try {
        if (built.btnLogoutConfirmCancel) built.btnLogoutConfirmCancel.focus();
      } catch (_) {
      }
    }, 0);
  }
  function performLogout(built) {
    if (!built || !built.btnLogout) return;
    var lockBtns = [built.btnLogout, built.btnLogoutConfirmGo, built.btnLogoutConfirmCancel].filter(Boolean);
    lockBtns.forEach(function(b) {
      b.disabled = true;
    });
    if (built.hint) built.hint.textContent = "";
    apiFetchAccount("/api/csrf-token", { method: "GET" })
      .catch(function() {})
      .then(function() {
        return apiFetchAccount("/api/user/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
      })
      .then(function(r) {
        lockBtns.forEach(function(b) {
          b.disabled = false;
        });
        if (r && r.ok) {
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch (_) {}
          hideLogoutConfirm(built);
          closeAccountModalFully();
          window.location.reload();
          return;
        }
        hideLogoutConfirm(built);
        if (built.hint) {
          built.hint.textContent =
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u0439\u0442\u0438. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.";
        }
      })
      .catch(function() {
        lockBtns.forEach(function(b) {
          b.disabled = false;
        });
        hideLogoutConfirm(built);
        if (built.hint) {
          built.hint.textContent = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438.";
        }
      });
  }
  function buildModal() {
    var modal = ce("div", "modal");
    modal.id = "account-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "account-modal-title");
    var content = ce("div", "modal-content modal-content--account");
    var header = ce("div", "modal-header");
    var title = ce("h2");
    title.id = "account-modal-title";
    title.textContent = "\u0410\u043A\u043A\u0430\u0443\u043D\u0442";
    var close = ce("button", "modal-close");
    close.type = "button";
    close.setAttribute("aria-label", "\u0417\u0430\u043A\u0440\u044B\u0442\u044C");
    close.classList.add("ui-xbtn");
    close.innerHTML = "&times;";
    header.appendChild(title);
    header.appendChild(close);
    var body = ce("div", "modal-body");
    var shell = ce("div", "account-modal-shell");
    var top = ce("div", "account-top");
    var avatar = ce("div", "account-avatar");
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "A";
    var meta = ce("div", "account-meta");
    var nameRow = ce("div", "account-name-row");
    var renameWrap = ce("div", "account-rename-wrap");
    var loginPencilGroup = ce("div", "account-login-pencil-group");
    var name = ce("div", "account-name");
    name.textContent = "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026";
    var renameInput = ce("input", "account-input account-rename-input");
    renameInput.type = "text";
    renameInput.id = "account-rename-input";
    renameInput.autocomplete = "username";
    renameInput.setAttribute("aria-label", "\u041B\u043E\u0433\u0438\u043D");
    renameInput.setAttribute("inputmode", "text");
    var btnRename = ce("button", "account-rename-icon-btn account-rename-pencil-btn");
    btnRename.type = "button";
    btnRename.setAttribute("aria-label", "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u043B\u043E\u0433\u0438\u043D");
    btnRename.setAttribute("title", "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u043B\u043E\u0433\u0438\u043D");
    var renameImg = ce("img");
    renameImg.src = "/img/rename.svg";
    renameImg.alt = "";
    renameImg.className = "account-rename-ico";
    btnRename.appendChild(renameImg);
    var btnRenameSave = ce("button", "account-rename-icon-btn account-rename-decision-btn");
    btnRenameSave.type = "button";
    btnRenameSave.id = "account-rename-agree";
    btnRenameSave.setAttribute("aria-label", "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043B\u043E\u0433\u0438\u043D");
    btnRenameSave.setAttribute("title", "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C");
    var imgAgree = ce("img");
    imgAgree.src = "/img/agree.svg";
    imgAgree.alt = "";
    imgAgree.className = "account-rename-ico account-rename-ico--decision";
    imgAgree.decoding = "async";
    btnRenameSave.appendChild(imgAgree);
    var btnRenameCancel = ce("button", "account-rename-icon-btn account-rename-decision-btn");
    btnRenameCancel.type = "button";
    btnRenameCancel.id = "account-rename-disagree";
    btnRenameCancel.setAttribute("aria-label", "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C");
    btnRenameCancel.setAttribute("title", "\u041E\u0442\u043C\u0435\u043D\u0430");
    var imgDisagree = ce("img");
    imgDisagree.src = "/img/disagree.svg";
    imgDisagree.alt = "";
    imgDisagree.className = "account-rename-ico account-rename-ico--decision";
    imgDisagree.decoding = "async";
    btnRenameCancel.appendChild(imgDisagree);
    loginPencilGroup.appendChild(name);
    loginPencilGroup.appendChild(btnRename);
    var renameEditor = ce("div", "account-rename-editor");
    renameEditor.setAttribute("role", "group");
    renameEditor.setAttribute("aria-label", "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043B\u043E\u0433\u0438\u043D\u0430");
    renameEditor.hidden = true;
    renameEditor.setAttribute("aria-hidden", "true");
    var renameDecisions = ce("div", "account-rename-decisions");
    renameDecisions.appendChild(btnRenameSave);
    renameDecisions.appendChild(btnRenameCancel);
    renameEditor.appendChild(renameInput);
    renameEditor.appendChild(renameDecisions);
    renameWrap.appendChild(loginPencilGroup);
    renameWrap.appendChild(renameEditor);
    nameRow.appendChild(renameWrap);
    var emailLine = ce("div", "account-email");
    emailLine.id = "account-email";
    emailLine.hidden = true;
    emailLine.textContent = "";
    var identityStack = ce("div", "account-identity-stack");
    identityStack.appendChild(nameRow);
    identityStack.appendChild(emailLine);
    var hint = ce("div", "account-hint");
    hint.textContent = "";
    var status = ce("div", "account-status");
    status.textContent = "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C\u2026";
    meta.appendChild(identityStack);
    meta.appendChild(hint);
    meta.appendChild(status);
    top.appendChild(avatar);
    top.appendChild(meta);
    var actions = ce("div", "account-actions");
    var btnSupport = ce("a", "btn btn--outline account-action-btn");
    btnSupport.href = "mailto:kpvssupport@gmail.com";
    btnSupport.textContent = "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430";
    btnSupport.classList.add("account-action-btn--auth");
    var btnLogout = ce("button", "btn btn--danger account-action-btn");
    btnLogout.type = "button";
    btnLogout.textContent = "\u0412\u044B\u0439\u0442\u0438";
    btnLogout.hidden = true;
    btnLogout.classList.add("account-action-btn--auth");
    var btnLogin = ce("button", "btn btn--primary account-action-btn");
    btnLogin.type = "button";
    btnLogin.textContent = "\u0412\u043E\u0439\u0442\u0438";
    btnLogin.hidden = true;
    btnLogin.classList.add("account-action-btn--auth");
    actions.appendChild(btnSupport);
    actions.appendChild(btnLogout);
    actions.appendChild(btnLogin);
    var settingsTitle = ce("div", "account-section-title");
    settingsTitle.textContent = "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438";
    var settings = ce("div", "account-settings");
    var sTheme = ce("div", "account-setting account-setting--tabs");
    var sThemeLeft = ce("span", "account-setting-label");
    sThemeLeft.textContent = "\u0422\u0435\u043C\u0430";
    var themeTabs = ce("div", "account-theme-tabs");
    themeTabs.setAttribute("role", "tablist");
    themeTabs.setAttribute("aria-label", "\u0422\u0435\u043C\u0430");
    var themeLightBtn = ce("button", "account-theme-tab");
    themeLightBtn.type = "button";
    themeLightBtn.id = "account-theme-light";
    themeLightBtn.setAttribute("role", "tab");
    themeLightBtn.setAttribute("aria-selected", "false");
    themeLightBtn.textContent = "\u0421\u0432\u0435\u0442\u043B\u0430\u044F";
    var themeDarkBtn = ce("button", "account-theme-tab");
    themeDarkBtn.type = "button";
    themeDarkBtn.id = "account-theme-dark";
    themeDarkBtn.setAttribute("role", "tab");
    themeDarkBtn.setAttribute("aria-selected", "false");
    themeDarkBtn.textContent = "\u0422\u0451\u043C\u043D\u0430\u044F";
    themeTabs.appendChild(themeLightBtn);
    themeTabs.appendChild(themeDarkBtn);
    sTheme.appendChild(sThemeLeft);
    sTheme.appendChild(themeTabs);
    var sPersist = ce("label", "account-setting");
    var sPersistLeft = ce("span", "account-setting-label");
    sPersistLeft.textContent = "\u0417\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u044B, \u043F\u043E\u0438\u0441\u043A \u0438 \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0438";
    var sPersistToggle = ce("input");
    sPersistToggle.type = "checkbox";
    sPersistToggle.className = "account-setting-toggle";
    sPersistToggle.id = "account-persist-filters";
    sPersist.appendChild(sPersistLeft);
    sPersist.appendChild(sPersistToggle);
    settings.appendChild(sTheme);
    settings.appendChild(sPersist);
    var secTitle = ce("div", "account-section-title");
    secTitle.textContent = "\u0411\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u044C";
    var security = ce("div", "account-settings account-settings--security");
    var pwdHint = ce("div", "account-security-hint");
    pwdHint.textContent = "";
    var btnPwdToggle = ce("button", "btn btn--outline account-security-open-btn");
    btnPwdToggle.type = "button";
    btnPwdToggle.id = "account-password-toggle";
    btnPwdToggle.setAttribute("aria-expanded", "false");
    btnPwdToggle.setAttribute("aria-controls", "account-password-panel");
    btnPwdToggle.textContent = "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
    var pwdPanel = ce("div", "account-disclosure-panel account-password-panel");
    pwdPanel.id = "account-password-panel";
    pwdPanel.hidden = true;
    var rowOldWrap = ce("div", "account-field-stack");
    rowOldWrap.id = "account-pwd-old-wrap";
    var rowOldLeft = ce("span", "account-field-label");
    rowOldLeft.textContent = "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C";
    var inpOld = ce("input", "account-input account-input--full");
    inpOld.type = "password";
    inpOld.id = "account-pwd-old";
    inpOld.autocomplete = "current-password";
    rowOldWrap.appendChild(rowOldLeft);
    rowOldWrap.appendChild(inpOld);
    var rowNew = ce("div", "account-field-stack");
    var rowNewLeft = ce("span", "account-field-label");
    rowNewLeft.textContent = "\u041D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C";
    var inpNew = ce("input", "account-input account-input--full");
    inpNew.type = "password";
    inpNew.id = "account-pwd-new";
    inpNew.autocomplete = "new-password";
    rowNew.appendChild(rowNewLeft);
    rowNew.appendChild(inpNew);
    var rowNew2 = ce("div", "account-field-stack");
    var rowNew2Left = ce("span", "account-field-label");
    rowNew2Left.textContent = "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C";
    var inpNew2 = ce("input", "account-input account-input--full");
    inpNew2.type = "password";
    inpNew2.id = "account-pwd-new2";
    inpNew2.autocomplete = "new-password";
    rowNew2.appendChild(rowNew2Left);
    rowNew2.appendChild(inpNew2);
    var rowBtn = ce("div", "account-security-actions");
    var btnPwd = ce("button", "btn btn--primary account-security-btn account-security-btn--save");
    btnPwd.type = "button";
    btnPwd.id = "account-password-save";
    btnPwd.textContent = "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
    var btnPwdCancel = ce("button", "btn btn--secondary account-security-btn account-security-btn--cancel");
    btnPwdCancel.type = "button";
    btnPwdCancel.id = "account-password-cancel";
    btnPwdCancel.textContent = "\u041E\u0442\u043C\u0435\u043D\u0430";
    rowBtn.appendChild(btnPwd);
    rowBtn.appendChild(btnPwdCancel);
    pwdPanel.appendChild(rowOldWrap);
    pwdPanel.appendChild(rowNew);
    pwdPanel.appendChild(rowNew2);
    pwdPanel.appendChild(rowBtn);
    security.appendChild(pwdHint);
    security.appendChild(btnPwdToggle);
    security.appendChild(pwdPanel);
    shell.appendChild(top);
    shell.appendChild(actions);
    shell.appendChild(settingsTitle);
    shell.appendChild(settings);
    shell.appendChild(secTitle);
    shell.appendChild(security);
    body.appendChild(shell);
    content.appendChild(header);
    content.appendChild(body);
    var logoutConfirm = buildLogoutConfirmUI();
    content.appendChild(logoutConfirm.layer);
    modal.appendChild(content);
    return {
      modal,
      close,
      avatar,
      name,
      emailLine,
      hint,
      status,
      btnLogout,
      btnLogin,
      themeLightBtn,
      themeDarkBtn,
      sPersistToggle,
      btnRename,
      loginPencilGroup,
      renameEditor,
      renameWrap,
      nameRow,
      renameInput,
      btnRenameSave,
      btnRenameCancel,
      secTitle,
      security,
      pwdHint,
      btnPwdToggle,
      pwdPanel,
      rowOldWrap,
      inpOld,
      inpNew,
      inpNew2,
      btnPwd,
      btnPwdCancel,
      logoutConfirmLayer: logoutConfirm.layer,
      btnLogoutConfirmCancel: logoutConfirm.btnCancel,
      btnLogoutConfirmGo: logoutConfirm.btnGo
    };
  }
  function ensureModal() {
    if (modalState && modalState.modal && document.body.contains(modalState.modal)) return modalState;
    var existing = qs("#account-modal");
    if (existing && existing.nodeType === 1) {
      modalState = {
        modal: existing,
        close: qs(".modal-close", existing),
        avatar: qs(".account-avatar", existing),
        name: qs(".account-name", existing),
        emailLine: qs("#account-email", existing),
        hint: qs(".account-hint", existing),
        status: qs(".account-status", existing),
        btnLogout: qs(".btn--danger.account-action-btn", existing),
        btnLogin: qs(".btn--primary.account-action-btn", existing),
        themeLightBtn: qs("#account-theme-light", existing),
        themeDarkBtn: qs("#account-theme-dark", existing),
        sPersistToggle: qs("#account-persist-filters", existing) || qsAllFallback(".account-setting-toggle", 0, existing),
        btnRename: qs(".account-rename-pencil-btn", existing),
        loginPencilGroup: qs(".account-login-pencil-group", existing),
        renameEditor: qs(".account-rename-editor", existing),
        renameWrap: qs(".account-rename-wrap", existing),
        nameRow: qs(".account-name-row", existing),
        renameInput: qs("#account-rename-input", existing),
        btnRenameSave: qs("#account-rename-agree", existing),
        btnRenameCancel: qs("#account-rename-disagree", existing),
        secTitle: qsAllFallback(".account-section-title", 1, existing),
        security: qsAllFallback(".account-settings--security", 0, existing),
        pwdHint: qs(".account-security-hint", existing),
        btnPwdToggle: qs("#account-password-toggle", existing),
        pwdPanel: qs("#account-password-panel", existing),
        rowOldWrap: qs("#account-pwd-old-wrap", existing),
        inpOld: qs("#account-pwd-old", existing),
        inpNew: qs("#account-pwd-new", existing),
        inpNew2: qs("#account-pwd-new2", existing),
        btnPwd: qs("#account-password-save", existing),
        btnPwdCancel: qs("#account-password-cancel", existing),
        logoutConfirmLayer: null,
        btnLogoutConfirmCancel: null,
        btnLogoutConfirmGo: null,
        __wired: false
      };
      ensureLogoutConfirmAttached(modalState);
    } else {
      modalState = buildModal();
      document.body.appendChild(modalState.modal);
    }
    if (!modalState.__wired) {
      wireModal(modalState);
      modalState.__wired = true;
    }
    return modalState;
  }
  function syncAccountAvatar(built, textSource) {
    if (!built || !built.avatar) return;
    var raw = textSource != null ? String(textSource).trim() : "";
    var ch = "?";
    if (raw.length) {
      var arr = [];
      try {
        arr = Array.from(raw);
      } catch (e) {
        arr = raw.split("");
      }
      ch = arr[0] || "?";
      try {
        ch = String(ch).toLocaleUpperCase("ru-RU");
      } catch (e2) {
        try {
          ch = String(ch).toUpperCase();
        } catch (e3) {
        }
      }
    }
    built.avatar.textContent = ch;
  }
  function showModal(built) {
    var modal = built ? built.modal : qs("#account-modal");
    if (!modal) return;
    modal.classList.add("show");
    lock();
    var closeBtn = qs(".modal-close", modal);
    if (closeBtn) closeBtn.focus();
  }
  function closeAccountModalFully() {
    var modal = qs("#account-modal");
    if (!modal) return;
    if (modalState && modalState.__logoutConfirmOpen) hideLogoutConfirm(modalState);
    if (modalState && typeof modalState.__exitRenameUi === "function") {
      try {
        modalState.__exitRenameUi();
      } catch (_) {
      }
    }
    if (modalState) collapseAccountPasswordPanel(modalState);
    modal.classList.remove("show");
    unlock();
    setTimeout(function() {
    }, 0);
  }
  function hideModal() {
    var modal = qs("#account-modal");
    if (!modal) return;
    if (modalState && modalState.__logoutConfirmOpen) {
      hideLogoutConfirm(modalState);
      try {
        if (modalState.btnLogout) modalState.btnLogout.focus();
      } catch (_) {
      }
      return;
    }
    closeAccountModalFully();
  }
  function wireModal(built) {
    var modal = built.modal;
    built.close.addEventListener("click", closeAccountModalFully);
    modal.addEventListener("click", function(e) {
      if (e.target === modal) hideModal();
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        var m = qs("#account-modal");
        if (m && m.classList.contains("show")) hideModal();
      }
    });
    ensureLogoutConfirmAttached(built);
    if (!built.__logoutConfirmListeners) {
      built.__logoutConfirmListeners = true;
      function hideLogoutConfirmUi() {
        hideLogoutConfirm(built);
        try {
          if (built.btnLogout) built.btnLogout.focus();
        } catch (_) {
        }
      }
      if (built.btnLogoutConfirmCancel) {
        built.btnLogoutConfirmCancel.addEventListener("click", hideLogoutConfirmUi);
      }
      if (built.logoutConfirmLayer) {
        built.logoutConfirmLayer.addEventListener("click", function(ev) {
          if (ev.target === built.logoutConfirmLayer) hideLogoutConfirmUi();
        });
      }
      if (built.btnLogoutConfirmGo) {
        built.btnLogoutConfirmGo.addEventListener("click", function() {
          performLogout(built);
        });
      }
    }
    built.btnLogout.addEventListener("click", function() {
      if (built.hint) built.hint.textContent = "";
      showLogoutConfirm(built);
    });
    built.btnLogin.addEventListener("click", function() {
      hideModal();
      openLogin(window.location.pathname);
    });
    function setRenameMode(on) {
      if (!built.renameInput || !built.btnRenameSave || !built.btnRenameCancel || !built.btnRename) return;
      if (built.loginPencilGroup) built.loginPencilGroup.hidden = !!on;
      if (built.renameEditor) {
        built.renameEditor.hidden = !on;
        built.renameEditor.setAttribute("aria-hidden", on ? "false" : "true");
      }
      if (built.renameWrap) built.renameWrap.classList.toggle("account-rename-wrap--editing", !!on);
      if (on && built.pwdPanel && built.btnPwdToggle) {
        built.pwdPanel.hidden = true;
        built.btnPwdToggle.setAttribute("aria-expanded", "false");
        built.btnPwdToggle.removeAttribute("hidden");
        built.btnPwdToggle.style.display = "";
      }
      if (on) {
        setTimeout(function() {
          try {
            built.renameInput.focus();
            built.renameInput.select();
          } catch (_) {
          }
        }, 0);
      }
    }
    function setPasswordExpanded(on) {
      if (!built.pwdPanel || !built.btnPwdToggle) return;
      built.pwdPanel.hidden = !on;
      built.btnPwdToggle.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) {
        built.btnPwdToggle.setAttribute("hidden", "");
        built.btnPwdToggle.style.display = "none";
      } else {
        built.btnPwdToggle.removeAttribute("hidden");
        built.btnPwdToggle.style.display = "";
      }
      if (on) setRenameMode(false);
      if (on) {
        setTimeout(function() {
          try {
            var canFocusOld = built.rowOldWrap && built.rowOldWrap.isConnected && built.inpOld && !built.inpOld.disabled;
            if (canFocusOld) built.inpOld.focus();
            else if (built.inpNew) built.inpNew.focus();
          } catch (_) {
          }
        }, 0);
      }
    }
    function setRenameBusy(busy) {
      if (!built.renameInput || !built.btnRenameSave || !built.btnRenameCancel) return;
      built.renameInput.disabled = !!busy;
      built.btnRenameSave.disabled = !!busy;
      built.btnRenameCancel.disabled = !!busy;
    }
    if (built.btnRename && built.renameInput && built.btnRenameSave && built.btnRenameCancel) {
      built.btnRename.addEventListener("click", function() {
        built.hint.textContent = "";
        var fromMe = typeof built.lastUsername === "string" ? built.lastUsername.trim() : "";
        var fromNode = built.name && built.name.textContent ? String(built.name.textContent).trim() : "";
        built.renameInput.value = fromMe || fromNode;
        setRenameMode(true);
      });
      built.btnRenameCancel.addEventListener("click", function() {
        built.hint.textContent = "";
        setRenameBusy(false);
        setRenameMode(false);
      });
      built.btnRenameSave.addEventListener("click", function() {
        var nextName = String(built.renameInput.value || "").trim();
        if (!nextName) {
          built.hint.textContent = "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D";
          return;
        }
        if (nextName.indexOf("@") !== -1) {
          built.hint.textContent = "\u041B\u043E\u0433\u0438\u043D \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0441\u0438\u043C\u0432\u043E\u043B @";
          return;
        }
        setRenameBusy(true);
        built.hint.textContent = "";
        apiFetchAccount("/api/csrf-token", { method: "GET" }).catch(function() {
        }).then(function() {
          return apiFetchAccount("/api/user/auth/username", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: nextName })
          });
        }).then(function(r) {
          return r.text().then(function(text) {
            var j = null;
            try {
              j = text ? JSON.parse(text) : null;
            } catch (e) {
              j = null;
            }
            return { ok: r.ok, status: r.status, json: j };
          });
        }).then(function(res) {
          if (!res || !res.ok) {
            var msg = res && res.json && res.json.error ? res.json.error : "";
            if (!msg && res && res.status === 401) msg = "\u0421\u0435\u0441\u0441\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430 \u2014 \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430";
            built.hint.textContent = msg || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u043B\u043E\u0433\u0438\u043D";
            setRenameBusy(false);
            return;
          }
          if (res.json && res.json.user && res.json.user.username) {
            built.name.textContent = String(res.json.user.username);
            built.lastUsername = String(res.json.user.username);
          } else {
            built.name.textContent = nextName;
            built.lastUsername = nextName;
          }
          syncAccountAvatar(built, built.lastUsername);
          if (built.emailLine && res.json && res.json.user) {
            var de = resolveDisplayEmail(res.json.user);
            if (de) {
              built.emailLine.hidden = false;
              built.emailLine.textContent = de;
            } else {
              built.emailLine.textContent = "";
              built.emailLine.hidden = true;
            }
          }
          built.hint.textContent = "\u041B\u043E\u0433\u0438\u043D \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D";
          setRenameBusy(false);
          setRenameMode(false);
          try {
            window.location.reload();
          } catch {
          }
        }).catch(function() {
          built.hint.textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u043B\u043E\u0433\u0438\u043D";
          setRenameBusy(false);
        });
      });
      built.renameInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          built.btnRenameSave.click();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          built.btnRenameCancel.click();
        }
      });
    }
    built.__exitRenameUi = function() {
      try {
        setRenameBusy(false);
        setRenameMode(false);
      } catch (_) {
      }
    };
    if (built.btnPwdToggle && built.pwdPanel) {
      built.btnPwdToggle.addEventListener("click", function() {
        var open = built.pwdPanel.hidden;
        setPasswordExpanded(open);
      });
    }
    if (built.btnPwdCancel) {
      built.btnPwdCancel.addEventListener("click", function() {
        collapseAccountPasswordPanel(built);
        fetchMe().then(function(me) {
          if (me) renderAuthed(built, me);
        });
      });
    }
    if (built.btnPwd) {
      built.btnPwd.addEventListener("click", function() {
        var next = String(built.inpNew && built.inpNew.value || "");
        var next2 = String(built.inpNew2 && built.inpNew2.value || "");
        var old = String(built.inpOld && built.inpOld.value || "");
        if (!next || next.length < 6) {
          built.pwdHint.textContent = "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432";
          return;
        }
        if (next !== next2) {
          built.pwdHint.textContent = "\u041F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442";
          return;
        }
        built.btnPwd.disabled = true;
        if (built.btnPwdCancel) built.btnPwdCancel.disabled = true;
        apiFetchAccount("/api/csrf-token", { method: "GET" }).catch(function() {
        }).then(function() {
          return apiFetchAccount("/api/user/auth/password", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_password: old, password: next })
          });
        }).then(function(r) {
          return r.text().then(function(text) {
            var j = null;
            try {
              j = text ? JSON.parse(text) : null;
            } catch (e) {
              j = null;
            }
            return { ok: r.ok, json: j };
          });
        }).then(function(res) {
          built.btnPwd.disabled = false;
          if (built.btnPwdCancel) built.btnPwdCancel.disabled = false;
          if (!res || !res.ok) {
            built.pwdHint.textContent = res && res.json && res.json.error ? res.json.error : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
            return;
          }
          fetchMe().then(function(me) {
            try {
              sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY);
            } catch {
            }
            if (me) renderAuthed(built, me, "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D");
            else collapseAccountPasswordPanel(built);
          });
        }).catch(function() {
          built.pwdHint.textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
          built.btnPwd.disabled = false;
          if (built.btnPwdCancel) built.btnPwdCancel.disabled = false;
        });
      });
    }
    loadTheme();
    (function() {
      function setSelected(theme) {
        var t = theme === "dark" ? "dark" : "light";
        if (built.themeLightBtn) built.themeLightBtn.setAttribute("aria-selected", t === "light" ? "true" : "false");
        if (built.themeDarkBtn) built.themeDarkBtn.setAttribute("aria-selected", t === "dark" ? "true" : "false");
      }
      var current = document.documentElement.getAttribute("data-theme") || "light";
      setSelected(current);
      if (built.themeLightBtn) built.themeLightBtn.addEventListener("click", function() {
        setTheme("light");
        setSelected("light");
      });
      if (built.themeDarkBtn) built.themeDarkBtn.addEventListener("click", function() {
        setTheme("dark");
        setSelected("dark");
      });
    })();
    var persistKey = "kpvs.catalog.persist";
    if (built.sPersistToggle) {
      try {
        built.sPersistToggle.checked = localStorage.getItem(persistKey) !== "0";
      } catch {
        built.sPersistToggle.checked = true;
      }
      built.sPersistToggle.addEventListener("change", function() {
        try {
          localStorage.setItem(persistKey, built.sPersistToggle.checked ? "1" : "0");
        } catch {
        }
      });
    }
  }
  function renderLoading(built) {
    built.lastUsername = "";
    built.name.textContent = "\u2026";
    syncAccountAvatar(built, "");
    built.hint.textContent = "";
    if (built.status) {
      built.status.textContent = "";
      built.status.hidden = true;
      built.status.style.display = "none";
    }
    if (built.btnLogout) {
      built.btnLogout.hidden = true;
      built.btnLogout.style.display = "none";
    }
    if (built.btnLogin) {
      built.btnLogin.hidden = true;
      built.btnLogin.style.display = "none";
    }
    if (built.btnRename) {
      built.btnRename.disabled = true;
      built.btnRename.style.display = "none";
    }
    if (built.renameEditor) {
      built.renameEditor.hidden = true;
      built.renameEditor.setAttribute("aria-hidden", "true");
    }
    if (built.loginPencilGroup) built.loginPencilGroup.hidden = false;
    if (built.renameWrap) built.renameWrap.classList.remove("account-rename-wrap--editing");
    if (built.name) built.name.hidden = false;
    if (built.btnPwdToggle) {
      built.btnPwdToggle.disabled = true;
      built.btnPwdToggle.style.display = "none";
    }
    if (built.pwdPanel) built.pwdPanel.hidden = true;
    if (built.emailLine) built.emailLine.hidden = true;
    if (built.secTitle) built.secTitle.style.display = "none";
    if (built.security) built.security.style.display = "none";
  }
  function renderAuthed(built, me, pwdHintMessage) {
    built.lastUsername = me && me.username ? String(me.username) : "";
    built.name.textContent = built.lastUsername || "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C";
    syncAccountAvatar(built, built.lastUsername || built.name.textContent);
    if (built.emailLine) {
      var dispEmail = resolveDisplayEmail(me);
      if (dispEmail) {
        built.emailLine.hidden = false;
        built.emailLine.textContent = dispEmail;
      } else {
        built.emailLine.textContent = "";
        built.emailLine.hidden = true;
      }
    }
    built.hint.textContent = "";
    if (built.status) {
      built.status.textContent = "";
      built.status.hidden = true;
      built.status.style.display = "none";
    }
    if (built.btnLogout) {
      built.btnLogout.hidden = false;
      built.btnLogout.style.display = "inline-flex";
    }
    if (built.btnLogin) {
      built.btnLogin.hidden = true;
      built.btnLogin.style.display = "none";
    }
    if (built.btnRename) {
      built.btnRename.disabled = false;
      built.btnRename.style.display = "inline-flex";
    }
    var renameUiOpen = built.renameEditor && built.renameEditor.hidden === false;
    if (!renameUiOpen) {
      if (built.renameEditor) {
        built.renameEditor.hidden = true;
        built.renameEditor.setAttribute("aria-hidden", "true");
      }
      if (built.loginPencilGroup) built.loginPencilGroup.hidden = false;
      if (built.renameWrap) built.renameWrap.classList.remove("account-rename-wrap--editing");
      if (built.name) built.name.hidden = false;
    }
    if (built.btnPwdToggle) {
      built.btnPwdToggle.disabled = false;
      built.btnPwdToggle.removeAttribute("hidden");
      built.btnPwdToggle.style.display = "";
    }
    if (built.pwdPanel) built.pwdPanel.hidden = true;
    if (built.btnPwdToggle) built.btnPwdToggle.setAttribute("aria-expanded", "false");
    if (built.secTitle) built.secTitle.style.display = "";
    if (built.security) built.security.style.display = "";
    if (built.pwdHint) built.pwdHint.textContent = "";
    if (built.inpOld) built.inpOld.value = "";
    if (built.inpNew) built.inpNew.value = "";
    if (built.inpNew2) built.inpNew2.value = "";
    var mustSet = me && !userHasPasswordSet(me);
    if (built.pwdHint) {
      if (pwdHintMessage != null && pwdHintMessage !== "") {
        built.pwdHint.textContent = String(pwdHintMessage);
      } else {
        built.pwdHint.textContent = mustSet ? "\u0412\u044B \u0432\u043F\u0435\u0440\u0432\u044B\u0435 \u0432\u043E\u0448\u043B\u0438 \u0447\u0435\u0440\u0435\u0437 Google. \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C, \u0447\u0442\u043E\u0431\u044B \u0432 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0440\u0430\u0437 \u043C\u043E\u0436\u043D\u043E \u0431\u044B\u043B\u043E \u0432\u043E\u0439\u0442\u0438 \u043F\u043E email \u0438\u043B\u0438 \u043B\u043E\u0433\u0438\u043D\u0443." : "\u0421\u043C\u0435\u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u044F \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u0432\u043E\u0434\u0430 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u043F\u0430\u0440\u043E\u043B\u044F. \u0415\u0441\u043B\u0438 \u0437\u0430\u0431\u044B\u043B\u0438 \u2014 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 email \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u0432\u0445\u043E\u0434\u0430.";
      }
    }
    syncPasswordOldRow(built, me);
    if (built.btnPwdToggle) built.btnPwdToggle.textContent = mustSet ? "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C" : "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
    if (built.btnPwd) built.btnPwd.textContent = "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C";
  }
  function renderGuest(built) {
    built.lastUsername = "";
    built.name.textContent = "\u0413\u043E\u0441\u0442\u044C";
    syncAccountAvatar(built, "\u0413\u043E\u0441\u0442\u044C");
    built.hint.textContent = "\u0412\u043E\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u0438 \u0431\u044B\u0441\u0442\u0440\u0435\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u044F\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0438";
    if (built.status) {
      built.status.hidden = false;
      built.status.style.display = "inline-flex";
      built.status.textContent = "\u0412\u044B \u043D\u0435 \u0432\u043E\u0448\u043B\u0438";
    }
    if (built.btnLogout) {
      built.btnLogout.hidden = true;
      built.btnLogout.style.display = "none";
    }
    if (built.btnLogin) {
      built.btnLogin.hidden = false;
      built.btnLogin.style.display = "inline-flex";
    }
    if (built.btnRename) {
      built.btnRename.disabled = true;
      built.btnRename.style.display = "none";
    }
    if (built.btnPwdToggle) {
      built.btnPwdToggle.style.display = "none";
    }
    if (built.renameEditor) {
      built.renameEditor.hidden = true;
      built.renameEditor.setAttribute("aria-hidden", "true");
    }
    if (built.loginPencilGroup) built.loginPencilGroup.hidden = false;
    if (built.renameWrap) built.renameWrap.classList.remove("account-rename-wrap--editing");
    if (built.name) built.name.hidden = false;
    if (built.pwdPanel) built.pwdPanel.hidden = true;
    if (built.emailLine) built.emailLine.hidden = true;
    if (built.secTitle) built.secTitle.style.display = "none";
    if (built.security) built.security.style.display = "none";
  }
  function openAccountModal() {
    var built = ensureModal();
    showModal(built);
    renderLoading(built);
    fetchMe().then(function(me) {
      if (!me) {
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
        }
        return renderGuest(built);
      }
      renderAuthed(built, me);
    });
  }
  function qsAllFallback(sel, index, root) {
    var list = (root || document).querySelectorAll(sel);
    return list && list.length > index ? list[index] : null;
  }
  function bindTriggers() {
    var triggers = document.querySelectorAll("[data-account-action], [data-account-modal-trigger]");
    triggers.forEach(function(el) {
      el.addEventListener("click", function(e) {
        e.preventDefault();
        openAccountModal();
      });
    });
  }
  document.addEventListener("DOMContentLoaded", function() {
    bindTriggers();
    loadTheme();
    setTimeout(function() {
      maybeShowOAuthPasswordPrompt();
    }, 0);
  });
})();
