let allProducts = [];
let currentSort = 'name';
let currentFilter = 'all';

async function loadProducts() {
    try {
        const res = await fetch('/api/products/mens');
        allProducts = await res.json();
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
    const isFavorite = getFavorites().some(fav => fav.id === item.id);
    const isInCart = getCart().some(cartItem => cartItem.id === item.id);
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
                <button class="card-cart-btn card-hover-btn ${isInCart ? 'in-cart' : ''}" onclick="event.stopPropagation(); toggleCart(${item.id}, this)">
                    ${isInCart ? 'Удалить из корзины' : 'В корзину'}
                </button>
            </div>
        </div>
        <p class="card-name">${item.name}</p>
    `;
    return card;
}

function toggleCart(productId, buttonElement) {
    let cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex === -1) {
        // Добавляем в корзину
        cart.push({ id: productId, source: 'mens' });
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

function inquirePrice(productName, productId = null) {
    const productInfo = productId ? `${productName} (ID: ${productId})` : productName;
    const subject = encodeURIComponent(`Запрос цены на ${productName}`);
    const body = encodeURIComponent(`Здравствуйте! Прошу предоставить информацию о цене на:\n\nНазвание: ${productName}\nID товара: ${productId || '\u043d/д'}\n\nСпасибо!`);
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

function getProductsByIds(ids) {
    return Promise.all(ids.map(id => 
        fetch(`/api/product/${id}`).then(r => r.json())
    ));
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    const content = document.createElement('div');
    content.className = 'notification-content';
    content.textContent = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    };
    
    const handle = document.createElement('div');
    handle.className = 'notification-handle';
    handle.title = 'Перетаскивайте отсюда';
    
    notification.appendChild(content);
    notification.appendChild(closeBtn);
    notification.appendChild(handle);
    
    const savedPos = localStorage.getItem('notificationPos');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            notification.style.top = pos.top + 'px';
            notification.style.left = pos.left + 'px';
            notification.style.right = 'auto';
        } catch (e) {
            console.error('Error parsing saved position:', e);
        }
    }
    
    let isDragging = false;
    let offset = { x: 0, y: 0 };
    let autoHideTimer = null;
    
    const clearAutoHide = () => {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
    };
    
    const setAutoHide = () => {
        clearAutoHide();
        autoHideTimer = setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };
    
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        clearAutoHide();
        notification.classList.add('dragging');
        offset.x = e.clientX - notification.getBoundingClientRect().left;
        offset.y = e.clientY - notification.getBoundingClientRect().top;
    });
    
    const handleMouseMove = (e) => {
        if (!isDragging || !document.body.contains(notification)) return;
        notification.style.top = (e.clientY - offset.y) + 'px';
        notification.style.left = (e.clientX - offset.x) + 'px';
        notification.style.right = 'auto';
    };
    
    const handleMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            notification.classList.remove('dragging');
            if (document.body.contains(notification)) {
                const pos = notification.getBoundingClientRect();
                localStorage.setItem('notificationPos', JSON.stringify({
                    top: pos.top,
                    left: pos.left
                }));
                setAutoHide();
            }
        }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('show');
        setAutoHide();
    }, 10);
}

function toggleFavorite(productId, buttonElement = null) {
    let favorites = getFavorites();
    const wasFavorite = favorites.some(item => item.id === productId);
    
    if (wasFavorite) {
        favorites = favorites.filter(item => item.id !== productId);
    } else {
        favorites.push({ id: productId, source: 'mens' });
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

function toggleCartFromModal(productId, buttonElement) {
    let cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex === -1) {
        // Добавляем в корзину
        cart.push({ id: productId, source: 'mens' });
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
                            const isInCart = getCart().some(item => item.id === product.id);
                            const source = favorites[idx].source === 'mens' ? '(мужское)' : (favorites[idx].source === 'womens' ? '(женское)' : '(товар)');
                            return `
                            <div class="modal-item">
                                <img src="${product.image}" alt="${product.name}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${product.name} <small>${source}</small></h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-add-to-cart ${isInCart ? 'in-cart' : ''}" onclick="toggleCartFromModal(${product.id}, this)">${isInCart ? 'Удалить из корзины' : 'В корзину'}</button>
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
                            const source = cart[idx].source === 'mens' ? '(мужское)' : '(женское)';
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
    favorites = favorites.filter(item => item.id !== productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    showNotification('Товар удален из корзины');
}
