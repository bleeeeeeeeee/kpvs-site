const Admin = (() => {
    let categories = [];
    let products = [];
    let editingProductId = null;
    let rowActionsSetup = false;
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
        const response = await fetch('/api/categories');
        if (!response.ok) {
            throw new Error('Не удалось загрузить категории');
        }
        const data = await response.json();
        categories = flattenCategories(data);
        populateCategoryFilters();
    }

    function flattenCategories(list) {
        const result = [];
        list.forEach((item) => {
            result.push({ code: item.code, name: item.name });
            if (Array.isArray(item.children) && item.children.length) {
                result.push(...flattenCategories(item.children));
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
        // Parse sortOption like 'created_at_desc' or 'name_asc'
        const parts = state.sortOption.split('_');
        const sortDir = parts.pop(); // Get last part (asc or desc)
        const sortBy = parts.join('_'); // Join remaining parts (e.g., 'created_at' or 'name')
        return { sortBy, sortDir };
    }

    async function fetchProducts() {
        try {
            const searchInput = document.getElementById('search-input');
            const params = new URLSearchParams();
            if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
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
            console.error(error);
            alert('Ошибка загрузки товаров');
        }
    }

    function renderProducts() {
        const body = document.getElementById('products-body');
        const count = document.getElementById('product-count');

        if (!body || !count) return;

        // Clear any previous event listeners first
        if (rowActionsSetup) {
            const newBody = body.cloneNode(true);
            body.parentNode.replaceChild(newBody, body);
        }

        if (!products.length) {
            body.innerHTML = `
                <tr class="empty-row">
                    <td colspan="7">Товары не найдены по текущим условиям поиска и фильтрам.</td>
                </tr>
            `;
            count.textContent = '0';
            return;
        }

        body.innerHTML = products.map((product) => {
            const category = categories.find((item) => item.code === product.category)?.name || product.category;
            const genderLabel = product.gender === 'mens' ? 'Мужской' : product.gender === 'womens' ? 'Женский' : product.gender;
            return `
                <tr>
                    <td class="cell-id">${product.id}</td>
                    <td class="cell-name"><strong>${product.name}</strong></td>
                    <td class="cell-description">${product.description || '-'}</td>
                    <td>${category || '-'}</td>
                    <td>${genderLabel}</td>
                    <td class="cell-price">${product.price !== null && product.price !== undefined ? product.price.toFixed(2) : '-'}</td>
                    <td class="admin-actions-cell">
                        <button class="btn-add-to-cart btn-edit" data-action="edit" data-id="${product.id}">Редактировать</button>
                        <button class="btn-remove btn-delete" data-action="delete" data-id="${product.id}">Удалить</button>
                    </td>
                </tr>
            `;
        }).join('');

        count.textContent = products.length.toString();
        // Re-setup event listeners after rendering
        setupRowActions();
    }

    function setupRowActions() {
        const productsBody = document.getElementById('products-body');
        if (!productsBody) return;

        // Use event delegation - listener will work for dynamically added elements
        // Only add listener once, since we're using event delegation
        if (!rowActionsSetup) {
            productsBody.addEventListener('click', handleRowAction);
            rowActionsSetup = true;
        }
    }

    function handleRowAction(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const id = Number(button.dataset.id);

        if (action === 'edit') {
            const product = products.find((item) => item.id === id);
            if (product) openProductModal(product);
        } else if (action === 'delete') {
            if (confirm('Удалить товар?')) {
                deleteProduct(id);
            }
        }
    }

    function openFiltersModal() {
        const modal = document.getElementById('filter-modal');
        if (!modal) return;
        document.getElementById('filter-gender-modal').value = state.gender;
        document.getElementById('filter-category-modal').value = state.category;
        document.getElementById('min-price').value = state.minPrice;
        document.getElementById('max-price').value = state.maxPrice;
        modal.classList.add('show');
    }

    function closeFiltersModal() {
        const modal = document.getElementById('filter-modal');
        if (!modal) return;
        modal.classList.remove('show');
    }

    function applyFilters() {
        state.gender = document.getElementById('filter-gender-modal').value;
        state.category = document.getElementById('filter-category-modal').value;
        state.minPrice = document.getElementById('min-price').value.trim();
        state.maxPrice = document.getElementById('max-price').value.trim();
        closeFiltersModal();
        fetchProducts().catch((error) => {
            console.error(error);
            alert('Не удалось применить фильтры');
        });
    }

    function clearFilters() {
        state.gender = '';
        state.category = '';
        state.minPrice = '';
        state.maxPrice = '';
        document.getElementById('filter-gender-modal').value = '';
        document.getElementById('filter-category-modal').value = '';
        document.getElementById('min-price').value = '';
        document.getElementById('max-price').value = '';
        closeFiltersModal();
        fetchProducts().catch((error) => {
            console.error(error);
            alert('Не удалось сбросить фильтры');
        });
    }

    async function deleteProduct(id) {
        try {
            const response = await fetch(`/api/admin/products/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                alert('Не удалось удалить товар');
                return;
            }
            await fetchProducts();
        } catch (error) {
            console.error(error);
            alert('Ошибка при удалении товара');
        }
    }

    function openProductModal(product = null) {
        const modal = document.getElementById('product-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('product-form');

        if (!modal || !title || !form) return;

        editingProductId = product?.id || null;
        title.textContent = product ? 'Редактировать товар' : 'Новый товар';

        form.elements.name.value = product?.name || '';
        form.elements.slug.value = product?.slug || '';
        form.elements.description.value = product?.description || '';
        form.elements.price.value = product?.price != null ? product.price : '';
        form.elements.image.value = product?.image || '';
        form.elements.gender.value = product?.gender || 'mens';
        form.elements.category.value = product?.category || (categories[0]?.code || '');

        modal.classList.add('show');
    }

    function closeProductModal() {
        const modal = document.getElementById('product-modal');
        if (!modal) return;
        modal.classList.remove('show');
        editingProductId = null;
    }

    async function saveProduct(event) {
        event.preventDefault();
        const form = document.getElementById('product-form');
        if (!form) return;

        const formData = new FormData(form);
        const productData = {
            name: formData.get('name').trim(),
            slug: formData.get('slug').trim() || slugify(formData.get('name')),
            description: formData.get('description').trim(),
            price: formData.get('price') ? Number(formData.get('price')) : null,
            image_path: formData.get('image').trim() || null,
            gender_code: formData.get('gender'),
            category_code: formData.get('category')
        };

        if (!productData.name || !productData.gender_code || !productData.category_code) {
            alert('Заполните обязательные поля: название, пол и категорию.');
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
                const errorText = await response.text();
                throw new Error(errorText || 'Ошибка сохранения товара');
            }

            await fetchProducts();
            closeProductModal();
        } catch (error) {
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
        const filterModal = document.getElementById('filter-modal');
        const productModal = document.getElementById('product-modal');
        const filterModalClose = filterModal?.querySelector('.modal-close');
        const productModalClose = productModal?.querySelector('.modal-close');
        const productForm = document.getElementById('product-form');

        if (addBtn) addBtn.addEventListener('click', () => openProductModal());
        if (refreshBtn) refreshBtn.addEventListener('click', () => {
            fetchProducts().catch(err => console.error(err));
        });
        if (searchInput) searchInput.addEventListener('input', () => {
            fetchProducts().catch(err => console.error(err));
        });
        if (openFiltersBtn) openFiltersBtn.addEventListener('click', openFiltersModal);
        if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
        if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);
        if (sortBy) sortBy.addEventListener('change', (event) => {
            state.sortOption = event.target.value;
            fetchProducts().catch(err => console.error(err));
        });
        if (cancelBtn) cancelBtn.addEventListener('click', closeProductModal);
        if (filterModalClose) filterModalClose.addEventListener('click', closeFiltersModal);
        if (filterModal) filterModal.addEventListener('click', (event) => {
            if (event.target === filterModal) closeFiltersModal();
        });
        if (productModalClose) productModalClose.addEventListener('click', closeProductModal);
        if (productModal) productModal.addEventListener('click', (event) => {
            if (event.target === productModal) closeProductModal();
        });
        if (productForm) productForm.addEventListener('submit', saveProduct);
    }

    function initAdminPage() {
        attachEvents();
        setupRowActions(); // Setup listeners once on init
        fetchCategories()
            .then(fetchProducts)
            .catch((error) => {
                console.error(error);
                alert('Не удалось загрузить данные админ-панели');
            });
    }

    window.addEventListener('DOMContentLoaded', initAdminPage);
})();
