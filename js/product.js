async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    const productId = urlParams.get('id');
    const identifier = slug || productId;

    if (!identifier) {
        document.getElementById('product-details').innerHTML = '<p>Товар не найден.</p>';
        return;
    }

    try {
        const res = await fetch(`/api/product/${encodeURIComponent(identifier)}`);
        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }

        const product = await res.json();
        if (!product || !product.id) {
            document.getElementById('product-details').innerHTML = '<p>Товар не найден.</p>';
            return;
        }

        const isFavorite = getFavorites().some((fav) => fav.id === product.id);
        const isInCart = getCart().some((cartItem) => cartItem.id === product.id);
        const tagsHtml = (product.tags || [])
            .map((tag) => `<span class="product-tag" style="background:${tag.color || '#eee'}">${tag.icon || ''} ${tag.name}</span>`)
            .join('');

        const materialsHtml = (product.materials || [])
            .map((material) => `<li>${material.material} — ${material.percentage}%</li>`)
            .join('');

        const sizesHtml = (product.sizes || [])
            .map((size) => `<li>${size.size}${size.quantity != null ? ` — ${size.quantity} шт.` : ''}</li>`)
            .join('');

        const images = Array.isArray(product.images) && product.images.length ? product.images : [{ path: product.image, is_main: true }];
        const mainImage = images.find((img) => img.is_main) || images[0];
        const galleryHtml = images.length > 1
            ? `<div class="product-gallery">${images.map((img) => `<img src="${img.path}" alt="${product.name}" class="product-gallery-item" data-src="${img.path}">`).join('')}</div>`
            : '';

        document.getElementById('product-details').innerHTML = `
            <div class="product-page">
                <div class="product-image-block">
                    <div class="product-image-wrapper">
                        <img src="${mainImage.path}" alt="${product.name}" class="product-image">
                    </div>
                    ${galleryHtml}
                    <div class="product-actions">
                        <button class="favorite-btn ${isFavorite ? 'in-favorites' : ''}" onclick="toggleFavorite(${product.id}, this)">
                            ${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                        </button>
                        <button class="price-btn cart-action-btn ${isInCart ? 'in-cart' : ''}" onclick="toggleCart(${product.id}, this)">
                            ${isInCart ? 'Удалить из корзины' : 'В корзину'}
                        </button>
                        <button class="price-btn inquire-action-btn" onclick="inquirePrice('${product.name.replace(/'/g, "\\'")}', ${product.id})">
                            Запросить цену
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    <h1 class="product-title">${product.name}</h1>
                    <p class="product-meta">${product.gender_name || 'Товар'}${product.category_name ? ` • ${product.category_name}` : ''}</p>
                    <p class="product-sku">Артикул: ${product.id}</p>

                    <div class="product-summary">
                        <p class="product-description">${product.description || 'Описание товара будет добавлено позже.'}</p>
                        <div class="product-tags">${tagsHtml || '<span>Нет тегов</span>'}</div>
                    </div>

                    <div class="product-specs">
                        <p class="product-price">${product.price == null ? 'По запросу' : `${product.price.toFixed(2)} руб.`}</p>
                        <div class="product-spec-group">
                            <div>
                                <p class="product-spec-heading">Состав</p>
                                <ul class="product-material-list">${materialsHtml || '<li>Информация о материалах будет добавлена позже.</li>'}</ul>
                            </div>
                            <div>
                                <p class="product-spec-heading">Размеры</p>
                                <ul class="product-size-list">${sizesHtml || '<li>Размеры отсутствуют</li>'}</ul>
                            </div>
                        </div>
                        <p class="product-meta">Дата добавления: ${product.created_at ? new Date(product.created_at).toLocaleDateString('ru-RU') : 'не указана'}</p>
                    </div>
                </div>
            </div>
        `;

        if (images.length > 1) {
            document.querySelectorAll('.product-gallery-item').forEach((thumb) => {
                thumb.addEventListener('click', () => {
                    const newSrc = thumb.dataset.src;
                    const mainImg = document.querySelector('.product-image');
                    if (mainImg && newSrc) {
                        mainImg.src = newSrc;
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error loading product:', error);
        document.getElementById('product-details').innerHTML = '<p>Ошибка загрузки товара.</p>';
    }
}

async function getProductsByIds(ids) {
    try {
        const requests = ids.map(async (id) => {
            const res = await fetch(`/api/product/${id}`);
            if (!res.ok) {
                return null;
            }
            return res.json();
        });

        const products = await Promise.all(requests);
        return products.filter(Boolean);
    } catch (error) {
        console.error('Error loading products:', error);
        return [];
    }
}

function toggleCart(productId, buttonElement) {
    let cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex === -1) {
        cart.push({ id: productId, source: 'product' });
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

function inquirePrice(productName, productId = null) {
    const subject = encodeURIComponent(`Запрос цены на ${productName}`);
    const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о цене на:\n\nНазвание: ${productName}\nID товара: ${productId || 'н/д'}\n\nСпасибо!`);
    const email = 'sbyt@kpvs.by';
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

function inquirePriceFromCart() {
    const cart = getCart();
    if (cart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    
    const ids = cart.map(item => item.id);
    getProductsByIds(ids).then(products => {
        const productList = products.map(p => `- ${p.name} (ID: ${p.id})`).join('\n');
        const subject = encodeURIComponent('Запрос цены на товары из корзины');
        const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о ценах на следующие товары:\n\n${productList}\n\nСпасибо!`);
        const email = 'sbyt@kpvs.by';
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    });
}

function removeFromFavorites(productId) {
    let favorites = getFavorites();
    favorites = favorites.filter(item => item.id !== productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
}

function toggleCartFromModal(productId, buttonElement) {
    let cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex === -1) {
        cart.push({ id: productId, source: 'product' });
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

function openFavoritesModal() {
    const favorites = getFavorites();
    const ids = favorites.map(item => item.id);
    const favoritesMap = new Map(favorites.map(item => [item.id, item]));
    
    if (ids.length === 0) {
        const modal = document.createElement('div');
        modal.className = 'modal';
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
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        return;
    }
    
    getProductsByIds(ids).then(products => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Избранное</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="modal-items">
                        ${products.filter(product => product && product.id).map((product) => {
                            const isInCart = getCart().some(item => item.id === product.id);
                            const genderLabel = product.gender_name || 'Товар';
                            return `
                            <div class="modal-item" data-product-id="${product.id}">
                                <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${product.name} <small>(${genderLabel})</small></h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-add-to-cart ${isInCart ? 'in-cart' : ''}" data-action="toggle-cart" data-product-id="${product.id}">${isInCart ? 'Удалить из корзины' : 'В корзину'}</button>
                                        <button class="btn-remove" data-action="remove-favorite" data-product-id="${product.id}">Удалить</button>
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

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
    const ids = cart.map(item => item.id);
    const cartMap = new Map(cart.map(item => [item.id, item]));
    
    if (ids.length === 0) {
        const modal = document.createElement('div');
        modal.className = 'modal';
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
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        return;
    }
    
    getProductsByIds(ids).then(products => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Корзина</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="modal-items">
                        ${products.filter(product => product && product.id).map((product) => {
                            const genderLabel = product.gender_name || 'Товар';
                            return `
                            <div class="modal-item" data-product-id="${product.id}">
                                <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${product.name} <small>(${genderLabel})</small></h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-remove" data-action="remove-from-cart" data-product-id="${product.id}">Удалить</button>
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                    <div class="cart-actions">
                        <button class="cart-inquire-btn" onclick="inquirePriceFromCart(); this.closest('.modal').remove();">Узнать цену на все товары</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

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

function removeFromFavorites(productId) {
    let favorites = getFavorites();
    favorites = favorites.filter((item) => item.id !== productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function toggleFavorite(productId, buttonElement = null) {
    let favorites = getFavorites();
    const wasFavorite = favorites.some((item) => item.id === productId);

    if (wasFavorite) {
        favorites = favorites.filter((item) => item.id !== productId);
    } else {
        favorites.push({ id: productId, source: 'product' });
    }

    localStorage.setItem('favorites', JSON.stringify(favorites));

    const button = buttonElement || document.querySelector('.favorite-btn');
    if (button) {
        button.textContent = wasFavorite ? 'Добавить в избранное' : 'Удалить из избранного';
        button.classList.toggle('in-favorites', !wasFavorite);
    }
}

function getFavorites() {
    const favorites = localStorage.getItem('favorites');
    if (!favorites) return [];

    try {
        const parsed = JSON.parse(favorites);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => {
            if (typeof item === 'number' || typeof item === 'string') {
                return { id: Number(item), source: 'product' };
            }
            return { id: Number(item.id), source: item.source || 'product' };
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
                return { id: Number(item), source: 'product' };
            }
            return { id: Number(item.id), source: item.source || 'product' };
        }).filter((item) => Number.isFinite(item.id));
    } catch {
        return [];
    }
}

document.querySelector('.section #logo').addEventListener('click', () => {
    window.location.href = 'welcome.html';
});

function openMap() {
    const address = 'Брест, ул. л-та Рябцева, 44';
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
    loadProduct();

    const locationIcon = document.querySelector('.central-top-section img[alt="location"]');
    const locationText = document.querySelector('.central-top-section p');
    
    if (locationIcon) {
        locationIcon.style.cursor = 'pointer';
        locationIcon.addEventListener('click', openMap);
    }
    
    if (locationText) {
        locationText.style.cursor = 'pointer';
        locationText.addEventListener('click', openMap);
    }

    const favoritesLink = document.getElementById('favorites-link');
    if (favoritesLink) {
        favoritesLink.addEventListener('click', openFavoritesModal);
    }

    const cartLink = document.getElementById('cart');
    if (cartLink) {
        cartLink.addEventListener('click', openCartModal);
    }

    const footerContacts = document.querySelectorAll('.footer-contact');
    footerContacts.forEach(contact => {
        if (contact.textContent.includes('ул.')) {
            contact.addEventListener('click', openMap);
        } else if (contact.textContent.includes('+375')) {
            contact.addEventListener('click', () => {
                window.location.href = 'tel:+375162580931';
            });
        } else if (contact.textContent.includes('@')) {
            contact.addEventListener('click', () => {
                window.location.href = 'mailto:sbyt@kpvs.by';
            });
        }
    });
});
