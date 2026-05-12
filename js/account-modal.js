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

    function userHasPasswordSet(me) {
        if (!me) return false;
        var v = me.password_set;
        return v === true || v === 1 || v === '1';
    }

    function collapseAccountPasswordPanel(built) {
        if (!built) return;
        if (built.pwdPanel) built.pwdPanel.hidden = true;
        if (built.btnPwdToggle) built.btnPwdToggle.setAttribute('aria-expanded', 'false');
    }

    /** Первая установка пароля — блок «текущий пароль» вне DOM; смена пароля — снова в панели первым. */
    function syncPasswordOldRow(built, me) {
        if (!built || !built.rowOldWrap || !built.pwdPanel) return;
        var needsOld = !!(me && userHasPasswordSet(me));
        if (needsOld) {
            if (!built.rowOldWrap.parentNode) {
                built.pwdPanel.insertBefore(built.rowOldWrap, built.pwdPanel.firstChild);
            }
            built.rowOldWrap.hidden = false;
            built.rowOldWrap.removeAttribute('aria-hidden');
            if (built.inpOld) built.inpOld.disabled = false;
        } else {
            if (built.inpOld) {
                built.inpOld.value = '';
                built.inpOld.disabled = true;
            }
            built.rowOldWrap.remove();
        }
    }

    function fetchMe(token) {
        return fetch('/api/user/auth/me?t=' + String(Date.now()), {
            cache: 'no-store',
            headers: { Authorization: 'Bearer ' + token }
        })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function looksLikeEmail(s) {
        if (!s || typeof s !== 'string') return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim().toLowerCase());
    }

    /** Почта для строки в модалке: поле email с API или логин в виде email (если в БД email пустой). */
    function resolveDisplayEmail(me) {
        if (!me) return '';
        var em = me.email != null ? String(me.email).trim().toLowerCase() : '';
        if (em && looksLikeEmail(em)) return em;
        var un = me.username != null ? String(me.username).trim().toLowerCase() : '';
        if (un && looksLikeEmail(un)) return un;
        return '';
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
        var btnSave = ce('button', 'admin-ui-btn admin-ui-btn--primary');
        btnSave.type = 'button';
        btnSave.id = 'oauth-pwd-save';
        btnSave.textContent = 'Сохранить';
        var btnDismiss = ce('button', 'admin-ui-btn admin-ui-btn--secondary');
        btnDismiss.type = 'button';
        btnDismiss.id = 'oauth-pwd-dismiss';
        btnDismiss.textContent = 'Позже';
        actions.appendChild(btnSave);
        actions.appendChild(btnDismiss);

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

        btnDismiss.addEventListener('click', function () { dismissOauthPasswordPrompt(); });

        btnSave.addEventListener('click', function () {
            var token = getToken();
            if (!token) return;
            var p = String(inp1.value || '');
            var p2 = String(inp2.value || '');
            if (!p || p.length < 6) { hint.textContent = 'Пароль должен быть не менее 6 символов'; return; }
            if (p !== p2) { hint.textContent = 'Пароли не совпадают'; return; }
            hint.textContent = '';
            btnSave.disabled = true;
            btnDismiss.disabled = true;
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
                    btnDismiss.disabled = false;
                    if (!res || !res.ok) {
                        hint.textContent = (res && res.json && res.json.error) ? res.json.error : 'Не удалось сохранить пароль';
                        return;
                    }
                    if (res.json && res.json.token) {
                        try { localStorage.setItem(TOKEN_KEY, String(res.json.token)); } catch {}
                    }
                    try { sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY); } catch {}
                    dismissOauthPasswordPrompt();
                })
                .catch(function () {
                    hint.textContent = 'Не удалось сохранить пароль';
                    btnSave.disabled = false;
                    btnDismiss.disabled = false;
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
            if (userHasPasswordSet(me)) {
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
        var renameWrap = ce('div', 'account-rename-wrap');
        var loginPencilGroup = ce('div', 'account-login-pencil-group');
        var name = ce('div', 'account-name');
        name.textContent = 'Загрузка…';
        var renameInput = ce('input', 'account-input account-rename-input');
        renameInput.type = 'text';
        renameInput.id = 'account-rename-input';
        renameInput.autocomplete = 'username';
        renameInput.setAttribute('aria-label', 'Логин');
        renameInput.setAttribute('inputmode', 'text');
        var btnRename = ce('button', 'account-rename-icon-btn account-rename-pencil-btn');
        btnRename.type = 'button';
        btnRename.setAttribute('aria-label', 'Сменить логин');
        btnRename.setAttribute('title', 'Сменить логин');
        var renameImg = ce('img');
        renameImg.src = '/img/rename.svg';
        renameImg.alt = '';
        renameImg.className = 'account-rename-ico';
        btnRename.appendChild(renameImg);
        var btnRenameSave = ce('button', 'account-rename-icon-btn account-rename-decision-btn');
        btnRenameSave.type = 'button';
        btnRenameSave.id = 'account-rename-agree';
        btnRenameSave.setAttribute('aria-label', 'Сохранить логин');
        btnRenameSave.setAttribute('title', 'Сохранить');
        var imgAgree = ce('img');
        imgAgree.src = '/img/agree.svg';
        imgAgree.alt = '';
        imgAgree.className = 'account-rename-ico account-rename-ico--decision';
        imgAgree.decoding = 'async';
        btnRenameSave.appendChild(imgAgree);
        var btnRenameCancel = ce('button', 'account-rename-icon-btn account-rename-decision-btn');
        btnRenameCancel.type = 'button';
        btnRenameCancel.id = 'account-rename-disagree';
        btnRenameCancel.setAttribute('aria-label', 'Отменить');
        btnRenameCancel.setAttribute('title', 'Отмена');
        var imgDisagree = ce('img');
        imgDisagree.src = '/img/disagree.svg';
        imgDisagree.alt = '';
        imgDisagree.className = 'account-rename-ico account-rename-ico--decision';
        imgDisagree.decoding = 'async';
        btnRenameCancel.appendChild(imgDisagree);
        loginPencilGroup.appendChild(name);
        loginPencilGroup.appendChild(btnRename);
        var renameEditor = ce('div', 'account-rename-editor');
        renameEditor.setAttribute('role', 'group');
        renameEditor.setAttribute('aria-label', 'Редактирование логина');
        renameEditor.hidden = true;
        renameEditor.setAttribute('aria-hidden', 'true');
        var renameDecisions = ce('div', 'account-rename-decisions');
        renameDecisions.appendChild(btnRenameSave);
        renameDecisions.appendChild(btnRenameCancel);
        renameEditor.appendChild(renameInput);
        renameEditor.appendChild(renameDecisions);
        renameWrap.appendChild(loginPencilGroup);
        renameWrap.appendChild(renameEditor);
        nameRow.appendChild(renameWrap);
        var emailLine = ce('div', 'account-email');
        emailLine.id = 'account-email';
        emailLine.hidden = true;
        emailLine.textContent = '';
        var identityStack = ce('div', 'account-identity-stack');
        identityStack.appendChild(nameRow);
        identityStack.appendChild(emailLine);
        var hint = ce('div', 'account-hint');
        hint.textContent = '';
        var status = ce('div', 'account-status');
        status.textContent = 'Проверяем…';
        meta.appendChild(identityStack);
        meta.appendChild(hint);
        meta.appendChild(status);
        top.appendChild(avatar);
        top.appendChild(meta);

        var actions = ce('div', 'account-actions');
        var btnSupport = ce('a', 'admin-ui-btn admin-ui-btn--outline account-action-btn');
        btnSupport.href = 'mailto:kpvssupport@gmail.com';
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

        var btnPwdToggle = ce('button', 'admin-ui-btn admin-ui-btn--outline account-security-open-btn');
        btnPwdToggle.type = 'button';
        btnPwdToggle.id = 'account-password-toggle';
        btnPwdToggle.setAttribute('aria-expanded', 'false');
        btnPwdToggle.setAttribute('aria-controls', 'account-password-panel');
        btnPwdToggle.textContent = 'Сменить пароль';

        var pwdPanel = ce('div', 'account-disclosure-panel account-password-panel');
        pwdPanel.id = 'account-password-panel';
        pwdPanel.hidden = true;

        var rowOldWrap = ce('div', 'account-field-stack');
        rowOldWrap.id = 'account-pwd-old-wrap';
        var rowOldLeft = ce('span', 'account-field-label');
        rowOldLeft.textContent = 'Текущий пароль';
        var inpOld = ce('input', 'account-input account-input--full');
        inpOld.type = 'password';
        inpOld.id = 'account-pwd-old';
        inpOld.autocomplete = 'current-password';
        rowOldWrap.appendChild(rowOldLeft);
        rowOldWrap.appendChild(inpOld);

        var rowNew = ce('div', 'account-field-stack');
        var rowNewLeft = ce('span', 'account-field-label');
        rowNewLeft.textContent = 'Новый пароль';
        var inpNew = ce('input', 'account-input account-input--full');
        inpNew.type = 'password';
        inpNew.id = 'account-pwd-new';
        inpNew.autocomplete = 'new-password';
        rowNew.appendChild(rowNewLeft);
        rowNew.appendChild(inpNew);

        var rowNew2 = ce('div', 'account-field-stack');
        var rowNew2Left = ce('span', 'account-field-label');
        rowNew2Left.textContent = 'Повторите пароль';
        var inpNew2 = ce('input', 'account-input account-input--full');
        inpNew2.type = 'password';
        inpNew2.id = 'account-pwd-new2';
        inpNew2.autocomplete = 'new-password';
        rowNew2.appendChild(rowNew2Left);
        rowNew2.appendChild(inpNew2);

        var rowBtn = ce('div', 'account-security-actions');
        var btnPwd = ce('button', 'admin-ui-btn admin-ui-btn--primary account-security-btn account-security-btn--save');
        btnPwd.type = 'button';
        btnPwd.id = 'account-password-save';
        btnPwd.textContent = 'Сохранить пароль';
        var btnPwdCancel = ce('button', 'admin-ui-btn admin-ui-btn--secondary account-security-btn account-security-btn--cancel');
        btnPwdCancel.type = 'button';
        btnPwdCancel.id = 'account-password-cancel';
        btnPwdCancel.textContent = 'Отмена';
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
        modal.appendChild(content);

        return {
            modal: modal,
            close: close,
            name: name,
            emailLine: emailLine,
            hint: hint,
            status: status,
            btnLogout: btnLogout,
            btnLogin: btnLogin,
            sCurrencySelect: sCurrencySelect,
            themeLightBtn: themeLightBtn,
            themeDarkBtn: themeDarkBtn,
            sPersistToggle: sPersistToggle,
            btnRename: btnRename,
            loginPencilGroup: loginPencilGroup,
            renameEditor: renameEditor,
            renameWrap: renameWrap,
            nameRow: nameRow,
            renameInput: renameInput,
            btnRenameSave: btnRenameSave,
            btnRenameCancel: btnRenameCancel,
            secTitle: secTitle,
            security: security,
            pwdHint: pwdHint,
            btnPwdToggle: btnPwdToggle,
            pwdPanel: pwdPanel,
            rowOldWrap: rowOldWrap,
            inpOld: inpOld,
            inpNew: inpNew,
            inpNew2: inpNew2,
            btnPwd: btnPwd,
            btnPwdCancel: btnPwdCancel,
        };
    }

    function ensureModal() {
        if (modalState && modalState.modal && document.body.contains(modalState.modal)) return modalState;
        var existing = qs('#account-modal');
        if (existing && existing.nodeType === 1) {
            // Reuse DOM (e.g. after partial injection) — same structure as buildModal().
            modalState = {
                modal: existing,
                close: qs('.modal-close', existing),
                name: qs('.account-name', existing),
                emailLine: qs('#account-email', existing),
                hint: qs('.account-hint', existing),
                status: qs('.account-status', existing),
                btnLogout: qs('.admin-ui-btn--danger.account-action-btn', existing),
                btnLogin: qs('.admin-ui-btn--primary.account-action-btn', existing),
                sCurrencySelect: qs('.account-select', existing),
                themeLightBtn: qs('#account-theme-light', existing),
                themeDarkBtn: qs('#account-theme-dark', existing),
                sPersistToggle: qsAllFallback('.account-setting-toggle', 1, existing),
                btnRename: qs('.account-rename-pencil-btn', existing),
                loginPencilGroup: qs('.account-login-pencil-group', existing),
                renameEditor: qs('.account-rename-editor', existing),
                renameWrap: qs('.account-rename-wrap', existing),
                nameRow: qs('.account-name-row', existing),
                renameInput: qs('#account-rename-input', existing),
                btnRenameSave: qs('#account-rename-agree', existing),
                btnRenameCancel: qs('#account-rename-disagree', existing),
                secTitle: qsAllFallback('.account-section-title', 1, existing),
                security: qsAllFallback('.account-settings--security', 0, existing),
                pwdHint: qs('.account-security-hint', existing),
                btnPwdToggle: qs('#account-password-toggle', existing),
                pwdPanel: qs('#account-password-panel', existing),
                rowOldWrap: qs('#account-pwd-old-wrap', existing),
                inpOld: qs('#account-pwd-old', existing),
                inpNew: qs('#account-pwd-new', existing),
                inpNew2: qs('#account-pwd-new2', existing),
                btnPwd: qs('#account-password-save', existing),
                btnPwdCancel: qs('#account-password-cancel', existing),
                __wired: false,
            };
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
        if (modalState && typeof modalState.__exitRenameUi === 'function') {
            try { modalState.__exitRenameUi(); } catch (_) {}
        }
        if (modalState) collapseAccountPasswordPanel(modalState);
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
            if (built.loginPencilGroup) built.loginPencilGroup.hidden = !!on;
            if (built.renameEditor) {
                built.renameEditor.hidden = !on;
                built.renameEditor.setAttribute('aria-hidden', on ? 'false' : 'true');
            }
            if (built.renameWrap) built.renameWrap.classList.toggle('account-rename-wrap--editing', !!on);
            if (on && built.pwdPanel && built.btnPwdToggle) {
                built.pwdPanel.hidden = true;
                built.btnPwdToggle.setAttribute('aria-expanded', 'false');
            }
            if (on) {
                setTimeout(function () {
                    try {
                        built.renameInput.focus();
                        built.renameInput.select();
                    } catch (_) {}
                }, 0);
            }
        }

        function setPasswordExpanded(on) {
            if (!built.pwdPanel || !built.btnPwdToggle) return;
            built.pwdPanel.hidden = !on;
            built.btnPwdToggle.setAttribute('aria-expanded', on ? 'true' : 'false');
            if (on) setRenameMode(false);
            if (on) {
                setTimeout(function () {
                    try {
                        var canFocusOld = built.rowOldWrap && built.rowOldWrap.isConnected && built.inpOld && !built.inpOld.disabled;
                        if (canFocusOld) built.inpOld.focus();
                        else if (built.inpNew) built.inpNew.focus();
                    } catch (_) {}
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
            built.btnRename.addEventListener('click', function () {
                built.hint.textContent = '';
                var fromMe = typeof built.lastUsername === 'string' ? built.lastUsername.trim() : '';
                var fromNode = built.name && built.name.textContent ? String(built.name.textContent).trim() : '';
                built.renameInput.value = fromMe || fromNode;
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
                if (nextName.indexOf('@') !== -1) { built.hint.textContent = 'Логин не может содержать символ @'; return; }
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
                            built.lastUsername = String(res.json.user.username);
                        } else {
                            built.name.textContent = nextName;
                            built.lastUsername = nextName;
                        }
                        if (built.emailLine && res.json && res.json.user) {
                            var de = resolveDisplayEmail(res.json.user);
                            if (de) {
                                built.emailLine.hidden = false;
                                built.emailLine.textContent = de;
                            } else {
                                built.emailLine.textContent = '';
                                built.emailLine.hidden = true;
                            }
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

        built.__exitRenameUi = function () {
            try {
                setRenameBusy(false);
                setRenameMode(false);
            } catch (_) {}
        };

        if (built.btnPwdToggle && built.pwdPanel) {
            built.btnPwdToggle.addEventListener('click', function () {
                var open = built.pwdPanel.hidden;
                setPasswordExpanded(open);
            });
        }

        if (built.btnPwdCancel) {
            built.btnPwdCancel.addEventListener('click', function () {
                var t = getToken();
                collapseAccountPasswordPanel(built);
                if (!t) return;
                fetchMe(t).then(function (me) {
                    if (me) renderAuthed(built, me);
                });
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
                if (built.btnPwdCancel) built.btnPwdCancel.disabled = true;
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
                        built.btnPwd.disabled = false;
                        if (built.btnPwdCancel) built.btnPwdCancel.disabled = false;
                        if (!res || !res.ok) {
                            built.pwdHint.textContent = (res && res.json && res.json.error) ? res.json.error : 'Не удалось сменить пароль';
                            return;
                        }
                        if (res.json && res.json.token) {
                            try { localStorage.setItem(TOKEN_KEY, String(res.json.token)); } catch {}
                        }
                        var tok = '';
                        try { tok = localStorage.getItem(TOKEN_KEY) || ''; } catch {}
                        fetchMe(tok).then(function (me) {
                            try { sessionStorage.removeItem(OAUTH_PWD_PROMPT_KEY); } catch {}
                            if (me) renderAuthed(built, me, 'Пароль сохранён');
                            else collapseAccountPasswordPanel(built);
                        });
                    })
                    .catch(function () {
                        built.pwdHint.textContent = 'Не удалось сменить пароль';
                        built.btnPwd.disabled = false;
                        if (built.btnPwdCancel) built.btnPwdCancel.disabled = false;
                    });
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
        built.lastUsername = '';
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
        if (built.renameEditor) { built.renameEditor.hidden = true; built.renameEditor.setAttribute('aria-hidden', 'true'); }
        if (built.loginPencilGroup) built.loginPencilGroup.hidden = false;
        if (built.renameWrap) built.renameWrap.classList.remove('account-rename-wrap--editing');
        if (built.name) built.name.hidden = false;
        if (built.btnPwdToggle) { built.btnPwdToggle.disabled = true; built.btnPwdToggle.style.display = 'none'; }
        if (built.pwdPanel) built.pwdPanel.hidden = true;
        if (built.emailLine) built.emailLine.hidden = true;
        if (built.secTitle) built.secTitle.style.display = 'none';
        if (built.security) built.security.style.display = 'none';
    }

    function renderAuthed(built, me, pwdHintMessage) {
        built.lastUsername = me && me.username ? String(me.username) : '';
        built.name.textContent = built.lastUsername || 'Пользователь';
        if (built.emailLine) {
            var dispEmail = resolveDisplayEmail(me);
            if (dispEmail) {
                built.emailLine.hidden = false;
                built.emailLine.textContent = dispEmail;
            } else {
                built.emailLine.textContent = '';
                built.emailLine.hidden = true;
            }
        }
        built.hint.textContent = '';
        if (built.status) {
            built.status.textContent = '';
            built.status.hidden = true;
            built.status.style.display = 'none';
        }
        if (built.btnLogout) { built.btnLogout.hidden = false; built.btnLogout.style.display = 'inline-flex'; }
        if (built.btnLogin) { built.btnLogin.hidden = true; built.btnLogin.style.display = 'none'; }
        if (built.btnRename) { built.btnRename.disabled = false; built.btnRename.style.display = 'inline-flex'; }
        var renameUiOpen = built.renameEditor && built.renameEditor.hidden === false;
        if (!renameUiOpen) {
            if (built.renameEditor) { built.renameEditor.hidden = true; built.renameEditor.setAttribute('aria-hidden', 'true'); }
            if (built.loginPencilGroup) built.loginPencilGroup.hidden = false;
            if (built.renameWrap) built.renameWrap.classList.remove('account-rename-wrap--editing');
            if (built.name) built.name.hidden = false;
        }
        if (built.btnPwdToggle) { built.btnPwdToggle.disabled = false; built.btnPwdToggle.style.display = ''; }
        if (built.pwdPanel) built.pwdPanel.hidden = true;
        if (built.btnPwdToggle) built.btnPwdToggle.setAttribute('aria-expanded', 'false');

        if (built.secTitle) built.secTitle.style.display = '';
        if (built.security) built.security.style.display = '';
        if (built.pwdHint) built.pwdHint.textContent = '';
        if (built.inpOld) built.inpOld.value = '';
        if (built.inpNew) built.inpNew.value = '';
        if (built.inpNew2) built.inpNew2.value = '';

        var mustSet = me && !userHasPasswordSet(me);
        if (built.pwdHint) {
            if (pwdHintMessage != null && pwdHintMessage !== '') {
                built.pwdHint.textContent = String(pwdHintMessage);
            } else {
                built.pwdHint.textContent = mustSet
                    ? 'Вы впервые вошли через Google. Установите пароль, чтобы в следующий раз можно было войти по email или логину.'
                    : 'Смена пароля требует ввода текущего пароля. Если забыли — используйте восстановление через email на странице входа.';
            }
        }
        syncPasswordOldRow(built, me);
        if (built.btnPwdToggle) built.btnPwdToggle.textContent = mustSet ? 'Установить пароль' : 'Сменить пароль';
        if (built.btnPwd) built.btnPwd.textContent = 'Сохранить пароль';
    }

    function renderGuest(built) {
        built.lastUsername = '';
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
        if (built.btnPwdToggle) { built.btnPwdToggle.style.display = 'none'; }
        if (built.renameEditor) { built.renameEditor.hidden = true; built.renameEditor.setAttribute('aria-hidden', 'true'); }
        if (built.loginPencilGroup) built.loginPencilGroup.hidden = false;
        if (built.renameWrap) built.renameWrap.classList.remove('account-rename-wrap--editing');
        if (built.name) built.name.hidden = false;
        if (built.pwdPanel) built.pwdPanel.hidden = true;
        if (built.emailLine) built.emailLine.hidden = true;
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

