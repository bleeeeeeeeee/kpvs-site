const Admin = (() => {
    let categories = [];
    let products = [];
    let editingProductId = null;
    let productImages = [];
    let availableSizes = [];
    let availableTags = [];
    let availableMaterials = [];
    let productSizes = [];
    let productTags = [];
    let productMaterials = [];
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
        productImagesListHandler: null,
        productSizesContainer: null,
        productSizesTrigger: null,
        productSizesDropdown: null,
        productSizesHidden: null,
        productTagsContainer: null,
        productTagsTrigger: null,
        productTagsDropdown: null,
        productTagsHidden: null,
        productMaterialsContainer: null,
        productMaterialsTrigger: null,
        productMaterialsDropdown: null,
        productMaterialsHidden: null
    };

    function slugify(text) {
        const translitMap = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
            'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
            'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
            'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
            'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm',
            'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
            'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
            'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya'
        };

        return text
            .toString()
            .trim()
            .toLowerCase()
            .split('')
            .map(char => translitMap[char] || char)
            .join('')
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
        if (close) close.onclick = (e) => {
            e.stopPropagation();
            node.remove();
        };

        node.onclick = (e) => {
            e.stopPropagation();
        };

        window.setTimeout(() => {
            if (node.isConnected) node.remove();
        }, kind === 'error' ? 7000 : 4500);
    }

    function setTableStatusRow(message) {
        if (!ui.productsBody || !ui.productCount) return;
        ui.productsBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">${escapeHtml(message)}</td>
            </tr>
        `;
        ui.productCount.textContent = '0';
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

    async function fetchSizes() {
        try {
            const response = await fetch('/api/sizes');
            if (!response.ok) {
                throw new Error('Не удалось загрузить размеры');
            }
            availableSizes = await response.json();
            populateSizesDropdown();
        } catch (error) {
            console.error('Error fetching sizes:', error);
            availableSizes = [];
            notify('Не удалось загрузить размеры.', 'error');
        }
    }

    async function fetchTags() {
        try {
            const response = await fetch('/api/tags');
            if (!response.ok) {
                throw new Error('Не удалось загрузить теги');
            }
            availableTags = await response.json();
            populateTagsDropdown();
        } catch (error) {
            console.error('Error fetching tags:', error);
            availableTags = [];
            notify('Не удалось загрузить теги.', 'error');
        }
    }

    async function fetchMaterials() {
        try {
            const response = await fetch('/api/materials');
            if (!response.ok) {
                throw new Error('Не удалось загрузить материалы');
            }
            availableMaterials = await response.json();
            populateMaterialsList();
        } catch (error) {
            console.error('Error fetching materials:', error);
            availableMaterials = [];
            notify('Не удалось загрузить материалы.', 'error');
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

    function populateSizesDropdown() {
        if (!ui.productSizesDropdown || !availableSizes.length) return;

        ui.productSizesDropdown.innerHTML = '';
        availableSizes.forEach((size) => {
            const option = document.createElement('div');
            option.className = 'admin-multiselect-option';
            const existingSize = productSizes.find(s => s.name === size.name);
            const quantity = existingSize ? existingSize.quantity : '';
            option.innerHTML = `
                <input type="checkbox" value="${size.name}" id="size-${size.name}" class="size-checkbox" />
                <label for="size-${size.name}" style="flex: 1">${escapeHtml(size.name)}</label>
                <input type="number" class="size-quantity" placeholder="Кол-во" min="0" value="${quantity}" style="width: 80px; margin-left: 10px;" />
            `;
            ui.productSizesDropdown.appendChild(option);
        });

        if (ui.productSizesTrigger) {
            ui.productSizesTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!ui.productSizesContainer) return;
                const isOpen = ui.productSizesContainer.classList.contains('open');
                if (isOpen) closeSizesDropdown();
                else openSizesDropdown();
            });
        }

        if (ui.productSizesDropdown) {
            ui.productSizesDropdown.addEventListener('change', () => {
                updateSelectedSizes();
            });
            
            ui.productSizesDropdown.addEventListener('click', (e) => {
                const option = e.target.closest('.admin-multiselect-option');
                if (option) {
                    const checkbox = option.querySelector('.size-checkbox');
                    if (checkbox && e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        updateSelectedSizes();
                    } else if (checkbox && e.target === checkbox) {
                        updateSelectedSizes();
                    }
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (!ui.productSizesContainer) return;
            if (!ui.productSizesContainer.contains(e.target)) {
                closeSizesDropdown();
            }
        });
    }

    function populateTagsDropdown() {
        if (!ui.productTagsDropdown || !availableTags.length) return;

        ui.productTagsDropdown.innerHTML = '';
        availableTags.forEach((tag) => {
            const option = document.createElement('div');
            option.className = 'admin-multiselect-option';
            option.innerHTML = `
                <input type="checkbox" value="${tag.code}" id="tag-${tag.code}" />
                <label for="tag-${tag.code}">${escapeHtml(tag.name)}</label>
            `;
            ui.productTagsDropdown.appendChild(option);
        });

        if (ui.productTagsTrigger) {
            ui.productTagsTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!ui.productTagsContainer) return;
                const isOpen = ui.productTagsContainer.classList.contains('open');
                if (isOpen) closeTagsDropdown();
                else openTagsDropdown();
            });
        }

        if (ui.productTagsDropdown) {
            ui.productTagsDropdown.addEventListener('change', () => {
                updateSelectedTags();
            });
            
            ui.productTagsDropdown.addEventListener('click', (e) => {
                const option = e.target.closest('.admin-multiselect-option');
                if (option) {
                    const checkbox = option.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        updateSelectedTags();
                    }
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (!ui.productTagsContainer) return;
            if (!ui.productTagsContainer.contains(e.target)) {
                closeTagsDropdown();
            }
        });
    }

    function openSizesDropdown() {
        if (!ui.productSizesContainer) return;
        ui.productSizesContainer.classList.add('open');
    }

    function closeSizesDropdown() {
        if (!ui.productSizesContainer) return;
        ui.productSizesContainer.classList.remove('open');
    }

    function openTagsDropdown() {
        if (!ui.productTagsContainer) return;
        ui.productTagsContainer.classList.add('open');
    }

    function closeTagsDropdown() {
        if (!ui.productTagsContainer) return;
        ui.productTagsContainer.classList.remove('open');
    }

    function updateSelectedSizes() {
        if (!ui.productSizesTrigger || !ui.productSizesHidden || !ui.productSizesDropdown) return;
        
        const options = ui.productSizesDropdown.querySelectorAll('.admin-multiselect-option');
        const selected = [];
        
        options.forEach((option) => {
            const checkbox = option.querySelector('.size-checkbox');
            const quantityInput = option.querySelector('.size-quantity');
            
            if (checkbox && checkbox.checked) {
                const quantity = quantityInput ? parseInt(quantityInput.value) || 0 : 0;
                if (quantity > 0) {
                    selected.push({
                        name: checkbox.value,
                        quantity: quantity
                    });
                }
            }
        });
        
        productSizes = selected;
        const names = selected.map(s => s.name);
        ui.productSizesHidden.value = names.join(',');
        
        if (names.length === 0) {
            ui.productSizesTrigger.textContent = 'Выберите размеры';
        } else if (names.length === 1) {
            ui.productSizesTrigger.textContent = names[0];
        } else {
            ui.productSizesTrigger.textContent = `Выбрано размеров: ${names.length}`;
        }
    }

    function updateSelectedTags() {
        if (!ui.productTagsTrigger || !ui.productTagsHidden || !ui.productTagsDropdown) return;
        
        const selected = Array.from(ui.productTagsDropdown.querySelectorAll('input[type="checkbox"]:checked'))
            .map((input) => input.value)
            .filter(Boolean);
        
        productTags = selected.map(code => ({ code }));
        ui.productTagsHidden.value = selected.join(',');
        
        if (selected.length === 0) {
            ui.productTagsTrigger.textContent = 'Выберите теги';
        } else if (selected.length === 1) {
            const tag = availableTags.find((t) => t.code === selected[0]);
            ui.productTagsTrigger.textContent = tag ? tag.name : selected[0];
        } else {
            ui.productTagsTrigger.textContent = `Выбрано тегов: ${selected.length}`;
        }
    }

    function populateMaterialsList() {
        if (!ui.productMaterialsContainer || !availableMaterials.length) return;

        ui.productMaterialsContainer.innerHTML = '';
        productMaterials.forEach((material, index) => {
            const materialDiv = document.createElement('div');
            materialDiv.className = 'admin-material-item';
            materialDiv.innerHTML = `
                <select class="admin-material-select">
                    <option value="">Выберите материал</option>
                    ${availableMaterials.map((m) => `<option value="${m.code}" ${m.code === material.code ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
                </select>
                <input type="number" class="admin-material-percentage" value="${material.percentage || 0}" min="0" max="100" step="1" placeholder="%" />
                <button type="button" class="admin-material-remove" data-index="${index}">×</button>
            `;
            ui.productMaterialsContainer.appendChild(materialDiv);
        });

        ui.productMaterialsContainer.querySelectorAll('.admin-material-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                removeMaterial(index);
            });
        });

        ui.productMaterialsContainer.querySelectorAll('.admin-material-select, .admin-material-percentage').forEach((el) => {
            el.addEventListener('change', updateMaterialsData);
        });
    }

    function addMaterial() {
        productMaterials.push({ code: '', percentage: 0 });
        populateMaterialsList();
    }

    function removeMaterial(index) {
        if (index >= 0 && index < productMaterials.length) {
            productMaterials.splice(index, 1);
            populateMaterialsList();
        }
    }

    function updateMaterialsData() {
        const materialItems = ui.productMaterialsContainer.querySelectorAll('.admin-material-item');
        productMaterials = Array.from(materialItems).map((item) => {
            const select = item.querySelector('.admin-material-select');
            const percentage = item.querySelector('.admin-material-percentage');
            return {
                code: select ? select.value : '',
                percentage: percentage ? parseInt(percentage.value) || 0 : 0
            };
        }).filter((m) => m.code && m.percentage > 0);
    }

    function loadStateFromStorage() {
        try {
            const saved = sessionStorage.getItem('adminFilters');
            if (saved) {
                const parsed = JSON.parse(saved);
                state.gender = parsed.gender || '';
                state.categories = parsed.categories || [];
                state.minPrice = parsed.minPrice || '';
                state.maxPrice = parsed.maxPrice || '';
                state.sortOption = parsed.sortOption || 'id_asc';
            }
        } catch (error) {
            console.error('Error loading state from storage:', error);
        }
    }

    function saveStateToStorage() {
        try {
            const stateToSave = {
                gender: state.gender,
                categories: state.categories,
                minPrice: state.minPrice,
                maxPrice: state.maxPrice,
                sortOption: state.sortOption
            };
            sessionStorage.setItem('adminFilters', JSON.stringify(stateToSave));
        } catch (error) {
            console.error('Error saving state to storage:', error);
        }
    }

    function saveProductFormData() {
        const formData = {
            name: document.getElementById('product-name')?.value || '',
            slug: document.getElementById('product-slug')?.value || '',
            description: document.getElementById('product-description')?.value || '',
            price: document.getElementById('product-price')?.value || '',
            image: document.getElementById('product-image')?.value || '',
            gender: document.getElementById('product-gender')?.value || 'mens',
            category: document.getElementById('product-category')?.value || '',
            sizes: productSizes,
            tags: productTags,
            materials: productMaterials,
            images: productImages
        };
        sessionStorage.setItem('productFormData', JSON.stringify(formData));
    }

    function loadProductFormData() {
        try {
            const saved = sessionStorage.getItem('productFormData');
            if (saved) {
                const formData = JSON.parse(saved);
                const nameInput = document.getElementById('product-name');
                const slugInput = document.getElementById('product-slug');
                const descInput = document.getElementById('product-description');
                const priceInput = document.getElementById('product-price');
                const imageInput = document.getElementById('product-image');
                const genderSelect = document.getElementById('product-gender');
                const categorySelect = document.getElementById('product-category');
                
                if (nameInput) nameInput.value = formData.name || '';
                if (slugInput) slugInput.value = formData.slug || '';
                if (descInput) descInput.value = formData.description || '';
                if (priceInput) priceInput.value = formData.price || '';
                if (imageInput) imageInput.value = formData.image || '';
                if (genderSelect) genderSelect.value = formData.gender || 'mens';
                if (categorySelect) categorySelect.value = formData.category || '';
                
                productSizes = Array.isArray(formData.sizes) ? formData.sizes : [];
                productTags = Array.isArray(formData.tags) ? formData.tags : [];
                productMaterials = Array.isArray(formData.materials) ? formData.materials : [];
                productImages = Array.isArray(formData.images) ? formData.images : [];
                
                setProductImages(productImages);
                populateSizesDropdown();
                populateTagsDropdown();
                populateMaterialsList();
                
                setTimeout(() => {
                    if (productSizes.length && ui.productSizesDropdown) {
                        const sizeMap = new Map(productSizes.map(s => [s.name || s, s.quantity || 0]));
                        ui.productSizesDropdown.querySelectorAll('.size-checkbox').forEach((input) => {
                            input.checked = sizeMap.has(input.value);
                        });
                        ui.productSizesDropdown.querySelectorAll('.size-quantity').forEach((input) => {
                            const sizeName = input.closest('.admin-multiselect-option')?.querySelector('.size-checkbox')?.value;
                            if (sizeName && sizeMap.has(sizeName)) {
                                input.value = sizeMap.get(sizeName);
                            }
                        });
                        updateSelectedSizes();
                    }
                    
                    if (productTags.length && ui.productTagsDropdown) {
                        const tagSet = new Set(productTags.map(t => t.code || t));
                        ui.productTagsDropdown.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                            input.checked = tagSet.has(input.value);
                        });
                        updateSelectedTags();
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error loading product form data:', error);
        }
    }

    function clearProductFormData() {
        sessionStorage.removeItem('productFormData');
    }

    function applySavedFilters() {
        const genderSelect = document.getElementById('filter-gender-modal');
        if (genderSelect) genderSelect.value = state.gender;

        const minPriceInput = document.getElementById('min-price');
        if (minPriceInput) minPriceInput.value = state.minPrice;

        const maxPriceInput = document.getElementById('max-price');
        if (maxPriceInput) maxPriceInput.value = state.maxPrice;

        const sortBy = document.getElementById('sort-by');
        if (sortBy) sortBy.value = state.sortOption;

        setSelectedCategories(state.categories);
    }

    function setSelectedCategories(codes) {
        const selected = normalizeSelectedCategories(codes);
        state.categories = selected;

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

        saveStateToStorage();
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

        ui.productImagesList.querySelectorAll('input[type="radio"][name="main-image"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                const index = Number(radio.value);
                if (!Number.isFinite(index)) return;
                productImages = productImages.map((img, i) => ({ ...img, is_main: i === index }));
                renderProductImages();
            });
        });

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
                    notify('Товар не найден', 'error');
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
        document.body.style.pointerEvents = 'none';
        modal.style.pointerEvents = 'auto';
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
                document.body.style.pointerEvents = '';
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
        
        saveStateToStorage();
        closeFiltersModal();
        fetchProducts();
    }

    function getSelectedCategories() {
        if (!ui.filterCategoryDropdown) return [];
        const selected = [];
        ui.filterCategoryDropdown.querySelectorAll('input[type="checkbox"]:checked').forEach((checkbox) => {
            selected.push(checkbox.value);
        });
        return selected;
    }

    function clearFilters() {
        state.gender = '';
        state.categories = [];
        state.minPrice = '';
        state.maxPrice = '';
        
        const genderSelect = document.getElementById('filter-gender-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        if (genderSelect) genderSelect.value = '';
        setSelectedCategories([]);
        if (minPriceInput) minPriceInput.value = '';
        if (maxPriceInput) maxPriceInput.value = '';
        
        saveStateToStorage();
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

    async function openProductModal(product = null) {
        const modal = document.getElementById('product-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('product-form');

        if (!modal || !title || !form) return;

        editingProductId = product?.id || null;
        title.textContent = product ? 'Редактировать товар' : 'Новый товар';

        form.reset();
        setProductImages([]);
        if (ui.productImagesInput) ui.productImagesInput.value = '';
        
        productSizes = [];
        productTags = [];
        productMaterials = [];
        
        document.body.classList.add('modal-open');
        document.body.style.pointerEvents = 'none';
        modal.style.pointerEvents = 'auto';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        
        if (product) {
            try {
                const fullProduct = await fetch(`/api/product/${encodeURIComponent(product.id)}`).then(r => r.ok ? r.json() : null);
                
                if (fullProduct) {
                    const nameInput = document.getElementById('product-name');
                    const slugInput = document.getElementById('product-slug');
                    const descInput = document.getElementById('product-description');
                    const priceInput = document.getElementById('product-price');
                    const imageInput = document.getElementById('product-image');
                    const genderSelect = document.getElementById('product-gender');
                    const categorySelect = document.getElementById('product-category');
                    
                    if (nameInput) nameInput.value = fullProduct.name || '';
                    if (slugInput) slugInput.value = fullProduct.slug || '';
                    if (descInput) descInput.value = fullProduct.description || '';
                    if (priceInput) priceInput.value = fullProduct.price != null ? fullProduct.price : '';
                    // Очищаем URL поле - оно будет заполняться только если пользователь хочет изменить основное изображение
                    if (imageInput) imageInput.value = '';
                    if (genderSelect) genderSelect.value = fullProduct.gender || 'mens';
                    if (categorySelect) categorySelect.value = fullProduct.category || (categories[0]?.code || '');
                    
                    // Загружаем изображения - они сохранены в массив images
                    if (Array.isArray(fullProduct.images) && fullProduct.images.length) {
                        setProductImages(fullProduct.images.map((img) => ({
                            path: img.path || img.image_path || img.image || '',
                            is_main: Boolean(img.is_main),
                            sort_order: Number(img.sort_order) || 0
                        })).filter(img => img.path));
                    } else if (fullProduct.image) {
                        // Fallback на основное изображение если нет массива images
                        setProductImages([{ path: fullProduct.image, is_main: true, sort_order: 0 }]);
                    }
                    
                    // Загружаем размеры
                    productSizes = Array.isArray(fullProduct.sizes) ? fullProduct.sizes.map(s => ({
                        name: s.size || s.name || '',
                        quantity: Number(s.quantity) || 0
                    })).filter(s => s.name) : [];
                    
                    // Загружаем теги
                    productTags = Array.isArray(fullProduct.tags) ? fullProduct.tags.map(t => ({
                        code: t.code || t
                    })) : [];
                    
                    // Загружаем материалы
                    productMaterials = Array.isArray(fullProduct.materials) ? fullProduct.materials.map(m => ({
                        code: m.material || m.code || '',
                        percentage: Number(m.percentage) || 0
                    })).filter(m => m.code) : [];
                    
                    setTimeout(() => {
                        // Восстанавливаем размеры с количеством
                        if (productSizes.length && ui.productSizesDropdown) {
                            const sizeMap = new Map(productSizes.map(s => [s.name || s, s.quantity || 0]));
                            ui.productSizesDropdown.querySelectorAll('.admin-multiselect-option').forEach((option) => {
                                const checkbox = option.querySelector('.size-checkbox');
                                const quantityInput = option.querySelector('.size-quantity');
                                if (checkbox) {
                                    const hasSize = sizeMap.has(checkbox.value);
                                    checkbox.checked = hasSize;
                                    if (hasSize && quantityInput) {
                                        quantityInput.value = sizeMap.get(checkbox.value) || 0;
                                    }
                                }
                            });
                            updateSelectedSizes();
                        }
                        
                        // Восстанавливаем теги - ВАЖНО: очищаем сначала, потом отмечаем нужные
                        if (ui.productTagsDropdown) {
                            // Сначала очищаем все чекбоксы
                            ui.productTagsDropdown.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                                input.checked = false;
                            });
                            // Потом отмечаем нужные
                            if (productTags && productTags.length > 0) {
                                const tagSet = new Set(productTags.map(t => t.code || t));
                                ui.productTagsDropdown.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                                    if (tagSet.has(input.value)) {
                                        input.checked = true;
                                    }
                                });
                            }
                            updateSelectedTags();
                        }
                        
                        populateMaterialsList();
                    }, 100);
                }
            } catch (error) {
                console.error('Failed to load product details:', error);
                notify('Не удалось загрузить полные данные товара', 'error');
            }
        } else {
            const genderSelect = document.getElementById('product-gender');
            const categorySelect = document.getElementById('product-category');
            if (genderSelect) genderSelect.value = 'mens';
            if (categorySelect && categories.length) {
                categorySelect.value = categories[0].code;
            }
            loadProductFormData();
        }
    }

    function closeProductModal() {
        const modal = document.getElementById('product-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => {
            if (!modal.classList.contains('show')) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
                document.body.style.pointerEvents = '';
            }
        }, 300);
        editingProductId = null;
    }

    async function saveProduct(event) {
        event.preventDefault();
        const form = document.getElementById('product-form');
        if (!form) return;

        // Обновляем данные из формы
        updateMaterialsData();
        updateSelectedSizes();
        updateSelectedTags();

        const nameInput = document.getElementById('product-name');
        const slugInput = document.getElementById('product-slug');
        const descInput = document.getElementById('product-description');
        const priceInput = document.getElementById('product-price');
        const imageInput = document.getElementById('product-image');
        const genderSelect = document.getElementById('product-gender');
        const categorySelect = document.getElementById('product-category');
        
        // Получаем все изображения
        let allImages = Array.isArray(productImages) ? [...productImages] : [];
        
        // Добавляем URL изображение если оно введено
        const urlImage = normalizeImagePath(imageInput ? imageInput.value : null);
        if (urlImage && !allImages.some(img => img.path === urlImage)) {
            allImages.push({ path: urlImage, is_main: false, sort_order: 9999 });
        }
        
        // Нормализуем изображения
        allImages = dedupeImages(allImages);
        
        // Если нет основного изображения, ставим первое
        if (!allImages.some(img => img.is_main) && allImages.length > 0) {
            allImages[0].is_main = true;
        }

        // Нормализуем размеры - убедимся что у всех есть количество > 0
        const normalizedSizes = Array.isArray(productSizes) ? productSizes.filter((s) => {
            const qty = Number(s.quantity) || 0;
            return s.name && qty > 0;
        }).map((s) => ({
            name: s.name || s.size || s,
            quantity: Number(s.quantity) || 0
        })) : [];

        // Нормализуем материалы - убедимся что у всех есть процент > 0
        const normalizedMaterials = Array.isArray(productMaterials) ? productMaterials.filter((m) => {
            const pct = Number(m.percentage) || 0;
            return m.code && pct > 0;
        }).map((m) => ({
            material: m.code || m.material || m,
            percentage: Number(m.percentage) || 0
        })) : [];

        // Нормализуем теги - только если выбраны
        const normalizedTags = Array.isArray(productTags) && productTags.length > 0 ? productTags.map((t) => ({
            code: t.code || t
        })) : [];

        // Определяем основное изображение для image_path
        const mainImage = allImages.find(img => img.is_main) || allImages[0] || null;

        const productData = {
            name: nameInput ? nameInput.value.trim() : '',
            slug: (slugInput ? slugInput.value.trim() : '') || slugify(nameInput ? nameInput.value : ''),
            description: descInput ? descInput.value.trim() : '',
            price: priceInput && priceInput.value ? Number(priceInput.value) : null,
            image_path: mainImage ? mainImage.path : null,
            gender_code: genderSelect ? genderSelect.value : 'mens',
            category_code: categorySelect ? categorySelect.value : '',
            images: allImages,
            sizes: normalizedSizes,
            tags: normalizedTags,
            materials: normalizedMaterials
        };

        if (!productData.name || !productData.category_code) {
            notify('Заполните обязательные поля: название и категорию.', 'error');
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
            clearProductFormData();
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
            saveStateToStorage();
            fetchProducts();
        };
        if (cancelBtn) cancelBtn.onclick = closeProductModal;
        
        const addMaterialBtn = document.getElementById('add-material-btn');
        if (addMaterialBtn) addMaterialBtn.onclick = addMaterial;
        
        const filterModal = document.getElementById('filter-modal');
        const productModal = document.getElementById('product-modal');
        const filterModalClose = filterModal?.querySelector('.modal-close');
        const productModalClose = productModal?.querySelector('.modal-close');
        
        if (filterModalClose) filterModalClose.onclick = closeFiltersModal;
        if (productModalClose) productModalClose.onclick = closeProductModal;
        
        const productForm = document.getElementById('product-form');
        if (productForm) {
            productForm.onsubmit = saveProduct;
            
            const inputs = productForm.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.addEventListener('input', saveProductFormData);
                input.addEventListener('change', saveProductFormData);
            });
        }
        
        const productNameInput = document.getElementById('product-name');
        const productSlugInput = document.getElementById('product-slug');
        if (productNameInput && productSlugInput) {
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
        loadStateFromStorage();
        
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
        ui.productSizesContainer = document.getElementById('product-sizes-container');
        ui.productSizesTrigger = document.getElementById('product-sizes-trigger');
        ui.productSizesDropdown = document.getElementById('product-sizes-dropdown');
        ui.productSizesHidden = document.getElementById('product-sizes-hidden');
        ui.productTagsContainer = document.getElementById('product-tags-container');
        ui.productTagsTrigger = document.getElementById('product-tags-trigger');
        ui.productTagsDropdown = document.getElementById('product-tags-dropdown');
        ui.productTagsHidden = document.getElementById('product-tags-hidden');
        ui.productMaterialsContainer = document.getElementById('product-materials-container');

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
            applySavedFilters();
            fetchProducts();
        });
        fetchSizes();
        fetchTags();
        fetchMaterials();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminPage);
    } else {
        initAdminPage();
    }
})();