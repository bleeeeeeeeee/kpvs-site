document.addEventListener("DOMContentLoaded", async () => {
  const apiFetch = window.KpvsApi && window.KpvsApi.apiFetch ? window.KpvsApi.apiFetch.bind(window) : function(url, init) {
    return window.fetch(url, Object.assign({}, init || {}, { credentials: "include" }));
  };
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");
  const modeInput = document.getElementById("auth-mode");
  const tabAdmin = document.getElementById("tab-admin");
  const tabUser = document.getElementById("tab-user");
  const badge = document.getElementById("login-badge");
  const title = document.getElementById("login-title");
  const note = document.getElementById("login-footer-note");
  const rowEmail = document.getElementById("row-email");
  const rowEmailCode = document.getElementById("row-email-code");
  const rowPassword2 = document.getElementById("row-password2");
  const toggleRegister = document.getElementById("toggle-register");
  const toggleLogin = document.getElementById("toggle-login");
  const oauthGoogleBtn = document.getElementById("oauth-google-btn");
  const toggleRecover = document.getElementById("toggle-recover");
  const toggleRecoverBack = document.getElementById("toggle-recover-back");
  const rowIdentity = document.getElementById("row-identity");
  const rowPassword = document.getElementById("row-password");
  const identityInput = document.getElementById("login-username");
  const pwdInput = document.getElementById("login-password");
  const pwd2Input = document.getElementById("login-password2");
  const pwdToggle = document.getElementById("login-password-toggle");
  const pwd2Toggle = document.getElementById("login-password2-toggle");
  const usernameLabel = document.getElementById("login-username-label");
  const emailCodeInput = document.getElementById("login-email-code");
  const resendEmailCodeBtn = document.getElementById("resend-email-code");
  const registerSuggestEl = document.getElementById("login-register-suggest");
  const registerSuggestMsg = document.getElementById("login-register-suggest-msg");
  const registerGoBtn = document.getElementById("login-go-register-btn");
  if (!form || !btn || !modeInput || !tabAdmin || !tabUser || !badge || !title || !note) return;
  let pendingLoginToRegister = null;
  var LOGIN_ICON_PASSWORD_HIDDEN = "/img/visible.svg";
  var LOGIN_ICON_PASSWORD_SHOWN = "/img/invisible.svg";
  function wirePasswordToggle(btn2, input) {
    if (!btn2 || !input) return function noopEye() {
    };
    var img = btn2.querySelector(".login-password-eye__icon");
    function syncEyeIcons() {
      var masked = input.type === "password";
      if (img) img.src = masked ? LOGIN_ICON_PASSWORD_HIDDEN : LOGIN_ICON_PASSWORD_SHOWN;
      btn2.classList.toggle("login-password-eye--revealed", !masked);
      btn2.setAttribute("aria-pressed", masked ? "false" : "true");
      btn2.setAttribute("aria-label", masked ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C" : "\u0421\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C");
    }
    btn2.addEventListener("click", function() {
      input.type = input.type === "text" ? "password" : "text";
      syncEyeIcons();
    });
    syncEyeIcons();
    return syncEyeIcons;
  }
  var syncPrimaryPwdEye = wirePasswordToggle(pwdToggle, pwdInput);
  var syncSecondaryPwdEye = wirePasswordToggle(pwd2Toggle, pwd2Input);
  function syncIdentityField() {
    if (!identityInput || !usernameLabel) return;
    if (mode === "admin") {
      if (rowIdentity) rowIdentity.hidden = false;
      identityInput.disabled = false;
      identityInput.required = true;
      usernameLabel.textContent = "\u041B\u043E\u0433\u0438\u043D";
      identityInput.type = "text";
      identityInput.autocomplete = "username";
      identityInput.placeholder = "";
      identityInput.removeAttribute("inputmode");
      return;
    }
    if (resetToken) {
      if (rowIdentity) rowIdentity.hidden = true;
      identityInput.required = false;
      identityInput.disabled = true;
      return;
    }
    if (rowIdentity) rowIdentity.hidden = false;
    identityInput.disabled = false;
    identityInput.required = true;
    if (isRecover) {
      usernameLabel.textContent = "Email";
      identityInput.type = "email";
      identityInput.autocomplete = "email";
      identityInput.placeholder = "name@example.com";
      identityInput.setAttribute("inputmode", "email");
      return;
    }
    if (isRegister) {
      usernameLabel.textContent = "\u041B\u043E\u0433\u0438\u043D";
      identityInput.type = "text";
      identityInput.autocomplete = "username";
      identityInput.placeholder = "";
      identityInput.removeAttribute("inputmode");
      return;
    }
    usernameLabel.textContent = "\u041B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 email";
    identityInput.type = "text";
    identityInput.autocomplete = "username";
    identityInput.placeholder = "";
    identityInput.removeAttribute("inputmode");
  }
  function syncPasswordRowsAttrs() {
    if (!pwdInput || !rowPassword) return;
    const hidePwd = mode === "user" && isRecover && !resetToken;
    rowPassword.hidden = hidePwd;
    pwdInput.required = !hidePwd;
    pwdInput.disabled = hidePwd;
    if (hidePwd && pwdInput.type === "text") pwdInput.type = "password";
    if (pwdToggle) pwdToggle.disabled = hidePwd;
    syncPrimaryPwdEye();
    if (pwd2Input && rowPassword2 && rowPassword2.isConnected) {
      const showP2 = mode === "user" && (isRegister || resetToken);
      rowPassword2.hidden = !showP2;
      pwd2Input.required = !!showP2;
      pwd2Input.disabled = !showP2;
      if (!showP2 && pwd2Input.type === "text") pwd2Input.type = "password";
      if (pwd2Toggle) pwd2Toggle.disabled = !showP2;
      syncSecondaryPwdEye();
    }
  }
  const params = new URLSearchParams(window.location.search);
  const nextRaw = params.get("next") || "";
  const oauthErrorCode = String(params.get("oauth_error") || "").trim();
  const resetToken = params.get("reset") || "";
  const forcedMode = (params.get("mode") || "").toLowerCase() === "admin" ? "admin" : "user";
  const mode = forcedMode;
  let isRegister = (params.get("register") || "").toLowerCase() === "1";
  let isRecover = (params.get("recover") || "").toLowerCase() === "1";
  let registerAwaitingCode = false;
  function setTabSelected(tab, selected) {
    tab.setAttribute("aria-selected", selected ? "true" : "false");
  }
  function safeNextPath(value) {
    const s = String(value || "").trim();
    if (!s.startsWith("/")) return "";
    const q = s.indexOf("?");
    const pathOnly = q === -1 ? s : s.slice(0, q);
    if (pathOnly !== "/login.html") return s;
    try {
      const sp = q === -1 ? "" : s.slice(q + 1);
      const qs = new URLSearchParams(sp);
      if (qs.get("reset") || qs.get("token")) return "";
      return s;
    } catch {
      return "";
    }
  }
  const next = safeNextPath(nextRaw);
  const PREFILL_SS_KEY = "kpvs.registerFromLogin";
  function looksLikeLoginEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim().toLowerCase());
  }
  function suggestUsernameFromLoginEmail(email) {
    const s = String(email || "").trim().toLowerCase();
    const m = s.match(/^([^@]+)@/);
    if (!m) return "";
    let local = m[1].replace(/[^\p{L}\p{N}._-]/gu, "");
    local = local.replace(/^\.+|\.+$/g, "");
    if (local.length < 3) return "";
    return local.slice(0, 48);
  }
  function applyRegisterPrefillObject(o) {
    if (!o) return;
    const emailEl = document.getElementById("login-email");
    if (o.clearEmail && emailEl) emailEl.value = "";
    else if (o.email && emailEl) emailEl.value = String(o.email).trim().toLowerCase();
    if (identityInput) {
      if (o.suggestedUsername) identityInput.value = o.suggestedUsername;
      else if (o.usernameText && !looksLikeLoginEmail(o.usernameText)) identityInput.value = String(o.usernameText).trim();
      else if (o.usernameText && looksLikeLoginEmail(o.usernameText)) identityInput.value = "";
    }
    if (o.password) {
      if (pwdInput) pwdInput.value = o.password;
      if (pwd2Input) pwd2Input.value = o.passwordPrimaryOnly ? "" : o.password;
    }
    if (o.hint) showInfo(o.hint);
  }
  function hideRegisterSuggestPanel() {
    if (registerSuggestEl) registerSuggestEl.hidden = true;
  }
  function showUnknownUserRegisterOffer(kind, identity, password) {
    pendingLoginToRegister = { kind, identity, password };
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
      errorEl.classList.remove("login-error--info");
    }
    if (registerSuggestMsg) {
      registerSuggestMsg.textContent = kind === "email" ? "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0441 \u0442\u0430\u043A\u0438\u043C email \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442." : "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0441 \u0442\u0430\u043A\u0438\u043C \u043B\u043E\u0433\u0438\u043D\u043E\u043C \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442.";
    }
    if (registerSuggestEl) registerSuggestEl.hidden = false;
  }
  function applyPendingLoginToRegister() {
    const pack = pendingLoginToRegister;
    pendingLoginToRegister = null;
    hideRegisterSuggestPanel();
    if (!pack) return;
    registerAwaitingCode = false;
    let o;
    if (pack.kind === "email") {
      const em = String(pack.identity || "").trim().toLowerCase();
      o = {
        email: em,
        suggestedUsername: suggestUsernameFromLoginEmail(em),
        usernameText: pack.identity,
        password: pack.password,
        passwordPrimaryOnly: true,
        hint: "\u041F\u043E\u043B\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u0441 \u044D\u043A\u0440\u0430\u043D\u0430 \u0432\u0445\u043E\u0434\u0430: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438 email, \u0437\u0430\u0442\u0435\u043C \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F\xBB, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043A\u043E\u0434 \u043D\u0430 \u043F\u043E\u0447\u0442\u0443."
      };
    } else {
      o = {
        clearEmail: true,
        usernameText: String(pack.identity || "").trim(),
        password: pack.password,
        passwordPrimaryOnly: true,
        hint: "\u041B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u043D\u044B \u0441 \u044D\u043A\u0440\u0430\u043D\u0430 \u0432\u0445\u043E\u0434\u0430. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 email \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C \u0432\u043E \u0432\u0442\u043E\u0440\u043E\u043C \u043F\u043E\u043B\u0435, \u0437\u0430\u0442\u0435\u043C \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F\xBB."
      };
    }
    try {
      if (emailCodeInput) emailCodeInput.value = "";
    } catch (_) {
    }
    setMode("register");
    applyRegisterPrefillObject(o);
    try {
      if (pack.kind === "email") {
        if (identityInput && String(identityInput.value || "").trim()) identityInput.focus();
        else document.getElementById("login-email")?.focus();
      } else {
        document.getElementById("login-email")?.focus();
      }
    } catch (_) {
    }
  }
  if (registerGoBtn) {
    registerGoBtn.addEventListener("click", () => {
      applyPendingLoginToRegister();
    });
  }
  function consumeRegisterPrefill() {
    if (mode !== "user" || !isRegister) return;
    if ((params.get("prefill") || "").toLowerCase() !== "1") return;
    try {
      const raw = sessionStorage.getItem(PREFILL_SS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      sessionStorage.removeItem(PREFILL_SS_KEY);
      applyRegisterPrefillObject(o);
    } catch (_) {
    }
    try {
      const qs = new URLSearchParams(window.location.search);
      qs.delete("prefill");
      window.history.replaceState({}, "", window.location.pathname + "?" + qs.toString());
    } catch (_) {
    }
  }
  function guessReferrerPath() {
    try {
      if (!document.referrer) return "";
      const u = new URL(document.referrer);
      if (u.host !== window.location.host) return "";
      const p = (u.pathname || "/") + (u.search || "");
      return safeNextPath(p);
    } catch {
      return "";
    }
  }
  function resolveReturnPath() {
    return next || guessReferrerPath() || "/welcome.html";
  }
  function setMode(view) {
    if (mode !== "user") return;
    isRegister = view === "register";
    isRecover = view === "recover";
    if (!isRegister) registerAwaitingCode = false;
    clearError();
    setTabSelected(tabAdmin, !isRegister);
    setTabSelected(tabUser, isRegister);
    syncRegisterUi();
    try {
      const qs = new URLSearchParams(window.location.search);
      qs.set("mode", "user");
      if (next) qs.set("next", next);
      if (isRegister) qs.set("register", "1");
      else qs.delete("register");
      if (isRecover) qs.set("recover", "1");
      else qs.delete("recover");
      window.history.replaceState({}, "", window.location.pathname + "?" + qs.toString());
    } catch {
    }
  }
  function syncModeText() {
    if (mode === "admin") {
      badge.textContent = "\u0421\u043B\u0443\u0436\u0435\u0431\u043D\u044B\u0439 \u0432\u0445\u043E\u0434";
      title.textContent = "\u041F\u0430\u043D\u0435\u043B\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430";
      note.textContent = "\u041F\u043E\u0441\u043B\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E\u0433\u043E \u0432\u0445\u043E\u0434\u0430 \u0432\u044B \u0431\u0443\u0434\u0435\u0442\u0435 \u043F\u0435\u0440\u0435\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u044B \u0432 \u0440\u0430\u0437\u0434\u0435\u043B \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F.";
      btn.textContent = "\u0412\u043E\u0439\u0442\u0438";
      if (rowEmail && typeof rowEmail.remove === "function") rowEmail.remove();
      else if (rowEmail) rowEmail.hidden = true;
      if (rowPassword2 && typeof rowPassword2.remove === "function") rowPassword2.remove();
      else if (rowPassword2) rowPassword2.hidden = true;
      if (oauthGoogleBtn && typeof oauthGoogleBtn.remove === "function") oauthGoogleBtn.remove();
      else if (oauthGoogleBtn) oauthGoogleBtn.hidden = true;
      if (toggleRegister && typeof toggleRegister.remove === "function") toggleRegister.remove();
      else if (toggleRegister) toggleRegister.hidden = true;
      if (toggleLogin && typeof toggleLogin.remove === "function") toggleLogin.remove();
      else if (toggleLogin) toggleLogin.hidden = true;
    } else {
      badge.textContent = "\u0410\u043A\u043A\u0430\u0443\u043D\u0442";
      title.textContent = resetToken ? "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F" : isRecover ? "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F" : isRegister ? "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F" : "\u0412\u0445\u043E\u0434 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F";
      note.textContent = resetToken ? "\u041F\u0440\u0438\u0434\u0443\u043C\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u0434\u043B\u044F \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430. \u041F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0432\u044B \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u0432\u043E\u0439\u0442\u0438 \u043E\u0431\u044B\u0447\u043D\u044B\u043C \u0441\u043F\u043E\u0441\u043E\u0431\u043E\u043C." : isRecover ? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email, \u0441 \u043A\u043E\u0442\u043E\u0440\u044B\u043C \u0432\u044B \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043B\u0438\u0441\u044C. \u0415\u0441\u043B\u0438 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0441 \u0442\u0430\u043A\u0438\u043C \u0430\u0434\u0440\u0435\u0441\u043E\u043C \u043D\u0435\u0442 \u0438\u043B\u0438 \u043F\u043E\u0447\u0442\u0430 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430, \u0432\u044B \u0441\u0440\u0430\u0437\u0443 \u0443\u0432\u0438\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0431 \u044D\u0442\u043E\u043C." : isRegister ? "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D, email \u0438 \u043F\u0430\u0440\u043E\u043B\u044C. \u041D\u0430 \u043F\u043E\u0447\u0442\u0443 \u043F\u0440\u0438\u0434\u0451\u0442 \u043A\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F." : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 email. \u0415\u0441\u043B\u0438 \u0442\u0430\u043A\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u043D\u0435\u0442, \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F.";
      btn.textContent = resetToken ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" : isRecover ? "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443" : isRegister ? "\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F" : "\u0412\u043E\u0439\u0442\u0438";
      if (rowEmail) rowEmail.hidden = !isRegister;
      if (rowEmailCode) rowEmailCode.hidden = !(isRegister && registerAwaitingCode);
      if (resendEmailCodeBtn) resendEmailCodeBtn.hidden = !(isRegister && registerAwaitingCode);
      if (oauthGoogleBtn) oauthGoogleBtn.hidden = false;
      if (toggleRecover) toggleRecover.hidden = !!(isRegister || resetToken || isRecover);
      if (toggleRecoverBack) toggleRecoverBack.hidden = !(isRecover && !resetToken);
      if (toggleRegister) toggleRegister.hidden = isRegister;
      if (toggleLogin) toggleLogin.hidden = !isRegister;
    }
    syncIdentityField();
    syncPasswordRowsAttrs();
  }
  function syncRegisterUi() {
    syncModeText();
  }
  modeInput.value = mode;
  if (forcedMode === "admin") {
    const tabs = tabAdmin.closest(".login-mode-tabs");
    if (tabs && typeof tabs.remove === "function") tabs.remove();
    else {
      if (tabs) tabs.hidden = true;
      tabAdmin.hidden = true;
      tabUser.hidden = true;
    }
  } else {
    tabAdmin.textContent = "\u0412\u0445\u043E\u0434";
    tabUser.textContent = "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F";
    tabAdmin.hidden = false;
    tabUser.hidden = false;
    tabAdmin.addEventListener("click", () => setMode("login"));
    tabUser.addEventListener("click", () => setMode("register"));
    if (resetToken) setMode("login");
    else if (isRecover) setMode("recover");
    else setMode(isRegister ? "register" : "login");
    if (mode === "user" && isRegister && (params.get("prefill") || "").toLowerCase() === "1") {
      consumeRegisterPrefill();
    }
  }
  if (toggleRegister) {
    toggleRegister.addEventListener("click", () => setMode("register"));
  }
  if (toggleLogin) {
    toggleLogin.addEventListener("click", () => setMode("login"));
  }
  if (toggleRecover) {
    toggleRecover.addEventListener("click", () => setMode("recover"));
  }
  if (toggleRecoverBack) {
    toggleRecoverBack.addEventListener("click", () => setMode("login"));
  }
  if (oauthGoogleBtn && mode === "user") {
    oauthGoogleBtn.addEventListener("click", () => {
      const qs = new URLSearchParams();
      if (next) qs.set("next", next);
      window.location.href = "/api/user/oauth/google/start?" + qs.toString();
    });
  }
  if (forcedMode === "admin") {
    syncRegisterUi();
  }
  if (mode === "user" && resetToken) {
    try {
      if (rowEmail) rowEmail.hidden = true;
      if (oauthGoogleBtn) oauthGoogleBtn.hidden = true;
      if (toggleRecover) toggleRecover.hidden = true;
      if (toggleRecoverBack) toggleRecoverBack.hidden = true;
      if (toggleRegister) toggleRegister.hidden = true;
      if (toggleLogin) toggleLogin.hidden = true;
    } catch {
    }
    syncRegisterUi();
  }
  if (oauthErrorCode) {
    const msgByCode = {
      not_configured: "\u0412\u0445\u043E\u0434 \u0447\u0435\u0440\u0435\u0437 Google \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 (\u043D\u0435\u0442 GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
      callback: "Google \u0432\u0435\u0440\u043D\u0443\u043B \u043E\u0448\u0438\u0431\u043A\u0443 \u043F\u0440\u0438 \u0432\u0445\u043E\u0434\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
      profile: "Google \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
      user: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C/\u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u043F\u043E\u0441\u043B\u0435 \u0432\u0445\u043E\u0434\u0430 \u0447\u0435\u0440\u0435\u0437 Google. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
      no_email: "Google \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043B \u0430\u0434\u0440\u0435\u0441 email (\u0438\u043B\u0438 \u0434\u043E\u0441\u0442\u0443\u043F \u043A email \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D). \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u043A email \u0434\u043B\u044F \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D\u043E\u043C \u0438 \u043F\u0430\u0440\u043E\u043B\u0435\u043C.",
      exception: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u0432\u0445\u043E\u0434\u0430 \u0447\u0435\u0440\u0435\u0437 Google. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
      "1": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043E\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Google. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430."
    };
    showError(msgByCode[oauthErrorCode] || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043E\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Google. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043B\u043E\u0433\u0438\u043D/\u043F\u0430\u0440\u043E\u043B\u044C.");
    try {
      const qs = new URLSearchParams(window.location.search);
      qs.delete("oauth_error");
      window.history.replaceState({}, "", window.location.pathname + "?" + qs.toString());
    } catch {
    }
  }
  try {
    if (mode === "admin") {
      const r = await apiFetch("/api/auth/me", { credentials: "include" });
      if (r.ok) {
        const staff = await r.json();
        if (staff && Number(staff.id) > 0) {
          window.location.replace(next || "/admin.html");
          return;
        }
      }
    } else {
      const r = await apiFetch("/api/user/auth/me");
      if (r.ok) {
        const me = await r.json();
        if (me && Number(me.id) > 0) {
          window.location.replace(resolveReturnPath());
          return;
        }
      }
    }
  } catch {
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const username = (identityInput?.value || "").trim();
    const password = pwdInput?.value || "";
    const email = (document.getElementById("login-email")?.value || "").trim();
    const password2 = pwd2Input?.value || "";
    const recoverEmail = username;
    const emailCode = (emailCodeInput?.value || "").trim();
    if (mode === "user" && resetToken) {
      if (!password || password.length < 6) {
        showError("\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
        return;
      }
      if (password !== password2) {
        showError("\u041F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442");
        return;
      }
    } else if (mode === "user" && isRecover) {
      if (!recoverEmail) {
        showError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoverEmail)) {
        showError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 email");
        return;
      }
    } else {
      if (!username || !password) {
        showError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 email \u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
        return;
      }
    }
    if (mode === "user" && isRegister) {
      if (username.includes("@")) {
        showError("\u041B\u043E\u0433\u0438\u043D \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0441\u0438\u043C\u0432\u043E\u043B @ \u2014 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043E\u0442 email");
        return;
      }
      if (!email) {
        showError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email");
        return;
      }
      if (password.length < 6) {
        showError("\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
        return;
      }
      if (password !== password2) {
        showError("\u041F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442");
        return;
      }
      if (registerAwaitingCode) {
        if (!/^\d{6}$/.test(emailCode)) {
          showError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 6-\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u043A\u043E\u0434 \u0438\u0437 \u043F\u0438\u0441\u044C\u043C\u0430");
          return;
        }
      }
    }
    btn.disabled = true;
    let prevText = btn.textContent;
    let loadingLabel = "\u0412\u0445\u043E\u0434\u2026";
    if (mode === "admin") loadingLabel = "\u0412\u0445\u043E\u0434\u2026";
    else if (mode === "user" && resetToken) loadingLabel = "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u043C\u2026";
    else if (mode === "user" && isRecover) loadingLabel = "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C\u2026";
    else if (mode === "user" && isRegister) loadingLabel = registerAwaitingCode ? "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E \u043A\u043E\u0434\u2026" : "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E \u043A\u043E\u0434\u2026";
    btn.textContent = loadingLabel;
    const setRecoverBusy = function(busy) {
      if (identityInput) identityInput.disabled = !!busy;
      if (toggleRecoverBack) toggleRecoverBack.disabled = !!busy;
      if (toggleRecover) toggleRecover.disabled = !!busy;
    };
    if (mode === "user" && isRecover) setRecoverBusy(true);
    async function readResponseJson(res) {
      const text = await res.text();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    }
    try {
      if (mode === "admin") {
        const res2 = await apiFetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data2 = await readResponseJson(res2);
        if (!res2.ok) {
          showError(data2.error || "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
          return;
        }
        if (data2.ok === false) {
          showError(data2.error || "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
          return;
        }
        if (data2.ok !== true && !Number(data2.id)) {
          showError(data2.error || "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
          return;
        }
        window.location.replace(next || "/admin.html");
        return;
      }
      if (isRecover) {
        const res2 = await apiFetch("/api/user/auth/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: recoverEmail })
        });
        const data2 = await readResponseJson(res2);
        if (!res2.ok) {
          showError(data2.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u0434\u043B\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F");
          return;
        }
        showInfo(data2.message || "\u041D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 email \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u043F\u0438\u0441\u044C\u043C\u043E \u0441\u043E \u0441\u0441\u044B\u043B\u043A\u043E\u0439 \u0434\u043B\u044F \u0441\u0431\u0440\u043E\u0441\u0430 \u043F\u0430\u0440\u043E\u043B\u044F.");
        return;
      }
      if (resetToken) {
        const res2 = await apiFetch("/api/user/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, password })
        });
        const data2 = await res2.json().catch(() => ({}));
        if (!res2.ok) {
          showError(data2.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C");
          return;
        }
        clearError();
        window.location.replace("/login.html?mode=user");
        return;
      }
      if (isRegister) {
        if (!registerAwaitingCode) {
          const res2 = await apiFetch("/api/user/auth/email-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, purpose: "register" })
          });
          const data2 = await res2.json().catch(() => ({}));
          if (!res2.ok) {
            showError(data2.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u0434");
            return;
          }
          registerAwaitingCode = true;
          syncRegisterUi();
          showInfo("\u041C\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u043B\u0438 \u043A\u043E\u0434 \u043D\u0430 email. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 6 \u0446\u0438\u0444\u0440 \u0438\u0437 \u043F\u0438\u0441\u044C\u043C\u0430.");
          try {
            if (emailCodeInput) emailCodeInput.focus();
          } catch {
          }
          return;
        } else {
          try {
            await apiFetch("/api/csrf-token");
          } catch {
          }
          const res2 = await apiFetch("/api/user/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password, email_code: emailCode })
          });
          const data2 = await res2.json().catch(() => ({}));
          if (!res2.ok) {
            showError(data2.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F");
            return;
          }
        }
      }
      const res = await apiFetch("/api/user/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await readResponseJson(res);
      const loginCode = data && data.code || res.headers && res.headers.get && res.headers.get("x-login-code") || "";
      const errText = String(data && data.error || "");
      const unknownUser = loginCode === "email_not_registered" || loginCode === "username_not_registered" || looksLikeLoginEmail(username) && (errText.indexOf("\u0422\u0430\u043A\u043E\u0433\u043E email") !== -1 || errText.indexOf("\u0422\u0430\u043A\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F") !== -1);
      if (data && data.ok === true && data.user && Number(data.user.id) > 0) {
        window.location.replace(resolveReturnPath());
        return;
      }
      if (data && data.ok === false) {
        if (unknownUser) {
          const kind = loginCode === "username_not_registered" ? "username" : looksLikeLoginEmail(username) ? "email" : "username";
          showUnknownUserRegisterOffer(kind, username, password);
          return;
        }
        showError(data.error || "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
        return;
      }
      if (!res.ok) {
        if (unknownUser) {
          const kind = loginCode === "username_not_registered" ? "username" : looksLikeLoginEmail(username) ? "email" : "username";
          showUnknownUserRegisterOffer(kind, username, password);
          return;
        }
        showError(data && data.error || "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
        return;
      }
      if (data && data.user && Number(data.user.id) > 0) {
        window.location.replace(resolveReturnPath());
        return;
      }
      showError(data && data.error || "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
    } catch {
      showError("\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C");
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
      if (mode === "user" && isRecover) setRecoverBusy(false);
    }
  });
  if (resendEmailCodeBtn) {
    resendEmailCodeBtn.addEventListener("click", async () => {
      clearError();
      const email = (document.getElementById("login-email")?.value || "").trim();
      if (!email) {
        showError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email");
        return;
      }
      resendEmailCodeBtn.disabled = true;
      try {
        const res = await apiFetch("/api/user/auth/email-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, purpose: "register" })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showError(data.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u0434");
          return;
        }
        showInfo("\u041A\u043E\u0434 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0447\u0442\u0443.");
      } catch {
        showError("\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C");
      } finally {
        resendEmailCodeBtn.disabled = false;
      }
    });
  }
  function showError(msg) {
    hideRegisterSuggestPanel();
    pendingLoginToRegister = null;
    if (errorEl) {
      errorEl.classList.remove("login-error--info");
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    }
  }
  function showInfo(msg) {
    hideRegisterSuggestPanel();
    pendingLoginToRegister = null;
    if (errorEl) {
      errorEl.classList.add("login-error--info");
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    }
  }
  function clearError() {
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
      errorEl.classList.remove("login-error--info");
    }
    hideRegisterSuggestPanel();
    pendingLoginToRegister = null;
  }
});
