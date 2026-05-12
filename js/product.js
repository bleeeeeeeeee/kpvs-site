let currentProductId = null;

function genderDisplayLabel(g) {
    if (g === 'mens' || g === 'male') return 'Мужской';
    if (g === 'womens' || g === 'female') return 'Женский';
    if (g === 'unisex') return 'Унисекс';
    return '';
}

function catalogHrefForGender(g) {
    const x = String(g || '').toLowerCase();
    if (x === 'mens' || x === 'male') return '/mens.html';
    if (x === 'womens' || x === 'female') return '/womens.html';
    if (x === 'unisex') return '/all.html';
    return '/all.html';
}

/** Вертикаль «Назад»: верх обёртки = верх основного фото (после layout / load картинки). */
let productBackAlignState = null;

function teardownProductBackAlign() {
    if (productBackAlignState) {
        if (productBackAlignState.ro) productBackAlignState.ro.disconnect();
        if (productBackAlignState.onResize) {
            window.removeEventListener('resize', productBackAlignState.onResize);
        }
        productBackAlignState = null;
    }
    const shell = document.getElementById('product-details');
    if (shell) shell.style.removeProperty('--product-back-top');
}

function requestProductBackAlign() {
    if (productBackAlignState && typeof productBackAlignState.schedule === 'function') {
        productBackAlignState.schedule();
    }
}

function setupProductBackAlign() {
    teardownProductBackAlign();
    const shell = document.getElementById('product-details');
    const img = shell && shell.querySelector('.product-image');
    if (!shell || !img) return;

    const wrap = shell.querySelector('.product-back-wrap');
    const backBtn = document.getElementById('product-back-btn');
    const backImg = backBtn && backBtn.querySelector('img');

    let raf = 0;
    const apply = () => {
        const shellRect = shell.getBoundingClientRect();
        const prodTopRel = img.getBoundingClientRect().top - shellRect.top;
        let y = prodTopRel;
        if (wrap && backImg) {
            const delta = backImg.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
            y = prodTopRel - delta;
        }
        shell.style.setProperty('--product-back-top', Math.max(0, y) + 'px');
    };
    const schedule = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            raf = 0;
            apply();
        });
    };

    schedule();
    if (!img.complete) img.addEventListener('load', schedule, { once: true });

    const mainEl = document.getElementById('product-details-main');
    let ro = null;
    if (mainEl && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(schedule);
        ro.observe(mainEl);
    }
    const onResize = () => schedule();
    window.addEventListener('resize', onResize);
    productBackAlignState = { ro: ro, onResize: onResize, schedule: schedule };
}

/** Кнопка «назад»: при переходе из каталога — history.back(), иначе ссылка на раздел по полу товара */
function wireProductBackButton(product) {
    const el = document.getElementById('product-back-btn');
    if (!el) return;
    el.setAttribute('href', catalogHrefForGender(product && product.gender));
    el.onclick = function (ev) {
        const ref = document.referrer || '';
        try {
            const sameSite = ref.indexOf(window.location.origin) === 0;
            const fromListing = /\/(mens|womens|all)\.html/i.test(ref) || /\/welcome\.html/i.test(ref);
            if (sameSite && fromListing && window.history.length > 1) {
                ev.preventDefault();
                window.history.back();
            }
        } catch (_) {}
    };
}

