async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));

    if (!productId) {
        document.getElementById('product-details').innerHTML = '<p>Товар не найден.</p>';
        return;
    }

    try {
        const response = await fetch('/products.json');
        const data = await response.json();

        let product = null;
        for (const gender in data) {
            for (const category in data[gender]) {
                product = data[gender][category].find(item => item.id === productId);
                if (product) break;
            }
            if (product) break;
        }

        if (!product) {
            document.getElementById('product-details').innerHTML = '<p>Товар не найден.</p>';
            return;
        }

        const isFavorite = getFavorites().includes(productId);

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
                        <button class="price-btn cart-action-btn" onclick="addToCart(${productId})">
                            В корзину
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
        const response = await fetch('/products.json');
        const data = await response.json();
        const allProducts = [
            ...data.mens?.popular?.map(item => ({ ...item, category: 'popular' })) || [],
            ...data.mens?.outerwear?.map(item => ({ ...item, category: 'outerwear' })) || [],
            ...data.mens?.underwear?.map(item => ({ ...item, category: 'underwear' })) || [],
            ...data.mens?.accessories?.map(item => ({ ...item, category: 'accessories' })) || [],
            ...data.womens?.popular?.map(item => ({ ...item, category: 'popular' })) || [],
            ...data.womens?.outerwear?.map(item => ({ ...item, category: 'outerwear' })) || [],
            ...data.womens?.underwear?.map(item => ({ ...item, category: 'underwear' })) || [],
            ...data.womens?.accessories?.map(item => ({ ...item, category: 'accessories' })) || []
        ];
        return allProducts.filter(p => ids.includes(p.id));
    } catch (error) {
        console.error('Error loading products:', error);
        return [];
    }
}

function addToCart(productId) {
    let cart = getCart();
    if (!cart.includes(productId)) {
        cart.push(productId);
        localStorage.setItem('cart', JSON.stringify(cart));
        showNotification('Товар добавлен в корзину');
    } else {
        showNotification('Товар уже в корзине');
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

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(id => id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    showNotification('Товар удален из корзины');
}

function openFavoritesModal() {
    const favorites = getFavorites();
    getProductsByIds(favorites).then(products => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Избранное</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    ${favorites.length === 0 
                        ? '<p class="empty-message">У вас пока нет товаров в избранном</p>'
                        : `<div class="modal-items">
                            ${products.map(product => `
                                <div class="modal-item">
                                    <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                    <div class="modal-item-info">
                                        <h3>${product.name}</h3>
                                        <div class="modal-item-actions">
                                            <button class="btn-add-to-cart" onclick="addToCart(${product.id}); this.closest('.modal-item').querySelector('.btn-add-to-cart').textContent = 'В корзине'; this.closest('.modal-item').querySelector('.btn-add-to-cart').disabled = true;">В корзину</button>
                                            <button class="btn-remove" onclick="removeFromFavorites(${product.id}); this.closest('.modal-item').remove(); if(document.querySelectorAll('.modal-item').length === 0) { document.querySelector('.modal-body').innerHTML = '<p class=\\'empty-message\\'>У вас пока нет товаров в избранном</p>'; }">Удалить</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>`
                    }
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    });
}

function openCartModal() {
    const cart = getCart();
    getProductsByIds(cart).then(products => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Корзина</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    ${cart.length === 0 
                        ? '<p class="empty-message">Корзина пуста</p>'
                        : `<div class="modal-items">
                            ${products.map(product => `
                                <div class="modal-item">
                                    <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                    <div class="modal-item-info">
                                        <h3>${product.name}</h3>
                                        <div class="modal-item-actions">
                                            <button class="btn-remove" onclick="removeFromCart(${product.id}); this.closest('.modal-item').remove(); if(document.querySelectorAll('.modal-item').length === 0) { document.querySelector('.modal-body').innerHTML = '<p class=\\'empty-message\\'>Корзина пуста</p>'; const btn = document.querySelector('.cart-inquire-btn'); if(btn) btn.style.display = 'none'; }">Удалить</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="cart-actions">
                            <button class="cart-inquire-btn" onclick="inquirePriceFromCart(); this.closest('.modal').remove();">Узнать цену на все товары</button>
                        </div>`
                    }
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
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
    const wasFavorite = favorites.includes(productId);
    
    if (wasFavorite) {
        favorites = favorites.filter(id => id !== productId);
    } else {
        favorites.push(productId);
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
