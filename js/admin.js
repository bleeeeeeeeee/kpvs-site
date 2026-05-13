const Admin = (() => {
    async function checkAuth() {
        try {
            const r = await apiFetch('/api/auth/me');
            if (!r.ok) {
                window.location.replace('/login.html?mode=admin&next=%2Fadmin.html');
                return false;
            }
            const user = await r.json();
            ui.currentUser = user;
            const usersPanel = document.getElementById('admin-users-panel');
            if (usersPanel && !(user && user.role === 'superadmin')) usersPanel.hidden = true;
            return true;
        } catch {
            window.location.replace('/login.html?mode=admin&next=%2Fadmin.html');
            return false;
        }
    }

    async function doLogout() {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch {}
        window.location.replace('/login.html?mode=admin&next=%2Fadmin.html');
    }

    let categories = [];
    let brands = [];
    let availableSizes = [];
    let productCategorySizesList = null;
    let productCategorySizesCatId = '';
    let availableColors = [];
    let availableCollections = [];
    let availableSizeTypes = [];
    let sizeQuickRevert = null;
    let brandQuickRevert = null;
    let products = [];
    let editingProductId = null;
    let productImages = [];
    let productVariants = [];
    let productCollections = [];
    let productAttributes = [];
    let productMaterials = [];
    let productModalBaselineSerialized = null;
    let productModalBaselineReady = false;
    const PRODUCT_DRAFT_STORAGE_PREFIX = 'kpvs_admin_product_draft_v1_';

    const state = {
        gender: '',
        categories: [],
        brands: [],
        seasons: [],
        sizes: [],
        colors: [],
        collections: [],
        active: '',
        sortOption: 'id_desc'
    };

    const ui = {};

    let visibilityConfirmPending = null;
    let searchInputTimer = null;
    let adminSearchScope = 'products';
    const USER_FILTERS_STORAGE_KEY = 'kpvs.adminUserListFilters.v1';
    let userListFilters = {
        roles: [],
        active: '',
        sortOption: 'id_desc'
    };

    function apiFetch(url, init) {
        init = Object.assign({}, init || {});
        if (!init.credentials) init.credentials = 'include';
        return window.fetch(url, init);
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatProductCount(n) {
        n = Number(n) || 0;
        const abs100 = Math.abs(n) % 100;
        const d = abs100 % 10;
        let w = 'товаров';
        if (abs100 < 10 || abs100 > 20) {
            if (d === 1) w = 'товар';
            else if (d > 1 && d < 5) w = 'товара';
        }
        return String(n) + ' ' + w;
    }

    function normalizeProductCollectionsRow(p) {
        const raw = p && p.collections;
        if (raw == null) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try {
                const j = JSON.parse(raw);
                return Array.isArray(j) ? j : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    function formatProductCollectionsCell(p) {
        const arr = normalizeProductCollectionsRow(p);
        if (!arr.length) return '—';
        return arr
            .map(function(c) {
                return c && c.name != null ? String(c.name) : '';
            })
            .filter(Boolean)
            .join(', ');
    }

    function isSuperadminSession() {
        return !!(ui.currentUser && ui.currentUser.role === 'superadmin');
    }

    function effectiveAdminSearchScope() {
        if (!isSuperadminSession()) return 'products';
        return adminSearchScope === 'users' ? 'users' : 'products';
    }

    function readAdminSearchScope() {
        try {
            const s = sessionStorage.getItem('kpvs.adminSearchScope');
            if (s === 'users' || s === 'products') return s;
        } catch (e) {}
        return 'products';
    }

    function writeAdminSearchScope(scope) {
        adminSearchScope = scope === 'users' ? 'users' : 'products';
        try {
            sessionStorage.setItem('kpvs.adminSearchScope', adminSearchScope);
        } catch (e) {}
    }

    function loadUserListFiltersFromStorage() {
        try {
            const raw = sessionStorage.getItem(USER_FILTERS_STORAGE_KEY);
            if (!raw) return;
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return;
            if (Array.isArray(o.roles)) userListFilters.roles = o.roles.map(String);
            if (typeof o.active === 'string') userListFilters.active = o.active;
            else if (typeof o.active === 'boolean') userListFilters.active = o.active ? 'active' : 'inactive';
            if (typeof o.sortOption === 'string') userListFilters.sortOption = o.sortOption;
        } catch (e) {}
    }

    function saveUserListFiltersToStorage() {
        try {
            sessionStorage.setItem(USER_FILTERS_STORAGE_KEY, JSON.stringify(userListFilters));
        } catch (e) {}
    }

    function normalizeAdminSearchScopeForRole() {
        const wrap = document.getElementById('admin-search-scope');
        if (!isSuperadminSession()) {
            adminSearchScope = 'products';
            if (wrap) {
                wrap.hidden = true;
                wrap.setAttribute('aria-hidden', 'true');
            }
        } else if (wrap) {
            wrap.removeAttribute('aria-hidden');
        }
        if (document.body && document.body.classList.contains('admin-page')) {
            document.body.classList.toggle('admin-no-user-search-scope', !isSuperadminSession());
        }
        syncAdminSearchPlaceholder();
        syncAdminToolbarForSearchScope();
    }

    function formatUserCountRow(n) {
        n = Number(n) || 0;
        const abs100 = Math.abs(n) % 100;
        const d = abs100 % 10;
        let w = 'пользователей';
        if (abs100 < 10 || abs100 > 20) {
            if (d === 1) w = 'пользователь';
            else if (d > 1 && d < 5) w = 'пользователя';
        }
        return String(n) + ' ' + w;
    }

    function userSortToApiParams(sortVal) {
        const s = String(sortVal || 'id_desc');
        const m = /^(.+)_(asc|desc)$/.exec(s);
        if (!m) return { sort_by: 'id', sort_direction: 'desc' };
        const base = m[1];
        const dir = m[2];
        const sort_by = base === 'created' ? 'created_at' : base;
        return { sort_by: sort_by, sort_direction: dir };
    }

    function getProductSortSelectOptions() {
        return [
            { value: 'id_desc', label: 'ID по убыванию (новые)' },
            { value: 'id_asc', label: 'ID по возрастанию' },
            { value: 'name_asc', label: 'Название А–Я' },
            { value: 'name_desc', label: 'Название Я–А' }
        ];
    }

    function getUserSortSelectOptions() {
        return [
            { value: 'id_desc', label: 'ID по убыванию' },
            { value: 'id_asc', label: 'ID по возрастанию' },
            { value: 'username_asc', label: 'Логин А–Я' },
            { value: 'username_desc', label: 'Логин Я–А' },
            { value: 'role_asc', label: 'Роль А–Я' },
            { value: 'role_desc', label: 'Роль Я–А' },
            { value: 'last_login_desc', label: 'Последний вход (сначала новые)' },
            { value: 'last_login_asc', label: 'Последний вход (сначала старые)' },
            { value: 'created_desc', label: 'Регистрация (сначала новые)' },
            { value: 'created_asc', label: 'Регистрация (сначала старые)' }
        ];
    }

    function fillSortSelectFromOptions(options, currentValue) {
        const sortBy = document.getElementById('sort-by');
        if (!sortBy) return;
        const want = String(currentValue || '');
        sortBy.innerHTML = options
            .map(function(o) {
                return '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>';
            })
            .join('');
        const ok = options.some(function(o) {
            return o.value === want;
        });
        sortBy.value = ok ? want : options[0].value;
    }

    function syncSortControlOptionsForScope() {
        if (effectiveAdminSearchScope() === 'users') {
            fillSortSelectFromOptions(getUserSortSelectOptions(), userListFilters.sortOption);
        } else {
            fillSortSelectFromOptions(getProductSortSelectOptions(), state.sortOption);
        }
    }

    function syncPrimaryToolbarAddButton() {
        const addBtn = document.getElementById('add-product-btn');
        if (!addBtn) return;
        if (isSuperadminSession() && adminSearchScope === 'users') {
            addBtn.textContent = 'Добавить пользователя';
            addBtn.setAttribute('data-toolbar-mode', 'users');
        } else {
            addBtn.textContent = 'Добавить товар';
            addBtn.setAttribute('data-toolbar-mode', 'products');
        }
    }

    function syncFiltersToolbarButtonLabel() {
        const b = document.getElementById('open-filters-btn');
        if (!b) return;
        b.textContent = 'Фильтры';
    }

    function syncAdminDataPanelsVisibility() {
        const productsPanel = document.getElementById('admin-products-panel');
        const usersPanel = document.getElementById('admin-users-panel');
        if (!productsPanel || !usersPanel) return;
        if (!isSuperadminSession()) {
            productsPanel.hidden = false;
            usersPanel.hidden = true;
            return;
        }
        const usersScope = effectiveAdminSearchScope() === 'users';
        productsPanel.hidden = usersScope;
        usersPanel.hidden = !usersScope;
    }

    function syncAdminToolbarForSearchScope() {
        syncPrimaryToolbarAddButton();
        syncFiltersToolbarButtonLabel();
        syncSortControlOptionsForScope();
        syncAdminDataPanelsVisibility();
    }

    function syncAdminSearchPlaceholder() {
        const inp = document.getElementById('search-input');
        if (!inp) return;
        if (effectiveAdminSearchScope() === 'users') {
            inp.placeholder = 'Поиск пользователей: логин, email, роль, id…';
        } else {
            inp.placeholder = 'Поиск по артикулу, названию или описанию';
        }
    }

    function setupAdminSearchScopeToggle() {
        const wrap = document.getElementById('admin-search-scope');
        if (!wrap || !ui.currentUser || ui.currentUser.role !== 'superadmin') return;
        wrap.hidden = false;
        adminSearchScope = readAdminSearchScope();
        const buttons = wrap.querySelectorAll('.admin-search-scope-btn');
        buttons.forEach(function(btn) {
            const scope = btn.getAttribute('data-scope');
            btn.classList.toggle('is-active', scope === adminSearchScope);
            btn.setAttribute('aria-pressed', scope === adminSearchScope ? 'true' : 'false');
        });
        syncAdminSearchPlaceholder();
        buttons.forEach(function(btn) {
            btn.onclick = function() {
                const scope = btn.getAttribute('data-scope') === 'users' ? 'users' : 'products';
                if (scope === adminSearchScope) return;
                writeAdminSearchScope(scope);
                buttons.forEach(function(b) {
                    const s = b.getAttribute('data-scope');
                    b.classList.toggle('is-active', s === adminSearchScope);
                    b.setAttribute('aria-pressed', s === adminSearchScope ? 'true' : 'false');
                });
                syncAdminSearchPlaceholder();
                syncAdminSearchClear();
                syncAdminToolbarForSearchScope();
                if (adminSearchScope === 'users') {
                    fetchUsers().catch(function() {});
                } else {
                    fetchProducts();
                }
            };
        });
    }

    function scheduleAdminToolbarSearch() {
        clearTimeout(searchInputTimer);
        searchInputTimer = setTimeout(function() {
            if (effectiveAdminSearchScope() === 'users') {
                fetchUsers().catch(function() {});
            } else {
                fetchProducts();
            }
        }, 320);
    }

    function syncAdminSearchClear() {
        const inp = document.getElementById('search-input');
        const btn = document.getElementById('admin-search-clear');
        if (!inp || !btn) return;
        btn.hidden = !inp.value.trim();
    }

    function slugify(text) {
        if (!text) return '';
        const map = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e',
            'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
            'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
            'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
            'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
            'А':'a','Б':'b','В':'v','Г':'g','Д':'d','Е':'e','Ё':'e',
            'Ж':'zh','З':'z','И':'i','Й':'y','К':'k','Л':'l','М':'m',
            'Н':'n','О':'o','П':'p','Р':'r','С':'s','Т':'t','У':'u',
            'Ф':'f','Х':'kh','Ц':'ts','Ч':'ch','Ш':'sh','Щ':'shch',
            'Ъ':'','Ы':'y','Ь':'','Э':'e','Ю':'yu','Я':'ya'
        };
        return text.toString().trim().toLowerCase()
            .split('').map(c => map[c] !== undefined ? map[c] : c).join('')
            .replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, '')
            .replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
    }

    function notify(message, kind) {
        kind = kind || 'info';
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        const node = document.createElement('div');
        node.className = 'notification show';
        node.setAttribute('role', 'status');
        node.innerHTML =
            '<div class="notification-handle" aria-hidden="true"></div>' +
            '<div class="notification-content">' +
                '<strong>' + escapeHtml(kind === 'error' ? 'Ошибка' : kind === 'success' ? 'Готово' : 'Сообщение') + '</strong>' +
                '<span>' + escapeHtml(message) + '</span>' +
            '</div>' +
            '<button class="notification-close ui-xbtn" type="button" aria-label="Закрыть">&times;</button>';
        document.body.appendChild(node);
        node.querySelector('.notification-close').onclick = function(e) { e.stopPropagation(); node.remove(); };
        node.onclick = function(e) { e.stopPropagation(); };
        setTimeout(function() { if (node.isConnected) node.remove(); }, kind === 'error' ? 7000 : 4500);
    }

    function setTableStatus(msg) {
        if (!ui.productsBody || !ui.productCount) return;
        if (effectiveAdminSearchScope() === 'users') return;
        ui.productsBody.innerHTML = '<tr class="empty-row"><td colspan="8">' + escapeHtml(msg) + '</td></tr>';
        ui.productCount.textContent = formatProductCount(0);
    }

    function formatDateTime(s) {
        if (!s) return '—';
        try {
            const d = new Date(s);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return '—'; }
    }

    function looksLikeAccountEmail(s) {
        if (!s || typeof s !== 'string') return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim().toLowerCase());
    }

    /** Как в модалке аккаунта (`resolveDisplayEmail`): API `email`, иначе логин в виде почты. */
    function pickUserListEmail(u) {
        if (!u) return '';
        var em = u.email != null ? String(u.email).trim().toLowerCase() : '';
        if (em && looksLikeAccountEmail(em)) return em;
        var un = u.username != null ? String(u.username).trim().toLowerCase() : '';
        if (un && looksLikeAccountEmail(un)) return un;
        if (em) return em;
        return '';
    }

    function renderUsersTable(list) {
        if (!ui.usersBody) return;
        if (!Array.isArray(list) || !list.length) {
            ui.usersBody.innerHTML = '<tr class="empty-row"><td colspan="7">Нет пользователей</td></tr>';
            return;
        }
        ui.usersBody.innerHTML = list.map(function (u) {
            const checked = u.is_active === true ? 'checked' : '';
            const isSelf = ui.currentUser && Number(ui.currentUser.id) === Number(u.id);
            const disabledSelf = isSelf ? 'disabled' : '';
            const role = String(u.role || '');
            const emailRaw = pickUserListEmail(u);
            const emailDisplay = emailRaw || '—';
            const emailTitle = emailRaw ? (' title="' + escapeHtml(emailRaw) + '"') : '';
            const roleOptions = ['user', 'admin', 'superadmin'].map(function (r) {
                return '<option value="' + r + '" ' + (r === role ? 'selected' : '') + '>' + r + '</option>';
            }).join('');
            return (
                '<tr data-user-id="' + u.id + '">' +
                    '<td class="cell-tight-control">' +
                        '<label class="checkbox-label checkbox-label--only">' +
                            '<input type="checkbox" class="user-active-toggle" ' + checked + ' ' + disabledSelf + ' />' +
                            '<span class="checkbox-custom" aria-hidden="true"></span>' +
                        '</label>' +
                    '</td>' +
                    '<td class="cell-id">' + escapeHtml(u.id) + '</td>' +
                    '<td class="cell-user-login"><span class="admin-table-cell-primary">' + escapeHtml(u.username || '') + '</span></td>' +
                    '<td class="cell-user-email"' + emailTitle + '>' + escapeHtml(emailDisplay) + '</td>' +
                    '<td><select class="user-role-select" ' + disabledSelf + '>' + roleOptions + '</select></td>' +
                    '<td class="cell-user-last-login">' + escapeHtml(formatDateTime(u.last_login)) + '</td>' +
                    '<td class="admin-actions-cell">' +
                        '<div class="admin-users-actions-inner">' +
                        '<button type="button" class="admin-ui-btn admin-ui-btn--outline admin-ui-btn--sm btn-user-copy" data-copy="' + escapeHtml(u.username || '') + '">Копировать логин</button>' +
                        '<button type="button" class="admin-ui-btn admin-ui-btn--outline admin-ui-btn--sm btn-user-rename">Сменить логин</button>' +
                        '<button type="button" class="admin-ui-btn admin-ui-btn--outline admin-ui-btn--sm btn-user-password">Сменить пароль</button>' +
                        '<button type="button" class="admin-ui-btn admin-ui-btn--danger admin-ui-btn--sm btn-user-delete">Удалить</button>' +
                        '</div>' +
                    '</td>' +
                '</tr>'
            );
        }).join('');
    }

    async function fetchUsers() {
        if (!ui.currentUser || ui.currentUser.role !== 'superadmin') return;
        if (!ui.usersBody) return;
        ui.usersBody.innerHTML = '<tr class="empty-row"><td colspan="7">Загрузка…</td></tr>';
        const params = new URLSearchParams();
        const si = document.getElementById('search-input');
        if (si && si.value.trim()) params.set('q', si.value.trim());
        userListFilters.roles.forEach(function(r) {
            params.append('role', r);
        });
        var af = String(userListFilters.active || '').trim();
        if (af === 'active' || af === 'inactive') params.set('active', af);
        const sp = userSortToApiParams(userListFilters.sortOption);
        params.set('sort_by', sp.sort_by);
        params.set('sort_direction', sp.sort_direction);
        const r = await apiFetch('/api/admin/users?' + params.toString());
        if (!r.ok) throw new Error('Failed to load users');
        const data = await r.json().catch(function () { return null; });
        const list = Array.isArray(data)
            ? data.map(function (row) {
                if (!row || typeof row !== 'object') return row;
                if (row.email == null && row.Email != null) row.email = row.Email;
                if (row.email == null && row.user_email != null) row.email = row.user_email;
                return row;
            })
            : [];
        renderUsersTable(list);
        if (effectiveAdminSearchScope() === 'users' && ui.productCount) {
            ui.productCount.textContent = formatUserCountRow(list.length);
        }
        setupResizableColumns();
    }

    function syncUserCreateEmailRow() {
        if (!ui.userRole || !ui.userEmail) return;
        var isUser = String(ui.userRole.value || '') === 'user';
        var row = document.getElementById('user-email-row');
        ui.userEmail.required = isUser;
        if (row) row.hidden = !isUser;
        if (!isUser) ui.userEmail.value = '';
    }

    function openUserModal() {
        if (!ui.userModal) return;
        if (ui.userForm) ui.userForm.reset();
        showFieldError('err-user-username', '');
        showFieldError('err-user-email', '');
        showFieldError('err-user-password', '');
        syncUserCreateEmailRow();
        if (ui.userSaveBtn) ui.userSaveBtn.textContent = 'Создать';
        ui.userModal.style.display = 'flex';
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(function () { ui.userModal.classList.add('show'); }, 10);
    }

    function closeUserModal() {
        if (!ui.userModal) return;
        ui.userModal.classList.remove('show');
        ui.userModal.style.display = 'none';
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.unlock();
    }

    function isValidEmailStr(s) {
        var t = String(s || '').trim();
        return !!t && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t);
    }

    async function createUserFromModal() {
        const username = String(ui.userUsername && ui.userUsername.value || '').trim();
        const password = String(ui.userPassword && ui.userPassword.value || '');
        const role = String(ui.userRole && ui.userRole.value || 'user');
        const email = String(ui.userEmail && ui.userEmail.value || '').trim();
        let ok = true;
        showFieldError('err-user-username', '');
        showFieldError('err-user-email', '');
        showFieldError('err-user-password', '');
        if (!username) { showFieldError('err-user-username', 'Укажите логин'); ok = false; }
        else if (username.indexOf('@') !== -1) { showFieldError('err-user-username', 'Логин не может содержать @'); ok = false; }
        if (role === 'user' && !isValidEmailStr(email)) { showFieldError('err-user-email', 'Укажите корректный email'); ok = false; }
        if (!password || password.length < 6) { showFieldError('err-user-password', 'Пароль должен быть не менее 6 символов'); ok = false; }
        if (!ok) return;
        const payload = { username: username, password: password, role: role };
        if (role === 'user') payload.email = email;
        const r = await apiFetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await r.json().catch(function () { return null; });
        if (!r.ok) {
            notify((data && data.error) ? data.error : 'Не удалось создать пользователя', 'error');
            return;
        }
        notify('Пользователь создан', 'success');
        closeUserModal();
        await fetchUsers();
    }

    async function setUserActiveUi(id, isActive) {
        const r = await apiFetch('/api/admin/users/' + encodeURIComponent(id) + '/active', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: Boolean(isActive) })
        });
        if (!r.ok) {
            const data = await r.json().catch(function () { return null; });
            notify((data && data.error) ? data.error : 'Не удалось обновить активность', 'error');
            throw new Error('active');
        }
        await fetchUsers().catch(function () {});
    }

    async function setUserRoleUi(id, role) {
        const r = await apiFetch('/api/admin/users/' + encodeURIComponent(id) + '/role', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: String(role || '') })
        });
        const data = await r.json().catch(function () { return null; });
        if (!r.ok) {
            notify((data && data.error) ? data.error : 'Не удалось обновить роль', 'error');
            throw new Error('role');
        }
        await fetchUsers().catch(function () {});
    }

    async function changeUsernameUi(id) {
        const v = prompt('Новый логин (латиница/цифры/._-):');
        if (!v) return;
        const r = await apiFetch('/api/admin/users/' + encodeURIComponent(id) + '/username', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: String(v) })
        });
        const data = await r.json().catch(function () { return null; });
        if (!r.ok) {
            notify((data && data.error) ? data.error : 'Не удалось сменить логин', 'error');
            return;
        }
        notify('Логин обновлён', 'success');
        await fetchUsers();
    }

    async function resetUserPasswordUi(id) {
        const pwd = prompt('Новый пароль (минимум 6 символов):');
        if (!pwd) return;
        const r = await apiFetch('/api/admin/users/' + encodeURIComponent(id) + '/password', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: String(pwd) })
        });
        const data = await r.json().catch(function () { return null; });
        if (!r.ok) {
            notify((data && data.error) ? data.error : 'Не удалось сменить пароль', 'error');
            return;
        }
        notify('Пароль обновлён', 'success');
    }

    async function deleteUserUi(id) {
        const r = await apiFetch('/api/admin/users/' + encodeURIComponent(id), { method: 'DELETE' });
        const data = await r.json().catch(function () { return null; });
        if (!r.ok) {
            notify((data && data.error) ? data.error : 'Не удалось удалить пользователя', 'error');
            return;
        }
        notify('Пользователь удалён', 'success');
        await fetchUsers();
    }

    function copyToClipboard(text) {
        const t = String(text || '');
        if (!t) return Promise.reject(new Error('empty'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(t);
        }
        return new Promise(function (resolve, reject) {
            try {
                const ta = document.createElement('textarea');
                ta.value = t;
                ta.setAttribute('readonly', 'readonly');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                if (!ok) return reject(new Error('copy failed'));
                resolve();
            } catch (e) { reject(e); }
        });
    }

    function bindUsersEvents() {
        if (ui.userModal) {
            ui.userModal.querySelectorAll('.modal-close.ui-xbtn').forEach(function (btn) {
                btn.addEventListener('click', closeUserModal);
            });
            const cancelBtn = document.getElementById('user-cancel-btn');
            if (cancelBtn) cancelBtn.addEventListener('click', closeUserModal);
            ui.userModal.addEventListener('click', function (e) {
                if (e.target === ui.userModal) closeUserModal();
            });
        }

        if (ui.userSaveBtn) {
            ui.userSaveBtn.addEventListener('click', function () {
                if (!ui.currentUser || ui.currentUser.role !== 'superadmin') return;
                createUserFromModal();
            });
        }

        if (ui.usersBody) {
            ui.usersBody.addEventListener('change', function (e) {
                const row = e.target.closest && e.target.closest('tr[data-user-id]');
                if (!row) return;
                const id = Number(row.getAttribute('data-user-id'));
                if (e.target.classList.contains('user-active-toggle')) {
                    setUserActiveUi(id, e.target.checked).catch(function () {
                        e.target.checked = !e.target.checked;
                    });
                }
                if (e.target.classList.contains('user-role-select')) {
                    setUserRoleUi(id, e.target.value)
                        .then(function () { notify('Роль обновлена', 'success'); })
                        .catch(function () { fetchUsers().catch(function () {}); });
                }
            });
            ui.usersBody.addEventListener('click', function (e) {
                const copyBtn = e.target.closest && e.target.closest('.btn-user-copy');
                if (copyBtn) {
                    const v = copyBtn.getAttribute('data-copy') || '';
                    copyToClipboard(v)
                        .then(function () { notify('Логин скопирован', 'success'); })
                        .catch(function () { notify('Не удалось скопировать', 'error'); });
                    return;
                }
                const renameBtn = e.target.closest && e.target.closest('.btn-user-rename');
                const btn = e.target.closest && e.target.closest('.btn-user-password');
                const delBtn = e.target.closest && e.target.closest('.btn-user-delete');
                const row = (renameBtn || btn || delBtn) ? (renameBtn || btn || delBtn).closest('tr[data-user-id]') : null;
                if (!row) return;
                const id = Number(row.getAttribute('data-user-id'));
                if (renameBtn) {
                    changeUsernameUi(id);
                    return;
                }
                if (btn) {
                    resetUserPasswordUi(id);
                    return;
                }
                if (delBtn) {
                    const titleEl = document.getElementById('visibility-confirm-title');
                    const msgEl = document.getElementById('visibility-confirm-message');
                    if (titleEl) titleEl.textContent = 'Удалить пользователя?';
                    if (msgEl) msgEl.textContent = 'Пользователь будет удалён без возможности восстановления. Продолжить?';
                    const okBtn = document.getElementById('visibility-confirm-ok');
                    if (okBtn) okBtn.disabled = false;

                    visibilityConfirmPending = { kind: 'delete-user', id: id };
                    openModal(ui.visibilityConfirmModal);
                }
            });
        }
    }

    function showFieldError(id, msg) {
        const el = document.getElementById(id);
        if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
    }

    function clearFieldErrors() {
        document.querySelectorAll('.field-error').forEach(function(el) {
            el.textContent = '';
            el.style.display = 'none';
        });
    }

    async function fetchCategories() {
        try {
            const r = await apiFetch('/api/categories');
            if (!r.ok) throw new Error();
            categories = flattenCategories(await r.json());
            pruneStateCategoryParents();
        } catch {
            categories = [];
            notify('Не удалось загрузить категории', 'error');
        }
    }

    async function fetchBrands() {
        try {
            const r = await apiFetch('/api/brands');
            if (!r.ok) throw new Error();
            brands = await r.json();
        } catch { brands = []; }
    }

    /** equivalent_hint с /api/sizes — подпись других шкал той же группы размеров. */
    function mapSizesApiRows(raw) {
        return Array.isArray(raw)
            ? raw
                  .map(function(s) {
                      return {
                          id: Number(s.id),
                          value: s.value || '',
                          size_type: s.size_type || '',
                          size_type_id: s.size_type_id != null ? Number(s.size_type_id) : NaN,
                          equivalent_hint:
                              s.equivalent_hint != null && String(s.equivalent_hint).trim() !== ''
                                  ? String(s.equivalent_hint)
                                  : ''
                      };
                  })
                  .filter(function(s) {
                      return Number.isFinite(s.id);
                  })
            : [];
    }

    async function fetchSizes() {
        try {
            const r = await apiFetch('/api/sizes');
            if (!r.ok) throw new Error();
            const raw = await r.json();
            availableSizes = mapSizesApiRows(raw);
        } catch {
            availableSizes = [];
        }
    }

    /**
     * Подгружает размеры, допустимые для выбранной категории товара (как на сервере в getSizes).
     */
    async function refreshProductCategorySizes() {
        const catEl = document.getElementById('product-category');
        const id = catEl && catEl.value ? String(catEl.value).trim() : '';
        if (!id) {
            productCategorySizesList = [];
            productCategorySizesCatId = '';
            return;
        }
        try {
            const r = await apiFetch('/api/sizes?category_id=' + encodeURIComponent(id));
            if (!r.ok) throw new Error();
            const raw = await r.json();
            const catNow = catEl.value ? String(catEl.value).trim() : '';
            if (catNow !== id) return;
            productCategorySizesList = mapSizesApiRows(raw);
            productCategorySizesCatId = id;
        } catch {
            const catNow = catEl && catEl.value ? String(catEl.value).trim() : '';
            if (catNow === id) {
                productCategorySizesList = [];
                productCategorySizesCatId = id;
            }
        }
    }

    /** Типы размеров из текущего списка /api/sizes?category_id=… для модалки «Новый размер». */
    function allowedSizeTypeIdsForProductForm() {
        const set = new Set();
        (productCategorySizesList || []).forEach(function(s) {
            if (s.size_type_id != null && Number.isFinite(Number(s.size_type_id))) {
                set.add(Number(s.size_type_id));
            }
        });
        return set;
    }

    async function fetchColors() {
        try {
            const r = await apiFetch('/api/colors');
            if (!r.ok) throw new Error();
            availableColors = await r.json();
        } catch { availableColors = []; }
    }

    function mapCollectionRows(raw, includeCount) {
        return (Array.isArray(raw) ? raw : []).map(function(t) {
            return {
                id: Number(t.id),
                name: t.name || '',
                slug: t.slug || '',
                icon: t.icon != null && String(t.icon).trim() !== '' ? String(t.icon).trim() : '',
                section: t.section || 'all',
                sort_order: Number(t.sort_order) || 0,
                product_count: includeCount && t.product_count != null ? Number(t.product_count) : 0
            };
        }).filter(function(t) {
            return Number.isFinite(t.id);
        });
    }

    async function fetchCollections() {
        try {
            const r = await apiFetch('/api/admin/collections');
            if (r.ok) {
                const raw = await r.json();
                availableCollections = mapCollectionRows(raw, true);
                return;
            }
            let errMsg = 'Не удалось загрузить подборки (код ' + r.status + ')';
            try {
                const j = await r.json();
                if (j.error) errMsg = j.error;
            } catch (e2) {}
            const r2 = await apiFetch('/api/collections');
            if (r2.ok) {
                const raw2 = await r2.json();
                availableCollections = mapCollectionRows(raw2, false);
                if (availableCollections.length) {
                    notify(errMsg + ' Показан публичный список; счётчик товаров в таблице недоступен.', 'info');
                } else {
                    notify(errMsg, 'error');
                }
                return;
            }
            notify(errMsg, 'error');
            availableCollections = [];
        } catch (e) {
            availableCollections = [];
            notify('Не удалось загрузить подборки', 'error');
        }
    }

    async function fetchSizeTypes() {
        try {
            const r = await apiFetch('/api/admin/size-types');
            if (!r.ok) throw new Error();
            const raw = await r.json();
            availableSizeTypes = Array.isArray(raw)
                ? raw.map(function(t) {
                    return {
                        id: Number(t.id),
                        name: t.name || '',
                        slug: t.slug != null ? String(t.slug) : ''
                    };
                }).filter(function(t) {
                    return Number.isFinite(t.id);
                })
                : [];
            if (!availableSizeTypes.length) notify('Типы размеров не найдены в базе', 'error');
        } catch {
            availableSizeTypes = [];
            notify('Не удалось загрузить типы размеров', 'error');
        }
    }

    function openCollectionModal(row) {
        const modal = document.getElementById('collection-modal');
        const title = document.getElementById('collection-modal-title');
        if (!modal || !title) return;
        title.textContent = row ? 'Редактировать подборку' : 'Новая подборка';
        document.getElementById('collection-edit-id').value = row ? String(row.id) : '';
        document.getElementById('collection-name').value = row ? (row.name || '') : '';
        document.getElementById('collection-slug').value = row ? (row.slug || '') : '';
        document.getElementById('collection-icon').value = row ? (row.icon || '') : '';
        const sec = document.getElementById('collection-section');
        if (sec) sec.value = row && row.section ? row.section : 'all';
        const sort = document.getElementById('collection-sort');
        if (sort) sort.value = row && row.sort_order != null ? String(row.sort_order) : '0';
        const en = document.getElementById('err-collection-name');
        if (en) en.textContent = '';
        openModal(modal);
    }

    function closeCollectionModal() {
        const m = document.getElementById('collection-modal');
        if (m) closeModal(m);
    }

    async function saveCollectionFromModal() {
        const nameEl = document.getElementById('collection-name');
        const slugEl = document.getElementById('collection-slug');
        const iconEl = document.getElementById('collection-icon');
        const secEl = document.getElementById('collection-section');
        const sortEl = document.getElementById('collection-sort');
        const err = document.getElementById('err-collection-name');
        const name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
            if (err) err.textContent = 'Укажите название';
            return;
        }
        if (err) err.textContent = '';
        const body = {
            name: name,
            icon: iconEl && iconEl.value.trim() ? iconEl.value.trim() : null,
            section: secEl ? secEl.value : 'all',
            sort_order: sortEl && sortEl.value !== '' ? Number(sortEl.value) : 0
        };
        const slug = slugEl && slugEl.value.trim();
        if (slug) body.slug = slug;
        const id = document.getElementById('collection-edit-id').value.trim();
        try {
            let r;
            if (id) {
                r = await apiFetch('/api/admin/collections/' + encodeURIComponent(id), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                r = await apiFetch('/api/admin/collections', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
            if (!r.ok) {
                let msg = 'Код ' + r.status;
                try { const j = await r.json(); if (j.error) msg = j.error; } catch (e2) {}
                throw new Error(msg);
            }
            await fetchCollections();
            renderCollectionsDropdown();
            updateSelectedCollections();
            closeCollectionModal();
            notify(id ? 'Подборка обновлена' : 'Подборка создана', 'success');
        } catch (e) {
            notify(e.message || 'Ошибка сохранения', 'error');
        }
    }

    function bindCollectionModalOnce() {
        const cm = document.getElementById('collection-modal');
        if (cm && !cm.dataset.bound) {
            cm.dataset.bound = '1';
            const c1 = cm.querySelector('.collection-modal-close');
            const c2 = document.getElementById('collection-cancel-btn');
            const c3 = document.getElementById('collection-save-btn');
            if (c1) c1.onclick = closeCollectionModal;
            if (c2) c2.onclick = closeCollectionModal;
            if (c3) c3.onclick = saveCollectionFromModal;
            cm.addEventListener('click', function(e) { if (e.target === cm) closeCollectionModal(); });
        }
    }

    function populateSizeQuickTypeSelect(allowedTypeIds) {
        const sel = document.getElementById('size-quick-type');
        const hint = document.getElementById('size-quick-type-hint');
        if (!sel) return;
        let list = availableSizeTypes.slice();
        if (allowedTypeIds && allowedTypeIds.size) {
            list = list.filter(function(t) {
                return allowedTypeIds.has(Number(t.id));
            });
        }
        if (!list.length) {
            sel.innerHTML = '<option value="">(нет типов)</option>';
            if (hint) {
                hint.textContent = 'Типы размеров не загружены или не сопоставлены с категорией. Обновите страницу после правок в базе.';
            }
            return;
        }
        sel.innerHTML = list.map(function(t) {
            return '<option value="' + escapeHtml(String(t.id)) + '">' + escapeHtml(t.name) + '</option>';
        }).join('');
        if (hint) {
            hint.textContent = allowedTypeIds && allowedTypeIds.size
                ? 'Только типы, допустимые для выбранной категории товара (и её родителей).'
                : 'Выберите тип, к которому относится обозначение (например одежда или обувь).';
        }
    }

    function openSizeQuickModal(sizeSelectEl, prevValue) {
        const modal = document.getElementById('size-quick-modal');
        if (!modal) return;
        const vi = sizeSelectEl && sizeSelectEl.dataset.variantIndex != null ? Number(sizeSelectEl.dataset.variantIndex) : NaN;
        sizeQuickRevert = sizeSelectEl
            ? {
                sel: sizeSelectEl,
                val: prevValue != null ? String(prevValue) : '',
                variantIndex: Number.isFinite(vi) ? vi : null
            }
            : null;
        if (sizeSelectEl) sizeSelectEl.value = sizeQuickRevert.val;
        const allowed = allowedSizeTypeIdsForProductForm();
        populateSizeQuickTypeSelect(allowed.size ? allowed : null);
        const v = document.getElementById('size-quick-value');
        const e = document.getElementById('err-size-quick');
        if (v) v.value = '';
        if (e) e.textContent = '';
        openModal(modal);
    }

    function dismissSizeQuickModal() {
        if (sizeQuickRevert && sizeQuickRevert.sel) {
            sizeQuickRevert.sel.value = sizeQuickRevert.val || '';
        }
        sizeQuickRevert = null;
        const m = document.getElementById('size-quick-modal');
        if (m) closeModal(m);
    }

    async function saveSizeQuickFromModal() {
        const vEl = document.getElementById('size-quick-value');
        const tEl = document.getElementById('size-quick-type');
        const err = document.getElementById('err-size-quick');
        const val = vEl ? vEl.value.trim() : '';
        if (!val) {
            if (err) err.textContent = 'Укажите размер';
            return;
        }
        if (err) err.textContent = '';
        const body = { value: val };
        if (tEl && tEl.value) body.size_type_id = Number(tEl.value);
        const rev = sizeQuickRevert;
        try {
            const r = await apiFetch('/api/admin/sizes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok) {
                let msg = 'Код ' + r.status;
                try { const j = await r.json(); if (j.error) msg = j.error; } catch (e2) {}
                throw new Error(msg);
            }
            const inserted = await r.json();
            const newId = Number(inserted.id);
            await fetchSizes();
            await refreshProductCategorySizes();
            const idx = rev != null ? Number(rev.variantIndex) : NaN;
            if (Number.isFinite(idx) && productVariants[idx]) {
                productVariants[idx].size_id = newId;
            }
            sizeQuickRevert = null;
            const m = document.getElementById('size-quick-modal');
            if (m) closeModal(m);
            await renderVariantsList();
            notify('Размер «' + val + '» добавлен', 'success');
        } catch (e) {
            notify(e.message || 'Не удалось создать размер', 'error');
        }
    }

    function bindSizeQuickModalOnce() {
        const sm = document.getElementById('size-quick-modal');
        if (sm && !sm.dataset.bound) {
            sm.dataset.bound = '1';
            const x = sm.querySelector('.size-quick-modal-close');
            const c = document.getElementById('size-quick-cancel-btn');
            const s = document.getElementById('size-quick-save-btn');
            if (x) x.onclick = dismissSizeQuickModal;
            if (c) c.onclick = dismissSizeQuickModal;
            if (s) s.onclick = saveSizeQuickFromModal;
            sm.addEventListener('click', function(e) { if (e.target === sm) dismissSizeQuickModal(); });
        }
    }

    function openBrandQuickModal() {
        const modal = document.getElementById('brand-quick-modal');
        if (!modal) return;
        const n = document.getElementById('brand-quick-name');
        const s = document.getElementById('brand-quick-slug');
        const en = document.getElementById('err-brand-quick-name');
        const es = document.getElementById('err-brand-quick-slug');
        if (n) n.value = '';
        if (s) s.value = '';
        if (en) en.textContent = '';
        if (es) es.textContent = '';
        openModal(modal);
    }

    function dismissBrandQuickModal() {
        brandQuickRevert = null;
        const m = document.getElementById('brand-quick-modal');
        if (m) closeModal(m);
    }

    async function saveBrandQuickFromModal() {
        const nEl = document.getElementById('brand-quick-name');
        const sEl = document.getElementById('brand-quick-slug');
        const en = document.getElementById('err-brand-quick-name');
        const name = nEl ? nEl.value.trim() : '';
        if (!name) {
            if (en) en.textContent = 'Укажите название';
            return;
        }
        if (en) en.textContent = '';
        const body = { name: name };
        const slug = sEl && sEl.value.trim();
        if (slug) body.slug = slug;
        try {
            const r = await apiFetch('/api/admin/brands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok) {
                let msg = 'Код ' + r.status;
                try { const j = await r.json(); if (j.error) msg = j.error; } catch (e2) {}
                throw new Error(msg);
            }
            const row = await r.json();
            const newId = Number(row.id);
            await fetchBrands();
            const brandSel = document.getElementById('product-brand');
            if (brandSel) {
                populateBrandSelect(brandSel, newId);
                brandSel.dataset.prevBrand = String(newId);
            }
            brandQuickRevert = null;
            dismissBrandQuickModal();
            notify('Бренд «' + name + '» создан', 'success');
        } catch (e) {
            notify(e.message || 'Не удалось создать бренд', 'error');
        }
    }

    function bindBrandQuickModalOnce() {
        const bm = document.getElementById('brand-quick-modal');
        if (bm && !bm.dataset.bound) {
            bm.dataset.bound = '1';
            const x = bm.querySelector('.brand-quick-modal-close');
            const c = document.getElementById('brand-quick-cancel-btn');
            const s = document.getElementById('brand-quick-save-btn');
            if (x) x.onclick = dismissBrandQuickModal;
            if (c) c.onclick = dismissBrandQuickModal;
            if (s) s.onclick = saveBrandQuickFromModal;
            bm.addEventListener('click', function(e) { if (e.target === bm) dismissBrandQuickModal(); });
        }
    }

    function bindVariantSizeSelectDelegationOnce() {
        const c = ui.productVariantsContainer;
        if (!c || c.dataset.sizeDeleg) return;
        c.dataset.sizeDeleg = '1';
        c.addEventListener('change', function(ev) {
            const sel = ev.target.closest('.variant-size');
            if (!sel || !c.contains(sel)) return;
            sel.dataset.prevValue = sel.value;
        });
    }

    function bindProductBrandNewOptionOnce() {
        const b = document.getElementById('product-brand');
        if (!b || b.dataset.brandNewDeleg) return;
        b.dataset.brandNewDeleg = '1';
        b.addEventListener('change', function() {
            if (b.value === '__new_brand__') {
                const prev = b.dataset.prevBrand != null ? b.dataset.prevBrand : '';
                b.value = prev || '';
                brandQuickRevert = { sel: b, val: prev || '' };
                openBrandQuickModal();
            } else {
                b.dataset.prevBrand = b.value;
            }
        });
    }

    function bindProductCategoryForVariantsOnce() {
        const cat = document.getElementById('product-category');
        if (!cat || cat.dataset.variantCatDeleg) return;
        cat.dataset.variantCatDeleg = '1';
        cat.addEventListener('change', function() {
            const pm = document.getElementById('product-modal');
            if (!pm || !pm.classList.contains('show')) return;
            collectVariants();
                void refreshProductCategorySizes().then(async function() {
                    const cid = cat.value ? String(cat.value).trim() : '';
                    if (cid) {
                        productVariants.forEach(function(v) {
                            if (v.size_id == null || !Number.isFinite(Number(v.size_id))) return;
                            const list = sizesForProductCategory(cid, v.size_id);
                            if (!list.some(function(s) { return Number(s.id) === Number(v.size_id); })) {
                                v.size_id = null;
                            }
                        });
                    }
                    await renderVariantsList();
                });
        });
    }

    function bindVariantSameColorButtonOnce() {
        const c = ui.productVariantsContainer;
        if (!c || c.dataset.sameColorDeleg) return;
        c.dataset.sameColorDeleg = '1';
        c.addEventListener('click', function(ev) {
            const btn = ev.target.closest('.btn-variant-same-color');
            if (!btn || !c.contains(btn)) return;
            ev.preventDefault();
            const i = Number(btn.dataset.index);
            if (!Number.isFinite(i)) return;
            collectVariants();
            const src = productVariants[i];
            const colorId = src && src.color_id != null ? src.color_id : null;
            productVariants.splice(i + 1, 0, { size_id: null, color_id: colorId, art: '', is_active: true });
            renderVariantsList();
        });
    }

    function normalizeVariantArtsForSave(baseArt, variants) {
        const used = new Set();
        const upperBase = String(baseArt || '').trim().toUpperCase();
        return variants.map(function(v) {
            const copy = Object.assign({}, v);
            let art = copy.art != null ? String(copy.art).trim().toUpperCase() : '';
            if (art) {
                used.add(art);
                copy.art = art;
                return copy;
            }
            const sid = copy.size_id != null && Number.isFinite(Number(copy.size_id)) ? Number(copy.size_id) : null;
            const cid = copy.color_id != null && Number.isFinite(Number(copy.color_id)) ? Number(copy.color_id) : null;
            if (sid == null && cid == null) {
                copy.art = null;
                return copy;
            }
            if (!upperBase) {
                copy.art = null;
                return copy;
            }
            const a0 = upperBase + '-S' + (sid != null ? sid : '0') + '-C' + (cid != null ? cid : '0');
            let candidate = a0;
            let n = 2;
            while (used.has(candidate)) {
                candidate = a0 + '-' + n;
                n += 1;
            }
            used.add(candidate);
            copy.art = candidate;
            return copy;
        });
    }

    function flattenCategories(list, depth) {
        depth = depth || 0;
        const result = [];
        if (!Array.isArray(list)) return result;
        list.forEach(function(item) {
            if (!item) return;
            result.push({
                id: item.id,
                name: item.name,
                slug: item.slug,
                depth: depth,
                parent_id: item.parent_id != null && item.parent_id !== '' ? Number(item.parent_id) : null
            });
            if (Array.isArray(item.children) && item.children.length) {
                result.push.apply(result, flattenCategories(item.children, depth + 1));
            }
        });
        return result;
    }

    function variantSizeSortKeyForAdmin(val) {
        if (val == null || String(val).trim() === '') return [9, 0, ''];
        const v = String(val)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '');
        const rank = { '2xs': 1, xxs: 1, xs: 2, s: 3, m: 4, l: 5, xl: 6, xxl: 7, '2xl': 7, '3xl': 8 };
        if (rank[v] != null) return [0, rank[v], String(val)];
        const num = parseFloat(String(val).replace(',', '.'));
        if (Number.isFinite(num)) return [1, num, String(val)];
        return [2, 0, String(val)];
    }

    function sizeIdToValueMapForVariantSort() {
        const m = new Map();
        (productCategorySizesList || []).forEach(function(s) {
            if (Number.isFinite(s.id)) m.set(Number(s.id), s.value != null ? String(s.value) : '');
        });
        (availableSizes || []).forEach(function(s) {
            if (Number.isFinite(s.id) && !m.has(Number(s.id))) {
                m.set(Number(s.id), s.value != null ? String(s.value) : '');
            }
        });
        return m;
    }

    function compareVariantsSizeColorArt(a, b, idToValue) {
        const va = a.size_id != null && Number.isFinite(Number(a.size_id)) ? idToValue.get(Number(a.size_id)) : '';
        const vb = b.size_id != null && Number.isFinite(Number(b.size_id)) ? idToValue.get(Number(b.size_id)) : '';
        const ka = variantSizeSortKeyForAdmin(va);
        const kb = variantSizeSortKeyForAdmin(vb);
        for (let i = 0; i < 3; i++) {
            if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        }
        const ca = a.color_id != null && Number.isFinite(Number(a.color_id)) ? Number(a.color_id) : 0;
        const cb = b.color_id != null && Number.isFinite(Number(b.color_id)) ? Number(b.color_id) : 0;
        if (ca !== cb) return ca - cb;
        return String(a.art || '').localeCompare(String(b.art || ''), 'ru');
    }

    /** Порядок строк как на витрине и при сохранении: размер по возрастанию, затем цвет, артикул. */
    function sortProductVariantsInPlace() {
        if (!Array.isArray(productVariants) || productVariants.length < 2) return;
        const idToValue = sizeIdToValueMapForVariantSort();
        productVariants.sort(function(a, b) {
            return compareVariantsSizeColorArt(a, b, idToValue);
        });
    }

    function sizesForProductCategory(categoryId, variantSizeId) {
        const vs = Number(variantSizeId);
        const cid = categoryId != null && String(categoryId).trim() !== '' ? String(categoryId).trim() : '';

        if (!cid) {
            if (Number.isFinite(vs)) {
                const extra = availableSizes.find(function(s) { return Number(s.id) === vs; });
                return extra ? [extra] : [];
            }
            return [];
        }

        let base =
            productCategorySizesCatId === cid && productCategorySizesList != null
                ? productCategorySizesList.slice()
                : [];

        if (Number.isFinite(vs)) {
            if (base.some(function(s) { return Number(s.id) === vs; })) return base;
            const extra = availableSizes.find(function(s) { return Number(s.id) === vs; });
            return extra ? base.concat([extra]) : base;
        }
        return base;
    }

    function variantSizeDisplayLabel(categoryId, sizeId) {
        const sid = Number(sizeId);
        if (!Number.isFinite(sid) || sid <= 0) return 'Размер…';
        const cid = categoryId != null && String(categoryId).trim() !== '' ? String(categoryId).trim() : '';
        const list = sizesForProductCategory(cid, sid);
        let row = list.find(function(s) {
            return Number(s.id) === sid;
        });
        if (!row) {
            row = availableSizes.find(function(s) {
                return Number(s.id) === sid;
            });
        }
        if (!row) return 'Размер #' + sid;
        const hint = row.equivalent_hint && String(row.equivalent_hint).trim() ? ' · ' + row.equivalent_hint : '';
        return String(row.value) + ' (' + row.size_type + ')' + hint;
    }

    function categoryParentIdsWithChildren() {
        const set = new Set();
        categories.forEach(function(c) {
            const pid = c.parent_id != null && c.parent_id !== '' ? Number(c.parent_id) : NaN;
            if (Number.isFinite(pid) && pid > 0) {
                set.add(pid);
            }
        });
        return set;
    }

    /** Убирает из state.categories родительские категории (их нельзя выбирать). */
    function pruneStateCategoryParents() {
        if (!Array.isArray(state.categories) || !state.categories.length || !categories.length) return;
        const parentIds = categoryParentIdsWithChildren();
        const next = state.categories.filter(function(val) {
            const cat = categories.find(function(c) {
                return String(c.id) === String(val) || (c.slug && String(c.slug) === String(val));
            });
            if (!cat) return true;
            return !parentIds.has(Number(cat.id));
        });
        if (next.length === state.categories.length) return;
        state.categories = next;
        if (ui.filterCategoryLabel) updateFilterCategoryLabel();
    }

    function populateCategorySelect(selectEl, selectedId) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Категория</option>';
        const parentIds = categoryParentIdsWithChildren();
        categories.forEach(function(cat) {
            const prefix = '\u00a0\u00a0'.repeat(cat.depth);
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = prefix + cat.name;
            if (selectedId != null && Number(cat.id) === Number(selectedId)) opt.selected = true;
            if (parentIds.has(Number(cat.id))) {
                opt.disabled = true;
                opt.title = 'Выберите конечную подкатегорию';
            }
            selectEl.appendChild(opt);
        });
    }

    function populateBrandSelect(selectEl, selectedId) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Бренд</option>';
        brands.forEach(function(b) {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            if (selectedId != null && Number(b.id) === Number(selectedId)) opt.selected = true;
            selectEl.appendChild(opt);
        });
        if (selectEl.id === 'product-brand') {
            const oa = document.createElement('option');
            oa.value = '__new_brand__';
            oa.textContent = '+ Новый бренд…';
            oa.className = 'admin-select-action-option';
            selectEl.appendChild(oa);
        }
    }

    function populateFilterCategoryDropdown() {
        const dropdown = ui.filterCategoryDropdown;
        if (!dropdown) return;
        pruneStateCategoryParents();
        dropdown.innerHTML = '';
        const parentIds = categoryParentIdsWithChildren();
        categories.forEach(function(cat) {
            const prefix = '\u00a0\u00a0'.repeat(cat.depth);
            const label = document.createElement('label');
            label.className = 'admin-multiselect-option';
            label.innerHTML =
                '<input type="checkbox" value="' + escapeHtml(String(cat.id)) + '" />' +
                '<span>' + prefix + escapeHtml(cat.name) + '</span>';
            if (parentIds.has(Number(cat.id))) {
                label.classList.add('admin-multiselect-option--disabled');
                label.title = 'Родительская категория — отметьте вложенную';
                const inp = label.querySelector('input');
                if (inp) inp.disabled = true;
            }
            dropdown.appendChild(label);
        });
        dropdown.onchange = function() {
            state.categories = getCheckedValues(dropdown);
            updateFilterCategoryLabel();
        };
    }

    function updateFilterCategoryLabel() {
        const label = ui.filterCategoryLabel;
        if (!label) return;
        if (!state.categories.length) {
            label.textContent = 'Все категории';
        } else if (state.categories.length === 1) {
            const cat = categories.find(function(c) { return String(c.id) === String(state.categories[0]); });
            label.textContent = cat ? cat.name : state.categories[0];
        } else {
            label.textContent = 'Выбрано: ' + state.categories.length;
        }
    }

    function getCheckedValues(container) {
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(function(i) { return i.value; });
    }

    function loadStateFromStorage() {
        try {
            const saved = sessionStorage.getItem('adminFilters');
            if (saved) Object.assign(state, JSON.parse(saved));
            if (state.gender === 'male') state.gender = 'mens';
            if (state.gender === 'female') state.gender = 'womens';
            if (!Array.isArray(state.categories)) state.categories = [];
            if (!Array.isArray(state.brands)) state.brands = [];
            if (!Array.isArray(state.seasons)) state.seasons = [];
            if (!Array.isArray(state.sizes)) state.sizes = [];
            if (!Array.isArray(state.colors)) state.colors = [];
            if (!Array.isArray(state.collections)) state.collections = [];
        } catch {}
    }

    function saveStateToStorage() {
        try { sessionStorage.setItem('adminFilters', JSON.stringify(state)); } catch {}
    }

    function getSortValues() {
        const parts = state.sortOption.split('_');
        const dir = parts.pop();
        return { sortBy: parts.join('_'), sortDir: dir };
    }

    async function fetchProducts() {
        const skipProductsDom = effectiveAdminSearchScope() === 'users';
        if (!skipProductsDom) setTableStatus('Загрузка товаров…');
        try {
            const params = new URLSearchParams();
            const searchInput = document.getElementById('search-input');
            if (searchInput && searchInput.value.trim() && effectiveAdminSearchScope() !== 'users') {
                params.set('q', searchInput.value.trim());
            }
            if (state.gender) params.set('gender', state.gender);
            if (state.active) params.set('active', state.active);
            state.categories.forEach(function(slug) { params.append('category', slug); });
            state.brands.forEach(function(slug) { params.append('brand', slug); });
            state.seasons.forEach(function(s) { params.append('season', s); });
            state.sizes.forEach(function(id) { params.append('size_id', id); });
            state.colors.forEach(function(id) { params.append('color_id', id); });
            state.collections.forEach(function(id) { params.append('collection_id', id); });
            const sv = getSortValues();
            params.set('sort_by', sv.sortBy);
            params.set('sort_direction', sv.sortDir);
            params.set('limit', '100');
            params.set('offset', '0');

            const r = await apiFetch('/api/admin/products?' + params.toString());
            if (!r.ok) throw new Error('Код ' + r.status);
            products = await r.json();
            if (!skipProductsDom) renderProducts();
        } catch (err) {
            if (!skipProductsDom) {
                products = [];
                setTableStatus('Не удалось загрузить товары. Проверьте подключение к серверу.');
                notify(err.message || 'Не удалось загрузить товары', 'error');
            }
        }
    }

    function renderProducts() {
        if (!ui.productsBody || !ui.productCount) return;
        if (effectiveAdminSearchScope() === 'users') return;
        if (!products.length) {
            setTableStatus('Товары не найдены по текущим условиям.');
            return;
        }
        const genderLabels = { mens: 'Мужской', womens: 'Женский', unisex: 'Унисекс', male: 'Мужской', female: 'Женский' };
        ui.productsBody.innerHTML = products.map(function(p) {
            const genderLabel = genderLabels[p.gender] || (p.gender || '-');
            const desc = p.description || '-';
            const shortDesc = desc.length > 80 ? desc.slice(0, 80) + '…' : desc;
            const slugAttr = p.slug ? ' data-slug="' + escapeHtml(p.slug) + '"' : '';
            const genderAttr = ' data-gender="' + escapeHtml(p.gender || '') + '"';
            const isVisible = p.is_active !== false;
            const visibleTitle = isVisible ? 'Виден в каталоге' : 'Скрыт в каталоге';
            const iconSrc = isVisible ? '/img/visible.svg' : '/img/invisible.svg';
            const toggleHint = isVisible ? 'Скрыть из каталога' : 'Показать в каталоге';
            const openLabel = 'Открыть страницу товара в новой вкладке';
            return '<tr data-product-id="' + p.id + '">' +
                '<td class="cell-visible">' +
                    '<button type="button" class="catalog-visibility-hit"' +
                    ' data-action="toggle-catalog-visibility"' +
                    ' data-id="' + p.id + '"' +
                    ' data-visible="' + (isVisible ? '1' : '0') + '"' +
                    ' aria-pressed="' + (isVisible ? 'true' : 'false') + '"' +
                    ' title="' + escapeHtml(toggleHint) + '"' +
                    ' aria-label="' + escapeHtml(visibleTitle + '. ' + toggleHint + '.') + '">' +
                        '<img src="' + escapeHtml(iconSrc) + '" alt="" width="28" height="28" draggable="false" />' +
                    '</button>' +
                '</td>' +
                '<td class="cell-id">' + p.id + '</td>' +
                '<td class="cell-name-with-open">' +
                    '<div class="cell-name-block">' +
                        '<button type="button" class="admin-product-open" data-action="open-page" data-id="' + p.id + '"' + genderAttr + slugAttr +
                        ' title="' + escapeHtml(openLabel) + '" aria-label="' + escapeHtml(openLabel) + '">' +
                            '<img src="/img/link.svg" alt="" class="admin-product-open-icon" draggable="false" />' +
                        '</button>' +
                        '<span class="cell-name-title">' + escapeHtml(p.name) + '</span>' +
                        (p.art ? '<span class="cell-art">' + escapeHtml(p.art) + '</span>' : '') +
                    '</div>' +
                '</td>' +
                '<td title="' + escapeHtml(desc) + '"><div class="cell-description">' + escapeHtml(shortDesc) + '</div></td>' +
                '<td>' + escapeHtml(p.category_name || '-') + '</td>' +
                '<td>' + escapeHtml(genderLabel) + '</td>' +
                '<td>' + escapeHtml(p.brand_name || '-') + '</td>' +
                '<td class="cell-collections" title="' + escapeHtml(formatProductCollectionsCell(p)) + '">' +
                    '<div class="cell-collections-inner">' + escapeHtml(formatProductCollectionsCell(p)) + '</div>' +
                '</td>' +
                '</tr>';
        }).join('');
        if (effectiveAdminSearchScope() !== 'users') {
            ui.productCount.textContent = formatProductCount(products.length);
        }
    }

    function openProductPage(id, gender, slug) {
        const productUrl = slug
            ? 'product.html?slug=' + encodeURIComponent(slug)
            : 'product.html?id=' + encodeURIComponent(id);

        if (gender === 'unisex') {
            const existing = document.getElementById('open-page-popup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.id = 'open-page-popup';
            popup.className = 'open-page-popup-overlay';
            popup.innerHTML =
                '<div class="open-page-popup">' +
                    '<div class="open-page-popup-header">' +
                        '<span>Открыть товар</span>' +
                        '<button type="button" class="open-page-popup-close" aria-label="Закрыть">&times;</button>' +
                    '</div>' +
                    '<p class="open-page-popup-hint">Товар унисекс. Выберите раздел или страницу товара:</p>' +
                    '<div class="open-page-popup-btns">' +
                        '<a href="' + escapeHtml(productUrl) + '" target="_blank" class="admin-ui-btn admin-ui-btn--primary">Страница товара</a>' +
                        '<a href="mens.html" target="_blank" class="admin-ui-btn admin-ui-btn--secondary">Мужской раздел</a>' +
                        '<a href="womens.html" target="_blank" class="admin-ui-btn admin-ui-btn--secondary">Женский раздел</a>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(popup);
            setTimeout(function() { popup.classList.add('show'); }, 10);
            popup.querySelector('.open-page-popup-close').onclick = function() { popup.remove(); };
            popup.addEventListener('click', function(e) { if (e.target === popup) popup.remove(); });
        } else {
            window.open(productUrl, '_blank');
        }
    }

    function openUserFiltersModal() {
        if (!isSuperadminSession()) return;
        const existing = document.getElementById('admin-user-filter-modal');
        if (existing) window.kpvsDismissTopModal(existing);

        const roles = ['user', 'admin', 'superadmin'];
        const roleSet = new Set(userListFilters.roles.map(String));
        const roleLabels = { user: 'Пользователь', admin: 'Администратор', superadmin: 'Superadmin' };
        const roleHtml = roles
            .map(function(r) {
                const checked = roleSet.has(r) ? 'checked' : '';
                return (
                    '<label class="filter-option">' +
                    '<input type="checkbox" name="user_filter_role" value="' +
                    escapeHtml(r) +
                    '" ' +
                    checked +
                    ' />' +
                    '<span>' +
                    escapeHtml(roleLabels[r] || r) +
                    '</span></label>'
                );
            })
            .join('');

        const act = String(userListFilters.active || '');
        const activeHtml = [
            { value: '', label: 'Все' },
            { value: 'active', label: 'Только активные' },
            { value: 'inactive', label: 'Только отключённые' }
        ]
            .map(function(a) {
                const c = act === a.value ? 'checked' : '';
                return (
                    '<label class="filter-option">' +
                    '<input type="radio" name="user_filter_active" value="' +
                    escapeHtml(a.value) +
                    '" ' +
                    c +
                    '><span>' +
                    escapeHtml(a.label) +
                    '</span></label>'
                );
            })
            .join('');

        const group = function(key, label, body) {
            return (
                '<div class="filter-group" data-group="' +
                escapeHtml(key) +
                '">' +
                '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                '<span class="filter-group-label">' +
                escapeHtml(label) +
                '</span>' +
                '<span class="filter-group-right">' +
                '<span class="filter-group-count" aria-hidden="true"></span>' +
                '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                '</span>' +
                '</button>' +
                '<div class="filter-group-body" hidden><div class="filter-options">' +
                body +
                '</div></div>' +
                '</div>'
            );
        };

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'admin-user-filter-modal';
        modal.innerHTML =
            '<div class="modal-content filter-modal-content">' +
            '<div class="modal-header">' +
            '<h2>Фильтры</h2>' +
            '<button class="modal-close" type="button" aria-label="Закрыть">&times;</button>' +
            '</div>' +
            '<div class="modal-body">' +
            group('user_role', 'Роль', roleHtml) +
            group('user_active', 'Статус аккаунта', activeHtml) +
            '</div>' +
            '<div class="modal-footer catalog-filter-modal-footer">' +
            '<button type="button" class="admin-ui-btn admin-ui-btn--danger catalog-filter-clear-btn">Сбросить</button>' +
            '<button type="button" class="admin-ui-btn admin-ui-btn--primary catalog-filter-apply-btn">Применить</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(function() {
            modal.classList.add('show');
        }, 10);

        function close() {
            window.kpvsDismissTopModal(modal);
        }
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) close();
        });

        function setGroupOpen(groupEl, open) {
            const body = groupEl.querySelector('.filter-group-body');
            const btn = groupEl.querySelector('.filter-group-toggle');
            if (!body || !btn) return;
            groupEl.classList.toggle('is-open', open);
            body.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function userFilterGroupCount(groupEl) {
            const g = groupEl.dataset ? groupEl.dataset.group : '';
            if (g === 'user_role') {
                return groupEl.querySelectorAll('input[name="user_filter_role"]:checked').length;
            }
            if (g === 'user_active') {
                const sel = groupEl.querySelector('input[name="user_filter_active"]:checked');
                return sel && String(sel.value || '').trim() !== '' ? 1 : 0;
            }
            return 0;
        }

        function updateGroupCount(groupEl) {
            const countEl = groupEl.querySelector('.filter-group-count');
            if (!countEl) return;
            var n = userFilterGroupCount(groupEl);
            if (n > 0) {
                countEl.textContent = String(n);
                countEl.style.display = 'inline-flex';
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
            }
        }

        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            modalBody.addEventListener('change', function(e) {
                const t = e.target;
                if (!t || (t.type !== 'checkbox' && t.type !== 'radio')) return;
                const groupEl = t.closest('.filter-group');
                if (groupEl) updateGroupCount(groupEl);
            });
        }

        modal.querySelectorAll('.filter-group-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const groupEl = btn.closest('.filter-group');
                if (!groupEl) return;
                const willOpen = !groupEl.classList.contains('is-open');
                modal.querySelectorAll('.filter-group.is-open').forEach(function(openGroup) {
                    if (openGroup !== groupEl) setGroupOpen(openGroup, false);
                });
                setGroupOpen(groupEl, willOpen);
            });
        });

        modal.querySelectorAll('.filter-group').forEach(function(groupEl) {
            setGroupOpen(groupEl, false);
            updateGroupCount(groupEl);
        });

        const applyBtn = modal.querySelector('.catalog-filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                userListFilters.roles = Array.from(modal.querySelectorAll('input[name="user_filter_role"]:checked')).map(function(i) {
                    return String(i.value);
                });
                const actSel = modal.querySelector('input[name="user_filter_active"]:checked');
                userListFilters.active = actSel ? String(actSel.value || '') : '';
                saveUserListFiltersToStorage();
                close();
                fetchUsers().catch(function() {});
            });
        }

        const clearBtn = modal.querySelector('.catalog-filter-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                userListFilters.roles = [];
                userListFilters.active = '';
                saveUserListFiltersToStorage();
                close();
                fetchUsers().catch(function() {});
            });
        }
    }

    function openFiltersModal() {
        if (effectiveAdminSearchScope() === 'users') {
            openUserFiltersModal();
            return;
        }
        const existing = document.getElementById('admin-filter-modal');
        if (existing) window.kpvsDismissTopModal(existing);

        pruneStateCategoryParents();
        const catParentIds = categoryParentIdsWithChildren();
        const catHtml = categories.length
            ? categories.map(function(c) {
                const value = c.slug || String(c.id);
                const checked = state.categories.indexOf(value) !== -1 ? 'checked' : '';
                const padding = c.depth ? 'style="padding-left:' + (12 + c.depth * 12) + 'px;"' : '';
                const isParent = catParentIds.has(Number(c.id));
                const dis = isParent ? 'disabled ' : '';
                const lblClass = 'filter-option' + (isParent ? ' filter-option--disabled' : '');
                const titleAttr = isParent ? ' title="Родительская категория — выберите вложенную"' : '';
                return (
                    '<label class="' +
                    lblClass +
                    '"' +
                    titleAttr +
                    '><input type="checkbox" name="category" value="' +
                    escapeHtml(value) +
                    '" ' +
                    dis +
                    checked +
                    '><span ' +
                    padding +
                    '>' +
                    escapeHtml(c.name) +
                    '</span></label>'
                );
            }).join('')
            : '<p class="filter-empty-hint">Категории не загружены</p>';

        const brandHtml = brands.length
            ? brands.map(function(b) {
                const val = b.slug || String(b.id);
                const checked = state.brands.indexOf(val) !== -1 ? 'checked' : '';
                return '<label class="filter-option"><input type="checkbox" name="brand" value="' + escapeHtml(val) + '" ' + checked + '><span>' + escapeHtml(b.name) + '</span></label>';
            }).join('')
            : '<p class="filter-empty-hint">Бренды не загружены</p>';

        const seasons = ['зима', 'лето', 'демисезон', 'всесезонный'];
        const seasonHtml = seasons.map(function(s) {
            const checked = state.seasons.indexOf(s) !== -1 ? 'checked' : '';
            const label = s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
            return '<label class="filter-option"><input type="checkbox" name="season" value="' + escapeHtml(s) + '" ' + checked + '><span>' + escapeHtml(label) + '</span></label>';
        }).join('');

        const sizeFilterBody =
            '<div class="filter-size-cascade-wrap" id="admin-filter-size-cascade"></div>';

        const sizeHtml = sizeFilterBody;

        const colorHtml = availableColors.length
            ? availableColors.map(function(c) {
                const val = String(c.id);
                const checked = state.colors.indexOf(val) !== -1 ? 'checked' : '';
                return '<label class="filter-option"><input type="checkbox" name="color_id" value="' + escapeHtml(val) + '" ' + checked + '><span>' + escapeHtml(c.name) + '</span></label>';
            }).join('')
            : '<p class="filter-empty-hint">Цвета не загружены</p>';

        const collectionHtml = availableCollections.length
            ? availableCollections.map(function(col) {
                const val = String(col.id);
                const checked = state.collections.indexOf(val) !== -1 ? 'checked' : '';
                const ico = col.icon != null && String(col.icon).trim() !== '' ? String(col.icon).trim() + '\u00a0' : '';
                return '<label class="filter-option"><input type="checkbox" name="collection_id" value="' + escapeHtml(val) + '" ' + checked + '><span>' + escapeHtml(ico) + escapeHtml(col.name || col.slug || val) + '</span></label>';
            }).join('')
            : '<p class="filter-empty-hint">Подборки не загружены</p>';

        const genderOptions = [
            { value: '', label: 'Любой' },
            { value: 'mens', label: 'Мужской' },
            { value: 'womens', label: 'Женский' },
            { value: 'unisex', label: 'Унисекс' }
        ];
        const genderHtml = genderOptions.map(function(g) {
            const checked = (state.gender || '') === g.value ? 'checked' : '';
            return '<label class="filter-option"><input type="radio" name="gender" value="' + escapeHtml(g.value) + '" ' + checked + '><span>' + escapeHtml(g.label) + '</span></label>';
        }).join('');

        const activeOptions = [
            { value: '', label: 'Все' },
            { value: 'active', label: 'Видимые' },
            { value: 'inactive', label: 'Скрытые' }
        ];
        const activeHtml = activeOptions.map(function(a) {
            const checked = (state.active || '') === a.value ? 'checked' : '';
            return '<label class="filter-option"><input type="radio" name="active" value="' + escapeHtml(a.value) + '" ' + checked + '><span>' + escapeHtml(a.label) + '</span></label>';
        }).join('');

        const group = function(key, label, body) {
            return '<div class="filter-group" data-group="' + escapeHtml(key) + '">' +
                '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                    '<span class="filter-group-label">' + escapeHtml(label) + '</span>' +
                    '<span class="filter-group-right">' +
                        '<span class="filter-group-count" aria-hidden="true"></span>' +
                        '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                    '</span>' +
                '</button>' +
                '<div class="filter-group-body" hidden><div class="filter-options">' + body + '</div></div>' +
            '</div>';
        };

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'admin-filter-modal';
        modal.innerHTML =
            '<div class="modal-content filter-modal-content">' +
                '<div class="modal-header">' +
                    '<h2>Фильтры</h2>' +
                    '<button class="modal-close" type="button" aria-label="Закрыть">&times;</button>' +
                '</div>' +
                '<div class="modal-body">' +
                    group('gender', 'Пол', genderHtml) +
                    group('active', 'Видимость', activeHtml) +
                    group('category', 'Категория', catHtml) +
                    group('brand', 'Бренд', brandHtml) +
                    group('season', 'Сезон', seasonHtml) +
                    group('collection', 'Подборки', collectionHtml) +
                    group('size', 'Размер', sizeHtml) +
                    group('color', 'Цвет', colorHtml) +
                '</div>' +
                '<div class="modal-footer catalog-filter-modal-footer">' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--danger catalog-filter-clear-btn">Сбросить</button>' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--primary catalog-filter-apply-btn">Применить</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(function() { modal.classList.add('show'); }, 10);

        let adminFilterSizeCascadeHandle = null;

        function close() { window.kpvsDismissTopModal(modal); }
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        modal.addEventListener('click', function(e) { if (e.target === modal) close(); });

        function setGroupOpen(groupEl, open) {
            const body = groupEl.querySelector('.filter-group-body');
            const btn = groupEl.querySelector('.filter-group-toggle');
            if (!body || !btn) return;
            groupEl.classList.toggle('is-open', open);
            body.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function countSelectionsInAdminFilterGroup(groupEl) {
            const g = groupEl.dataset ? groupEl.dataset.group : '';
            if (g === 'gender') {
                const sel = groupEl.querySelector('input[name="gender"]:checked');
                return sel && String(sel.value || '').trim() !== '' ? 1 : 0;
            }
            if (g === 'active') {
                const sel = groupEl.querySelector('input[name="active"]:checked');
                return sel && String(sel.value || '').trim() !== '' ? 1 : 0;
            }
            if (g === 'size' && adminFilterSizeCascadeHandle && typeof adminFilterSizeCascadeHandle.getCheckedIds === 'function') {
                return adminFilterSizeCascadeHandle.getCheckedIds().length;
            }
            return groupEl.querySelectorAll('input[type="checkbox"]:checked').length;
        }

        function updateGroupCount(groupEl) {
            const countEl = groupEl.querySelector('.filter-group-count');
            if (!countEl) return;
            var checked = countSelectionsInAdminFilterGroup(groupEl);
            if (checked > 0) {
                countEl.textContent = String(checked);
                countEl.style.display = 'inline-flex';
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
            }
        }

        const sizeCascadeEl = modal.querySelector('#admin-filter-size-cascade');
        const sizeGroupEl = modal.querySelector('.filter-group[data-group="size"]');
        adminFilterSizeCascadeHandle = null;
        if (sizeCascadeEl && window.KpvsSizeCascade) {
            adminFilterSizeCascadeHandle = window.KpvsSizeCascade.mount(sizeCascadeEl, {
                categories: categories,
                loadSizes: function(id) {
                    return apiFetch('/api/sizes?category_id=' + encodeURIComponent(id)).then(function(r) {
                        return r.ok ? r.json() : [];
                    });
                },
                mode: 'multi',
                inputName: 'size_id',
                checkedIds: state.sizes,
                onChange: function() {
                    if (sizeGroupEl) updateGroupCount(sizeGroupEl);
                }
            });
        }

        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            modalBody.addEventListener('change', function(e) {
                const t = e.target;
                if (!t) return;
                if (t.type !== 'checkbox' && t.type !== 'radio') return;
                const groupEl = t.closest('.filter-group');
                if (groupEl) updateGroupCount(groupEl);
            });
        }

        modal.querySelectorAll('.filter-group-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const groupEl = btn.closest('.filter-group');
                if (!groupEl) return;
                const willOpen = !groupEl.classList.contains('is-open');
                modal.querySelectorAll('.filter-group.is-open').forEach(function(openGroup) {
                    if (openGroup !== groupEl) setGroupOpen(openGroup, false);
                });
                setGroupOpen(groupEl, willOpen);
            });
        });

        modal.querySelectorAll('.filter-group').forEach(function(groupEl) {
            setGroupOpen(groupEl, false);
            updateGroupCount(groupEl);
        });

        const applyBtn = modal.querySelector('.catalog-filter-apply-btn');
        if (applyBtn) applyBtn.addEventListener('click', function() {
            const genderSel = modal.querySelector('input[name="gender"]:checked');
            const activeSel = modal.querySelector('input[name="active"]:checked');
            state.gender = genderSel ? genderSel.value : '';
            state.active = activeSel ? activeSel.value : '';
            state.categories = Array.from(modal.querySelectorAll('input[name="category"]:checked')).map(function(i) { return i.value; });
            state.brands = Array.from(modal.querySelectorAll('input[name="brand"]:checked')).map(function(i) { return i.value; });
            state.seasons = Array.from(modal.querySelectorAll('input[name="season"]:checked')).map(function(i) { return i.value; });
            state.sizes =
                adminFilterSizeCascadeHandle && typeof adminFilterSizeCascadeHandle.getCheckedIds === 'function'
                    ? adminFilterSizeCascadeHandle.getCheckedIds()
                    : Array.from(modal.querySelectorAll('input[name="size_id"]:checked')).map(function(i) { return i.value; });
            state.colors = Array.from(modal.querySelectorAll('input[name="color_id"]:checked')).map(function(i) { return i.value; });
            state.collections = Array.from(modal.querySelectorAll('input[name="collection_id"]:checked')).map(function(i) { return i.value; });
            saveStateToStorage();
            close();
            fetchProducts();
        });

        const clearBtn = modal.querySelector('.catalog-filter-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', function() {
            state.gender = '';
            state.active = '';
            state.categories = [];
            state.brands = [];
            state.seasons = [];
            state.sizes = [];
            state.colors = [];
            state.collections = [];
            saveStateToStorage();
            close();
            fetchProducts();
        });
    }

    function closeFiltersModal() {
        closeModal(document.getElementById('filter-modal'));
    }

    function applyFilters() {
        const genderSel = document.getElementById('filter-gender-modal');
        const brandSel = document.getElementById('filter-brand-modal');
        const seasonSel = document.getElementById('filter-season-modal');
        state.gender = genderSel ? genderSel.value : '';
        state.brands = brandSel && brandSel.value ? [brandSel.value] : [];
        state.seasons = seasonSel && seasonSel.value ? [seasonSel.value] : [];
        state.categories = ui.filterCategoryDropdown ? getCheckedValues(ui.filterCategoryDropdown) : [];
        saveStateToStorage();
        closeFiltersModal();
        fetchProducts();
    }

    function clearFilters() {
        state.gender = '';
        state.brands = [];
        state.seasons = [];
        state.sizes = [];
        state.colors = [];
        state.collections = [];
        state.active = '';
        state.categories = [];
        saveStateToStorage();
        closeFiltersModal();
        fetchProducts();
    }

    function cancelVisibilityConfirm() {
        visibilityConfirmPending = null;
        const okBtn = document.getElementById('visibility-confirm-ok');
        if (okBtn) okBtn.disabled = false;
        closeModal(ui.visibilityConfirmModal);
    }

    function requestToggleProductCatalogVisibility(id, triggerBtn) {
        const p = products.find(function(x) { return Number(x.id) === Number(id); });
        if (!p) {
            notify('Товар не найден', 'error');
            return;
        }
        const currentlyVisible = p.is_active !== false;
        const nextVisible = !currentlyVisible;
        const title = nextVisible ? 'Показать в каталоге?' : 'Скрыть из каталога?';
        const message = nextVisible
            ? 'Товар станет виден покупателям в каталоге и в поиске. Продолжить?'
            : 'Товар будет скрыт из каталога и поиска (страница по прямой ссылке может открываться). Продолжить?';

        visibilityConfirmPending = { kind: 'product-visibility', id: id, nextVisible: nextVisible, triggerBtn: triggerBtn };
        const titleEl = document.getElementById('visibility-confirm-title');
        const msgEl = document.getElementById('visibility-confirm-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        const okBtn = document.getElementById('visibility-confirm-ok');
        if (okBtn) okBtn.disabled = false;
        openModal(ui.visibilityConfirmModal);
    }

    async function applyVisibilityConfirmFromConfirm() {
        const pending = visibilityConfirmPending;
        if (!pending) return;
        visibilityConfirmPending = null;

        const okBtn = document.getElementById('visibility-confirm-ok');
        if (okBtn) okBtn.disabled = true;

        if (pending.kind === 'delete-user') {
            closeModal(ui.visibilityConfirmModal);
            try {
                await deleteUserUi(pending.id);
            } finally {
                if (okBtn) okBtn.disabled = false;
            }
            return;
        }

        const id = pending.id;
        const nextVisible = pending.nextVisible;
        const triggerBtn = pending.triggerBtn;

        closeModal(ui.visibilityConfirmModal);

        const p = products.find(function(x) { return Number(x.id) === Number(id); });
        if (!p) {
            notify('Товар не найден', 'error');
            if (okBtn) okBtn.disabled = false;
            return;
        }

        if (triggerBtn && triggerBtn.isConnected) triggerBtn.disabled = true;
        try {
            const r = await apiFetch('/api/admin/productvisibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: id, is_active: nextVisible })
            });
            if (!r.ok) {
                let msg = 'Код ' + r.status;
                const ct = (r.headers.get('Content-Type') || '').toLowerCase();
                if (ct.includes('application/json')) {
                    try {
                        const errBody = await r.json();
                        if (errBody.error) msg = errBody.error;
                    } catch (_) {}
                } else if (r.status === 404) {
                    msg = 'Запрос не дошёл до API (404). Откройте админку с того же хоста и порта, что и сервер (npm start), например http://localhost:3000/admin.html';
                }
                throw new Error(msg);
            }
            const data = await r.json();
            const active = data.is_active !== false;
            p.is_active = active;
            if (editingProductId === id) {
                const activeChk = document.getElementById('product-active');
                if (activeChk) activeChk.checked = active;
            }
            renderProducts();
            notify(active ? 'Товар показан в каталоге' : 'Товар скрыт из каталога', 'success');
        } catch (err) {
            notify(err.message || 'Не удалось изменить видимость в каталоге', 'error');
        } finally {
            if (triggerBtn && triggerBtn.isConnected) triggerBtn.disabled = false;
            if (okBtn) okBtn.disabled = false;
        }
    }

    async function doDeleteProduct(id) {
        try {
            const r = await apiFetch('/api/admin/products/' + id, { method: 'DELETE' });
            if (!r.ok) throw new Error('Код ' + r.status);
            await fetchProducts();
            notify('Товар удалён', 'success');
        } catch (err) {
            notify(err.message || 'Не удалось удалить товар', 'error');
        }
    }

    function openModal(modal) {
        if (!modal) return;
        modal._returnFocus = document.activeElement;
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        modal.style.display = 'flex';
        setTimeout(function() { modal.classList.add('show'); }, 10);
        setTimeout(function() {
            if (!modal.classList.contains('show')) return;
            const focusable = modal.querySelector(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
            );
            if (focusable) focusable.focus();
        }, 120);
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(function() {
            if (!modal.classList.contains('show')) {
                modal.style.display = 'none';
                if (window.KpvsModalOverlay) window.KpvsModalOverlay.unlock();
                const rf = modal._returnFocus;
                if (rf && document.contains(rf) && typeof rf.focus === 'function') {
                    try { rf.focus(); } catch {}
                }
            }
        }, 300);
    }

    function setupTableDelegation() {
        const container = document.querySelector('.admin-table-container');
        if (!container || container._delegated) return;
        container._delegated = true;
        container.addEventListener('click', function(e) {
            const row = e.target.closest('tr[data-product-id]');
            if (row && !e.target.closest('[data-action]')) {
                const id = parseInt(row.dataset.productId, 10);
                if (!isNaN(id)) {
                    const p = products.find(function(x) { return Number(x.id) === Number(id); });
                    if (p) openProductModal(p);
                    else notify('Товар не найден', 'error');
                    return;
                }
            }
            
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = parseInt(btn.dataset.id, 10);
            if (isNaN(id)) return;
            e.preventDefault();
            e.stopPropagation();
            if (action === 'open-page') {
                openProductPage(id, btn.dataset.gender || '', btn.dataset.slug || '');
                return;
            }
            if (action === 'toggle-catalog-visibility') {
                requestToggleProductCatalogVisibility(id, btn);
                return;
            }
        });
    }

    function setupResizableColumns() {
        const tables = Array.from(document.querySelectorAll('table.admin-table'));
        if (!tables.length) return;

        function setupFor(table, minWidths) {
            if (!table) return;
            table.querySelectorAll('thead th .admin-col-resizer').forEach(function (el) {
                el.remove();
            });
            const cols = Array.from(table.querySelectorAll('colgroup col'));
            const ths = Array.from(table.querySelectorAll('thead th'));
            if (!cols.length || ths.length !== cols.length) return;

            function readColWidths() {
                return cols.map(function (c, j) {
                    let w = parseInt(c.style.width, 10);
                    if (isNaN(w) || w <= 0) {
                        w = Math.round(ths[j].getBoundingClientRect().width);
                    }
                    return w;
                });
            }

            for (let i = 0; i < ths.length; i++) {
                const w = Math.round(ths[i].getBoundingClientRect().width);
                if (!cols[i].style.width) cols[i].style.width = Math.max(minWidths[i] || 80, w) + 'px';
            }

            ths.forEach(function(th, i) {
                if (i === ths.length - 1) return;
                const handle = document.createElement('span');
                handle.className = 'admin-col-resizer';
                th.appendChild(handle);
                handle.addEventListener('pointerdown', function(e) {
                    e.preventDefault();
                    try { handle.setPointerCapture(e.pointerId); } catch {}
                    const startX = e.clientX;
                    const startPair = readColWidths();
                    const mi = minWidths[i] || 80;
                    const mi1 = minWidths[i + 1] || 80;
                    const S = startPair[i] + startPair[i + 1];
                    const onMove = function(ev) {
                        const delta = Math.round(ev.clientX - startX);
                        const rawW1 = startPair[i] + delta;
                        const w1 = Math.max(mi, Math.min(rawW1, S - mi1));
                        const w2 = S - w1;
                        cols[i].style.width = w1 + 'px';
                        cols[i + 1].style.width = w2 + 'px';
                    };
                    const onUp = function() {
                        document.removeEventListener('pointermove', onMove);
                        document.removeEventListener('pointerup', onUp);
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                });
            });
            table._resizable = true;
        }

        tables.forEach(function(table) {
            if (table.classList.contains('admin-users-table')) {
                setupFor(table, [48, 52, 120, 72, 112, 160, 360]);
            } else {
                // products table (default)
                setupFor(table, [56, 52, 240, 200, 128, 84, 112]);
            }
        });
    }

    function renderImagesList() {
        const list = ui.productImagesList;
        if (!list) return;
        if (!productImages.length) { list.innerHTML = ''; return; }
        list.innerHTML = productImages.map(function(img, i) {
            return '<div class="admin-image-item" data-index="' + i + '">' +
                '<div class="admin-image-thumb"><img src="' + escapeHtml(img.url) + '" alt="img ' + (i + 1) + '" onerror="this.style.opacity=0.3"></div>' +
                '<div class="admin-image-meta">' +
                    '<strong>Фото ' + (i + 1) + '</strong>' +
                    '<code title="' + escapeHtml(img.url) + '">' + escapeHtml(img.url) + '</code>' +
                '</div>' +
                '<div class="admin-image-actions">' +
                    '<label class="radio-label">' +
                        '<input type="radio" name="primary-image" value="' + i + '" ' + (img.is_primary ? 'checked' : '') + ' />' +
                        '<span>Главная</span>' +
                    '</label>' +
                    '<button type="button" class="btn-img-remove" data-action="remove-image" data-index="' + i + '">Удалить</button>' +
                '</div>' +
            '</div>';
        }).join('');

        list.querySelectorAll('input[type="radio"][name="primary-image"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                const idx = Number(radio.value);
                productImages = productImages.map(function(img, i) {
                    return Object.assign({}, img, { is_primary: i === idx });
                });
                renderImagesList();
            });
        });
        list.querySelectorAll('[data-action="remove-image"]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const idx = Number(btn.dataset.index);
                productImages.splice(idx, 1);
                if (productImages.length && !productImages.some(function(i) { return i.is_primary; })) {
                    productImages[0].is_primary = true;
                }
                renderImagesList();
            });
        });
    }

    function renderMaterialsList() {
        const container = ui.productMaterialsList;
        if (!container) return;
        container.innerHTML = '';
        productMaterials.forEach(function(mat, i) {
            const div = document.createElement('div');
            div.className = 'admin-material-row';
            div.innerHTML =
                '<input type="text" class="mat-name" placeholder="Материал (напр. Хлопок)" value="' + escapeHtml(mat.name || '') + '" />' +
                '<div class="mat-percent-wrap">' +
                    '<input type="number" class="mat-percent" placeholder="" value="' + escapeHtml(String(mat.percent || '')) + '" min="1" max="100" step="1" />' +
                    '<span class="mat-percent-sign">%</span>' +
                '</div>' +
            '<button type="button" class="btn-mat-remove" data-index="' + i + '" title="Удалить" aria-label="Удалить"><img src="/img/disagree.svg" alt="" class="admin-remove-row-icon" decoding="async"></button>';
            container.appendChild(div);
        });

        container.querySelectorAll('.btn-mat-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                productMaterials.splice(Number(btn.dataset.index), 1);
                renderMaterialsList();
            });
        });
    }

    function collectMaterials() {
        const container = ui.productMaterialsList;
        productMaterials = [];
        if (!container) return null;
        const rows = container.querySelectorAll('.admin-material-row');
        const pending = [];
        for (var i = 0; i < rows.length; i++) {
            const row = rows[i];
            const nameEl = row.querySelector('.mat-name');
            const pctEl = row.querySelector('.mat-percent');
            const name = nameEl ? nameEl.value.trim() : '';
            const raw = pctEl ? String(pctEl.value).trim().replace(/\s/g, '') : '';
            if (!name && !raw) continue;
            if (name && raw === '') {
                return 'Укажите процент для материала «' + name + '».';
            }
            if (!name && raw !== '') {
                return 'У каждой строки с процентом должно быть название материала.';
            }
            if (!/^\d+$/.test(raw)) {
                return 'Процент в составе должен быть целым числом от 1 до 100.';
            }
            const pct = parseInt(raw, 10);
            if (pct < 1 || pct > 100) {
                return 'Процент в составе должен быть от 1 до 100.';
            }
            pending.push({ name: name, percent: pct });
        }
        productMaterials = pending;
        return null;
    }

    function materialsToString(mats) {
        if (!Array.isArray(mats) || !mats.length) return '';
        return mats.map(function(m) {
            return m.name + ' ' + m.percent + '%';
        }).join(', ');
    }

    function parseMaterialsString(str) {
        if (!str) return [];
        return str.split(',').map(function(part) {
            part = part.trim();
            const m = part.match(/^(.+?)\s+(\d+)%?$/);
            if (m) return { name: m[1].trim(), percent: parseInt(m[2], 10) };
            return { name: part, percent: 0 };
        }).filter(function(m) { return m.name; });
    }

    function normalizeGenderForForm(raw) {
        if (!raw) return '';
        if (raw === 'male') return 'mens';
        if (raw === 'female') return 'womens';
        return raw;
    }

    function snapshotMaterialsFromDom() {
        const container = ui.productMaterialsList;
        if (!container) return [];
        const out = [];
        container.querySelectorAll('.admin-material-row').forEach(function(row) {
            const nameEl = row.querySelector('.mat-name');
            const pctEl = row.querySelector('.mat-percent');
            const name = nameEl ? nameEl.value.trim() : '';
            const raw = pctEl ? String(pctEl.value).trim().replace(/\s/g, '') : '';
            const pct = raw === '' ? NaN : parseInt(raw, 10);
            out.push({ name: name, percent: Number.isFinite(pct) ? pct : 0 });
        });
        return out;
    }

    function draftStorageKey() {
        return PRODUCT_DRAFT_STORAGE_PREFIX + (editingProductId != null ? String(editingProductId) : 'new');
    }

    function getProductModalStateSnapshotRaw() {
        collectVariants();
        collectAttributes();
        productMaterials = snapshotMaterialsFromDom();
        const g = function(id) { return document.getElementById(id); };
        return {
            editingProductId: editingProductId,
            name: g('product-name') ? g('product-name').value : '',
            art: g('product-art') ? g('product-art').value : '',
            slug: g('product-slug') ? g('product-slug').value : '',
            description: g('product-description') ? g('product-description').value : '',
            season: g('product-season') ? g('product-season').value : '',
            gender: g('product-gender') ? g('product-gender').value : '',
            category_id: g('product-category') ? g('product-category').value : '',
            brand_id: g('product-brand') ? g('product-brand').value : '',
            is_active: g('product-active') ? g('product-active').checked : true,
            images: productImages.slice(),
            variants: productVariants.slice(),
            attributes: productAttributes.slice(),
            materials: productMaterials.slice(),
            collectionIds: productCollections.map(function(t) { return t.id; }).slice()
        };
    }

    function normalizeVariantSnapshotForCompare(v) {
        const art = v.art != null ? String(v.art).trim().toUpperCase() : '';
        return {
            size_id: v.size_id != null && Number.isFinite(Number(v.size_id)) ? Number(v.size_id) : null,
            color_id: v.color_id != null && Number.isFinite(Number(v.color_id)) ? Number(v.color_id) : null,
            art: art ? art : null,
            is_active: v.is_active !== false
        };
    }

    /** Стабильная строка: порядок вариантов/атрибутов/картинок не влияет; совпадает с тем же состоянием после открытия без правок. */
    function canonicalProductModalSnapshotJson(snap) {
        if (!snap || typeof snap !== 'object') return '';
        const idToValue = sizeIdToValueMapForVariantSort();
        const vars = (Array.isArray(snap.variants) ? snap.variants : []).map(normalizeVariantSnapshotForCompare);
        vars.sort(function(a, b) {
            return compareVariantsSizeColorArt(a, b, idToValue);
        });
        const attrs = (Array.isArray(snap.attributes) ? snap.attributes : []).map(function(attr) {
            return {
                name: attr.name != null ? String(attr.name).trim() : '',
                value: attr.value != null ? String(attr.value).trim() : '',
                sort_order:
                    attr.sort_order != null && Number.isFinite(Number(attr.sort_order)) ? Number(attr.sort_order) : 0
            };
        });
        attrs.sort(function(a, b) {
            const c = String(a.name).localeCompare(String(b.name), 'ru');
            return c !== 0 ? c : String(a.value).localeCompare(String(b.value), 'ru');
        });
        const idSrc =
            Array.isArray(snap.collectionIds) && snap.collectionIds.length
                ? snap.collectionIds
                : Array.isArray(snap.tagIds)
                  ? snap.tagIds
                  : [];
        const collectionIds = idSrc
            .map(function(x) {
                return Number(x);
            })
            .filter(function(x) {
                return Number.isFinite(x);
            })
            .sort(function(a, b) {
                return a - b;
            });
        const images = (Array.isArray(snap.images) ? snap.images : [])
            .map(function(im) {
                return {
                    url: im.url != null ? String(im.url).trim() : '',
                    alt_text: im.alt_text != null ? String(im.alt_text) : '',
                    is_primary: Boolean(im.is_primary),
                    sort_order:
                        im.sort_order != null && Number.isFinite(Number(im.sort_order)) ? Number(im.sort_order) : 0
                };
            })
            .sort(function(a, b) {
                if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
                return String(a.url).localeCompare(String(b.url), 'ru');
            });
        const materials = (Array.isArray(snap.materials) ? snap.materials : [])
            .map(function(m) {
                const pct = m.percent != null && Number.isFinite(Number(m.percent)) ? Number(m.percent) : 0;
                return {
                    name: m.name != null ? String(m.name).trim() : '',
                    percent: pct
                };
            })
            .filter(function(m) {
                return m.name || m.percent > 0;
            })
            .sort(function(a, b) {
                return String(a.name).localeCompare(String(b.name), 'ru');
            });
        const rawEid = snap.editingProductId;
        let editingNum = null;
        if (rawEid != null && String(rawEid).trim() !== '' && String(rawEid).trim() !== 'new') {
            const n = Number(rawEid);
            if (Number.isFinite(n) && n > 0) editingNum = n;
        }
        const gRaw = String(snap.gender != null ? snap.gender : '');
        const genderCanon = normalizeGenderForForm(gRaw) || gRaw;
        const out = {
            editingProductId: editingNum,
            name: snap.name != null ? String(snap.name).trim() : '',
            art: snap.art != null ? String(snap.art).trim().toUpperCase() : '',
            slug: snap.slug != null ? String(snap.slug).trim() : '',
            description: snap.description != null ? String(snap.description).trim() : '',
            season: snap.season != null ? String(snap.season).trim() : '',
            gender: genderCanon,
            category_id: String(snap.category_id != null ? snap.category_id : '').trim(),
            brand_id: String(snap.brand_id != null ? snap.brand_id : '').trim(),
            is_active: snap.is_active !== false,
            images: images,
            variants: vars,
            attributes: attrs,
            materials: materials,
            collectionIds: collectionIds
        };
        try {
            return JSON.stringify(out);
        } catch {
            return '';
        }
    }

    function serializeProductModalStateForCompare() {
        return canonicalProductModalSnapshotJson(getProductModalStateSnapshotRaw());
    }

    function captureProductModalBaseline() {
        try {
            productModalBaselineSerialized = serializeProductModalStateForCompare();
        } catch {
            productModalBaselineSerialized = '';
        }
        productModalBaselineReady = true;
    }

    function isProductModalDirty() {
        if (!productModalBaselineReady) return false;
        try {
            return serializeProductModalStateForCompare() !== productModalBaselineSerialized;
        } catch {
            return true;
        }
    }

    function clearProductDraftStorage() {
        try { localStorage.removeItem(draftStorageKey()); } catch {}
    }

    function saveProductDraftToStorage() {
        try {
            localStorage.setItem(draftStorageKey(), serializeProductModalStateForCompare());
        } catch (err) {
            notify('Не удалось сохранить черновик в браузере', 'error');
        }
    }

    async function applyDraftPayload(d) {
        if (!d || typeof d !== 'object') return;
        const curId = editingProductId != null ? Number(editingProductId) : null;
        const draftId = d.editingProductId != null && d.editingProductId !== '' ? Number(d.editingProductId) : null;
        if (curId !== draftId) return;

        const setVal = function(id, val) {
            const el = document.getElementById(id);
            if (el) el.value = val != null ? val : '';
        };
        setVal('product-name', d.name);
        setVal('product-art', d.art);
        setVal('product-slug', d.slug);
        setVal('product-description', d.description);
        setVal('product-season', d.season);
        setVal('product-gender', normalizeGenderForForm(d.gender) || d.gender || '');

        const catSel = document.getElementById('product-category');
        const brandSel = document.getElementById('product-brand');
        if (catSel) populateCategorySelect(catSel, d.category_id);
        if (catSel && d.category_id != null && categoryParentIdsWithChildren().has(Number(d.category_id))) {
            notify('У товара указана родительская категория — выберите подкатегорию.', 'warning');
            catSel.value = '';
        }
        if (brandSel) populateBrandSelect(brandSel, d.brand_id);

        const activeChk = document.getElementById('product-active');
        if (activeChk) activeChk.checked = d.is_active !== false;

        productImages = Array.isArray(d.images) ? d.images.slice() : [];
        productVariants = Array.isArray(d.variants) ? d.variants.slice() : [];
        productAttributes = Array.isArray(d.attributes) ? d.attributes.slice() : [];
        productMaterials = Array.isArray(d.materials) ? d.materials.slice() : [];

        const ids = Array.isArray(d.collectionIds) ? d.collectionIds.map(Number) : (Array.isArray(d.tagIds) ? d.tagIds.map(Number) : []);
        productCollections = availableCollections.filter(function(t) { return ids.indexOf(Number(t.id)) !== -1; });

        await refreshProductCategorySizes();
        renderImagesList();
        await renderVariantsList();
        renderAttributesList();
        renderMaterialsList();
        renderCollectionsDropdown();
        updateSelectedCollections();
    }

    function forceCloseProductModal() {
        const exitDraft = document.getElementById('product-exit-draft-modal');
        if (exitDraft && exitDraft.classList.contains('show')) closeModal(exitDraft);
        const modal = document.getElementById('product-modal');
        if (modal) closeModal(modal);
        editingProductId = null;
        productModalBaselineSerialized = null;
        productModalBaselineReady = false;
        productCategorySizesList = null;
        productCategorySizesCatId = '';
    }

    function requestCloseProductModal() {
        if (!isProductModalDirty()) {
            forceCloseProductModal();
            return;
        }
        const exitDraft = document.getElementById('product-exit-draft-modal');
        if (exitDraft) openModal(exitDraft);
    }

    function renderVariantsList() {
        const container = ui.productVariantsContainer;
        if (!container) return Promise.resolve();

        Array.from(container.querySelectorAll('.variant-size-cell')).forEach(function(w) {
            if (w._sizeCascadeHandle && typeof w._sizeCascadeHandle.destroy === 'function') {
                w._sizeCascadeHandle.destroy();
            }
        });

        container.innerHTML = '';
        if (!productVariants.length) {
            container.innerHTML = '<p class="admin-empty-hint">Нет вариантов. Нажмите «+ Добавить вариант».</p>';
            return Promise.resolve();
        }
        sortProductVariantsInPlace();
        const catEl = document.getElementById('product-category');
        const catId = catEl && catEl.value ? catEl.value : '';
        const catLabel =
            catEl && catEl.options && catEl.selectedIndex >= 0 ? String(catEl.options[catEl.selectedIndex].text || '') : '';

        const SC = window.KpvsSizeCascade;
        if (!SC || typeof SC.mountVariantCell !== 'function') {
            container.innerHTML = '<p class="admin-empty-hint">Подключите /js/size-cascade.js</p>';
            return Promise.resolve();
        }

        const sizeCellReadyPromises = [];
        productVariants.forEach(function(v, i) {
            const div = document.createElement('div');
            div.className = 'admin-variant-row';

            const colorOptions = '<option value="">Цвет</option>' + availableColors.map(function(c) {
                return '<option value="' + c.id + '"' + (Number(v.color_id) === Number(c.id) ? ' selected' : '') + '>' +
                    escapeHtml(c.name) + '</option>';
            }).join('');

            div.innerHTML =
                '<div class="variant-size-cell"></div>' +
                '<select class="variant-color">' + colorOptions + '</select>' +
                '<input type="text" class="variant-art" placeholder="Артикул SKU; пусто — авто" value="' + escapeHtml(v.art || '') + '" />' +
                '<button type="button" class="admin-ui-btn admin-ui-btn--primary admin-ui-btn--sm btn-variant-same-color" data-index="' + i + '" title="Тот же цвет — новая строка с другим размером">+ вариант</button>' +
                '<label class="checkbox-label variant-active-label">' +
                    '<input type="checkbox" class="variant-active" ' + (v.is_active !== false ? 'checked' : '') + ' />' +
                    '<span class="checkbox-custom"></span>' +
                    '<span>Видимость</span>' +
                '</label>' +
                '<button type="button" class="btn-row-remove" data-index="' + i + '" title="Удалить" aria-label="Удалить"><img src="/img/disagree.svg" alt="" class="admin-remove-row-icon" decoding="async"></button>';

            const sizeCell = div.querySelector('.variant-size-cell');
            const h = SC.mountVariantCell(sizeCell, {
                variantIndex: i,
                defaultCategoryId: catId,
                categoryLabel: catLabel,
                initialSizeId: v.size_id,
                loadSizes: function(id) {
                    return apiFetch('/api/sizes?category_id=' + encodeURIComponent(id)).then(function(r) {
                        return r.ok ? r.json() : [];
                    });
                },
                onNewSize: function(hid) {
                    const prev = hid.dataset.prevValue != null ? hid.dataset.prevValue : '';
                    openSizeQuickModal(hid, prev);
                }
            });
            if (h && typeof h.whenReady === 'function') {
                sizeCellReadyPromises.push(h.whenReady());
            }

            container.appendChild(div);
        });

        container.querySelectorAll('.btn-row-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                collectVariants();
                const idx = Number(btn.dataset.index);
                if (Number.isFinite(idx) && idx >= 0 && idx < productVariants.length) {
                    productVariants.splice(idx, 1);
                }
                void renderVariantsList();
            });
        });

        return Promise.all(sizeCellReadyPromises);
    }

    function collectVariants() {
        const container = ui.productVariantsContainer;
        if (!container) return;
        productVariants = [];
        container.querySelectorAll('.admin-variant-row').forEach(function(item) {
            const sizeEl = item.querySelector('.variant-size');
            const colorEl = item.querySelector('.variant-color');
            const artEl = item.querySelector('.variant-art');
            const activeEl = item.querySelector('.variant-active');
            const reservedSize =
                window.KpvsSizeCascade && window.KpvsSizeCascade.NEW_SIZE_OPT
                    ? String(window.KpvsSizeCascade.NEW_SIZE_OPT)
                    : '__kpvs_new_size__';
            const sizeRaw = sizeEl && sizeEl.value != null ? String(sizeEl.value).trim() : '';
            let size_id = null;
            if (sizeRaw && sizeRaw !== reservedSize) {
                const n = Number(sizeRaw);
                if (Number.isFinite(n) && n > 0) size_id = n;
            }
            const colorRaw = colorEl && colorEl.value != null ? String(colorEl.value).trim() : '';
            let color_id = null;
            if (colorRaw) {
                const nc = Number(colorRaw);
                if (Number.isFinite(nc) && nc > 0) color_id = nc;
            }
            const art = artEl ? artEl.value.trim().toUpperCase() : '';
            const isActive = activeEl ? activeEl.checked : true;
            productVariants.push({
                size_id: size_id,
                color_id: color_id,
                art: art || null,
                is_active: isActive
            });
        });
    }

    function renderAttributesList() {
        const container = ui.productAttributesContainer;
        if (!container) return;
        container.innerHTML = '';
        if (!productAttributes.length) {
            container.innerHTML = '<p class="admin-empty-hint">Нет характеристик. Нажмите «+ Добавить».</p>';
            return;
        }
        productAttributes.forEach(function(attr, i) {
            const div = document.createElement('div');
            div.className = 'admin-attr-row';
            div.innerHTML =
                '<input type="text" class="attr-name" placeholder="Название" value="' + escapeHtml(attr.name || '') + '" />' +
                '<input type="text" class="attr-value" placeholder="Значение" value="' + escapeHtml(attr.value || '') + '" />' +
                '<button type="button" class="btn-row-remove" data-index="' + i + '" title="Удалить" aria-label="Удалить"><img src="/img/disagree.svg" alt="" class="admin-remove-row-icon" decoding="async"></button>';
            container.appendChild(div);
        });

        container.querySelectorAll('.btn-row-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                productAttributes.splice(Number(btn.dataset.index), 1);
                renderAttributesList();
            });
        });
    }

    function collectAttributes() {
        const container = ui.productAttributesContainer;
        if (!container) return;
        productAttributes = [];
        container.querySelectorAll('.admin-attr-row').forEach(function(item, i) {
            const nameEl = item.querySelector('.attr-name');
            const valueEl = item.querySelector('.attr-value');
            const name = nameEl ? nameEl.value.trim() : '';
            const value = valueEl ? valueEl.value.trim() : '';
            if (name && value) productAttributes.push({ name: name, value: value, sort_order: i });
        });
    }

    function renderCollectionsDropdown() {
        const dropdown = ui.productCollectionsDropdown;
        if (!dropdown) return;
        dropdown.innerHTML = '';
        availableCollections.forEach(function(tag) {
            const isChecked = productCollections.some(function(t) { return Number(t.id) === Number(tag.id); });
            const label = document.createElement('label');
            label.className = 'admin-multiselect-option';
            const ic = tag.icon != null ? String(tag.icon).trim() : '';
            label.innerHTML =
                '<input type="checkbox" value="' + escapeHtml(String(tag.id)) + '" class="collection-checkbox" ' + (isChecked ? 'checked' : '') + ' />' +
                '<span class="admin-tag-label">' +
                (ic ? '<span class="admin-tag-emoji">' + escapeHtml(ic) + '</span> ' : '') +
                '<span class="admin-tag-name">' + escapeHtml(tag.name) + '</span></span>';
            dropdown.appendChild(label);
        });
        const addWrap = document.createElement('div');
        addWrap.className = 'admin-multiselect-option admin-multiselect-option--action';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'admin-ui-btn admin-ui-btn--primary admin-multiselect-add-action';
        addBtn.textContent = '+ Добавить подборку…';
        addBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (ui.productCollectionsContainer) ui.productCollectionsContainer.classList.remove('open');
            openCollectionModal(null);
        });
        addWrap.appendChild(addBtn);
        dropdown.appendChild(addWrap);
    }

    function updateSelectedCollections() {
        const dropdown = ui.productCollectionsDropdown;
        const trigger = ui.productCollectionsTrigger;
        if (!dropdown) return;
        const selected = Array.from(dropdown.querySelectorAll('input.collection-checkbox:checked')).map(function(i) { return Number(i.value); });
        productCollections = availableCollections.filter(function(t) {
            return selected.some(function(sid) { return Number(sid) === Number(t.id); });
        });
        if (trigger) {
            const span = trigger.querySelector('span');
            if (span) {
                if (!productCollections.length) span.textContent = 'Выберите подборки';
                else if (productCollections.length === 1) {
                    var t0 = productCollections[0];
                    var ic0 = t0.icon != null ? String(t0.icon).trim() : '';
                    span.textContent = (ic0 ? ic0 + ' ' : '') + (t0.name || '');
                }
                else span.textContent = 'Выбрано подборок: ' + productCollections.length;
            }
        }
    }

    async function uploadFiles(files) {
        const form = new FormData();
        Array.from(files).forEach(function(f) { form.append('images', f, f.name); });
        const r = await apiFetch('/api/admin/uploads', { method: 'POST', body: form });
        if (!r.ok) {
            let msg = 'Код ' + r.status;
            try { const e = await r.json(); if (e.error) msg = e.error; } catch {}
            throw new Error(msg);
        }
        const data = await r.json();
        return (data.files || []).map(function(url, i) {
            return { url: url, alt_text: '', is_primary: false, sort_order: i };
        });
    }

    function formatProductMetaTs(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString('ru-RU'); } catch (e) { return '—'; }
    }

    function syncProductMetaDetails(full) {
        var det = document.getElementById('product-meta-details');
        if (!det) return;
        if (!full || !editingProductId) {
            det.hidden = true;
            try { det.open = false; } catch (e) {}
            return;
        }
        det.hidden = false;
        var mc = document.getElementById('product-meta-created');
        var mu = document.getElementById('product-meta-updated');
        var me = document.getElementById('product-meta-editor');
        if (mc) mc.textContent = 'Дата добавления: ' + formatProductMetaTs(full.created_at);
        if (mu) mu.textContent = 'Последнее изменение: ' + formatProductMetaTs(full.updated_at);
        if (me) {
            var u = full.updated_by_username != null && String(full.updated_by_username).trim() !== '' ? String(full.updated_by_username).trim() : '—';
            me.textContent = 'Последний редактор: ' + u;
        }
    }

    async function openProductModal(product) {
        const modal = document.getElementById('product-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('product-form');
        if (!modal || !title || !form) return;

        editingProductId = product ? product.id : null;
        productModalBaselineReady = false;
        title.textContent = product ? 'Редактировать товар' : 'Новый товар';
        form.reset();
        clearFieldErrors();
        syncProductMetaDetails(null);

        productImages = [];
        productVariants = [];
        productCollections = [];
        productAttributes = [];
        productMaterials = [];
        productCategorySizesList = null;
        productCategorySizesCatId = '';

        const catSel = document.getElementById('product-category');
        const brandSel = document.getElementById('product-brand');
        populateCategorySelect(catSel);
        populateBrandSelect(brandSel);

        await refreshProductCategorySizes();
        renderImagesList();
        await renderVariantsList();
        renderAttributesList();
        renderMaterialsList();
        renderCollectionsDropdown();

        if (ui.productCollectionsTrigger) {
            const span = ui.productCollectionsTrigger.querySelector('span');
            if (span) span.textContent = 'Выберите подборки';
        }

        const delBtn = document.getElementById('delete-product-btn');
        if (delBtn) delBtn.hidden = !editingProductId;

        openModal(modal);

        if (product) {
            try {
                const r = await apiFetch('/api/product/' + encodeURIComponent(product.id));
                const full = r.ok ? await r.json() : null;
                if (full) {
                    const setVal = function(id, val) {
                        const el = document.getElementById(id);
                        if (el) el.value = val != null ? val : '';
                    };
                    setVal('product-name', full.name);
                    setVal('product-art', full.art);
                    setVal('product-slug', full.slug);
                    setVal('product-description', full.description);
                    setVal('product-season', full.season);
                    setVal('product-gender', normalizeGenderForForm(full.gender) || full.gender || '');
                    const activeChk = document.getElementById('product-active');
                    if (activeChk) activeChk.checked = full.is_active !== false;

                    populateCategorySelect(catSel, full.category_id);
                    if (catSel && full.category_id != null && categoryParentIdsWithChildren().has(Number(full.category_id))) {
                        notify('У товара указана родительская категория — выберите подкатегорию.', 'warning');
                        catSel.value = '';
                    }
                    populateBrandSelect(brandSel, full.brand_id);

                    if (Array.isArray(full.materials_list) && full.materials_list.length) {
                        productMaterials = full.materials_list;
                    } else if (typeof full.materials === 'string' && full.materials) {
                        productMaterials = parseMaterialsString(full.materials);
                    } else {
                        productMaterials = [];
                    }

                    productImages = Array.isArray(full.images) ? full.images.map(function(img) {
                        return {
                            url: img.url || '',
                            alt_text: img.alt_text || '',
                            is_primary: Boolean(img.is_primary),
                            sort_order: Number(img.sort_order) || 0
                        };
                    }).filter(function(i) { return i.url; }) : [];

                    productVariants = Array.isArray(full.variants) ? full.variants.map(function(v) {
                        return {
                            size_id: v.size_id,
                            color_id: v.color_id,
                            art: v.art || '',
                            is_active: v.is_active !== false
                        };
                    }) : [];

                    productAttributes = Array.isArray(full.attributes) ? full.attributes.map(function(a) {
                        return {
                            name: a.name || '',
                            value: a.value || '',
                            sort_order: a.sort_order != null ? a.sort_order : 0
                        };
                    }) : [];

                    productCollections = (Array.isArray(full.collections) ? full.collections : []).map(function(t) {
                        return {
                            id: Number(t.id),
                            name: t.name || '',
                            slug: t.slug || '',
                            icon: t.icon
                        };
                    }).filter(function(t) {
                        return Number.isFinite(t.id);
                    });

                    await refreshProductCategorySizes();
                    renderImagesList();
                    await renderVariantsList();
                    renderAttributesList();
                    renderMaterialsList();
                    renderCollectionsDropdown();
                    updateSelectedCollections();
                    syncProductMetaDetails(full);
                }
            } catch (err) {
                notify('Не удалось загрузить данные товара', 'error');
                syncProductMetaDetails(null);
            }
        }

        const draftRaw = localStorage.getItem(draftStorageKey());
        if (draftRaw) {
            try {
                const parsed = JSON.parse(draftRaw);
                const curCanon = serializeProductModalStateForCompare();
                const draftCanon = canonicalProductModalSnapshotJson(parsed);
                if (draftCanon === curCanon) {
                    clearProductDraftStorage();
                } else if (confirm('Найден сохранённый черновик. Восстановить введённые данные?')) {
                    await applyDraftPayload(parsed);
                } else {
                    clearProductDraftStorage();
                }
            } catch {
                clearProductDraftStorage();
            }
        }

        await new Promise(function(resolve) {
            requestAnimationFrame(function() {
                requestAnimationFrame(resolve);
            });
        });

        captureProductModalBaseline();
    }

    function closeProductModalAfterSave() {
        clearProductDraftStorage();
        forceCloseProductModal();
    }

    async function saveProduct(e) {
        e.preventDefault();
        clearFieldErrors();
        updateSelectedCollections();
        collectVariants();
        collectAttributes();
        const materialsError = collectMaterials();

        const g = function(id) { return document.getElementById(id); };
        const name = g('product-name') ? g('product-name').value.trim() : '';
        const categoryId = g('product-category') ? g('product-category').value : '';

        let hasErrors = false;
        if (!name) {
            showFieldError('err-name', 'Поле «Название» обязательно');
            g('product-name') && g('product-name').focus();
            hasErrors = true;
        }

        const artRaw = g('product-art') ? g('product-art').value.trim().toUpperCase() : '';
        if (!artRaw) {
            showFieldError('err-art', 'Поле «Артикул» обязательно');
            if (!hasErrors) g('product-art') && g('product-art').focus();
            hasErrors = true;
        } else if (!/^[A-Z0-9-]+$/.test(artRaw)) {
            showFieldError('err-art', 'Артикул может содержать только A-Z, 0-9 и дефис');
            if (!hasErrors) g('product-art') && g('product-art').focus();
            hasErrors = true;
        }

        if (materialsError) {
            notify(materialsError, 'error');
            hasErrors = true;
        } else if (productMaterials.length) {
            const total = productMaterials.reduce(function(s, m) { return s + m.percent; }, 0);
            if (total !== 100) {
                notify('Сумма процентов состава должна быть ровно 100%. Сейчас: ' + total + '%.', 'error');
                hasErrors = true;
            }
        }

        if (categoryId && categoryParentIdsWithChildren().has(Number(categoryId))) {
            notify('Выберите конечную подкатегорию: родительскую категорию нельзя назначить товару.', 'error');
            if (!hasErrors) g('product-category') && g('product-category').focus();
            hasErrors = true;
        }

        if (hasErrors) return;

        if (categoryId) await refreshProductCategorySizes();

        const variantsNormalized = normalizeVariantArtsForSave(artRaw, productVariants);
        let variantErr = '';
        const artPattern = /^[A-Z0-9-]+$/;
        const seenArts = [];
        const categoryIdNum = categoryId ? Number(categoryId) : null;

        for (let vi = 0; vi < productVariants.length; vi++) {
            const raw = productVariants[vi];
            const hs = raw.size_id != null && Number.isFinite(Number(raw.size_id));
            const hc = raw.color_id != null && Number.isFinite(Number(raw.color_id));
            const artIn = raw.art != null ? String(raw.art).trim() : '';
            const hasAny = hs || hc || artIn !== '';
            if (!hasAny) continue;
            if (hs !== hc) {
                variantErr = 'Вариант в строке ' + (vi + 1) + ': укажите и размер, и цвет (либо очистите строку).';
                break;
            }
            if (hs && categoryIdNum && Number.isFinite(categoryIdNum)) {
                const list = sizesForProductCategory(String(categoryIdNum), raw.size_id);
                if (!list.some(function(s) { return Number(s.id) === Number(raw.size_id); })) {
                    variantErr = 'Вариант в строке ' + (vi + 1) + ': выбранный размер не подходит для категории товара.';
                    break;
                }
            }
        }
        if (!variantErr && productVariants.some(function(v) {
            const hs = v.size_id != null && Number.isFinite(Number(v.size_id));
            const hc = v.color_id != null && Number.isFinite(Number(v.color_id));
            return hs || hc;
        })) {
            if (!categoryIdNum || !Number.isFinite(categoryIdNum)) {
                variantErr = 'Чтобы сохранить варианты с размерами и цветами, выберите категорию товара.';
            }
        }

        for (let vi = 0; vi < variantsNormalized.length; vi++) {
            if (variantErr) break;
            const vv = variantsNormalized[vi];
            const a = vv.art != null ? String(vv.art).trim().toUpperCase() : '';
            if (a && !artPattern.test(a)) {
                variantErr = 'Вариант в строке ' + (vi + 1) + ': артикул допускает только латиницу A–Z, цифры и дефис.';
                break;
            }
            if (a) {
                if (seenArts.indexOf(a) !== -1) {
                    variantErr = 'Повторяется артикул варианта: «' + a + '». У каждой строки должен быть свой уникальный артикул.';
                    break;
                }
                seenArts.push(a);
            }
        }
        if (variantErr) {
            notify(variantErr, 'error');
            return;
        }

        const variantsForApi = variantsNormalized.filter(function(v) {
            return v.art != null && String(v.art).trim() !== '';
        });

        const slug = g('product-slug') ? g('product-slug').value.trim() : '';
        const descRaw = g('product-description') ? g('product-description').value : '';
        const descriptionNorm = descRaw.replace(/\r\n/g, '\n');
        const description = /^\s*$/.test(descriptionNorm) ? null : descriptionNorm;
        const season = g('product-season') ? g('product-season').value : '';
        const gender = g('product-gender') ? g('product-gender').value : '';
        const brandId = g('product-brand') ? g('product-brand').value : '';
        const isActive = g('product-active') ? g('product-active').checked : true;

        const urlImageInput = g('product-image-url');
        if (urlImageInput && urlImageInput.value.trim()) {
            const url = urlImageInput.value.trim();
            if (!productImages.some(function(i) { return i.url === url; })) {
                productImages.push({ url: url, alt_text: '', is_primary: false, sort_order: productImages.length });
            }
            urlImageInput.value = '';
        }
        if (productImages.length && !productImages.some(function(i) { return i.is_primary; })) {
            productImages[0].is_primary = true;
        }

        const materialsStr = materialsToString(productMaterials);

        const payload = {
            name: name,
            art: artRaw || null,
            slug: slug || slugify(name) || null,
            description: description,
            materials: materialsStr || null,
            season: season || null,
            gender: gender || null,
            category_id: categoryId ? Number(categoryId) : null,
            brand_id: brandId ? Number(brandId) : null,
            is_active: isActive,
            images: productImages,
            variants: variantsForApi,
            collections: productCollections.map(function(t) { return { id: Number(t.id) }; }).filter(function(x) { return Number.isFinite(x.id); }),
            attributes: productAttributes
        };

        try {
            const method = editingProductId ? 'PUT' : 'POST';
            const url = editingProductId ? '/api/admin/products/' + editingProductId : '/api/admin/products';
            const r = await apiFetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!r.ok) {
                let msg = 'Код ' + r.status;
                try { const err = await r.json(); if (err.error) msg = err.error; } catch {}
                throw new Error(msg);
            }
            await fetchProducts();
            const wasEdit = !!editingProductId;
            closeProductModalAfterSave();
            notify(wasEdit ? 'Товар обновлён' : 'Товар добавлен', 'success');
        } catch (err) {
            if (err.message.includes('Артикул уже существует')) {
                showFieldError('err-art', 'Артикул уже существует');
            } else {
                notify(err.message || 'Не удалось сохранить товар', 'error');
            }
        }
    }

    function attachEvents() {
        setupAdminSearchScopeToggle();
        normalizeAdminSearchScopeForRole();

        const addBtn = document.getElementById('add-product-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const searchInput = document.getElementById('search-input');
        const openFiltersBtn = document.getElementById('open-filters-btn');
        const applyFiltersBtn = document.getElementById('apply-filters-btn');
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        const sortBy = document.getElementById('sort-by');
        const cancelBtn = document.getElementById('cancel-product-btn');
        const addVariantBtn = document.getElementById('add-variant-btn');
        const addAttributeBtn = document.getElementById('add-attribute-btn');
        const addMaterialBtn = document.getElementById('add-material-btn');
        const addImageUrlBtn = document.getElementById('add-image-url-btn');

        if (addBtn) {
            addBtn.onclick = function() {
                if (isSuperadminSession() && adminSearchScope === 'users') {
                    openUserModal();
                } else {
                    openProductModal(null);
                }
            };
        }
        if (refreshBtn) refreshBtn.onclick = function() {
            fetchProducts();
            fetchUsers().catch(function () {});
            fetchCollections()
                .then(function() {
                    renderCollectionsDropdown();
                    const pm = document.getElementById('product-modal');
                    if (pm && pm.classList.contains('show')) updateSelectedCollections();
                })
                .catch(function () {});
        };
        if (searchInput) {
            searchInput.oninput = function() {
                syncAdminSearchClear();
                scheduleAdminToolbarSearch();
            };
        }
        const searchClearBtn = document.getElementById('admin-search-clear');
        if (searchClearBtn && searchInput) {
            searchClearBtn.onclick = function() {
                searchInput.value = '';
                syncAdminSearchClear();
                if (effectiveAdminSearchScope() === 'users') {
                    fetchUsers().catch(function() {});
                } else {
                    fetchProducts();
                }
            };
        }
        syncAdminSearchClear();
        if (openFiltersBtn) openFiltersBtn.onclick = openFiltersModal;
        if (applyFiltersBtn) applyFiltersBtn.onclick = applyFilters;
        if (clearFiltersBtn) clearFiltersBtn.onclick = clearFilters;
        if (cancelBtn) cancelBtn.onclick = requestCloseProductModal;

        if (sortBy) {
            sortBy.onchange = function(e) {
                if (effectiveAdminSearchScope() === 'users') {
                    userListFilters.sortOption = e.target.value;
                    saveUserListFiltersToStorage();
                    fetchUsers().catch(function() {});
                } else {
                    state.sortOption = e.target.value;
                    saveStateToStorage();
                    fetchProducts();
                }
            };
        }

        if (addVariantBtn) {
            addVariantBtn.onclick = function() {
                collectVariants();
                productVariants.push({ size_id: null, color_id: null, art: '', is_active: true });
                renderVariantsList();
            };
        }

        if (addAttributeBtn) {
            addAttributeBtn.onclick = function() {
                collectAttributes();
                productAttributes.push({ name: '', value: '', sort_order: productAttributes.length });
                renderAttributesList();
            };
        }

        if (addMaterialBtn) {
            addMaterialBtn.onclick = function() {
                productMaterials = snapshotMaterialsFromDom();
                productMaterials.push({ name: '', percent: 0 });
                renderMaterialsList();
            };
        }

        if (addImageUrlBtn) {
            addImageUrlBtn.onclick = function() {
                const urlInput = document.getElementById('product-image-url');
                if (!urlInput) return;
                const url = urlInput.value.trim();
                if (!url) { notify('Введите URL изображения', 'error'); return; }
                if (!productImages.some(function(i) { return i.url === url; })) {
                    productImages.push({ url: url, alt_text: '', is_primary: false, sort_order: productImages.length });
                    if (!productImages.some(function(i) { return i.is_primary; })) productImages[0].is_primary = true;
                    renderImagesList();
                    notify('Изображение добавлено', 'success');
                } else {
                    notify('Это изображение уже добавлено', 'error');
                }
                urlInput.value = '';
            };
        }

        if (ui.productCollectionsTrigger) {
            ui.productCollectionsTrigger.onclick = function() {
                const container = ui.productCollectionsContainer;
                if (!container) return;
                container.classList.toggle('open');
            };
        }
        if (ui.productCollectionsContainer && !ui.productCollectionsContainer.dataset.collectionsChangeBound) {
            ui.productCollectionsContainer.dataset.collectionsChangeBound = '1';
            ui.productCollectionsContainer.addEventListener('change', function(ev) {
                const el = ev.target;
                if (el && el.classList && el.classList.contains('collection-checkbox')) updateSelectedCollections();
            });
        }

        const filterModal = document.getElementById('filter-modal');
        const productModal = document.getElementById('product-modal');
        if (filterModal) {
            const closeBtn = filterModal.querySelector('.modal-close');
            if (closeBtn) closeBtn.onclick = closeFiltersModal;
            filterModal.addEventListener('click', function(e) {
                if (e.target === filterModal) closeFiltersModal();
            });
        }
        if (productModal) {
            const closeBtn = productModal.querySelector('.modal-close');
            if (closeBtn) closeBtn.onclick = requestCloseProductModal;
            productModal.addEventListener('click', function(e) {
                if (e.target === productModal) requestCloseProductModal();
            });
        }

        const exitDraftModal = document.getElementById('product-exit-draft-modal');
        if (exitDraftModal) {
            const stayBtn = document.getElementById('product-exit-draft-stay');
            const discardBtn = document.getElementById('product-exit-draft-discard');
            const saveDraftBtn = document.getElementById('product-exit-draft-save');
            const exClose = exitDraftModal.querySelector('.modal-close');
            if (stayBtn) stayBtn.onclick = function() { closeModal(exitDraftModal); };
            if (exClose) exClose.onclick = function() { closeModal(exitDraftModal); };
            if (discardBtn) discardBtn.onclick = function() {
                clearProductDraftStorage();
                closeModal(exitDraftModal);
                forceCloseProductModal();
            };
            if (saveDraftBtn) saveDraftBtn.onclick = function() {
                saveProductDraftToStorage();
                closeModal(exitDraftModal);
                forceCloseProductModal();
                notify('Черновик сохранён в браузере. При следующем открытии формы его можно восстановить.', 'success');
            };
            exitDraftModal.addEventListener('click', function(e) {
                if (e.target === exitDraftModal) closeModal(exitDraftModal);
            });
        }

        const visibilityModal = document.getElementById('visibility-confirm-modal');
        if (visibilityModal) {
            const vClose = visibilityModal.querySelector('.modal-close');
            if (vClose) vClose.onclick = cancelVisibilityConfirm;
            const vCancel = document.getElementById('visibility-confirm-cancel');
            if (vCancel) vCancel.onclick = cancelVisibilityConfirm;
            const vOk = document.getElementById('visibility-confirm-ok');
            if (vOk) vOk.onclick = function() { applyVisibilityConfirmFromConfirm(); };
            visibilityModal.addEventListener('click', function(e) {
                if (e.target === visibilityModal) cancelVisibilityConfirm();
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            const exitDraft = document.getElementById('product-exit-draft-modal');
            if (exitDraft && exitDraft.style.display !== 'none' && exitDraft.classList.contains('show')) {
                closeModal(exitDraft);
                e.preventDefault();
                return;
            }
            const vis = ui.visibilityConfirmModal;
            if (vis && vis.style.display !== 'none' && vis.classList.contains('show')) {
                cancelVisibilityConfirm();
                e.preventDefault();
                return;
            }
            const pm = document.getElementById('product-modal');
            if (pm && pm.classList.contains('show')) {
                requestCloseProductModal();
                e.preventDefault();
                return;
            }
            const fm = document.getElementById('filter-modal');
            if (fm && fm.classList.contains('show')) {
                closeFiltersModal();
                e.preventDefault();
            }
        });

        const productForm = document.getElementById('product-form');
        if (productForm) productForm.onsubmit = saveProduct;

        const deleteBtn = document.getElementById('delete-product-btn');
        if (deleteBtn) {
            deleteBtn.onclick = function() {
                if (!editingProductId) {
                    notify('Ошибка: товар не загружен', 'error');
                    return;
                }
                if (confirm('Вы уверены, что хотите удалить этот товар? Это действие нельзя отменить.')) {
                    doDeleteProduct(editingProductId).then(function() {
                        clearProductDraftStorage();
                        forceCloseProductModal();
                    });
                }
            };
        }

        if (ui.productImagesInput) {
            ui.productImagesInput.addEventListener('change', async function() {
                const files = ui.productImagesInput.files;
                if (!files || !files.length) return;
                try {
                    notify('Загружаю изображения…', 'info');
                    const uploaded = await uploadFiles(files);
                    uploaded.forEach(function(img) {
                        if (!productImages.some(function(i) { return i.url === img.url; })) {
                            productImages.push(img);
                        }
                    });
                    if (productImages.length && !productImages.some(function(i) { return i.is_primary; })) {
                        productImages[0].is_primary = true;
                    }
                    renderImagesList();
                    notify('Изображения загружены', 'success');
                } catch (err) {
                    notify(err.message || 'Не удалось загрузить изображения', 'error');
                } finally {
                    ui.productImagesInput.value = '';
                }
            });
        }

        if (ui.filterCategoryTrigger) {
            ui.filterCategoryTrigger.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (!ui.filterCategoryMultiselect) return;
                ui.filterCategoryMultiselect.classList.toggle('open');
            });
        }

        document.addEventListener('click', function(e) {
            if (ui.filterCategoryMultiselect && !ui.filterCategoryMultiselect.contains(e.target)) {
                ui.filterCategoryMultiselect.classList.remove('open');
            }
            if (ui.productCollectionsContainer && !ui.productCollectionsContainer.contains(e.target)) {
                ui.productCollectionsContainer.classList.remove('open');
            }
        });

        bindCollectionModalOnce();
        bindSizeQuickModalOnce();

        setupTableDelegation();
        setupResizableColumns();

        syncAdminDataPanelsVisibility();
    }

    function initAdminPage() {
        loadStateFromStorage();
        loadUserListFiltersFromStorage();
        adminSearchScope = readAdminSearchScope();

        ui.productsBody = document.getElementById('products-body');
        ui.productCount = document.getElementById('product-count');
        ui.usersBody = document.getElementById('users-body');
        ui.userModal = document.getElementById('user-modal');
        ui.userForm = document.getElementById('user-form');
        ui.userSaveBtn = document.getElementById('user-save-btn');
        ui.userUsername = document.getElementById('user-username');
        ui.userEmail = document.getElementById('user-email');
        ui.userPassword = document.getElementById('user-password');
        ui.userRole = document.getElementById('user-role');
        if (ui.userRole) ui.userRole.addEventListener('change', syncUserCreateEmailRow);
        ui.filterCategoryMultiselect = document.getElementById('filter-category-multiselect');
        ui.filterCategoryDropdown = document.getElementById('filter-category-dropdown');
        ui.filterCategoryLabel = document.getElementById('filter-category-label');
        ui.filterCategoryTrigger = document.getElementById('filter-category-trigger');
        ui.productImagesInput = document.getElementById('product-images');
        ui.productImagesList = document.getElementById('product-images-list');
        ui.productCollectionsContainer = document.getElementById('product-collections-container');
        ui.productCollectionsTrigger = document.getElementById('product-collections-trigger');
        ui.productCollectionsDropdown = document.getElementById('product-collections-dropdown');
        ui.productVariantsContainer = document.getElementById('product-variants-container');
        ui.productAttributesContainer = document.getElementById('product-attributes-container');
        ui.productMaterialsList = document.getElementById('product-materials-list');

        bindVariantSizeSelectDelegationOnce();
        bindVariantSameColorButtonOnce();
        bindProductBrandNewOptionOnce();
        bindProductCategoryForVariantsOnce();
        bindBrandQuickModalOnce();

        ui.visibilityConfirmModal = document.getElementById('visibility-confirm-modal');

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.onclick = doLogout;

        checkAuth().then(function(ok) {
            if (!ok) return;
            bindUsersEvents();
            fetchUsers().catch(function () {});
            Promise.all([
                fetchCategories(),
                fetchBrands(),
                fetchSizes(),
                fetchColors(),
                fetchCollections(),
                fetchSizeTypes()
            ])
                .then(function() {
                    populateFilterCategoryDropdown();
                    if (ui.filterCategoryDropdown) {
                        const set = new Set(state.categories.map(String));
                        ui.filterCategoryDropdown.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
                            cb.checked = set.has(cb.value);
                        });
                    }
                    updateFilterCategoryLabel();
                    attachEvents();
                    fetchProducts();
                });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminPage);
    } else {
        initAdminPage();
    }

    return { checkAuth: checkAuth, doLogout: doLogout };
})();