async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    const productId = urlParams.get('id');
    const identifier = slug || productId;

    const productMainEl = document.getElementById('product-details-main');
    if (!productMainEl) return;

    teardownProductBackAlign();

    if (!identifier) {
        productMainEl.innerHTML = '<p class="catalog-empty">Товар не найден. Укажите корректную ссылку или откройте <a href="/mens.html">каталог</a>.</p>';
        return;
    }

    try {
        const res = await fetch('/api/product/' + encodeURIComponent(identifier));
        if (!res.ok) throw new Error('Server returned ' + res.status);

        const product = await res.json();
        if (!product || !product.id) {
            productMainEl.innerHTML = '<p class="catalog-empty">Товар не найден.</p>';
            return;
        }

        currentProductId = product.id;
        const isFavorite = getFavorites().some(f => f.id === product.id);
        const isInCart = getCart().some(c => c.id === product.id);

        const tagsHtml = (product.tags || []).map(tag =>
            '<span class="product-tag" style="background:' + (tag.color || '#eee') + '">' +
            (tag.icon ? tag.icon + ' ' : '') + (tag.name || '') + '</span>'
        ).join('');

        const images = Array.isArray(product.images) && product.images.length
            ? product.images
            : [];
        const mainImage = images.find(i => i.is_primary) || images[0] || null;
        const mainSrc = mainImage ? (mainImage.url || '') : '/img/item.png';

        const galleryHtml = images.length > 1
            ? '<div class="product-gallery">' +
              images.map(img =>
                  '<img src="' + (img.url || '') + '" alt="' + (product.name || '') + '" class="product-gallery-item" data-src="' + (img.url || '') + '">'
              ).join('') +
              '</div>'
            : '';

        const variantsHtml = buildVariantsHtml(product.variants);
        const attributesHtml = buildAttributesHtml(product.attributes);

        const artHtml = product.art
            ? '<p class="product-sku">Артикул: <strong>' + product.art + '</strong></p>'
            : '';
        const brandHtml = product.brand_name
            ? '<p class="product-brand">Бренд: <strong>' + product.brand_name + '</strong></p>'
            : '';
        const seasonHtml = product.season
            ? '<p class="product-season">Сезон: <strong>' + product.season + '</strong></p>'
            : '';
        const materialsHtml = product.materials
            ? '<p class="product-materials">Состав: ' + product.materials + '</p>'
            : '';

        productMainEl.innerHTML = `
            <div class="product-page">
                <div class="product-image-block">
                    <div class="product-image-wrapper">
                        <img src="${mainSrc}" alt="${product.name || ''}" class="product-image">
                    </div>
                    ${galleryHtml}
                    <div class="product-actions site-product-actions">
                        <button type="button" class="admin-ui-btn admin-ui-btn--primary product-page-action-btn favorite-action-btn ${isFavorite ? 'in-favorites' : ''}" onclick="toggleFavorite(${product.id}, this)">
                            ${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                        </button>
                        <button type="button" class="admin-ui-btn admin-ui-btn--primary product-page-action-btn cart-action-btn ${isInCart ? 'in-cart' : ''}" onclick="toggleCart(${product.id}, this)">
                            ${isInCart ? 'Удалить из корзины' : 'В корзину'}
                        </button>
                        <button type="button" class="admin-ui-btn inquire-action-btn" onclick="inquirePrice('${(product.name || '').replace(/'/g, "\\'")}', ${product.id})">
                            Запросить цену
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    <h1 class="product-title">${product.name || ''}</h1>
                    <p class="product-meta">${genderDisplayLabel(product.gender) || 'Товар'}${product.category_name ? ' · ' + product.category_name : ''}</p>
                    ${artHtml}
                    ${brandHtml}

                    <div class="product-summary">
                        <p class="product-description">${product.description || 'Описание товара будет добавлено позже.'}</p>
                        <div class="product-tags">${tagsHtml || '<span>Нет тегов</span>'}</div>
                    </div>

                    <div class="product-specs">
                        ${seasonHtml}
                        ${materialsHtml}
                        ${variantsHtml}
                        ${attributesHtml}
                        <p class="product-meta">Дата добавления: ${product.created_at ? new Date(product.created_at).toLocaleDateString('ru-RU') : 'не указана'}</p>
                    </div>
                </div>
            </div>
        `;

        document.title = (product.name || 'Товар').replace(/</g, '') + ' · КПВС';
        wireProductBackButton(product);
        setupProductBackAlign();

        if (images.length > 1) {
            document.querySelectorAll('.product-gallery-item').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    const mainImg = document.querySelector('.product-image');
                    if (mainImg && thumb.dataset.src) mainImg.src = thumb.dataset.src;
                    requestProductBackAlign();
                });
            });
        }
    } catch (err) {
        console.error('Error loading product:', err);
        if (productMainEl) productMainEl.innerHTML = '<p class="catalog-empty">Ошибка загрузки товара. Попробуйте обновить страницу.</p>';
    }
}

