const Admin = (() => {
    let categories = [];
    let products = [];
    let editingProductId = null;
    const state = {
        gender: '',
        category: '',
        minPrice: '',
        maxPrice: '',
        sortOption: 'created_at_desc'
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
            categories = [
                { code: 'outerwear', name: 'Верхняя одежда' },
                { code: 'pants', name: 'Брюки' },
                { code: 'accessories', name: 'Аксессуары' }
            ];
            populateCategoryFilters();
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
        const filterSelect = document.getElementById('filter-category-modal');
        const formSelect = document.getElementById('product-category');

        if (!filterSelect || !formSelect) return;

        filterSelect.innerHTML = '<option value="">Все категории</option>' + categories
            .map((category) => `<option value="${category.code}">${category.name}</option>`)
            .join('');

        formSelect.innerHTML = categories
            .map((category) => `<option value="${category.code}">${category.name}</option>`)
            .join('');
    }

    function getSortValues() {
        const parts = state.sortOption.split('_');
        const sortDir = parts.pop();
        const sortBy = parts.join('_');
        return { sortBy, sortDir };
    }

    async function fetchProducts() {
        try {
            const searchInput = document.getElementById('search-input');
            const params = new URLSearchParams();
            if (searchInput && searchInput.value.trim()) params.set('q', searchInput.value.trim());
            if (state.gender) params.set('gender', state.gender);
            if (state.category) params.set('category', state.category);
            if (state.minPrice) params.set('price_min', state.minPrice);
            if (state.maxPrice) params.set('price_max', state.maxPrice);
            const { sortBy, sortDir } = getSortValues();
            params.set('sort_by', sortBy);
            params.set('sort_direction', sortDir);
            params.set('limit', '100');
            params.set('offset', '0');

            const response = await fetch(`/api/admin/products?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Не удалось загрузить товары');
            }
            products = await response.json();
            renderProducts();
        } catch (error) {
            console.error('Error fetching products:', error);
            showDemoData();
        }
    }

    function showDemoData() {
        products = [
            {
                id: 1,
                name: 'Куртка утепленная',
                description: 'Теплая зимняя куртка с водоотталкивающей пропиткой',
                price: 299.99,
                image: '/img/demo1.jpg',
                gender: 'mens',
                category: 'outerwear'
            },
            {
                id: 2,
                name: 'Брюки классические',
                description: 'Классические брюки из костюмной ткани',
                price: 149.99,
                image: '/img/demo2.jpg',
                gender: 'mens',
                category: 'pants'
            },
            {
                id: 3,
                name: 'Платье офисное',
                description: 'Элегантное платье для офиса',
                price: 199.99,
                image: '/img/demo3.jpg',
                gender: 'womens',
                category: 'outerwear'
            }
        ];
        renderProducts();
    }

    function renderProducts() {
        const body = document.getElementById('products-body');
        const count = document.getElementById('product-count');

        if (!body || !count) return;

        if (!products || products.length === 0) {
            body.innerHTML = `
                <tr class="empty-row">
                    <td colspan="7">Товары не найдены по текущим условиям поиска и фильтрам.</td>
                </tr>
            `;
            count.textContent = '0';
            return;
        }

        body.innerHTML = products.map((product) => {
            const category = categories.find((item) => item.code === product.category)?.name || product.category || '-';
            const genderLabel = product.gender === 'mens' ? 'Мужской' : product.gender === 'womens' ? 'Женский' : (product.gender || '-');
            const description = product.description || '-';
            const shortDescription = description.length > 80 ? description.substring(0, 80) + '...' : description;
            
            return `
                <tr data-product-id="${product.id}">
                    <td class="cell-id">${product.id}</td>
                    <td class="cell-name"><strong>${escapeHtml(product.name)}</strong></td>
                    <td class="cell-description" title="${escapeHtml(description)}">${escapeHtml(shortDescription)}</td>
                    <td>${escapeHtml(category)}</td>
                    <td>${escapeHtml(genderLabel)}</td>
                    <td class="cell-price">${product.price !== null && product.price !== undefined ? product.price.toFixed(2) : 'По запросу'}</td>
                    <td class="admin-actions-cell">
                        <button type="button" class="btn-edit" data-action="edit" data-id="${product.id}">Редактировать</button>
                        <button type="button" class="btn-delete" data-action="delete" data-id="${product.id}">Удалить</button>
                    </td>
                </tr>
            `;
        }).join('');

        count.textContent = products.length.toString();
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

    function openFiltersModal() {
        const modal = document.getElementById('filter-modal');
        if (!modal) return;
        
        const genderSelect = document.getElementById('filter-gender-modal');
        const categorySelect = document.getElementById('filter-category-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        if (genderSelect) genderSelect.value = state.gender;
        if (categorySelect) categorySelect.value = state.category;
        if (minPriceInput) minPriceInput.value = state.minPrice;
        if (maxPriceInput) maxPriceInput.value = state.maxPrice;
        
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
            }
        }, 300);
    }

    function applyFilters() {
        const genderSelect = document.getElementById('filter-gender-modal');
        const categorySelect = document.getElementById('filter-category-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        state.gender = genderSelect ? genderSelect.value : '';
        state.category = categorySelect ? categorySelect.value : '';
        state.minPrice = minPriceInput ? minPriceInput.value.trim() : '';
        state.maxPrice = maxPriceInput ? maxPriceInput.value.trim() : '';
        
        closeFiltersModal();
        fetchProducts();
    }

    function clearFilters() {
        state.gender = '';
        state.category = '';
        state.minPrice = '';
        state.maxPrice = '';
        
        const genderSelect = document.getElementById('filter-gender-modal');
        const categorySelect = document.getElementById('filter-category-modal');
        const minPriceInput = document.getElementById('min-price');
        const maxPriceInput = document.getElementById('max-price');
        
        if (genderSelect) genderSelect.value = '';
        if (categorySelect) categorySelect.value = '';
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
                products = products.filter(p => p.id !== id);
                renderProducts();
                alert('Товар удален локально (API недоступен)');
                return;
            }
            await fetchProducts();
            alert('Товар успешно удален');
        } catch (error) {
            console.error('Error deleting product:', error);
            products = products.filter(p => p.id !== id);
            renderProducts();
            alert('Товар удален локально (ошибка соединения)');
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
        }
        
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
        
        const productData = {
            name: nameInput ? nameInput.value.trim() : '',
            slug: (slugInput ? slugInput.value.trim() : '') || slugify(nameInput ? nameInput.value : ''),
            description: descInput ? descInput.value.trim() : '',
            price: priceInput && priceInput.value ? Number(priceInput.value) : null,
            image_path: imageInput ? imageInput.value.trim() : null,
            gender_code: genderSelect ? genderSelect.value : 'mens',
            category_code: categorySelect ? categorySelect.value : ''
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
                const newProduct = {
                    id: editingProductId || Date.now(),
                    name: productData.name,
                    description: productData.description,
                    price: productData.price,
                    image: productData.image_path,
                    gender: productData.gender_code,
                    category: productData.category_code,
                    slug: productData.slug
                };
                
                if (editingProductId) {
                    const index = products.findIndex(p => p.id === editingProductId);
                    if (index !== -1) products[index] = newProduct;
                } else {
                    products.unshift(newProduct);
                }
                renderProducts();
                closeProductModal();
                alert(editingProductId ? 'Товар обновлен локально' : 'Товар добавлен локально');
                return;
            }

            await fetchProducts();
            closeProductModal();
            alert(editingProductId ? 'Товар успешно обновлен' : 'Товар успешно добавлен');
        } catch (error) {
            console.error('Error saving product:', error);
            alert(`Ошибка: ${error.message}`);
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
        
        setupTableDelegation();
    }

    function initAdminPage() {
        attachEvents();
        fetchCategories();
        fetchProducts();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminPage);
    } else {
        initAdminPage();
    }
})();