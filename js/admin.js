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
        const [sortBy, sortDir] = state.sortOption.split('_');
        return { sortBy, sortDir };
    }

    async function fetchProducts() {
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
    }

    function renderProducts() {
        const body = document.getElementById('products-body');
        const count = document.getElementById('product-count');

        if (!body || !count) return;

        if (!products.length) {
            body.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">Товары не найдены по текущим условиям поиска и фильтрам.</td>
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
                    <td class="cell-name"><strong>${product.name}</strong><span>${product.description || ''}</span></td>
                    <td>${category || '-'}</td>
                    <td>${genderLabel}</td>
                    <td class="cell-price">${product.price !== null && product.price !== undefined ? product.price.toFixed(2) : '-'}</td>
                    <td class="admin-actions-cell">
                        <button class="btn-add-to-cart" data-action="edit" data-id="${product.id}">Редактировать</button>
                        <button class="btn-remove" data-action="delete" data-id="${product.id}">Удалить</button>
                    </td>
                </tr>
            `;
        }).join('');

        count.textContent = products.length.toString();
        bindRowActions();
    }

    function bindRowActions() {
        document.querySelectorAll('[data-action="edit"]').forEach((button) => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.id);
                const product = products.find((item) => item.id === id);
                if (product) openProductModal(product);
            });
        });

        document.querySelectorAll('[data-action="delete"]').forEach((button) => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.id);
                if (confirm('Удалить товар?')) {
                    deleteProduct(id);
                }
            });
        });
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
        const response = await fetch(`/api/admin/products/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            alert('Не удалось удалить товар');
            return;
        }
        await fetchProducts();
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
        document.getElementById('add-product-btn')?.addEventListener('click', () => openProductModal());
        document.getElementById('refresh-btn')?.addEventListener('click', fetchProducts);
        document.getElementById('search-input')?.addEventListener('input', fetchProducts);
        document.getElementById('open-filters-btn')?.addEventListener('click', openFiltersModal);
        document.getElementById('apply-filters-btn')?.addEventListener('click', applyFilters);
        document.getElementById('clear-filters-btn')?.addEventListener('click', clearFilters);
        document.getElementById('sort-by')?.addEventListener('change', (event) => {
            state.sortOption = event.target.value;
            fetchProducts().catch((error) => {
                console.error(error);
                alert('Не удалось применить сортировку');
            });
        });
        document.getElementById('cancel-product-btn')?.addEventListener('click', closeProductModal);
        document.querySelectorAll('#filter-modal .modal-close, #filter-modal')?.forEach((element) => {
            if (!element) return;
            element.addEventListener('click', (event) => {
                if (event.target === element || event.target.classList.contains('modal-close')) {
                    closeFiltersModal();
                }
            });
        });
        document.querySelector('#product-modal .modal-close')?.addEventListener('click', closeProductModal);
        document.getElementById('product-modal')?.addEventListener('click', (event) => {
            if (event.target === event.currentTarget) closeProductModal();
        });
    }

    function initAdminPage() {
        attachEvents();
        fetchCategories()
            .then(fetchProducts)
            .catch((error) => {
                console.error(error);
                alert('Не удалось загрузить данные админ-панели');
            });
    }

    window.addEventListener('DOMContentLoaded', initAdminPage);
})();
