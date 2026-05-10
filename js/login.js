document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const modeInput = document.getElementById('auth-mode');
    const tabAdmin = document.getElementById('tab-admin');
    const tabUser = document.getElementById('tab-user');
    const badge = document.getElementById('login-badge');
    const title = document.getElementById('login-title');
    const note = document.getElementById('login-footer-note');
    const rowEmail = document.getElementById('row-email');
    const rowPassword2 = document.getElementById('row-password2');
    const toggleRegister = document.getElementById('toggle-register');
    const toggleLogin = document.getElementById('toggle-login');
    const oauthGoogleBtn = document.getElementById('oauth-google-btn');
    const toggleRecover = document.getElementById('toggle-recover');
    const toggleRecoverBack = document.getElementById('toggle-recover-back');
    const rowIdentity = document.getElementById('row-identity');
    const rowPassword = document.getElementById('row-password');
    const identityInput = document.getElementById('login-username');
    const pwdInput = document.getElementById('login-password');
    const pwd2Input = document.getElementById('login-password2');
    const pwdToggle = document.getElementById('login-password-toggle');
    const pwd2Toggle = document.getElementById('login-password2-toggle');
    const usernameLabel = document.getElementById('login-username-label');

    if (!form || !btn || !modeInput || !tabAdmin || !tabUser || !badge || !title || !note) return;

    /* Скрыт пароль → «глаз» (visible); текст виден → перечёркнутый глаз (invisible) */
    var LOGIN_ICON_PASSWORD_HIDDEN = '/img/visible.svg';
    var LOGIN_ICON_PASSWORD_SHOWN = '/img/invisible.svg';

    function wirePasswordToggle(btn, input) {
        if (!btn || !input) return function noopEye() {};
        var img = btn.querySelector('.login-password-eye__icon');
        function syncEyeIcons() {
            var masked = input.type === 'password';
            if (img) img.src = masked ? LOGIN_ICON_PASSWORD_HIDDEN : LOGIN_ICON_PASSWORD_SHOWN;
            btn.classList.toggle('login-password-eye--revealed', !masked);
            btn.setAttribute('aria-pressed', masked ? 'false' : 'true');
            btn.setAttribute('aria-label', masked ? 'Показать пароль' : 'Скрыть пароль');
        }
        btn.addEventListener('click', function () {
            input.type = input.type === 'text' ? 'password' : 'text';
            syncEyeIcons();
        });
        syncEyeIcons();
        return syncEyeIcons;
    }
    var syncPrimaryPwdEye = wirePasswordToggle(pwdToggle, pwdInput);
    var syncSecondaryPwdEye = wirePasswordToggle(pwd2Toggle, pwd2Input);

    function syncIdentityField() {
        if (!identityInput || !usernameLabel) return;
        if (mode === 'admin') {
            if (rowIdentity) rowIdentity.hidden = false;
            identityInput.disabled = false;
            identityInput.required = true;
            usernameLabel.textContent = 'Логин';
            identityInput.type = 'text';
            identityInput.autocomplete = 'username';
            identityInput.placeholder = '';
            identityInput.removeAttribute('inputmode');
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
            usernameLabel.textContent = 'Email';
            identityInput.type = 'email';
            identityInput.autocomplete = 'email';
            identityInput.placeholder = 'name@example.com';
            identityInput.setAttribute('inputmode', 'email');
            return;
        }
        if (isRegister) {
            usernameLabel.textContent = 'Логин';
            identityInput.type = 'text';
            identityInput.autocomplete = 'username';
            identityInput.placeholder = '';
            identityInput.removeAttribute('inputmode');
            return;
        }
        usernameLabel.textContent = 'Логин или email';
        identityInput.type = 'text';
        identityInput.autocomplete = 'username';
        identityInput.placeholder = '';
        identityInput.removeAttribute('inputmode');
    }

    function syncPasswordRowsAttrs() {
        if (!pwdInput || !rowPassword) return;
        const hidePwd = mode === 'user' && isRecover && !resetToken;
        rowPassword.hidden = hidePwd;
        pwdInput.required = !hidePwd;
        pwdInput.disabled = hidePwd;
        if (hidePwd && pwdInput.type === 'text') pwdInput.type = 'password';
        if (pwdToggle) pwdToggle.disabled = hidePwd;
        syncPrimaryPwdEye();
        if (pwd2Input && rowPassword2 && rowPassword2.isConnected) {
            const showP2 = mode === 'user' && (isRegister || resetToken);
            rowPassword2.hidden = !showP2;
            pwd2Input.required = !!showP2;
            pwd2Input.disabled = !showP2;
            if (!showP2 && pwd2Input.type === 'text') pwd2Input.type = 'password';
            if (pwd2Toggle) pwd2Toggle.disabled = !showP2;
            syncSecondaryPwdEye();
        }
    }

    const params = new URLSearchParams(window.location.search);
    const nextRaw = params.get('next') || '';
    const tokenFromUrl = params.get('token') || '';
    const oauthError = (params.get('oauth_error') || '') === '1';
    const resetToken = params.get('reset') || '';

    const forcedMode = (params.get('mode') || '').toLowerCase() === 'admin' ? 'admin' : 'user';
    const mode = forcedMode;
    let isRegister = (params.get('register') || '').toLowerCase() === '1';
    let isRecover = (params.get('recover') || '').toLowerCase() === '1';

    function setTabSelected(tab, selected) {
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    }

    function safeNextPath(value) {
        const s = String(value || '');
        return s.startsWith('/') ? s : '';
    }

    const next = safeNextPath(nextRaw);

    function guessReferrerPath() {
        try {
            if (!document.referrer) return '';
            const u = new URL(document.referrer);
            if (u.host !== window.location.host) return '';
            const p = (u.pathname || '/') + (u.search || '');
            return safeNextPath(p);
        } catch { return ''; }
    }

    function resolveReturnPath() {
        return next || guessReferrerPath() || '/welcome.html';
    }

    function setMode(view) {
        if (mode !== 'user') return;
        isRegister = view === 'register';
        isRecover = view === 'recover';
        clearError();
        setTabSelected(tabAdmin, !isRegister);
        setTabSelected(tabUser, isRegister);
        syncRegisterUi();
        try {
            const qs = new URLSearchParams(window.location.search);
            qs.set('mode', 'user');
            if (next) qs.set('next', next);
            if (isRegister) qs.set('register', '1');
            else qs.delete('register');
            if (isRecover) qs.set('recover', '1');
            else qs.delete('recover');
            window.history.replaceState({}, '', window.location.pathname + '?' + qs.toString());
        } catch {}
    }

    function syncModeText() {
        if (mode === 'admin') {
            badge.textContent = 'Служебный вход';
            title.textContent = 'Панель администратора';
            note.textContent = 'После успешного входа вы будете перенаправлены в раздел администрирования.';
            btn.textContent = 'Войти';
            // Admin login: only username + password fields.
            if (rowEmail && typeof rowEmail.remove === 'function') rowEmail.remove();
            else if (rowEmail) rowEmail.hidden = true;
            if (rowPassword2 && typeof rowPassword2.remove === 'function') rowPassword2.remove();
            else if (rowPassword2) rowPassword2.hidden = true;
            // Admin login must not offer OAuth entry points.
            if (oauthGoogleBtn && typeof oauthGoogleBtn.remove === 'function') oauthGoogleBtn.remove();
            else if (oauthGoogleBtn) oauthGoogleBtn.hidden = true;
            if (toggleRegister && typeof toggleRegister.remove === 'function') toggleRegister.remove();
            else if (toggleRegister) toggleRegister.hidden = true;
            if (toggleLogin && typeof toggleLogin.remove === 'function') toggleLogin.remove();
            else if (toggleLogin) toggleLogin.hidden = true;
        } else {
            badge.textContent = 'Аккаунт';
            title.textContent = resetToken ? 'Восстановление пароля' : (isRecover ? 'Восстановление пароля' : (isRegister ? 'Регистрация' : 'Вход пользователя'));
            note.textContent = resetToken
                ? 'Придумайте новый пароль для аккаунта. После сохранения вы сможете войти обычным способом.'
                : (isRecover ? 'Введите email. Если он зарегистрирован, мы отправим ссылку для восстановления.' : 'Войдите в аккаунт, чтобы использовать функции пользователя.');
            btn.textContent = resetToken ? 'Сохранить новый пароль' : (isRecover ? 'Отправить ссылку' : (isRegister ? 'Зарегистрироваться' : 'Войти'));
            if (rowEmail) rowEmail.hidden = !isRegister;
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
    if (forcedMode === 'admin') {
        const tabs = tabAdmin.closest('.login-mode-tabs');
        // For admin login we completely remove mode tabs
        // (no hidden markup in DOM / accessibility tree).
        if (tabs && typeof tabs.remove === 'function') tabs.remove();
        else {
            if (tabs) tabs.hidden = true;
            tabAdmin.hidden = true;
            tabUser.hidden = true;
        }
    } else {
        tabAdmin.textContent = 'Вход';
        tabUser.textContent = 'Регистрация';
        tabAdmin.hidden = false;
        tabUser.hidden = false;
        tabAdmin.addEventListener('click', () => setMode('login'));
        tabUser.addEventListener('click', () => setMode('register'));
        if (resetToken) setMode('login');
        else if (isRecover) setMode('recover');
        else setMode(isRegister ? 'register' : 'login');
    }

    if (toggleRegister) {
        toggleRegister.addEventListener('click', () => setMode('register'));
    }
    if (toggleLogin) {
        toggleLogin.addEventListener('click', () => setMode('login'));
    }

    if (toggleRecover) {
        toggleRecover.addEventListener('click', () => setMode('recover'));
    }
    if (toggleRecoverBack) {
        toggleRecoverBack.addEventListener('click', () => setMode('login'));
    }

    if (oauthGoogleBtn && mode === 'user') {
        oauthGoogleBtn.addEventListener('click', () => {
            const qs = new URLSearchParams();
            if (next) qs.set('next', next);
            window.location.href = '/api/user/oauth/google/start?' + qs.toString();
        });
    }

    if (forcedMode === 'admin') {
        syncRegisterUi();
    }

    if (tokenFromUrl) {
        const oauthSetPassword = (params.get('oauth_set_password') || '').toLowerCase() === '1';
        try { localStorage.setItem('kpvs.user.jwt', tokenFromUrl); } catch {}
        if (oauthSetPassword) {
            try { sessionStorage.setItem('kpvs.oauthPasswordPrompt', '1'); } catch {}
        }
        let dest = resolveReturnPath();
        if (oauthSetPassword) {
            try {
                const base = window.location.origin;
                const u = new URL(dest || '/welcome.html', base);
                if (!u.hash || u.hash === '#') u.hash = 'oauthPasswordPrompt';
                dest = u.pathname + u.search + u.hash;
            } catch {
                dest = (dest || '/welcome.html') + '#oauthPasswordPrompt';
            }
        }
        const qs = new URLSearchParams(window.location.search);
        qs.delete('token');
        qs.delete('oauth_error');
        qs.delete('oauth_set_password');
        window.history.replaceState({}, '', window.location.pathname + '?' + qs.toString());
        window.location.replace(dest);
        return;
    }

    // Password reset flow (via email link)
    if (mode === 'user' && resetToken) {
        try {
            if (rowEmail) rowEmail.hidden = true;
            if (oauthGoogleBtn) oauthGoogleBtn.hidden = true;
            if (toggleRecover) toggleRecover.hidden = true;
            if (toggleRecoverBack) toggleRecoverBack.hidden = true;
            if (toggleRegister) toggleRegister.hidden = true;
            if (toggleLogin) toggleLogin.hidden = true;
        } catch {}
        syncRegisterUi();
    }

    if (oauthError) {
        const msgByCode = {
            not_configured: 'Вход через Google не настроен на сервере (нет GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).',
            callback: 'Google вернул ошибку при входе. Проверьте логи сервера.',
            profile: 'Google не вернул профиль пользователя. Проверьте логи сервера.',
            user: 'Не удалось создать/обновить пользователя после входа через Google. Проверьте логи сервера.',
            exception: 'Ошибка сервера при обработке входа через Google. Проверьте логи сервера.',
            '1': 'Не удалось войти через Google. Проверьте логи сервера.',
        };
        showError(msgByCode[oauthError] || 'Не удалось войти через Google. Попробуйте ещё раз или используйте логин/пароль.');
        try {
            const qs = new URLSearchParams(window.location.search);
            qs.delete('oauth_error');
            window.history.replaceState({}, '', window.location.pathname + '?' + qs.toString());
        } catch {}
    }

    try {
        if (mode === 'admin') {
            const r = await fetch('/api/auth/me');
            if (r.ok) {
                window.location.replace(next || '/admin.html');
                return;
            }
        } else {
            const token = (() => { try { return localStorage.getItem('kpvs.user.jwt') || ''; } catch { return ''; } })();
            if (token) {
                const r = await fetch('/api/user/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
                if (r.ok) {
                    window.location.replace(resolveReturnPath());
                    return;
                }
                try { localStorage.removeItem('kpvs.user.jwt'); } catch {}
            }
        }
    } catch {}

    form.addEventListener('submit', async e => {
        e.preventDefault();
        clearError();
        const username = (identityInput?.value || '').trim();
        const password = pwdInput?.value || '';
        const email = (document.getElementById('login-email')?.value || '').trim();
        const password2 = pwd2Input?.value || '';
        const recoverEmail = username;

        if (mode === 'user' && resetToken) {
            if (!password || password.length < 6) { showError('Пароль должен быть не менее 6 символов'); return; }
            if (password !== password2) { showError('Пароли не совпадают'); return; }
        } else if (mode === 'user' && isRecover) {
            if (!recoverEmail) { showError('Введите email'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoverEmail)) { showError('Введите корректный email'); return; }
        } else {
            if (!username || !password) { showError('Введите логин или email и пароль'); return; }
        }

        if (mode === 'user' && isRegister) {
            if (!email) { showError('Введите email'); return; }
            if (password.length < 6) { showError('Пароль должен быть не менее 6 символов'); return; }
            if (password !== password2) { showError('Пароли не совпадают'); return; }
        }

        btn.disabled = true;
        const prevText = btn.textContent;
        let loadingLabel = 'Вход…';
        if (mode === 'admin') loadingLabel = 'Вход…';
        else if (mode === 'user' && resetToken) loadingLabel = 'Сохраняем…';
        else if (mode === 'user' && isRecover) loadingLabel = 'Отправляем…';
        else if (mode === 'user' && isRegister) loadingLabel = 'Создаю аккаунт…';
        btn.textContent = loadingLabel;

        const setRecoverBusy = function (busy) {
            if (identityInput) identityInput.disabled = !!busy;
            if (toggleRecoverBack) toggleRecoverBack.disabled = !!busy;
            if (toggleRecover) toggleRecover.disabled = !!busy;
        };
        if (mode === 'user' && isRecover) setRecoverBusy(true);

        try {
            if (mode === 'admin') {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    showError(data.error || 'Неверный логин или пароль');
                    return;
                }
                window.location.replace(next || '/admin.html');
                return;
            }

            if (isRecover) {
                const res = await fetch('/api/user/auth/recover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: recoverEmail })
                });
                await res.json().catch(() => ({}));
                showInfo('Если такой email зарегистрирован, мы отправим письмо со ссылкой для восстановления.');
                return;
            }

            if (resetToken) {
                const res = await fetch('/api/user/auth/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: resetToken, password })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    showError(data.error || 'Не удалось сбросить пароль');
                    return;
                }
                clearError();
                window.location.replace('/login.html?mode=user');
                return;
            }

            if (isRegister) {
                const res = await fetch('/api/user/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    showError(data.error || 'Не удалось зарегистрироваться');
                    return;
                }
            }

            const res = await fetch('/api/user/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showError(data.error || 'Неверный логин или пароль');
                return;
            }
            if (!data.token) { showError('Не удалось получить токен'); return; }
            try { localStorage.setItem('kpvs.user.jwt', data.token); } catch {}
            window.location.replace(resolveReturnPath());
        } catch {
            showError('Ошибка соединения с сервером');
        } finally {
            btn.disabled = false;
            btn.textContent = prevText;
            if (mode === 'user' && isRecover) setRecoverBusy(false);
        }
    });

    function showError(msg) {
        if (errorEl) {
            errorEl.classList.remove('login-error--info');
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
    }

    function showInfo(msg) {
        if (errorEl) {
            errorEl.classList.add('login-error--info');
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
    }

    function clearError() {
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
            errorEl.classList.remove('login-error--info');
        }
    }
});