function buildVariantsHtml(variants) {
    if (!Array.isArray(variants) || !variants.length) return '';

    const bySize = {};
    const byColor = {};
    variants.forEach(v => {
        if (v.size_value) {
            if (!bySize[v.size_value]) bySize[v.size_value] = [];
            bySize[v.size_value].push(v);
        }
        if (v.color_name) {
            if (!byColor[v.color_name]) byColor[v.color_name] = { hex: v.color_hex, variants: [] };
            byColor[v.color_name].variants.push(v);
        }
    });

    let html = '<div class="product-variants">';

    const sizes = Object.keys(bySize);
    if (sizes.length) {
        html += '<div class="product-spec-group"><p class="product-spec-heading">Размеры</p><ul class="product-size-list">';
        sizes.forEach(size => { html += '<li>' + size + '</li>'; });
        html += '</ul></div>';
    }

    const colors = Object.keys(byColor);
    if (colors.length) {
        html += '<div class="product-spec-group"><p class="product-spec-heading">Цвета</p><div class="product-colors">';
        colors.forEach(colorName => {
            const hex = byColor[colorName].hex;
            const style = hex ? 'background:' + hex + ';' : '';
            html += '<span class="product-color-swatch" title="' + colorName + '" style="' + style + 'display:inline-block;width:20px;height:20px;border-radius:50%;border:1px solid #ccc;margin-right:4px;"></span>';
        });
        html += '</div></div>';
    }

    html += '</div>';
    return html;
}

function buildAttributesHtml(attributes) {
    if (!Array.isArray(attributes) || !attributes.length) return '';
    let html = '<div class="product-attributes"><p class="product-spec-heading">Характеристики</p><ul class="product-attr-list">';
    attributes.forEach(attr => {
        html += '<li><span class="attr-name">' + attr.name + ':</span> <span class="attr-value">' + attr.value + '</span></li>';
    });
    html += '</ul></div>';
    return html;
}

async function getProductsByIds(ids) {
    try {
        const results = await Promise.all(ids.map(async id => {
            const r = await fetch('/api/product/' + id);
            if (!r.ok) return null;
            return r.json();
        }));
        return results.filter(Boolean);
    } catch { return []; }
}

function getProductImage(product) {
    if (!product) return '/img/item.png';
    if (Array.isArray(product.images) && product.images.length) {
        const primary = product.images.find(i => i.is_primary) || product.images[0];
        return primary ? (primary.url || '') : '/img/item.png';
    }
    return '/img/item.png';
}

function refreshProductButtons() {
    if (!currentProductId) return;
    const favorites = getFavorites();
    const cart = getCart();
    const isFavorite = favorites.some(i => i.id === currentProductId);
    const isInCart = cart.some(i => i.id === currentProductId);

    document.querySelectorAll('.favorite-action-btn').forEach(btn => {
        btn.textContent = isFavorite ? 'Удалить из избранного' : 'Добавить в избранное';
        btn.classList.toggle('in-favorites', isFavorite);
    });
    document.querySelectorAll('.cart-action-btn').forEach(btn => {
        btn.textContent = isInCart ? 'Удалить из корзины' : 'В корзину';
        btn.classList.toggle('in-cart', isInCart);
    });
}

function toggleCart(productId, buttonElement) {
    let cart = getCart();
    const idx = cart.findIndex(i => i.id === productId);
    if (idx === -1) {
        cart.push({ id: productId, source: 'product' });
        localStorage.setItem('cart', JSON.stringify(cart));
        if (buttonElement) { buttonElement.textContent = 'Удалить из корзины'; buttonElement.classList.add('in-cart'); }
    } else {
        cart.splice(idx, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        if (buttonElement) { buttonElement.textContent = 'В корзину'; buttonElement.classList.remove('in-cart'); }
    }
    refreshProductButtons();
}

function toggleCartFromModal(productId, buttonElement) {
    toggleCart(productId, buttonElement);
}

function toggleFavorite(productId, buttonElement) {
    let favorites = getFavorites();
    const wasFavorite = favorites.some(i => i.id === productId);
    if (wasFavorite) {
        favorites = favorites.filter(i => i.id !== productId);
    } else {
        favorites.push({ id: productId, source: 'product' });
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    const btn = buttonElement || document.querySelector('.favorite-action-btn');
    if (btn) {
        btn.textContent = wasFavorite ? 'Добавить в избранное' : 'Удалить из избранного';
        btn.classList.toggle('in-favorites', !wasFavorite);
    }
    refreshProductButtons();
}

function removeFromFavorites(productId) {
    localStorage.setItem('favorites', JSON.stringify(getFavorites().filter(i => i.id !== productId)));
    refreshProductButtons();
}

function removeFromCart(productId) {
    localStorage.setItem('cart', JSON.stringify(getCart().filter(i => i.id !== productId)));
    refreshProductButtons();
}

function getFavorites() {
    try {
        const raw = localStorage.getItem('favorites');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => {
            if (typeof item === 'number' || typeof item === 'string') return { id: Number(item), source: 'product' };
            return { id: Number(item.id), source: item.source || 'product' };
        }).filter(item => Number.isFinite(item.id));
    } catch { return []; }
}

function getCart() {
    try {
        const raw = localStorage.getItem('cart');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => {
            if (typeof item === 'number' || typeof item === 'string') return { id: Number(item), source: 'product' };
            return { id: Number(item.id), source: item.source || 'product' };
        }).filter(item => Number.isFinite(item.id));
    } catch { return []; }
}

