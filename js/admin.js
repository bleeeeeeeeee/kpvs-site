const Admin = (() => {
    async function checkAuth() {
        try {
            const r = await apiFetch('/api/auth/me');
            if (!r.ok) {
                window.location.replace('/login.html');
                return false;
            }
            const user = await r.json();
            const subtitle = document.querySelector('.admin-subtitle');
            if (subtitle && user.username) {
                subtitle.textContent = user.username + ' · ' + user.role;
            }
            return true;
        } catch {
            window.location.replace('/login.html');
            return false;
        }
    }

    async function doLogout() {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch {}
        window.location.replace('/login.html');
    }

    let categories = [];
    let brands = [];
    let availableSizes = [];
    let availableColors = [];
    let availableTags = [];
    let products = [];
    let editingProductId = null;
    let productImages = [];
    let productVariants = [];
    let productTags = [];
    let productAttributes = [];
    let productMaterials = [];
    let productModalBaselineSerialized = null;
    let productModalBaselineReady = false;
    const PRODUCT_DRAFT_STORAGE_PREFIX = 'kpvs_admin_product_draft_v1_';

    const state = {
        gender: '',
        categories: [],
        brand: '',
        season: '',
        sortOption: 'id_desc'
    };

    const ui = {};

    let visibilityConfirmPending = null;
    let searchInputTimer = null;

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
            '<button class="notification-close" type="button" aria-label="Закрыть">&times;</button>';
        document.body.appendChild(node);
        node.querySelector('.notification-close').onclick = function(e) { e.stopPropagation(); node.remove(); };
        node.onclick = function(e) { e.stopPropagation(); };
        setTimeout(function() { if (node.isConnected) node.remove(); }, kind === 'error' ? 7000 : 4500);
    }

    function setTableStatus(msg) {
        if (!ui.productsBody || !ui.productCount) return;
        ui.productsBody.innerHTML = '<tr class="empty-row"><td colspan="7">' + escapeHtml(msg) + '</td></tr>';
        ui.productCount.textContent = formatProductCount(0);
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

    async function fetchSizes() {
        try {
            const r = await apiFetch('/api/sizes');
            if (!r.ok) throw new Error();
            availableSizes = await r.json();
        } catch { availableSizes = []; }
    }

    async function fetchColors() {
        try {
            const r = await apiFetch('/api/colors');
            if (!r.ok) throw new Error();
            availableColors = await r.json();
        } catch { availableColors = []; }
    }

    async function fetchTags() {
        try {
            const r = await apiFetch('/api/tags');
            if (!r.ok) throw new Error();
            availableTags = await r.json();
        } catch { availableTags = []; }
    }

    function flattenCategories(list, depth) {
        depth = depth || 0;
        const result = [];
        if (!Array.isArray(list)) return result;
        list.forEach(function(item) {
            if (!item) return;
            result.push({ id: item.id, name: item.name, slug: item.slug, depth: depth });
            if (Array.isArray(item.children) && item.children.length) {
                result.push.apply(result, flattenCategories(item.children, depth + 1));
            }
        });
        return result;
    }

    function populateCategorySelect(selectEl, selectedId) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Категория</option>';
        categories.forEach(function(cat) {
            const prefix = '\u00a0\u00a0'.repeat(cat.depth);
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = prefix + cat.name;
            if (selectedId != null && Number(cat.id) === Number(selectedId)) opt.selected = true;
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
    }

    function populateFilterCategoryDropdown() {
        const dropdown = ui.filterCategoryDropdown;
        if (!dropdown) return;
        dropdown.innerHTML = '';
        categories.forEach(function(cat) {
            const prefix = '\u00a0\u00a0'.repeat(cat.depth);
            const label = document.createElement('label');
            label.className = 'admin-multiselect-option';
            label.innerHTML =
                '<input type="checkbox" value="' + escapeHtml(String(cat.id)) + '" />' +
                '<span>' + prefix + escapeHtml(cat.name) + '</span>';
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
        setTableStatus('Загрузка товаров…');
        try {
            const params = new URLSearchParams();
            const searchInput = document.getElementById('search-input');
            if (searchInput && searchInput.value.trim()) params.set('q', searchInput.value.trim());
            if (state.gender) params.set('gender', state.gender);
            state.categories.forEach(function(id) { params.append('category', id); });
            if (state.brand) params.set('brand', state.brand);
            if (state.season) params.set('season', state.season);
            const sv = getSortValues();
            params.set('sort_by', sv.sortBy);
            params.set('sort_direction', sv.sortDir);
            params.set('limit', '100');
            params.set('offset', '0');

            const r = await apiFetch('/api/admin/products?' + params.toString());
            if (!r.ok) throw new Error('Код ' + r.status);
            products = await r.json();
            renderProducts();
        } catch (err) {
            products = [];
            setTableStatus('Не удалось загрузить товары. Проверьте подключение к серверу.');
            notify(err.message || 'Не удалось загрузить товары', 'error');
        }
    }

    function renderProducts() {
        if (!ui.productsBody || !ui.productCount) return;
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
                '</tr>';
        }).join('');
        ui.productCount.textContent = formatProductCount(products.length);
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
                        '<button type="button" class="open-page-popup-close">&times;</button>' +
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

    function openFiltersModal() {
        const modal = document.getElementById('filter-modal');
        if (!modal) return;
        const genderSel = document.getElementById('filter-gender-modal');
        const brandSel = document.getElementById('filter-brand-modal');
        const seasonSel = document.getElementById('filter-season-modal');
        if (genderSel) genderSel.value = state.gender || '';
        if (brandSel) {
            brandSel.innerHTML = '<option value="">Все бренды</option>';
            brands.forEach(function(b) {
                const opt = document.createElement('option');
                opt.value = b.slug;
                opt.textContent = b.name;
                if (b.slug === state.brand) opt.selected = true;
                brandSel.appendChild(opt);
            });
        }
        if (seasonSel) seasonSel.value = state.season || '';
        if (ui.filterCategoryDropdown) {
            const set = new Set(state.categories.map(String));
            ui.filterCategoryDropdown.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
                cb.checked = set.has(cb.value);
            });
        }
        updateFilterCategoryLabel();
        openModal(modal);
    }

    function closeFiltersModal() {
        closeModal(document.getElementById('filter-modal'));
    }

    function applyFilters() {
        const genderSel = document.getElementById('filter-gender-modal');
        const brandSel = document.getElementById('filter-brand-modal');
        const seasonSel = document.getElementById('filter-season-modal');
        state.gender = genderSel ? genderSel.value : '';
        state.brand = brandSel ? brandSel.value : '';
        state.season = seasonSel ? seasonSel.value : '';
        state.categories = ui.filterCategoryDropdown ? getCheckedValues(ui.filterCategoryDropdown) : [];
        saveStateToStorage();
        closeFiltersModal();
        fetchProducts();
    }

    function clearFilters() {
        state.gender = '';
        state.brand = '';
        state.season = '';
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

        visibilityConfirmPending = { id: id, nextVisible: nextVisible, triggerBtn: triggerBtn };
        const titleEl = document.getElementById('visibility-confirm-title');
        const msgEl = document.getElementById('visibility-confirm-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        const okBtn = document.getElementById('visibility-confirm-ok');
        if (okBtn) okBtn.disabled = false;
        openModal(ui.visibilityConfirmModal);
    }

    async function applyProductCatalogVisibilityFromConfirm() {
        const pending = visibilityConfirmPending;
        if (!pending) return;
        visibilityConfirmPending = null;

        const okBtn = document.getElementById('visibility-confirm-ok');
        if (okBtn) okBtn.disabled = true;

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
        const table = document.querySelector('.admin-table');
        if (!table || table._resizable) return;
        table._resizable = true;
        const cols = Array.from(table.querySelectorAll('colgroup col'));
        const ths = Array.from(table.querySelectorAll('thead th'));
        if (!cols.length || ths.length !== cols.length) return;
        const minWidths = [100, 52, 240, 200, 128, 84, 112];

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
                const startW = parseInt(cols[i].style.width, 10) || Math.round(th.getBoundingClientRect().width);
                const nextStartW = parseInt(cols[i + 1].style.width, 10) || Math.round(ths[i + 1].getBoundingClientRect().width);
                const onMove = function(ev) {
                    const delta = Math.round(ev.clientX - startX);
                    const w1 = Math.max(minWidths[i] || 80, startW + delta);
                    const w2 = Math.max(minWidths[i + 1] || 80, nextStartW - delta);

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
                '<button type="button" class="btn-mat-remove" data-index="' + i + '" title="Удалить">×</button>';
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

    function serializeProductModalStateForCompare() {
        collectVariants();
        collectAttributes();
        productMaterials = snapshotMaterialsFromDom();
        const g = function(id) { return document.getElementById(id); };
        return JSON.stringify({
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
            tagIds: productTags.map(function(t) { return t.id; }).slice().sort(function(a, b) { return a - b; })
        });
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

    function applyDraftPayload(d) {
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
        if (brandSel) populateBrandSelect(brandSel, d.brand_id);

        const activeChk = document.getElementById('product-active');
        if (activeChk) activeChk.checked = d.is_active !== false;

        productImages = Array.isArray(d.images) ? d.images.slice() : [];
        productVariants = Array.isArray(d.variants) ? d.variants.slice() : [];
        productAttributes = Array.isArray(d.attributes) ? d.attributes.slice() : [];
        productMaterials = Array.isArray(d.materials) ? d.materials.slice() : [];

        const ids = Array.isArray(d.tagIds) ? d.tagIds : [];
        productTags = availableTags.filter(function(t) { return ids.indexOf(t.id) !== -1; });

        renderImagesList();
        renderVariantsList();
        renderAttributesList();
        renderMaterialsList();
        renderTagsDropdown();
        updateSelectedTags();
    }

    function forceCloseProductModal() {
        const exitDraft = document.getElementById('product-exit-draft-modal');
        if (exitDraft && exitDraft.classList.contains('show')) closeModal(exitDraft);
        const modal = document.getElementById('product-modal');
        if (modal) closeModal(modal);
        editingProductId = null;
        productModalBaselineSerialized = null;
        productModalBaselineReady = false;
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
        if (!container) return;
        container.innerHTML = '';
        if (!productVariants.length) {
            container.innerHTML = '<p class="admin-empty-hint">Нет вариантов. Нажмите «+ Добавить вариант».</p>';
            return;
        }
        productVariants.forEach(function(v, i) {
            const div = document.createElement('div');
            div.className = 'admin-variant-row';

            const sizeOptions = '<option value="">Размер</option>' + availableSizes.map(function(s) {
                return '<option value="' + s.id + '"' + (Number(v.size_id) === s.id ? ' selected' : '') + '>' +
                    escapeHtml(s.value) + ' (' + escapeHtml(s.size_type) + ')</option>';
            }).join('');
            const colorOptions = '<option value="">Цвет</option>' + availableColors.map(function(c) {
                return '<option value="' + c.id + '"' + (Number(v.color_id) === c.id ? ' selected' : '') + '>' +
                    escapeHtml(c.name) + '</option>';
            }).join('');

            div.innerHTML =
                '<select class="variant-size">' + sizeOptions + '</select>' +
                '<select class="variant-color">' + colorOptions + '</select>' +
                '<input type="text" class="variant-art" placeholder="Артикул варианта" value="' + escapeHtml(v.art || '') + '" />' +
                '<label class="checkbox-label variant-active-label">' +
                    '<input type="checkbox" class="variant-active" ' + (v.is_active !== false ? 'checked' : '') + ' />' +
                    '<span class="checkbox-custom"></span>' +
                    '<span>Видимость</span>' +
                '</label>' +
                '<button type="button" class="btn-row-remove" data-index="' + i + '" title="Удалить">×</button>';
            container.appendChild(div);
        });

        container.querySelectorAll('.btn-row-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                productVariants.splice(Number(btn.dataset.index), 1);
                renderVariantsList();
            });
        });
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
            const sizeId = sizeEl ? sizeEl.value : '';
            const colorId = colorEl ? colorEl.value : '';
            const art = artEl ? artEl.value.trim().toUpperCase() : '';
            const isActive = activeEl ? activeEl.checked : true;
            productVariants.push({
                size_id: sizeId ? Number(sizeId) : null,
                color_id: colorId ? Number(colorId) : null,
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
                '<button type="button" class="btn-row-remove" data-index="' + i + '" title="Удалить">×</button>';
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

    function renderTagsDropdown() {
        const dropdown = ui.productTagsDropdown;
        if (!dropdown) return;
        dropdown.innerHTML = '';
        availableTags.forEach(function(tag) {
            const isChecked = productTags.some(function(t) { return t.id === tag.id; });
            const label = document.createElement('label');
            label.className = 'admin-multiselect-option';
            label.innerHTML =
                '<input type="checkbox" value="' + tag.id + '" class="tag-checkbox" ' + (isChecked ? 'checked' : '') + ' />' +
                '<span>' + escapeHtml(tag.name) + '</span>';
            dropdown.appendChild(label);
        });
        dropdown.onchange = updateSelectedTags;
    }

    function updateSelectedTags() {
        const dropdown = ui.productTagsDropdown;
        const trigger = ui.productTagsTrigger;
        if (!dropdown) return;
        const selected = Array.from(dropdown.querySelectorAll('input.tag-checkbox:checked')).map(function(i) { return Number(i.value); });
        productTags = availableTags.filter(function(t) { return selected.indexOf(t.id) !== -1; });
        if (trigger) {
            const span = trigger.querySelector('span');
            if (span) {
                if (!productTags.length) span.textContent = 'Выберите теги';
                else if (productTags.length === 1) span.textContent = productTags[0].name;
                else span.textContent = 'Выбрано тегов: ' + productTags.length;
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

        productImages = [];
        productVariants = [];
        productTags = [];
        productAttributes = [];
        productMaterials = [];

        const catSel = document.getElementById('product-category');
        const brandSel = document.getElementById('product-brand');
        populateCategorySelect(catSel);
        populateBrandSelect(brandSel);

        renderImagesList();
        renderVariantsList();
        renderAttributesList();
        renderMaterialsList();
        renderTagsDropdown();

        if (ui.productTagsTrigger) {
            const span = ui.productTagsTrigger.querySelector('span');
            if (span) span.textContent = 'Выберите теги';
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

                    productTags = Array.isArray(full.tags) ? full.tags : [];

                    renderImagesList();
                    renderVariantsList();
                    renderAttributesList();
                    renderMaterialsList();
                    renderTagsDropdown();
                    updateSelectedTags();
                }
            } catch (err) {
                notify('Не удалось загрузить данные товара', 'error');
            }
        }

        const draftRaw = localStorage.getItem(draftStorageKey());
        if (draftRaw) {
            try {
                const parsed = JSON.parse(draftRaw);
                if (confirm('Найден сохранённый черновик. Восстановить введённые данные?')) {
                    applyDraftPayload(parsed);
                } else {
                    clearProductDraftStorage();
                }
            } catch {
                clearProductDraftStorage();
            }
        }

        captureProductModalBaseline();
    }

    function closeProductModalAfterSave() {
        clearProductDraftStorage();
        forceCloseProductModal();
    }

    async function saveProduct(e) {
        e.preventDefault();
        clearFieldErrors();
        collectVariants();
        collectAttributes();
        const materialsError = collectMaterials();

        const g = function(id) { return document.getElementById(id); };
        const name = g('product-name') ? g('product-name').value.trim() : '';

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

        if (hasErrors) return;

        const slug = g('product-slug') ? g('product-slug').value.trim() : '';
        const description = g('product-description') ? g('product-description').value.trim() : '';
        const season = g('product-season') ? g('product-season').value : '';
        const gender = g('product-gender') ? g('product-gender').value : '';
        const categoryId = g('product-category') ? g('product-category').value : '';
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
            description: description || null,
            materials: materialsStr || null,
            season: season || null,
            gender: gender || null,
            category_id: categoryId ? Number(categoryId) : null,
            brand_id: brandId ? Number(brandId) : null,
            is_active: isActive,
            images: productImages,
            variants: productVariants,
            tags: productTags.map(function(t) { return { id: t.id }; }),
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

        if (addBtn) addBtn.onclick = function() { openProductModal(null); };
        if (refreshBtn) refreshBtn.onclick = function() { fetchProducts(); };
        if (searchInput) {
            searchInput.oninput = function() {
                syncAdminSearchClear();
                clearTimeout(searchInputTimer);
                searchInputTimer = setTimeout(fetchProducts, 320);
            };
        }
        const searchClearBtn = document.getElementById('admin-search-clear');
        if (searchClearBtn && searchInput) {
            searchClearBtn.onclick = function() {
                searchInput.value = '';
                syncAdminSearchClear();
                fetchProducts();
            };
        }
        syncAdminSearchClear();
        if (openFiltersBtn) openFiltersBtn.onclick = openFiltersModal;
        if (applyFiltersBtn) applyFiltersBtn.onclick = applyFilters;
        if (clearFiltersBtn) clearFiltersBtn.onclick = clearFilters;
        if (cancelBtn) cancelBtn.onclick = requestCloseProductModal;

        if (sortBy) {
            sortBy.onchange = function(e) {
                state.sortOption = e.target.value;
                saveStateToStorage();
                fetchProducts();
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

        if (ui.productTagsTrigger) {
            ui.productTagsTrigger.onclick = function() {
                const container = ui.productTagsContainer;
                if (!container) return;
                container.classList.toggle('open');
            };
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
            if (vOk) vOk.onclick = function() { applyProductCatalogVisibilityFromConfirm(); };
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
            if (ui.productTagsContainer && !ui.productTagsContainer.contains(e.target)) {
                ui.productTagsContainer.classList.remove('open');
            }
        });

        setupTableDelegation();
        setupResizableColumns();
    }

    function initAdminPage() {
        loadStateFromStorage();

        ui.productsBody = document.getElementById('products-body');
        ui.productCount = document.getElementById('product-count');
        ui.filterCategoryMultiselect = document.getElementById('filter-category-multiselect');
        ui.filterCategoryDropdown = document.getElementById('filter-category-dropdown');
        ui.filterCategoryLabel = document.getElementById('filter-category-label');
        ui.filterCategoryTrigger = document.getElementById('filter-category-trigger');
        ui.productImagesInput = document.getElementById('product-images');
        ui.productImagesList = document.getElementById('product-images-list');
        ui.productTagsContainer = document.getElementById('product-tags-container');
        ui.productTagsTrigger = document.getElementById('product-tags-trigger');
        ui.productTagsDropdown = document.getElementById('product-tags-dropdown');
        ui.productVariantsContainer = document.getElementById('product-variants-container');
        ui.productAttributesContainer = document.getElementById('product-attributes-container');
        ui.productMaterialsList = document.getElementById('product-materials-list');

        ui.visibilityConfirmModal = document.getElementById('visibility-confirm-modal');

        const sortBy = document.getElementById('sort-by');
        if (sortBy) sortBy.value = state.sortOption;

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.onclick = doLogout;

        checkAuth().then(function(ok) {
            if (!ok) return;
            Promise.all([fetchCategories(), fetchBrands(), fetchSizes(), fetchColors(), fetchTags()])
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