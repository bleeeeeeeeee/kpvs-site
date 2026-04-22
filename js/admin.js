const Admin = (() => {
    let categories = [];
    let products = [];
    let editingProductId = null;
    let productImages = [];
    const state = {
        gender: '',
        categories: [],
        minPrice: '',
        maxPrice: '',
        sortOption: 'id_asc'
    };

    const ui = {
        productsBody: null,
        productCount: null,
        filterCategoryHidden: null,
        filterCategoryMultiselect: null,
        filterCategoryDropdown: null,
        filterCategoryLabel: null,
        filterCategoryTrigger: null,
        productCategorySelect: null,
        productImagesInput: null,
        productImagesList: null,
        productImagesListHandler: null
    };

    function slugify(text) {
        return text
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function notify(message, kind = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const node = document.createElement('div');
        node.className = 'notification show';
        node.setAttribute('role', 'status');
        node.innerHTML = `
            <div class="notification-handle" aria-hidden="true"></div>
            <div class="notification-content">
                <strong>${escapeHtml(kind === 'error' ? 'Ошибка' : kind === 'success' ? 'Готово' : 'Сообщение')}</strong>
                <span>${escapeHtml(message)}</span>
            </div>
            <button class="notification-close" type="button" aria-label="Закрыть">&times;</button>
        `;
        document.body.appendChild(node);

        const close = node.querySelector('.notification-close');
        if (close) close.onclick = () => node.remove();

        window.setTimeout(() => {
            if (node.isConnected) node.remove();
        }, kind === 'error' ? 7000 : 4500);
    }

    function saveFiltersToStorage() {
        try {
            const filters = {
                gender: state.gender,
                categories: state.categories,
                minPrice: state.minPrice,
                maxPrice: state.maxPrice,
                sortOption: state.sortOption
            };
            localStorage.setItem('adminFilters', JSON.stringify(filters));
        } catch (error) {
            console.warn('Failed to save filters to localStorage:', error);
        }
    }

    function loadFiltersFromStorage() {
        try {
            const saved = localStorage.getItem('adminFilters');
            if (saved) {
                const filters = JSON.parse(saved);
                Object.assign(state, filters);
                return true;
            }
        } catch (error) {
            console.warn('Failed to load filters from localStorage:', error);
        }
        return false;
    }

    function applySavedFilters() {
        // Применяем сохраненные фильтры к UI элементам
        const genderSelect = document.getElementById('filter-gender');
        const minPriceInput = document.getElementById('filter-min-price');
        const maxPriceInput = document.getElementById('filter-max-price');
        const sortSelect = document.getElementById('sort-by');

        if (genderSelect) genderSelect.value = state.gender || '';
        if (minPriceInput) minPriceInput.value = state.minPrice || '';
        if (maxPriceInput) maxPriceInput.value = state.maxPrice || '';
        if (sortSelect) sortSelect.value = state.sortOption || 'id_asc';

        // Применяем категории (без повторного сохранения)
        if (state.categories && state.categories.length > 0 && ui.filterCategoryDropdown) {
            const set = new Set(state.categories);
            ui.filterCategoryDropdown.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                input.checked = set.has(input.value);
            });
            if (ui.filterCategoryHidden) {
                ui.filterCategoryHidden.value = state.categories.join(',');
            }
        }
    }

    function normalizeSelectedCategories(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
        return String(value)
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
    }

    async function fetchCategories() {
        try {
            const response = await fetch('/api/categories');
            if (!response.ok) {
                throw new Error('Не удалось загрузить категории');
            }
            const data = await response.json();
            categories = flattenCategories(data);
            populateCategoryFilters();
        } catch (error) {
            console.error('Error fetching categories:', error);
            categories = [];
            populateCategoryFilters();
            notify('Не удалось загрузить категории. Проверьте сервер и попробуйте обновить.', 'error');
        }
    }

    function flattenCategories(list) {
        const result = [];
        if (!Array.isArray(list)) return result;
        list.forEach((item) => {
            if (item && item.code) {
                result.push({ code: item.code, name: item.name || item.code });
                if (Array.isArray(item.children) && item.children.length) {
                    result.push(...flattenCategories(item.children));
                }
            }
        });
        return result;
    }

    function populateCategoryFilters() {
        if (!ui.filterCategoryDropdown || !ui.filterCategoryHidden || !ui.productCategorySelect) return;

        ui.filterCategoryDropdown.innerHTML = '';
        categories.forEach((category) => {
            const option = document.createElement('label');
            option.className = 'admin-multiselect-option';
            option.innerHTML = `
                <input type="checkbox" value="${escapeHtml(category.code)}" />
                <span>${escapeHtml(category.name)}</span>
            `;
            ui.filterCategoryDropdown.appendChild(option);
        });

        ui.productCategorySelect.innerHTML = categories
            .map((category) => `<option value="${category.code}">${escapeHtml(category.name)}</option>`)
            .join('');

        const next = normalizeSelectedCategories(state.categories);
        setSelectedCategories(next);
    }

    function getSelectedCategories() {
        if (!ui.filterCategoryDropdown) return [];
        return Array.from(ui.filterCategoryDropdown.querySelectorAll('input[type="checkbox"]:checked'))
            .map((input) => input.value)
            .filter(Boolean);
    }

    function setSelectedCategories(codes) {
        const selected = normalizeSelectedCategories(codes);
        state.categories = selected;
        saveFiltersToStorage();

        if (ui.filterCategoryHidden) {
            ui.filterCategoryHidden.value = selected.join(',');
        }

        if (ui.filterCategoryDropdown) {
            const set = new Set(selected);
            ui.filterCategoryDropdown.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                input.checked = set.has(input.value);
            });
        }

        if (ui.filterCategoryLabel) {
            if (!selected.length) {
                ui.filterCategoryLabel.textContent = 'Все категории';
            } else if (selected.length === 1) {
                const name = categories.find((c) => c.code === selected[0])?.name || selected[0];
                ui.filterCategoryLabel.textContent = name;
            } else {
                ui.filterCategoryLabel.textContent = `Выбрано категорий: ${selected.length}`;
            }
        }
    }

    function openCategoryDropdown() {
        if (!ui.filterCategoryMultiselect) return;
        ui.filterCategoryMultiselect.classList.add('open');
    }

    function closeCategoryDropdown() {
        if (!ui.filterCategoryMultiselect) return;
        ui.filterCategoryMultiselect.classList.remove('open');
    }

    function getSortValues() {
        const parts = state.sortOption.split('_');
        const sortDir = parts.pop();
        const sortBy = parts.join('_');
        return { sortBy, sortDir };
    }

    async function fetchProducts() {
        try {
            setTableStatusRow('Загрузка товаров…');
            const searchInput = document.getElementById('search-input');
            const params = new URLSearchParams();
            if (searchInput && searchInput.value.trim()) params.set('q', searchInput.value.trim());
            if (state.gender) params.set('gender', state.gender);
            if (state.categories && state.categories.length) {
                state.categories.forEach((code) => params.append('category', code));
            }
            if (state.minPrice) params.set('price_min', state.minPrice);
            if (state.maxPrice) params.set('price_max', state.maxPrice);
            const { sortBy, sortDir } = getSortValues();
            params.set('sort_by', sortBy);
            params.set('sort_direction', sortDir);
            params.set('limit', '100');
            params.set('offset', '0');

            const response = await fetch(`/api/admin/products?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`Не удалось загрузить товары (код ${response.status})`);
            }
            products = await response.json();
            renderProducts();
        } catch (error) {
            console.error('Error fetching products:', error);
            products = [];
            setTableStatusRow('Не удалось загрузить товары. Проверьте подключение к серверу и обновите страницу.');
            notify(error.message || 'Не удалось загрузить товары.', 'error');
        }
    }

    function renderProducts() {
        if (!ui.productsBody || !ui.productCount) return;

        if (!products || products.length === 0) {
            ui.productsBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="7">Товары не найдены по текущим условиям поиска и фильтрам.</td>
                </tr>
            `;
            ui.productCount.textContent = '0';
            return;
        }

        ui.productsBody.innerHTML = products.map((product) => {
            const category = categories.find((item) => item.code === product.category)?.name || product.category || '-';
            const genderLabel = product.gender === 'mens' ? 'Мужской' : product.gender === 'womens' ? 'Женский' : (product.gender || '-');
            const description = product.description || '-';
            const shortDescription = description.length > 80 ? description.substring(0, 80) + '...' : description;
            
            return `
                <tr data-product-id="${product.id}">
                    <td class="cell-id">${product.id}</td>
                    <td>
                        <div class="cell-name">
                            <strong>${escapeHtml(product.name)}</strong>
                        </div>
                    </td>
                    <td title="${escapeHtml(description)}">
                        <div class="cell-description">${escapeHtml(shortDescription)}</div>
                    </td>
                    <td>${escapeHtml(category)}</td>
                    <td>${escapeHtml(genderLabel)}</td>
                    <td class="cell-price">${product.price !== null && product.price !== undefined ? product.price.toFixed(2) : 'По запросу'}</td>
                    <td>
                        <div class="admin-actions-cell">
                            <button type="button" class="btn-edit" data-action="edit" data-id="${product.id}">Редактировать</button>
                            <button type="button" class="btn-delete" data-action="delete" data-id="${product.id}">Удалить</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        ui.productCount.textContent = products.length.toString();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeImagePath(path) {
        if (!path || typeof path !== 'string') return null;
        const trimmed = path.trim();
        return trimmed ? trimmed : null;
    }

    function dedupeImages(images) {
        const seen = new Set();
        const out = [];
        images.forEach((img) => {
            const p = normalizeImagePath(img?.path);
            if (!p) return;
            if (seen.has(p)) return;
            seen.add(p);
            out.push({ path: p, is_main: Boolean(img?.is_main), sort_order: out.length });
        });
        if (!out.length) return [];
        if (!out.some((i) => i.is_main)) out[0].is_main = true;
        return out;
    }

    function setProductImages(nextImages) {
        productImages = dedupeImages(Array.isArray(nextImages) ? nextImages : []);
        renderProductImages();
    }

    function renderProductImages() {
        if (!ui.productImagesList) return;
        if (!productImages.length) {
            ui.productImagesList.innerHTML = '';
            return;
        }

        ui.productImagesList.innerHTML = productImages.map((img, idx) => {
            const safePath = escapeHtml(img.path);
            const checked = img.is_main ? 'checked' : '';
            return `
                <div class="admin-image-item" data-index="${idx}">
                    <div class="admin-image-thumb">
                        <img src="${safePath}" alt="image ${idx + 1}">
                    </div>
                    <div class="admin-image-meta">
                        <strong>Картинка ${idx + 1}</strong>
                        <code title="${safePath}">${safePath}</code>
                    </div>
                    <div class="admin-image-actions">
                        <label for="main-image-${idx}">
                            <input type="radio" id="main-image-${idx}" name="main-image" value="${idx}" ${checked} />
                            Главная
                        </label>
                        <button type="button" data-action="remove-image" data-index="${idx}">Удалить</button>
                    </div>
                </div>
            `;
        }).join('');

        // Используем делегирование событий для избежания множественных обработчиков
        // Обработчик добавляется один раз при инициализации
        const handleMainImageChange = (event) => {
            if (event.target.name === 'main-image' && event.target.type === 'radio') {
                const index = Number(event.target.value);
                if (!Number.isFinite(index) || index >= productImages.length) return;
                
                // Снимаем флаг is_main со всех изображений
                productImages.forEach(img => img.is_main = false);
                // Устанавливаем флаг is_main для выбранного изображения
                productImages[index].is_main = true;
            }
        };
        
        // Удаляем старый обработчик, если есть
        ui.productImagesList.removeEventListener('change', ui.productImagesListHandler);
        // Добавляем новый обработчик и сохраняем ссылку
        ui.productImagesListHandler = handleMainImageChange;
        ui.productImagesList.addEventListener('change', handleMainImageChange);

        ui.productImagesList.querySelectorAll('[data-action="remove-image"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(index)) return;
                productImages.splice(index, 1);
                if (productImages.length && !productImages.some((i) => i.is_main)) {
                    productImages[0].is_main = true;
                }
                productImages = dedupeImages(productImages);
                renderProductImages();
            });
        });
    }

    async function uploadSelectedFiles(files) {
        const list = Array.from(files || []).filter(Boolean);
        if (!list.length) return [];
        const form = new FormData();
        list.forEach((file) => form.append('images', file, file.name));

        const res = await fetch('/api/admin/uploads', { method: 'POST', body: form });
        if (!res.ok) {
            let details = '';
            try {
                const err = await res.json();
                if (err && err.error) details = String(err.error);
            } catch {}
            throw new Error(details || `Не удалось загрузить изображения (код ${res.status})`);
        }
        const data = await res.json();
        const uploaded = Array.isArray(data?.files) ? data.files : [];
        return uploaded.map((p) => ({ path: p, is_main: false, sort_order: 0 }));
    }

    async function loadProductImagesForEdit(productId) {
        try {
            const res = await fetch(`/api/product/${encodeURIComponent(productId)}`);
            if (!res.ok) return;
            const full = await res.json();
            const images = Array.isArray(full?.images) ? full.images : [];
            if (images.length) {
                setProductImages(images.map((img) => ({
                    path: img.path || img.image_path || img.image || '',
                    is_main: Boolean(img.is_main),
                    sort_order: Number(img.sort_order) || 0
                })));
                return;
            }
            if (full?.image) {
                setProductImages([{ path: full.image, is_main: true, sort_order: 0 }]);
            }
        } catch (error) {
            console.error('Failed to load product images:', error);
        }
    }

    function setupTableDelegation() {
        const tableContainer = document.querySelector('.admin-table-container');
        if (!tableContainer) return;
        
        if (tableContainer._handlerSet) return;
        tableContainer._handlerSet = true;
        
        tableContainer.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const id = parseInt(button.getAttribute('data-id'), 10);
            
            if (isNaN(id)) {
                console.error('Invalid product ID');
                return;
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            if (action === 'edit') {
                const product = products.find((item) => item.id === id);
                if (product) {
                    openProductModal(product);
                } else {
                    alert('Товар не найден');
                }
            } else if (action === 'delete') {
                if (confirm(`Вы уверены, что хотите удалить товар ID: ${id}?`)) {
                    deleteProduct(id);
                }
            }
        });
    }

    function setupResizableColumns() {
        const table = document.querySelector('.admin-table');
        if (!table) return;
        if (table._resizableSet) return;
        table._resizableSet = true;

        const headerRow = table.querySelector('thead tr');
        const cols = Array.from(table.querySelectorAll('colgroup col'));
        const ths = Array.from(table.querySelectorAll('thead th'));
        if (!headerRow || !cols.length || ths.length !== cols.length) return;

        ths.forEach((th, index) => {
            if (index === ths.length - 1) return;
            const handle = document.createElement('span');
            handle.className = 'admin-col-resizer';
            handle.setAttribute('role', 'separator');
            handle.setAttribute('aria-orientation', 'vertical');
            th.appendChild(handle);

            const minWidths = [60, 180, 220, 140, 110, 110, 160];
            const minWidth = minWidths[index] || 80;

            const onPointerDown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                try { handle.setPointerCapture(e.pointerId); } catch {}
                const startX = e.clientX;
                const startWidth = th.getBoundingClientRect().width;

                const onMove = (moveEvent) => {
                    const dx = moveEvent.clientX - startX;
                    const nextWidth = Math.max(minWidth, Math.round(startWidth + dx));
                    cols[index].style.width = `${nextWidth}px`;
                };

                const onUp = () => {
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', onUp);
                };

                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
            };

            handle.addEventListener('pointerdown', onPointerDown);
        });
    }

    function openFiltersModal() {
        const modal = document.getElementById('filter-modal');
        if (!modal) return;
        
        const genderSelect = document.getElementById('filter-gender-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        if (genderSelect) genderSelect.value = state.gender || '';
        setSelectedCategories(state.categories);
        if (minPriceInput) minPriceInput.value = state.minPrice || '';
        if (maxPriceInput) maxPriceInput.value = state.maxPrice || '';
        
        document.body.classList.add('modal-open');
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    function closeFiltersModal() {
        const modal = document.getElementById('filter-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => {
            if (!modal.classList.contains('show')) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }, 300);
    }

    function applyFilters() {
        const genderSelect = document.getElementById('filter-gender-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        state.gender = genderSelect ? genderSelect.value : '';
        state.categories = getSelectedCategories();
        state.minPrice = minPriceInput ? minPriceInput.value.trim() : '';
        state.maxPrice = maxPriceInput ? maxPriceInput.value.trim() : '';
        saveFiltersToStorage();
        
        closeFiltersModal();
        fetchProducts();
    }

    function clearFilters() {
        state.gender = '';
        state.categories = [];
        state.minPrice = '';
        state.maxPrice = '';
        saveFiltersToStorage();
        
        const genderSelect = document.getElementById('filter-gender-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        if (genderSelect) genderSelect.value = '';
        setSelectedCategories([]);
        if (minPriceInput) minPriceInput.value = '';
        if (maxPriceInput) maxPriceInput.value = '';
        
        closeFiltersModal();
        fetchProducts();
    }

    async function deleteProduct(id) {
        try {
            const response = await fetch(`/api/admin/products/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Не удалось удалить товар (код ${response.status})`);
            }
            await fetchProducts();
            notify('Товар успешно удалён', 'success');
        } catch (error) {
            console.error('Error deleting product:', error);
            notify(error.message || 'Не удалось удалить товар.', 'error');
        }
    }

    function openProductModal(product = null) {
        const modal = document.getElementById('product-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('product-form');

        if (!modal || !title || !form) return;

        editingProductId = product?.id || null;
        title.textContent = product ? 'Редактировать товар' : 'Новый товар';

        form.reset();
        setProductImages([]);
        if (ui.productImagesInput) ui.productImagesInput.value = '';
        
        if (product) {
            const nameInput = document.getElementById('product-name');
            const slugInput = document.getElementById('product-slug');
            const descInput = document.getElementById('product-description');
            const priceInput = document.getElementById('product-price');
            const imageInput = document.getElementById('product-image');
            const genderSelect = document.getElementById('product-gender');
            const categorySelect = document.getElementById('product-category');
            
            if (nameInput) nameInput.value = product.name || '';
            if (slugInput) slugInput.value = product.slug || '';
            if (descInput) descInput.value = product.description || '';
            if (priceInput) priceInput.value = product.price != null ? product.price : '';
            if (imageInput) imageInput.value = product.image || '';
            if (genderSelect) genderSelect.value = product.gender || 'mens';
            if (categorySelect) categorySelect.value = product.category || (categories[0]?.code || '');
            loadProductImagesForEdit(product.id);
        } else {
            const categorySelect = document.getElementById('product-category');
            if (categorySelect && categories.length) {
                categorySelect.value = categories[0].code;
            }
        }
        
        document.body.classList.add('modal-open');
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    function closeProductModal() {
        const modal = document.getElementById('product-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => {
            if (!modal.classList.contains('show')) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }, 300);
        editingProductId = null;
    }

    async function saveProduct(event) {
        event.preventDefault();
        const form = document.getElementById('product-form');
        if (!form) return;

        const nameInput = document.getElementById('product-name');
        const slugInput = document.getElementById('product-slug');
        const descInput = document.getElementById('product-description');
        const priceInput = document.getElementById('product-price');
        const imageInput = document.getElementById('product-image');
        const genderSelect = document.getElementById('product-gender');
        const categorySelect = document.getElementById('product-category');
        
        const urlImage = normalizeImagePath(imageInput ? imageInput.value : null);
        const combinedImages = dedupeImages([
            ...(productImages || []),
            ...(urlImage ? [{ path: urlImage, is_main: false, sort_order: 9999 }] : [])
        ]);
        const main = combinedImages.find((i) => i.is_main) || combinedImages[0] || null;

        const productData = {
            name: nameInput ? nameInput.value.trim() : '',
            slug: (slugInput ? slugInput.value.trim() : '') || slugify(nameInput ? nameInput.value : ''),
            description: descInput ? descInput.value.trim() : '',
            price: priceInput && priceInput.value ? Number(priceInput.value) : null,
            image_path: main ? main.path : null,
            gender_code: genderSelect ? genderSelect.value : 'mens',
            category_code: categorySelect ? categorySelect.value : '',
            images: combinedImages
        };

        if (!productData.name || !productData.category_code) {
            alert('Заполните обязательные поля: название и категорию.');
            return;
        }

        try {
            const method = editingProductId ? 'PUT' : 'POST';
            const url = editingProductId ? `/api/admin/products/${editingProductId}` : '/api/admin/products';
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productData)
            });

            if (!response.ok) {
                let details = '';
                try {
                    const err = await response.json();
                    if (err && err.error) details = String(err.error);
                } catch {}
                throw new Error(details || `Не удалось сохранить товар (код ${response.status})`);
            }

            await fetchProducts();
            closeProductModal();
            notify(editingProductId ? 'Товар успешно обновлён' : 'Товар успешно добавлен', 'success');
        } catch (error) {
            console.error('Error saving product:', error);
            notify(error.message || 'Не удалось сохранить товар.', 'error');
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
        
        if (addBtn) addBtn.onclick = () => openProductModal();
        if (refreshBtn) refreshBtn.onclick = () => fetchProducts();
        if (searchInput) searchInput.oninput = () => fetchProducts();
        if (openFiltersBtn) openFiltersBtn.onclick = openFiltersModal;
        if (applyFiltersBtn) applyFiltersBtn.onclick = applyFilters;
        if (clearFiltersBtn) clearFiltersBtn.onclick = clearFilters;
        if (sortBy) sortBy.onchange = (e) => {
            state.sortOption = e.target.value;
            saveFiltersToStorage();
            fetchProducts();
        };
        if (cancelBtn) cancelBtn.onclick = closeProductModal;
        
        const filterModal = document.getElementById('filter-modal');
        const productModal = document.getElementById('product-modal');
        const filterModalClose = filterModal?.querySelector('.modal-close');
        const productModalClose = productModal?.querySelector('.modal-close');
        
        if (filterModalClose) filterModalClose.onclick = closeFiltersModal;
        if (filterModal) filterModal.onclick = (e) => {
            if (e.target === filterModal) closeFiltersModal();
        };
        if (productModalClose) productModalClose.onclick = closeProductModal;
        if (productModal) productModal.onclick = (e) => {
            if (e.target === productModal) closeProductModal();
        };
        
        const productForm = document.getElementById('product-form');
        if (productForm) productForm.onsubmit = saveProduct;
        
        const productNameInput = document.getElementById('product-name');
        const productSlugInput = document.getElementById('product-slug');
        if (productNameInput && productSlugInput) {
            productNameInput.addEventListener('input', () => {
                if (!productSlugInput.value || productSlugInput.value.trim() === '') {
                    productSlugInput.value = slugify(productNameInput.value);
                }
            });
        }

        if (ui.productImagesInput) {
            ui.productImagesInput.addEventListener('change', async () => {
                const files = ui.productImagesInput.files;
                if (!files || !files.length) return;
                try {
                    notify('Загружаю изображения…', 'info');
                    const uploaded = await uploadSelectedFiles(files);
                    const next = dedupeImages([...(productImages || []), ...uploaded]);
                    if (next.length && !next.some((i) => i.is_main)) next[0].is_main = true;
                    setProductImages(next);
                    notify('Изображения загружены', 'success');
                } catch (error) {
                    console.error('Upload failed:', error);
                    notify(error.message || 'Не удалось загрузить изображения.', 'error');
                } finally {
                    ui.productImagesInput.value = '';
                }
            });
        }
        
        setupTableDelegation();
        setupResizableColumns();
    }

    function initAdminPage() {
        ui.productsBody = document.getElementById('products-body');
        ui.productCount = document.getElementById('product-count');
        ui.filterCategoryHidden = document.getElementById('filter-category-modal');
        ui.filterCategoryMultiselect = document.getElementById('filter-category-multiselect');
        ui.filterCategoryDropdown = document.getElementById('filter-category-dropdown');
        ui.filterCategoryLabel = document.getElementById('filter-category-label');
        ui.filterCategoryTrigger = document.getElementById('filter-category-trigger');
        ui.productCategorySelect = document.getElementById('product-category');
        ui.productImagesInput = document.getElementById('product-images');
        ui.productImagesList = document.getElementById('product-images-list');

        // Загружаем сохраненные фильтры
        loadFiltersFromStorage();

        const sortBy = document.getElementById('sort-by');
        if (sortBy && !sortBy.value) {
            sortBy.value = 'id_asc';
        } else if (sortBy) {
            sortBy.value = state.sortOption;
        }

        if (ui.filterCategoryTrigger) {
            ui.filterCategoryTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!ui.filterCategoryMultiselect) return;
                const isOpen = ui.filterCategoryMultiselect.classList.contains('open');
                if (isOpen) closeCategoryDropdown();
                else openCategoryDropdown();
            });
        }

        if (ui.filterCategoryDropdown) {
            ui.filterCategoryDropdown.addEventListener('change', () => {
                setSelectedCategories(getSelectedCategories());
            });
        }

        document.addEventListener('click', (e) => {
            if (!ui.filterCategoryMultiselect) return;
            if (!ui.filterCategoryMultiselect.contains(e.target)) {
                closeCategoryDropdown();
            }
        });

        attachEvents();
        fetchCategories().then(() => {
            // Применяем сохраненные фильтры после загрузки категорий
            applySavedFilters();
            // Загружаем товары с применённными фильтрами
            fetchProducts();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminPage);
    } else {
        initAdminPage();
    }
})();