function inquirePrice(productName, productId) {
    const subject = encodeURIComponent('Запрос цены на ' + productName);
    const body = encodeURIComponent('Здравствуйте! Прошу предоставить информацию о цене на:\n\nНазвание: ' + productName + '\nID товара: ' + (productId || 'н/д') + '\n\nСпасибо!');
    window.location.href = 'mailto:kpvssales@gmail.com?subject=' + subject + '&body=' + body;
}

function inquirePriceFromCart() {
    const cart = getCart();
    if (!cart.length) { alert('Корзина пуста'); return; }
    getProductsByIds(cart.map(i => i.id)).then(products => {
        const list = products.map(p => '- ' + p.name + ' (ID: ' + p.id + ')').join('\n');
        const subject = encodeURIComponent('Запрос цены на товары из корзины');
        const body = encodeURIComponent('Здравствуйте! Прошу предоставить информацию о ценах на следующие товары:\n\n' + list + '\n\nСпасибо!');
        window.location.href = 'mailto:kpvssales@gmail.com?subject=' + subject + '&body=' + body;
    });
}

function openFavoritesModal() {
    const existing = document.getElementById('kpvs-favorites-modal');
    if (existing) window.kpvsDismissTopModal(existing);

    const favorites = getFavorites();
    const ids = favorites.map(i => i.id);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'kpvs-favorites-modal';

    if (!ids.length) {
        modal.innerHTML = `
            <div class="modal-content modal-content--cart-favorites">
                <div class="modal-header"><h2>Избранное</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>
                <div class="modal-body"><p class="empty-message">У вас пока нет товаров в избранном</p></div>
            </div>`;
        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(() => modal.classList.add('show'), 10);
        modal.addEventListener('click', e => { if (e.target === modal) window.kpvsDismissTopModal(modal); });
        return;
    }

    getProductsByIds(ids).then(products => {
        modal.innerHTML = `
            <div class="modal-content modal-content--cart-favorites">
                <div class="modal-header"><h2>Избранное</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>
                <div class="modal-body">
                    <div class="modal-items">
                        ${products.filter(p => p && p.id).map(p => {
                            const isInCart = getCart().some(i => i.id === p.id);
                            const imgSrc = getProductImage(p);
                            return `
                            <div class="modal-item" data-product-id="${p.id}">
                                <img src="${imgSrc}" alt="${p.name || 'Товар'}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${p.name || 'Товар'}</h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-add-to-cart ${isInCart ? 'in-cart' : ''}" data-action="toggle-cart" data-product-id="${p.id}">${isInCart ? 'Удалить из корзины' : 'В корзину'}</button>
                                        <button class="btn-remove" data-action="remove-favorite" data-product-id="${p.id}">Удалить</button>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(() => modal.classList.add('show'), 10);
        modal.addEventListener('click', e => { if (e.target === modal) window.kpvsDismissTopModal(modal); });

        modal.querySelectorAll('[data-action="toggle-cart"]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleCartFromModal(Number(btn.dataset.productId), btn);
            });
        });
        modal.querySelectorAll('[data-action="remove-favorite"]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                removeFromFavorites(Number(btn.dataset.productId));
                const item = btn.closest('.modal-item');
                if (item) item.remove();
                if (!modal.querySelector('.modal-item')) {
                    modal.querySelector('.modal-body').innerHTML = '<p class="empty-message">У вас пока нет товаров в избранном</p>';
                }
            });
        });
    });
}

