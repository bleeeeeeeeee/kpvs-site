async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));

    if (!productId) {
        document.getElementById('product-details').innerHTML = '<p>Товар не найден.</p>';
        return;
    }

    try {
        const res = await fetch(`/api/product/${productId}`);
        const product = await res.json();

        if (!product || !product.id) {
            document.getElementById('product-details').innerHTML = '<p>Товар не найден.</p>';
            return;
        }

        const isFavorite = getFavorites().some(fav => fav.id === productId);
        const isInCart = getCart().some(cartItem => cartItem.id === productId);

        document.getElementById('product-details').innerHTML = `
            <div class="product-page">
                <div class="product-image-wrapper">
                    <img src="${product.image}" alt="${product.name}" class="product-image">
                </div>
                <div class="product-info">
                    <h1 class="product-title">${product.name}</h1>

                    <div class="product-section">
                        <h3>Описание</h3>
                        <p class="product-description">${product.description || 'Описание товара будет добавлено позже.'}</p>
                    </div>

                    <div class="product-section">
                        <h3>Материалы</h3>
                        <p class="product-materials">${product.materials || 'Информация о материалах будет добавлена позже.'}</p>
                    </div>

                    <div class="product-actions">
                        <button class="price-btn cart-action-btn ${isInCart ? 'in-cart' : ''}" onclick="toggleCart(${productId}, this)">
                            ${isInCart ? 'Удалить из корзины' : 'В корзину'}
                        </button>
                        <button class="price-btn inquire-action-btn" onclick="inquirePrice('${product.name.replace(/'/g, "\\'")}')">
                            Запросить цену
                        </button>
                        <button class="favorite-btn ${isFavorite ? 'in-favorites' : ''}" onclick="toggleFavorite(${productId}, this)">
                            ${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading product:', error);
        document.getElementById('product-details').innerHTML = '<p>Ошибка загрузки товара.</p>';
    }
}

async function getProductsByIds(ids) {
    try {
        return Promise.all(ids.map(id => 
            fetch(`/api/product/${id}`).then(r => r.json())
        ));
    } catch (error) {
        console.error('Error loading products:', error);
        return [];
    }
}

function toggleCart(productId, buttonElement) {
    let cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex === -1) {
        // Добавляем в корзину
        cart.push({ id: productId, source: 'product' });
        localStorage.setItem('cart', JSON.stringify(cart));
        showNotification('Товар добавлен в корзину');
        buttonElement.textContent = 'Удалить из корзины';
        buttonElement.classList.add('in-cart');
    } else {
        // Удаляем из корзины
        cart.splice(existingIndex, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        showNotification('Товар удален из корзины');
        buttonElement.textContent = 'В корзину';
        buttonElement.classList.remove('in-cart');
    }
}

function inquirePrice(productName) {
    const subject = encodeURIComponent(`Запрос цены на ${productName}`);
    const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о цене на ${productName}.`);
    const email = 'info@kpvs.by';
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

function inquirePriceFromCart() {
    const cart = getCart();
    if (cart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    
    getProductsByIds(cart).then(products => {
        const productNames = products.map(p => p.name).join(', ');
        const subject = encodeURIComponent('Запрос цены на товары из корзины');
        const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о ценах на следующие товары:\n\n${productNames}\n\nСпасибо!`);
        const email = 'info@kpvs.by';
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2000);
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
    showNotification('Товар удален из корзины');
}

function openFavoritesModal() {
    const favorites = getFavorites();
    const ids = favorites.map(item => item.id);
    
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
                        ${products.map((product, idx) => {
                            const source = favorites[idx].source === 'mens' ? '(мужское)' : favorites[idx].source === 'womens' ? '(женское)' : '(товар)';
                            return `
                            <div class="modal-item">
                                <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${product.name} <small>${source}</small></h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-add-to-cart" onclick="addToCart(${product.id}); this.closest('.modal-item').querySelector('.btn-add-to-cart').textContent = 'В корзине'; this.closest('.modal-item').querySelector('.btn-add-to-cart').disabled = true;">В корзину</button>
                                        <button class="btn-remove" onclick="removeFromFavorites(${product.id}); this.closest('.modal-item').remove(); if(document.querySelectorAll('.modal-item').length === 0) { document.querySelector('.modal-body').innerHTML = '<p class=\\'empty-message\\'>У вас пока нет товаров в избранном</p>'; }">Удалить</button>
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
    });
}

function openCartModal() {
    const cart = getCart();
    const ids = cart.map(item => item.id);
    
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
                        ${products.map((product, idx) => {
                            const source = cart[idx].source === 'mens' ? '(мужское)' : cart[idx].source === 'womens' ? '(женское)' : '(товар)';
                            return `
                            <div class="modal-item">
                                <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${product.name} <small>${source}</small></h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-remove" onclick="removeFromCart(${product.id}); this.closest('.modal-item').remove(); if(document.querySelectorAll('.modal-item').length === 0) { document.querySelector('.modal-body').innerHTML = '<p class=\\'empty-message\\'>Корзина пуста</p>'; }">Удалить</button>
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
    });
}

function removeFromFavorites(productId) {
    let favorites = getFavorites();
    favorites = favorites.filter(id => id !== productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function toggleFavorite(productId, buttonElement = null) {
    let favorites = getFavorites();
    const wasFavorite = favorites.some(item => item.id === productId);
    
    if (wasFavorite) {
        favorites = favorites.filter(item => item.id !== productId);
    } else {
        favorites.push({ id: productId, source: 'product' });
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));

    const button = buttonElement || document.querySelector('.favorite-btn');
    if (button) {
        button.textContent = wasFavorite ? 'Добавить в избранное' : 'Удалить из избранного';
        if (wasFavorite) {
            button.classList.remove('in-favorites');
        } else {
            button.classList.add('in-favorites');
        }
    }
    
    showNotification(wasFavorite ? 'Товар удален из избранного' : 'Товар добавлен в избранное');
}

function getFavorites() {
    const favorites = localStorage.getItem('favorites');
    return favorites ? JSON.parse(favorites) : [];
}

function getCart() {
    const cart = localStorage.getItem('cart');
    return cart ? JSON.parse(cart) : [];
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
