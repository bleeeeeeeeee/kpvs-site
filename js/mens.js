let allProducts = [];
let currentSort = 'name';
let currentFilter = 'all';

async function loadProducts() {
    try {
        const response = await fetch('/products.json');
        const data = await response.json();
        allProducts = [
            ...data.mens.popular.map(item => ({ ...item, category: 'popular' })),
            ...data.mens.outerwear.map(item => ({ ...item, category: 'outerwear' })),
            ...data.mens.underwear.map(item => ({ ...item, category: 'underwear' })),
            ...data.mens.accessories.map(item => ({ ...item, category: 'accessories' }))
        ];
        renderProducts();
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function renderProducts() {
    const filteredProducts = currentFilter === 'all' 
        ? allProducts 
        : allProducts.filter(item => item.category === currentFilter);
    const sortedProducts = filteredProducts.sort((a, b) => {
        if (currentSort === 'name') {
            return a.name.localeCompare(b.name);
        } else if (currentSort === 'id') {
            return a.id - b.id;
        }
        return 0;
    });

    const grouped = {};
    sortedProducts.forEach(item => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
    });

    const container = document.querySelector('.itemsContainer');
    container.innerHTML = '';

    const categories = currentFilter === 'all' 
        ? ['popular', 'outerwear', 'underwear', 'accessories']
        : [currentFilter];
    
    categories.forEach(cat => {
        if (grouped[cat] && grouped[cat].length > 0) {
            const section = document.createElement('div');
            section.className = 'itemsSection';
            section.innerHTML = `
                <p>${getCategoryName(cat)}</p>
                <div class="effect-section">
                    <div class="items" id="${cat}-items">
                    </div>
                </div>
            `;
            container.appendChild(section);

            const itemsContainer = section.querySelector('.items');
            grouped[cat].forEach(item => {
                const card = createCard(item);
                itemsContainer.appendChild(card);
            });
        }
    });
}

function getCategoryName(cat) {
    const names = {
        popular: 'Популярные товары',
        outerwear: 'Верхняя одежда',
        underwear: 'Нижняя одежда',
        accessories: 'Аксессуары'
    };
    return names[cat] || cat;
}

function createCard(item) {
    const isFavorite = getFavorites().includes(item.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-id', item.id);
    card.onclick = () => window.location.href = `product.html?id=${item.id}`;
    card.innerHTML = `
        <div class="card-img-container">
            <img src="${item.image}" alt="${item.name}" class="card-img">
            <div class="card-hover-overlay">
                <button class="card-favorite-btn card-hover-btn ${isFavorite ? 'in-favorites' : ''}" onclick="event.stopPropagation(); toggleFavorite(${item.id}, this)">
                    ${isFavorite ? 'Удалить из избранного' : 'В избранное'}
                </button>
                <button class="card-cart-btn card-hover-btn" onclick="event.stopPropagation(); addToCart(${item.id})">В корзину</button>
            </div>
        </div>
        <p class="card-name">${item.name}</p>
    `;
    return card;
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

function inquirePrice(productName, productId = null) {
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
    
    const products = getProductsByIds(cart);
    const productNames = products.map(p => p.name).join(', ');
    const subject = encodeURIComponent('Запрос цены на товары из корзины');
    const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о ценах на следующие товары:\n\n${productNames}\n\nСпасибо!`);
    const email = 'info@kpvs.by';
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

function getProductsByIds(ids) {
    return allProducts.filter(p => ids.includes(p.id));
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

function toggleFavorite(productId, buttonElement = null) {
    let favorites = getFavorites();
    const wasFavorite = favorites.includes(productId);
    
    if (wasFavorite) {
        favorites = favorites.filter(id => id !== productId);
    } else {
        favorites.push(productId);
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
    loadProducts();

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

    document.getElementById('sort-select').addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderProducts();
    });

    const filterSelect = document.getElementById('filter-select');
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderProducts();
        });
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

function openFavoritesModal() {
    const favorites = getFavorites();
    const products = getProductsByIds(favorites);
    
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
}

function openCartModal() {
    const cart = getCart();
    const products = getProductsByIds(cart);
    
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
                                        <button class="btn-remove" onclick="removeFromCart(${product.id}); this.closest('.modal-item').remove(); if(document.querySelectorAll('.modal-item').length === 0) { document.querySelector('.modal-body').innerHTML = '<p class=\\'empty-message\\'>Корзина пуста</p>'; document.querySelector('.cart-inquire-btn').style.display = 'none'; }">Удалить</button>
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
}

function removeFromFavorites(productId) {
    let favorites = getFavorites();
    favorites = favorites.filter(id => id !== productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(id => id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    showNotification('Товар удален из корзины');
}