function openCartModal() {
    const existing = document.getElementById('kpvs-cart-modal');
    if (existing) window.kpvsDismissTopModal(existing);

    const cart = getCart();
    const ids = cart.map(i => i.id);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'kpvs-cart-modal';

    if (!ids.length) {
        modal.innerHTML = `
            <div class="modal-content modal-content--cart-favorites">
                <div class="modal-header"><h2>Корзина</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>
                <div class="modal-body"><p class="empty-message">Корзина пуста</p></div>
            </div>`;
        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(() => modal.classList.add('show'), 10);
        modal.addEventListener('click', e => { if (e.target === modal) window.kpvsDismissTopModal(modal); });
        return;
    }

    getProductsByIds(ids).then(products => {
        modal.innerHTML = `
            <div class="modal-content modal-content--cart-favorites">
                <div class="modal-header"><h2>Корзина</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>
                <div class="modal-body">
                    <div class="modal-items">
                        ${products.filter(p => p && p.id).map(p => {
                            const imgSrc = getProductImage(p);
                            return `
                            <div class="modal-item" data-product-id="${p.id}">
                                <img src="${imgSrc}" alt="${p.name || 'Товар'}" class="modal-item-img">
                                <div class="modal-item-info">
                                    <h3>${p.name || 'Товар'}</h3>
                                    <div class="modal-item-actions">
                                        <button class="btn-remove" data-action="remove-from-cart" data-product-id="${p.id}">Удалить</button>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="cart-actions">
                        <button type="button" class="cart-inquire-btn" onclick="kpvsDismissTopModal(this); inquirePriceFromCart();">Узнать цену на все товары</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(() => modal.classList.add('show'), 10);
        modal.addEventListener('click', e => { if (e.target === modal) window.kpvsDismissTopModal(modal); });

        modal.querySelectorAll('[data-action="remove-from-cart"]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                removeFromCart(Number(btn.dataset.productId));
                const item = btn.closest('.modal-item');
                if (item) item.remove();
                if (!modal.querySelector('.modal-item')) {
                    modal.querySelector('.modal-body').innerHTML = '<p class="empty-message">Корзина пуста</p>';
                }
            });
        });
    });
}

function openMap() {
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Брест, ул. л-та Рябцева, 44'), '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
    loadProduct();

    try {
        const token = localStorage.getItem('kpvs.user.jwt');
        const el = document.querySelector('[data-account-action]');
        if (el) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            el.setAttribute('href', '/login.html?mode=user&next=' + next);
            if (!token) {
                el.className = 'admin-ui-btn admin-ui-btn--primary site-account-login-btn';
                el.removeAttribute('title');
                el.setAttribute('aria-label', 'Войти');
                el.textContent = 'Войти';
            } else {
                fetch('/api/user/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
                    .then(r => {
                        if (r.ok) return;
                        try { localStorage.removeItem('kpvs.user.jwt'); } catch {}
                        el.className = 'admin-ui-btn admin-ui-btn--primary site-account-login-btn';
                        el.removeAttribute('title');
                        el.setAttribute('aria-label', 'Войти');
                        el.textContent = 'Войти';
                    })
                    .catch(() => {});
            }
        }
    } catch {}

    const logo = document.querySelector('.section #logo');
    if (logo && !logo.closest('a')) {
        logo.addEventListener('click', () => { window.location.href = 'welcome.html'; });
    }

    const favoritesLink = document.getElementById('favorites-link');
    if (favoritesLink) favoritesLink.addEventListener('click', openFavoritesModal);

    const cartLink = document.getElementById('cart');
    if (cartLink) cartLink.addEventListener('click', openCartModal);

    document.querySelectorAll('.footer-contact').forEach(contact => {
        if (contact.textContent.includes('ул.')) {
            contact.addEventListener('click', openMap);
        } else if (contact.textContent.includes('+375')) {
            contact.addEventListener('click', () => { window.location.href = 'tel:+375162580931'; });
        } else if (contact.textContent.includes('@')) {
            contact.addEventListener('click', () => { window.location.href = 'mailto:kpvssales@gmail.com'; });
        }
    });
});
