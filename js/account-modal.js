(function () {
    function qs(sel, root) { return (root || document).querySelector(sel); }
    function ce(tag, cls) { var el = document.createElement(tag); if (cls) el.className = cls; return el; }

    var TOKEN_KEY = 'kpvs.user.jwt';
    var THEME_KEY = 'kpvs.theme';
    var OAUTH_PWD_PROMPT_KEY = 'kpvs.oauthPasswordPrompt';
    var modalState = null;

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    }

    function setTheme(theme) {
        var t = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch {}
    }

    function loadTheme() {
        var t = '';
        try { t = localStorage.getItem(THEME_KEY) || ''; } catch {}
        if (t) setTheme(t);
    }

    function loadCurrency() {
        if (window.KpvsCurrency && typeof window.KpvsCurrency.getSelectedCurrency === 'function') {
            return window.KpvsCurrency.getSelectedCurrency();
        }
        return 'BYN';
    }

    function openLogin(nextPath) {
        var p = nextPath || window.location.pathname;
        window.location.href = '/login.html?mode=user&next=' + encodeURIComponent(p);
    }

    function lock() {
        if (window.KpvsModalOverlay && typeof window.KpvsModalOverlay.lock === 'function') window.KpvsModalOverlay.lock();
        else document.documentElement.classList.add('modal-open');
    }
    function unlock() {
        if (window.KpvsModalOverlay && typeof window.KpvsModalOverlay.unlock === 'function') window.KpvsModalOverlay.unlock();
        else document.documentElement.classList.remove('modal-open');
    }

    function fetchMe(token) {
        return fetch('/api/user/auth/me', { headers: { Authorization: 'Bearer ' + token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function dismissOauthPasswordPrompt() {
        try { sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY); } catch {}
        var modal = document.getElementById('oauth-password-prompt-modal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        unlock();
        if (window.__kpvsOauthPwdOnEscape) {
            document.removeEventListener('keydown', window.__kpvsOauthPwdOnEscape);
            window.__kpvsOauthPwdOnEscape = null;
        }
    }

    function buildAndShowOauthPasswordModal() {
        if (document.getElementById('oauth-password-prompt-modal')) return;

        var modal = ce('div', 'modal oauth-password-modal');
        modal.id = 'oauth-password-prompt-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'oauth-password-prompt-title');

        var header = ce('div', 'modal-header');
        var title = ce('h2');
        title.id = 'oauth-password-prompt-title';
        title.textContent = 'Задайте пароль для входа';
        var btnClose = ce('button', 'modal-close ui-xbtn');
        btnClose.type = 'button';
        btnClose.setAttribute('aria-label', 'Закрыть');
        btnClose.innerHTML = '&times;';
        btnClose.addEventListener('click', function () { dismissOauthPasswordPrompt(); });
        header.appendChild(title);
        header.appendChild(btnClose);

        var body = ce('div', 'modal-body');
        var intro = ce('p', 'oauth-pwd-intro');
        intro.textContent = 'Вы вошли через Google. Укажите пароль — тогда можно будет входить по логину или email без Google. Настроить это можно и позже в аккаунте.';

        var hint = ce('div', 'oauth-pwd-hint account-security-hint');
        hint.textContent = '';

        var row1 = ce('label', 'account-setting account-setting--password');
        var row1L = ce('span', 'account-setting-label');
        row1L.textContent = 'Новый пароль';
        var inp1 = ce('input', 'account-input');
        inp1.type = 'password';
        inp1.autocomplete = 'new-password';
        inp1.id = 'oauth-pwd-new';
        row1.appendChild(row1L);
        row1.appendChild(inp1);

        var row2 = ce('label', 'account-setting account-setting--password');
        var row2L = ce('span', 'account-setting-label');
        row2L.textContent = 'Повторите пароль';
        var inp2 = ce('input', 'account-input');
        inp2.type = 'password';
        inp2.autocomplete = 'new-password';
        inp2.id = 'oauth-pwd-new2';
        row2.appendChild(row2L);
        row2.appendChild(inp2);

        var actions = ce('div', 'oauth-pwd-actions');
        var btnSkip = ce('button', 'admin-ui-btn admin-ui-btn--outline');
        btnSkip.type = 'button';
        btnSkip.textContent = 'Позже';
        var btnSave = ce('button', 'admin-ui-btn admin-ui-btn--primary');
        btnSave.type = 'button';
        btnSave.textContent = 'Сохранить';
        actions.appendChild(btnSkip);
        actions.appendChild(btnSave);

        body.appendChild(intro);
        body.appendChild(hint);
        body.appendChild(row1);
        body.appendChild(row2);
        body.appendChild(actions);

        var content = ce('div', 'modal-content modal-content--oauth-pwd');
        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) dismissOauthPasswordPrompt();
        });

        btnSkip.addEventListener('click', function () { dismissOauthPasswordPrompt(); });

        btnSave.addEventListener('click', function () {
            var token = getToken();
            if (!token) return;
            var p = String(inp1.value || '');
            var p2 = String(inp2.value || '');
            if (!p || p.length < 6) { hint.textContent = 'Пароль должен быть не менее 6 символов'; return; }
            if (p !== p2) { hint.textContent = 'Пароли не совпадают'; return; }
            hint.textContent = '';
            btnSave.disabled = true;
            fetch('/api/user/auth/password', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ password: p })
            })
                .then(function (r) {
                    return r.text().then(function (text) {
                        var j = null;
                        try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
                        return { ok: r.ok, json: j };
                    });
                })
                .then(function (res) {
                    btnSave.disabled = false;
                    if (!res || !res.ok) {
                        hint.textContent = (res && res.json && res.json.error) ? res.json.error : 'Не удалось сохранить пароль';
                        return;
                    }
                    if (res.json && res.json.token) {
                        try { localStorage.setItem(TOKEN_KEY, String(res.json.token)); } catch {}
                    }
                    dismissOauthPasswordPrompt();
                    try { window.location.reload(); } catch {}
                })
                .catch(function () {
                    hint.textContent = 'Не удалось сохранить пароль';
                    btnSave.disabled = false;
                });
        });

        inp1.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); btnSave.click(); }
        });
        inp2.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); btnSave.click(); }
        });

        window.__kpvsOauthPwdOnEscape = function (e) {
            if (e.key === 'Escape') dismissOauthPasswordPrompt();
        };
        document.addEventListener('keydown', window.__kpvsOauthPwdOnEscape);

        document.body.appendChild(modal);
        lock();
        modal.classList.add('show');
        setTimeout(function () { try { inp1.focus(); } catch (e) {} }, 50);
    }

    function syncOauthPwdIntentFromHash() {
        try {
            var raw = (window.location.hash || '').replace(/^#/, '');
            if (raw === 'oauthPasswordPrompt' || raw.indexOf('oauthPasswordPrompt') === 0) {
                try { sessionStorage.setItem(OAUTH_PWD_PROMPT_KEY, '1'); } catch (e1) {}
                try {
                    history.replaceState(null, '', window.location.pathname + window.location.search);
                } catch (e2) {}
            }
        } catch (e) {}
    }

    function maybeShowOAuthPasswordPrompt() {
        syncOauthPwdIntentFromHash();
        var wantsPrompt = false;
        try {
            wantsPrompt = sessionStorage.getItem(OAUTH_PWD_PROMPT_KEY) === '1';
        } catch (e) {}
        if (!wantsPrompt) return;

        var token = getToken();
        if (!token) {
            try { sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY); } catch {}
            return;
        }

        fetchMe(token).then(function (me) {
            if (!me) {
                try { sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY); } catch {}
                try { localStorage.removeItem(TOKEN_KEY); } catch {}
                return;
            }
            if (me.password_set === true || me.password_set === 1) {
                try { sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY); } catch {}
                return;
            }
            buildAndShowOauthPasswordModal();
        });
    }

    function buildModal() {
        var modal = ce('div', 'modal');
        modal.id = 'account-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'account-modal-title');

        var content = ce('div', 'modal-content modal-content--account');
        var header = ce('div', 'modal-header');
        var title = ce('h2');
        title.id = 'account-modal-title';
        title.textContent = 'Аккаунт';
        var close = ce('button', 'modal-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Закрыть');
        close.classList.add('ui-xbtn');
        close.innerHTML = '&times;';
        header.appendChild(title);
        header.appendChild(close);

        var body = ce('div', 'modal-body');
        var shell = ce('div', 'account-modal-shell');

        var top = ce('div', 'account-top');
        var avatar = ce('div', 'account-avatar');
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = 'A';
        var meta = ce('div', 'account-meta');
        var nameRow = ce('div', 'account-name-row');
        var name = ce('div', 'account-name');
        name.textContent = 'Загрузка…';
        var btnRename = ce('button', 'account-rename-icon-btn');
        btnRename.type = 'button';
        btnRename.setAttribute('aria-label', 'Сменить логин');
        btnRename.setAttribute('title', 'Сменить логин');
        var renameImg = ce('img');
        renameImg.src = '/img/rename.svg';
        renameImg.alt = '';
        renameImg.className = 'account-rename-ico';
        btnRename.appendChild(renameImg);
        var renameWrap = ce('div', 'account-rename-wrap');
        var renameInput = ce('input', 'account-rename-input');
        renameInput.type = 'text';
        renameInput.autocomplete = 'username';
        renameInput.hidden = true;
        var btnRenameSave = ce('button', 'account-rename-save');
        btnRenameSave.type = 'button';
        btnRenameSave.textContent = 'Сохранить';
        btnRenameSave.hidden = true;
        var btnRenameCancel = ce('button', 'account-rename-cancel');
        btnRenameCancel.type = 'button';
        btnRenameCancel.textContent = 'Отмена';
        btnRenameCancel.hidden = true;
        renameWrap.appendChild(name);
        renameWrap.appendChild(renameInput);
        renameWrap.appendChild(btnRename);
        renameWrap.appendChild(btnRenameSave);
        renameWrap.appendChild(btnRenameCancel);
        nameRow.appendChild(renameWrap);
        var hint = ce('div', 'account-hint');
        hint.textContent = '';
        var status = ce('div', 'account-status');
        status.textContent = 'Проверяем…';
        meta.appendChild(nameRow);
        meta.appendChild(hint);
        meta.appendChild(status);
        top.appendChild(avatar);
        top.appendChild(meta);

        var actions = ce('div', 'account-actions');
        var btnSupport = ce('a', 'admin-ui-btn admin-ui-btn--outline account-action-btn');
        btnSupport.href = 'mailto:sbyt@kpvs.by';
        btnSupport.textContent = 'Поддержка';
        btnSupport.classList.add('account-action-btn--auth');

        var btnLogout = ce('button', 'admin-ui-btn admin-ui-btn--danger account-action-btn');
        btnLogout.type = 'button';
        btnLogout.textContent = 'Выйти';
        btnLogout.hidden = true;
        btnLogout.classList.add('account-action-btn--auth');

        var btnLogin = ce('button', 'admin-ui-btn admin-ui-btn--primary account-action-btn');
        btnLogin.type = 'button';
        btnLogin.textContent = 'Войти';
        btnLogin.hidden = true;
        btnLogin.classList.add('account-action-btn--auth');

        actions.appendChild(btnSupport);
        actions.appendChild(btnLogout);
        actions.appendChild(btnLogin);

        var settingsTitle = ce('div', 'account-section-title');
        settingsTitle.textContent = 'Настройки';

        var settings = ce('div', 'account-settings');

        var sCurrency = ce('label', 'account-setting account-setting--select');
        var sCurrencyLeft = ce('span', 'account-setting-label');
        sCurrencyLeft.textContent = 'Валюта';
        var sCurrencySelect = ce('select', 'account-select');
        sCurrencySelect.innerHTML = '<option value="BYN">BYN</option><option value="RUB">RUB</option><option value="USD">USD</option><option value="EUR">EUR</option>';
        sCurrency.appendChild(sCurrencyLeft);
        sCurrency.appendChild(sCurrencySelect);

        var sTheme = ce('div', 'account-setting account-setting--tabs');
        var sThemeLeft = ce('span', 'account-setting-label');
        sThemeLeft.textContent = 'Тема';
        var themeTabs = ce('div', 'account-theme-tabs');
        themeTabs.setAttribute('role', 'tablist');
        themeTabs.setAttribute('aria-label', 'Тема');

        var themeLightBtn = ce('button', 'account-theme-tab');
        themeLightBtn.type = 'button';
        themeLightBtn.id = 'account-theme-light';
        themeLightBtn.setAttribute('role', 'tab');
        themeLightBtn.setAttribute('aria-selected', 'false');
        themeLightBtn.textContent = 'Светлая';

        var themeDarkBtn = ce('button', 'account-theme-tab');
        themeDarkBtn.type = 'button';
        themeDarkBtn.id = 'account-theme-dark';
        themeDarkBtn.setAttribute('role', 'tab');
        themeDarkBtn.setAttribute('aria-selected', 'false');
        themeDarkBtn.textContent = 'Тёмная';

        themeTabs.appendChild(themeLightBtn);
        themeTabs.appendChild(themeDarkBtn);
        sTheme.appendChild(sThemeLeft);
        sTheme.appendChild(themeTabs);

        var sPersist = ce('label', 'account-setting');
        var sPersistLeft = ce('span', 'account-setting-label');
        sPersistLeft.textContent = 'Запоминать фильтры и поиск';
        var sPersistToggle = ce('input');
        sPersistToggle.type = 'checkbox';
        sPersistToggle.className = 'account-setting-toggle';
        sPersist.appendChild(sPersistLeft);
        sPersist.appendChild(sPersistToggle);

        settings.appendChild(sCurrency);
        settings.appendChild(sTheme);
        settings.appendChild(sPersist);

        var secTitle = ce('div', 'account-section-title');
        secTitle.textContent = 'Безопасность';
        var security = ce('div', 'account-settings account-settings--security');

        var pwdHint = ce('div', 'account-security-hint');
        pwdHint.textContent = '';

        var rowOld = ce('label', 'account-setting account-setting--password');
        var rowOldLeft = ce('span', 'account-setting-label');
        rowOldLeft.textContent = 'Текущий пароль';
        var inpOld = ce('input', 'account-input');
        inpOld.type = 'password';
        inpOld.autocomplete = 'current-password';
        rowOld.appendChild(rowOldLeft);
        rowOld.appendChild(inpOld);

        var rowNew = ce('label', 'account-setting account-setting--password');
        var rowNewLeft = ce('span', 'account-setting-label');
        rowNewLeft.textContent = 'Новый пароль';
        var inpNew = ce('input', 'account-input');
        inpNew.type = 'password';
        inpNew.autocomplete = 'new-password';
        rowNew.appendChild(rowNewLeft);
        rowNew.appendChild(inpNew);

        var rowNew2 = ce('label', 'account-setting account-setting--password');
        var rowNew2Left = ce('span', 'account-setting-label');
        rowNew2Left.textContent = 'Повторите пароль';
        var inpNew2 = ce('input', 'account-input');
        inpNew2.type = 'password';
        inpNew2.autocomplete = 'new-password';
        rowNew2.appendChild(rowNew2Left);
        rowNew2.appendChild(inpNew2);

        var rowBtn = ce('div', 'account-security-actions');
        var btnPwd = ce('button', 'admin-ui-btn admin-ui-btn--primary account-security-btn');
        btnPwd.type = 'button';
        btnPwd.textContent = 'Сохранить пароль';
        rowBtn.appendChild(btnPwd);

        security.appendChild(pwdHint);
        security.appendChild(rowOld);
        security.appendChild(rowNew);
        security.appendChild(rowNew2);
        security.appendChild(rowBtn);

        shell.appendChild(top);
        shell.appendChild(actions);
        shell.appendChild(settingsTitle);
        shell.appendChild(settings);
        shell.appendChild(secTitle);
        shell.appendChild(security);
        body.appendChild(shell);

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        return {
            modal: modal,
            close: close,
            name: name,
            hint: hint,
            status: status,
            btnLogout: btnLogout,
            btnLogin: btnLogin,
            sCurrencySelect: sCurrencySelect,
            themeLightBtn: themeLightBtn,
            themeDarkBtn: themeDarkBtn,
            sPersistToggle: sPersistToggle,
            btnRename: btnRename,
            nameRow: nameRow,
            renameInput: renameInput,
            btnRenameSave: btnRenameSave,
            btnRenameCancel: btnRenameCancel,
            secTitle: secTitle,
            security: security,
            pwdHint: pwdHint,
            inpOld: inpOld,
            inpNew: inpNew,
            inpNew2: inpNew2,
            btnPwd: btnPwd,
        };
    }

    function ensureModal() {
        if (modalState && modalState.modal && document.body.contains(modalState.modal)) return modalState;
        var existing = qs('#account-modal');
        if (existing && existing.nodeType === 1) {
            // If it exists for some reason, reuse it but we rely on our standard structure.
            modalState = {
                modal: existing,
                close: qs('.modal-close', existing),
                name: qs('.account-name', existing),
                hint: qs('.account-hint', existing),
                status: qs('.account-status', existing),
                btnLogout: qs('.admin-ui-btn--danger.account-action-btn', existing),
                btnLogin: qs('.admin-ui-btn--primary.account-action-btn', existing),
                sCurrencySelect: qs('.account-select', existing),
                themeLightBtn: qs('#account-theme-light', existing),
                themeDarkBtn: qs('#account-theme-dark', existing),
                sPersistToggle: qsAllFallback('.account-setting-toggle', 1, existing),
                btnRename: qs('.account-rename-icon-btn', existing),
                nameRow: qs('.account-name-row', existing),
                renameInput: qs('.account-rename-input', existing),
                btnRenameSave: qs('.account-rename-save', existing),
                btnRenameCancel: qs('.account-rename-cancel', existing),
                secTitle: qsAllFallback('.account-section-title', 1, existing),
                security: qsAllFallback('.account-settings--security', 0, existing),
                pwdHint: qs('.account-security-hint', existing),
                inpOld: qsAllFallback('.account-setting--password .account-input', 0, existing),
                inpNew: qsAllFallback('.account-setting--password .account-input', 1, existing),
                inpNew2: qsAllFallback('.account-setting--password .account-input', 2, existing),
                btnPwd: qs('.account-security-btn', existing),
                __wired: true,
            };
            return modalState;
        }
        modalState = buildModal();
        document.body.appendChild(modalState.modal);
        wireModal(modalState);
        modalState.__wired = true;
        return modalState;
    }

    function showModal(built) {
        var modal = built ? built.modal : qs('#account-modal');
        if (!modal) return;
        modal.classList.add('show');
        lock();
        var closeBtn = qs('.modal-close', modal);
        if (closeBtn) closeBtn.focus();
    }

    function hideModal() {
        var modal = qs('#account-modal');
        if (!modal) return;
        modal.classList.remove('show');
        unlock();
        setTimeout(function () {
            // keep in DOM for re-use; no remove
        }, 0);
    }

    function wireModal(built) {
        var modal = built.modal;
        built.close.addEventListener('click', hideModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) hideModal();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var m = qs('#account-modal');
                if (m && m.classList.contains('show')) hideModal();
            }
        });

        built.btnLogout.addEventListener('click', function () {
            try { localStorage.removeItem(TOKEN_KEY); } catch {}
            hideModal();
            // refresh UI state on pages that adjust account action
            window.location.reload();
        });
        built.btnLogin.addEventListener('click', function () {
            hideModal();
            openLogin(window.location.pathname);
        });

        function setRenameMode(on) {
            if (!built.renameInput || !built.btnRenameSave || !built.btnRenameCancel || !built.btnRename) return;
            built.renameInput.hidden = !on;
            built.btnRenameSave.hidden = !on;
            built.btnRenameCancel.hidden = !on;
            built.btnRename.hidden = on;
            if (built.name) built.name.hidden = on;
            if (on) setTimeout(function () { try { built.renameInput.focus(); } catch {} }, 0);
        }

        function setRenameBusy(busy) {
            if (!built.renameInput || !built.btnRenameSave || !built.btnRenameCancel) return;
            built.renameInput.disabled = !!busy;
            built.btnRenameSave.disabled = !!busy;
            built.btnRenameCancel.disabled = !!busy;
        }

        if (built.btnRename && built.renameInput && built.btnRenameSave && built.btnRenameCancel) {
            built.btnRename.addEventListener('click', function () {
                built.hint.textContent = '';
                built.renameInput.value = (built.name && built.name.textContent) ? String(built.name.textContent) : '';
                setRenameMode(true);
            });
            built.btnRenameCancel.addEventListener('click', function () {
                built.hint.textContent = '';
                setRenameBusy(false);
                setRenameMode(false);
            });
            built.btnRenameSave.addEventListener('click', function () {
                var token = getToken();
                if (!token) return;
                var nextName = String(built.renameInput.value || '').trim();
                if (!nextName) { built.hint.textContent = 'Укажите логин'; return; }
                setRenameBusy(true);
                built.hint.textContent = '';
                fetch('/api/user/auth/username', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ username: nextName })
                })
                    .then(function (r) {
                        return r.text().then(function (text) {
                            var j = null;
                            try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
                            return { ok: r.ok, status: r.status, json: j };
                        });
                    })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            var msg = (res && res.json && res.json.error) ? res.json.error : '';
                            if (!msg && res && res.status === 401) msg = 'Сессия истекла — войдите снова';
                            built.hint.textContent = msg || 'Не удалось сменить логин';
                            setRenameBusy(false);
                            return;
                        }
                        if (res.json && res.json.token) {
                            try { localStorage.setItem(TOKEN_KEY, String(res.json.token)); } catch {}
                        }
                        if (res.json && res.json.user && res.json.user.username) {
                            built.name.textContent = String(res.json.user.username);
                        } else {
                            built.name.textContent = nextName;
                        }
                        built.hint.textContent = 'Логин обновлён';
                        setRenameBusy(false);
                        setRenameMode(false);
                        try { window.location.reload(); } catch {}
                    })
                    .catch(function () {
                        built.hint.textContent = 'Не удалось сменить логин';
                        setRenameBusy(false);
                    });
            });
            built.renameInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); built.btnRenameSave.click(); }
                if (e.key === 'Escape') { e.preventDefault(); built.btnRenameCancel.click(); }
            });
        }

        if (built.btnPwd) {
            built.btnPwd.addEventListener('click', function () {
                var token = getToken();
                if (!token) return;
                var next = String(built.inpNew && built.inpNew.value || '');
                var next2 = String(built.inpNew2 && built.inpNew2.value || '');
                var old = String(built.inpOld && built.inpOld.value || '');
                if (!next || next.length < 6) { built.pwdHint.textContent = 'Пароль должен быть не менее 6 символов'; return; }
                if (next !== next2) { built.pwdHint.textContent = 'Пароли не совпадают'; return; }
                built.btnPwd.disabled = true;
                fetch('/api/user/auth/password', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ old_password: old, password: next })
                })
                    .then(function (r) {
                        return r.text().then(function (text) {
                            var j = null;
                            try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
                            return { ok: r.ok, json: j };
                        });
                    })
                    .then(function (res) {
                        if (!res || !res.ok) {
                            built.pwdHint.textContent = (res && res.json && res.json.error) ? res.json.error : 'Не удалось сменить пароль';
                            built.btnPwd.disabled = false;
                            return;
                        }
                        if (res.json && res.json.token) {
                            try { localStorage.setItem(TOKEN_KEY, String(res.json.token)); } catch {}
                        }
                        built.pwdHint.textContent = 'Пароль сохранён';
                        built.btnPwd.disabled = false;
                        try { window.location.reload(); } catch {}
                    })
                    .catch(function () { built.pwdHint.textContent = 'Не удалось сменить пароль'; built.btnPwd.disabled = false; });
            });
        }

        // Settings
        loadTheme();
        var currency = loadCurrency();
        (function () {
            function setSelected(theme) {
                var t = theme === 'dark' ? 'dark' : 'light';
                if (built.themeLightBtn) built.themeLightBtn.setAttribute('aria-selected', t === 'light' ? 'true' : 'false');
                if (built.themeDarkBtn) built.themeDarkBtn.setAttribute('aria-selected', t === 'dark' ? 'true' : 'false');
            }
            var current = document.documentElement.getAttribute('data-theme') || 'light';
            setSelected(current);
            if (built.themeLightBtn) built.themeLightBtn.addEventListener('click', function () { setTheme('light'); setSelected('light'); });
            if (built.themeDarkBtn) built.themeDarkBtn.addEventListener('click', function () { setTheme('dark'); setSelected('dark'); });
        })();

        if (built.sCurrencySelect) {
            built.sCurrencySelect.value = currency;
            built.sCurrencySelect.addEventListener('change', function () {
                if (window.KpvsCurrency && typeof window.KpvsCurrency.setSelectedCurrency === 'function') {
                    window.KpvsCurrency.setSelectedCurrency(built.sCurrencySelect.value);
                    // try refresh rates, but keep cached on failure
                    if (typeof window.KpvsCurrency.ensureRates === 'function') {
                        window.KpvsCurrency.ensureRates({ force: true }).finally(function () {
                            try { window.location.reload(); } catch {}
                        });
                        return;
                    }
                }
                try { window.location.reload(); } catch {}
            });
        }

        var persistKey = 'kpvs.catalog.persist';
        try { built.sPersistToggle.checked = localStorage.getItem(persistKey) !== '0'; } catch { built.sPersistToggle.checked = true; }
        built.sPersistToggle.addEventListener('change', function () {
            try { localStorage.setItem(persistKey, built.sPersistToggle.checked ? '1' : '0'); } catch {}
        });
    }

    function renderLoading(built) {
        built.name.textContent = '…';
        built.hint.textContent = '';
        if (built.status) {
            built.status.textContent = '';
            built.status.hidden = true;
            built.status.style.display = 'none';
        }
        if (built.btnLogout) { built.btnLogout.hidden = true; built.btnLogout.style.display = 'none'; }
        if (built.btnLogin) { built.btnLogin.hidden = true; built.btnLogin.style.display = 'none'; }
        if (built.btnRename) { built.btnRename.disabled = true; built.btnRename.style.display = 'none'; }
        if (built.renameInput) built.renameInput.hidden = true;
        if (built.btnRenameSave) built.btnRenameSave.hidden = true;
        if (built.btnRenameCancel) built.btnRenameCancel.hidden = true;
        if (built.name) built.name.hidden = false;
        if (built.secTitle) built.secTitle.style.display = 'none';
        if (built.security) built.security.style.display = 'none';
    }

    function renderAuthed(built, me) {
        built.name.textContent = me && me.username ? String(me.username) : 'Пользователь';
        built.hint.textContent = (me && me.role) ? ('Роль: ' + me.role) : '';
        if (built.status) {
            built.status.textContent = '';
            built.status.hidden = true;
            built.status.style.display = 'none';
        }
        if (built.btnLogout) { built.btnLogout.hidden = false; built.btnLogout.style.display = 'inline-flex'; }
        if (built.btnLogin) { built.btnLogin.hidden = true; built.btnLogin.style.display = 'none'; }
        if (built.btnRename) { built.btnRename.disabled = false; built.btnRename.style.display = 'inline-flex'; }
        if (built.renameInput) built.renameInput.hidden = true;
        if (built.btnRenameSave) built.btnRenameSave.hidden = true;
        if (built.btnRenameCancel) built.btnRenameCancel.hidden = true;
        if (built.name) built.name.hidden = false;

        if (built.secTitle) built.secTitle.style.display = '';
        if (built.security) built.security.style.display = '';
        if (built.pwdHint) built.pwdHint.textContent = '';
        if (built.inpOld) built.inpOld.value = '';
        if (built.inpNew) built.inpNew.value = '';
        if (built.inpNew2) built.inpNew2.value = '';

        var mustSet = me && me.password_set === false;
        if (built.pwdHint) {
            built.pwdHint.textContent = mustSet
                ? 'Вы впервые вошли через Google. Установите пароль, чтобы в следующий раз можно было войти по email или логину.'
                : 'Смена пароля требует ввода текущего пароля. Если забыли — используйте восстановление через email на странице входа.';
        }
        if (built.inpOld) built.inpOld.closest('.account-setting').style.display = mustSet ? 'none' : '';
        if (built.btnPwd) built.btnPwd.textContent = mustSet ? 'Установить пароль' : 'Сменить пароль';
    }

    function renderGuest(built) {
        built.name.textContent = 'Гость';
        built.hint.textContent = 'Войдите, чтобы сохранять избранное и быстрее оформлять заявки';
        if (built.status) {
            built.status.hidden = false;
            built.status.style.display = 'inline-flex';
            built.status.textContent = 'Вы не вошли';
        }
        if (built.btnLogout) { built.btnLogout.hidden = true; built.btnLogout.style.display = 'none'; }
        if (built.btnLogin) { built.btnLogin.hidden = false; built.btnLogin.style.display = 'inline-flex'; }
        if (built.btnRename) { built.btnRename.disabled = true; built.btnRename.style.display = 'none'; }
        if (built.secTitle) built.secTitle.style.display = 'none';
        if (built.security) built.security.style.display = 'none';
    }

    function openAccountModal() {
        var built = ensureModal();

        showModal(built);

        var token = getToken();
        renderLoading(built);
        if (!token) return renderGuest(built);
        fetchMe(token).then(function (me) {
            if (!me) {
                try { localStorage.removeItem(TOKEN_KEY); } catch {}
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
        var triggers = document.querySelectorAll('[data-account-action], [data-account-modal-trigger]');
        triggers.forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                openAccountModal();
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindTriggers();
        loadTheme();
        loadCurrency();
        if (window.KpvsCurrency && typeof window.KpvsCurrency.ensureRates === 'function') {
            window.KpvsCurrency.ensureRates({ force: false });
        }
        setTimeout(function () { maybeShowOAuthPasswordPrompt(); }, 0);
    });
})();

