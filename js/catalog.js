const Catalog = (() => {
    let pageGender = 'mens';
    let allProducts = [];
    let currentSort = 'name';
    let currentFilter = ['all'];

    const filterTitles = {
        popular: 'Популярные товары',
        outerwear: 'Верхняя одежда',
        underwear: 'Нижняя одежда',
        accessories: 'Аксессуары'
    };

    function initCatalogPage(options = {}) {
        pageGender = options.gender || pageGender;
        currentSort = 'name';
        currentFilter = ['all'];
        attachPageEvents();
        loadProducts();
    }

    async function loadProducts() {
        try {
            const params = new URLSearchParams({ limit: '100', offset: '0' });
            const selected = currentFilter.filter(Boolean);
            const isAll = selected.length === 0 || selected.includes('all');
            const onlyOne = selected.length === 1 && selected[0] !== 'all';

            if (onlyOne) {
                if (selected[0] === 'popular') {
                    params.set('tag', 'popular');
                } else {
                    params.set('category', selected[0]);
                }
            }

            const res = await fetch(`/api/products/${pageGender}?${params.toString()}`);
            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            allProducts = await res.json();
            renderProducts();
        } catch (error) {
            console.error('Error loading products:', error);
            const container = document.querySelector('.itemsContainer');
            if (container) {
                container.innerHTML = '<p class="empty-state">Не удалось загрузить товары.</p>';
            }
        }
    }

    function openFilterModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        const selectedSet = new Set(currentFilter.filter(Boolean));
        const filterItems = [
            { value: 'all', label: 'Все категории' },
            { value: 'popular', label: 'Популярные' },
            { value: 'outerwear', label: 'Верхняя одежда' },
            { value: 'underwear', label: 'Нижняя одежда' },
            { value: 'accessories', label: 'Аксессуары' }
        ];

        const itemsHtml = filterItems.map((item) => `
            <label class="filter-option">
                <input type="checkbox" name="filter" value="${item.value}" ${selectedSet.has(item.value) ? 'checked' : ''}>
                <span>${item.label}</span>
            </label>
        `).join('');

        modal.innerHTML = `
            <div class="modal-content filter-modal">
                <div class="modal-header">
                    <h2>Фильтр товаров</h2>
                    <button class="modal-close" type="button">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="filter-modal-description">Отметьте нужные категории. Если выбрано «Все категории», остальные фильтры будут сброшены.</p>
                    <div class="filter-options">${itemsHtml}</div>
                </div>
                <div class="modal-footer">
                    <button class="filter-apply-btn" type="button">Применить</button>
                    <button class="filter-clear-btn" type="button">Сбросить</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
        attachModalClose(modal);

        const closeButton = modal.querySelector('.modal-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => modal.remove());
        }

        const applyButton = modal.querySelector('.filter-apply-btn');
        if (applyButton) {
            applyButton.addEventListener('click', () => {
                let selectedOptions = Array.from(modal.querySelectorAll('input[name="filter"]:checked')).map((input) => input.value);
                if (selectedOptions.includes('all') && selectedOptions.length > 1) {
                    selectedOptions = selectedOptions.filter((value) => value !== 'all');
                }
                if (selectedOptions.length === 0) {
                    selectedOptions = ['all'];
                }
                currentFilter = selectedOptions;
                loadProducts();
                modal.remove();
            });
        }

        const clearButton = modal.querySelector('.filter-clear-btn');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                currentFilter = ['all'];
                loadProducts();
                modal.remove();
            });
        }
    }

    function renderProducts() {
        const container = document.querySelector('.itemsContainer');
        if (!container) return;

        container.innerHTML = '';
        const sortedProducts = [...allProducts].sort((a, b) => {
            if (currentSort === 'name') {
                return a.name.localeCompare(b.name);
            }
            if (currentSort === 'id') {
                return a.id - b.id;
            }
            return 0;
        });

        const filteredProducts = filterProducts(sortedProducts);
        const sections = buildSections(filteredProducts);
        if (sections.length === 0) {
            container.innerHTML = '<p class="empty-state">Товары не найдены.</p>';
            return;
        }

        sections.forEach((section) => {
            if (!section.items.length) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'itemsSection';
            wrapper.innerHTML = `
                <p class="section-title">${section.title}</p>
                <div class="effect-section">
                    <div class="items" id="${section.key}-items"></div>
                </div>
            `;

            const itemsContainer = wrapper.querySelector('.items');
            section.items.forEach((item) => itemsContainer.appendChild(createCard(item)));
            container.appendChild(wrapper);
        });
    }

    function buildSections(products) {
        const selected = currentFilter.filter(Boolean);
        const isAll = selected.length === 0 || selected.includes('all');

        if (isAll) {
            const popular = products.filter((item) => item.tags?.some((tag) => tag.code === 'popular'));
            const others = products.filter((item) => !item.tags?.some((tag) => tag.code === 'popular'));

            return [
                { key: 'popular', title: filterTitles.popular, items: popular },
                { key: 'outerwear', title: filterTitles.outerwear, items: others.filter((item) => mapCategoryToSection(item.category) === 'outerwear') },
                { key: 'underwear', title: filterTitles.underwear, items: others.filter((item) => mapCategoryToSection(item.category) === 'underwear') },
                { key: 'accessories', title: filterTitles.accessories, items: others.filter((item) => mapCategoryToSection(item.category) === 'accessories') }
            ];
        }

        const sections = [];
        if (selected.includes('popular')) {
            sections.push({
                key: 'popular',
                title: filterTitles.popular,
                items: products.filter((item) => item.tags?.some((tag) => tag.code === 'popular'))
            });
        }

        ['outerwear', 'underwear', 'accessories'].forEach((sectionKey) => {
            if (selected.includes(sectionKey)) {
                sections.push({
                    key: sectionKey,
                    title: filterTitles[sectionKey],
                    items: products.filter((item) => mapCategoryToSection(item.category) === sectionKey)
                });
            }
        });

        return sections.length ? sections : [{ key: 'selected', title: 'Выбранные товары', items: products }];
    }

    function filterProducts(products) {
        const selected = currentFilter.filter(Boolean);
        if (selected.length === 0 || selected.includes('all')) {
            return products;
        }

        return products.filter((item) => {
            const isPopular = item.tags?.some((tag) => tag.code === 'popular');
            const categorySection = mapCategoryToSection(item.category);

            return selected.includes('popular') && isPopular
                || selected.includes('outerwear') && categorySection === 'outerwear'
                || selected.includes('underwear') && categorySection === 'underwear'
                || selected.includes('accessories') && categorySection === 'accessories';
        });
    }

    function buildTagBadge(tag) {
        const label = tag.icon || tag.name.charAt(0);
        const color = tag.color || '#727B26';
        return `<span class="card-tag" title="${tag.name}" style="background:${color};">${label}</span>`;
    }

    function createCard(item) {
        const isFavorite = getFavorites().some((fav) => fav.id === item.id);
        const isInCart = getCart().some((cartItem) => cartItem.id === item.id);
        const tagsHtml = (item.tags || []).map(buildTagBadge).join('');
        const tagOverlay = tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : '';

        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-id', item.id);
        const productLink = item.slug
            ? `product.html?slug=${encodeURIComponent(item.slug)}`
            : `product.html?id=${encodeURIComponent(item.id)}`;
        card.onclick = () => window.location.href = productLink;

        card.innerHTML = `
            <div class="card-img-container">
                <img src="${item.image}" alt="${item.name}" class="card-img">
                ${tagOverlay}
                <div class="card-hover-overlay">
                    <button class="card-favorite-btn card-hover-btn ${isFavorite ? 'in-favorites' : ''}" onclick="event.stopPropagation(); toggleFavorite(${item.id}, this)">
                        ${isFavorite ? 'Удалить из избранного' : 'В избранное'}
                    </button>
                    <button class="card-cart-btn card-hover-btn ${isInCart ? 'in-cart' : ''}" onclick="event.stopPropagation(); toggleCart(${item.id}, this)">
                        ${isInCart ? 'Удалить из корзины' : 'В корзину'}
                    </button>
                </div>
            </div>
            <div class="card-content">
                <p class="card-name">${item.name}</p>
            </div>
        `;

        return card;
    }

    function mapCategoryToSection(categoryCode) {
        if (!categoryCode) return null;
        if (categoryCode.startsWith('outerwear')) return 'outerwear';
        if (categoryCode.startsWith('pants')) return 'underwear';
        if (categoryCode.startsWith('accessories')) return 'accessories';
        if (categoryCode === 'outerwear') return 'outerwear';
        if (categoryCode === 'pants') return 'underwear';
        if (categoryCode === 'accessories') return 'accessories';
        return null;
    }

    function attachPageEvents() {
        const locationIcon = document.querySelector('.central-top-section img[alt="location"]');
        const locationText = document.querySelector('.central-top-section p');
        const sortSelect = document.getElementById('sort-select');
        const filterButton = document.getElementById('filter-button');
        const favoritesLink = document.getElementById('favorites-link');
        const cartLink = document.getElementById('cart');
        const logo = document.querySelector('.section #logo');

        if (locationIcon) {
            locationIcon.style.cursor = 'pointer';
            locationIcon.addEventListener('click', openMap);
        }

        if (locationText) {
            locationText.style.cursor = 'pointer';
            locationText.addEventListener('click', openMap);
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                renderProducts();
            });
        }

        if (filterButton) {
            filterButton.addEventListener('click', openFilterModal);
        }

        if (favoritesLink) {
            favoritesLink.addEventListener('click', openFavoritesModal);
        }

        if (cartLink) {
            cartLink.addEventListener('click', openCartModal);
        }

        if (logo) {
            logo.addEventListener('click', () => {
                window.location.href = 'welcome.html';
            });
        }

        const footerContacts = document.querySelectorAll('.footer-contact');
        footerContacts.forEach((contact) => {
            if (contact.textContent.includes('ул.')) {
                contact.addEventListener('click', openMap);
            } else if (contact.textContent.includes('+375')) {
                contact.addEventListener('click', () => {
                    window.location.href = 'tel:+375162580931';
                });
            }
        });
    }

    function openMap() {
        const address = 'Брест, ул. л-та Рябцева, 44';
        const encodedAddress = encodeURIComponent(address);
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
    }

    function getFavorites() {
        const favorites = localStorage.getItem('favorites');
        if (!favorites) return [];

        try {
            const parsed = JSON.parse(favorites);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item) => {
                if (typeof item === 'number' || typeof item === 'string') {
                    return { id: Number(item), source: pageGender };
                }
                return { id: Number(item.id), source: item.source || pageGender };
            }).filter((item) => Number.isFinite(item.id));
        } catch {
            return [];
        }
    }

    function getCart() {
        const cart = localStorage.getItem('cart');
        if (!cart) return [];

        try {
            const parsed = JSON.parse(cart);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item) => {
                if (typeof item === 'number' || typeof item === 'string') {
                    return { id: Number(item), source: pageGender };
                }
                return { id: Number(item.id), source: item.source || pageGender };
            }).filter((item) => Number.isFinite(item.id));
        } catch {
            return [];
        }
    }

    function toggleFavorite(productId, buttonElement = null) {
        let favorites = getFavorites();
        const wasFavorite = favorites.some((item) => item.id === productId);

        if (wasFavorite) {
            favorites = favorites.filter((item) => item.id !== productId);
        } else {
            favorites.push({ id: productId, source: pageGender });
        }

        localStorage.setItem('favorites', JSON.stringify(favorites));

        if (buttonElement) {
            if (wasFavorite) {
                buttonElement.textContent = 'В избранное';
                buttonElement.classList.remove('in-favorites');
            } else {
                buttonElement.textContent = 'Удалить из избранного';
                buttonElement.classList.add('in-favorites');
            }
        }
    }

    function toggleCart(productId, buttonElement) {
        let cart = getCart();
        const existingIndex = cart.findIndex((item) => item.id === productId);

        if (existingIndex === -1) {
            cart.push({ id: productId, source: pageGender });
            localStorage.setItem('cart', JSON.stringify(cart));
            buttonElement.textContent = 'Удалить из корзины';
            buttonElement.classList.add('in-cart');
        } else {
            cart.splice(existingIndex, 1);
            localStorage.setItem('cart', JSON.stringify(cart));
            buttonElement.textContent = 'В корзину';
            buttonElement.classList.remove('in-cart');
        }
    }

    function toggleCartFromModal(productId, buttonElement) {
        let cart = getCart();
        const existingIndex = cart.findIndex((item) => item.id === productId);

        if (existingIndex === -1) {
            cart.push({ id: productId, source: pageGender });
            localStorage.setItem('cart', JSON.stringify(cart));
            if (buttonElement) {
                buttonElement.textContent = 'Удалить из корзины';
                buttonElement.classList.add('in-cart');
            }
        } else {
            cart.splice(existingIndex, 1);
            localStorage.setItem('cart', JSON.stringify(cart));
            if (buttonElement) {
                buttonElement.textContent = 'В корзину';
                buttonElement.classList.remove('in-cart');
            }
        }
    }

    async function getProductsByIds(ids) {
        const products = await Promise.all(ids.map(async (id) => {
            try {
                const res = await fetch(`/api/product/${encodeURIComponent(id)}`);
                if (!res.ok) return null;
                const product = await res.json();
                return product && product.id ? product : null;
            } catch (error) {
                console.error('Ошибка загрузки товара по ID:', id, error);
                return null;
            }
        }));

        return products.filter(Boolean);
    }

    function removeFromFavorites(productId) {
        let favorites = getFavorites();
        favorites = favorites.filter((item) => item.id !== productId);
        localStorage.setItem('favorites', JSON.stringify(favorites));
    }

    function removeFromCart(productId) {
        let cart = getCart();
        cart = cart.filter((item) => item.id !== productId);
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    function attachModalClose(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    function openFavoritesModal() {
        const favorites = getFavorites();
        const ids = favorites.map((item) => item.id);

        const modal = document.createElement('div');
        modal.className = 'modal';

        if (ids.length === 0) {
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Избранное</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="empty-message">У вас пока нет товаров в избранном</p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('show'), 10);
            attachModalClose(modal);
            return;
        }

        getProductsByIds(ids).then((products) => {
            const favoritesMap = new Map(favorites.map((item) => [item.id, item]));
            const itemsHtml = products.length > 0
                ? products.map((product) => {
                    const isInCart = getCart().some((item) => item.id === product.id);
                    const sourceValue = favoritesMap.get(product.id)?.source;
                    const source = sourceValue === 'mens'
                        ? '(мужское)'
                        : sourceValue === 'womens'
                        ? '(женское)'
                        : sourceValue === 'product'
                        ? '(карточка товара)'
                        : '';
                    return `
                        <div class="modal-item" data-product-id="${product.id}">
                            <img src="${product.image || '/img/placeholder.png'}" alt="${product.name || 'Товар'}" class="modal-item-img">
                            <div class="modal-item-info">
                                <h3>${product.name || 'Товар'} ${source ? `<small>${source}</small>` : ''}</h3>
                                <div class="modal-item-actions">
                                    <button class="btn-add-to-cart ${isInCart ? 'in-cart' : ''}" data-action="toggle-cart" data-product-id="${product.id}">${isInCart ? 'Удалить из корзины' : 'В корзину'}</button>
                                    <button class="btn-remove" data-action="remove-favorite" data-product-id="${product.id}">Удалить</button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<p class="empty-message">Товары не найдены. Возможно, они были удалены.</p>';

            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Избранное</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-items">${itemsHtml}</div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('show'), 10);
            attachModalClose(modal);

            modal.querySelectorAll('[data-action="toggle-cart"]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const productId = Number(button.dataset.productId);
                    toggleCartFromModal(productId, button);
                });
            });

            modal.querySelectorAll('[data-action="remove-favorite"]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const productId = Number(button.dataset.productId);
                    removeFromFavorites(productId);
                    const itemElement = button.closest('.modal-item');
                    if (itemElement) itemElement.remove();
                    if (!modal.querySelector('.modal-item')) {
                        modal.querySelector('.modal-body').innerHTML = '<p class="empty-message">У вас пока нет товаров в избранном</p>';
                    }
                });
            });
        });
    }

    function openCartModal() {
        const cart = getCart();
        const ids = cart.map((item) => item.id);

        const modal = document.createElement('div');
        modal.className = 'modal';

        if (ids.length === 0) {
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Корзина</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="empty-message">Корзина пуста</p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('show'), 10);
            attachModalClose(modal);
            return;
        }

        getProductsByIds(ids).then((products) => {
            const cartMap = new Map(cart.map((item) => [item.id, item]));
            const itemsHtml = products.length > 0
                ? products.map((product) => {
                    const sourceValue = cartMap.get(product.id)?.source;
                    const source = sourceValue === 'mens'
                        ? '(мужское)'
                        : sourceValue === 'womens'
                        ? '(женское)'
                        : sourceValue === 'product'
                        ? '(карточка товара)'
                        : '';
                    return `
                        <div class="modal-item" data-product-id="${product.id}">
                            <img src="${product.image || '/img/placeholder.png'}" alt="${product.name || 'Товар'}" class="modal-item-img">
                            <div class="modal-item-info">
                                <h3>${product.name || 'Товар'} ${source ? `<small>${source}</small>` : ''}</h3>
                                <div class="modal-item-actions">
                                    <button class="btn-remove" data-action="remove-from-cart" data-product-id="${product.id}">Удалить</button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<p class="empty-message">Товары не найдены. Возможно, они были удалены.</p>';

            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Корзина</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-items">${itemsHtml}</div>
                        <div class="cart-actions">
                            <button class="cart-inquire-btn" onclick="inquirePriceFromCart(); this.closest('.modal').remove();">Узнать цену на все товары</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('show'), 10);
            attachModalClose(modal);

            modal.querySelectorAll('[data-action="remove-from-cart"]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const productId = Number(button.dataset.productId);
                    removeFromCart(productId);
                    const itemElement = button.closest('.modal-item');
                    if (itemElement) itemElement.remove();
                    if (!modal.querySelector('.modal-item')) {
                        modal.querySelector('.modal-body').innerHTML = '<p class="empty-message">Корзина пуста</p>';
                    }
                });
            });
        });
    }

    function inquirePriceFromCart() {
        const cart = getCart();
        if (cart.length === 0) {
            alert('Корзина пуста');
            return;
        }

        const ids = cart.map((item) => item.id);
        getProductsByIds(ids).then((products) => {
            const productList = products.map((p) => `- ${p.name} (ID: ${p.id})`).join('\n');
            const subject = encodeURIComponent('Запрос цены на товары из корзины');
            const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о ценах на следующие товары:\n\n${productList}\n\nСпасибо!`);
            const email = 'sbyt@kpvs.by';
            window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        });
    }

    function detectPageGender() {
        const path = window.location.pathname.toLowerCase();
        if (path.endsWith('womens.html') || path.includes('/womens')) return 'womens';
        if (path.endsWith('mens.html') || path.includes('/mens')) return 'mens';
        const bodyGender = document.body.dataset.gender;
        if (bodyGender) return bodyGender.toLowerCase();
        return null;
    }

    window.toggleFavorite = toggleFavorite;
    window.toggleCart = toggleCart;
    window.toggleCartFromModal = toggleCartFromModal;
    window.removeFromFavorites = removeFromFavorites;
    window.removeFromCart = removeFromCart;
    window.openMap = openMap;
    window.inquirePriceFromCart = inquirePriceFromCart;

    window.addEventListener('DOMContentLoaded', () => {
        const gender = detectPageGender();
        if (gender) {
            initCatalogPage({ gender });
        }
    });

    return { initCatalogPage };
})();
