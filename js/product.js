let currentProductId = null;

function genderDisplayLabel(g) {
    if (g === 'mens' || g === 'male') return 'Мужской';
    if (g === 'womens' || g === 'female') return 'Женский';
    if (g === 'unisex') return 'Унисекс';
    return '';
}

function escapeAttr(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeProductImageUrl(u) {
    const s = String(u || '').trim();
    if (!s || s.length > 2048) return '';
    const head = s.slice(0, 16).toLowerCase();
    if (head.startsWith('javascript:') || head.startsWith('data:') || head.startsWith('vbscript:')) return '';
    if (s.startsWith('/')) return s.startsWith('//') ? '' : s;
    if (/^https?:\/\//i.test(s)) {
        try {
            const url = new URL(s);
            if (url.username || url.password) return '';
            if (url.protocol === 'http:' || url.protocol === 'https:') return s;
        } catch (_) {}
    }
    return '';
}

function documentTitleFromProductName(name) {
    const d = document.createElement('div');
    d.textContent = name == null || name === '' ? 'Товар' : String(name);
    return d.textContent + ' · КПВС';
}

function catalogHrefForGender(g) {
    const x = String(g || '').toLowerCase();
    if (x === 'mens' || x === 'male') return '/mens.html';
    if (x === 'womens' || x === 'female') return '/womens.html';
    if (x === 'unisex') return '/all.html';
    return '/all.html';
}

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

let productAdaptiveColorsState = null;

function teardownProductAdaptiveColorRows() {
    if (productAdaptiveColorsState) {
        if (productAdaptiveColorsState.ro) productAdaptiveColorsState.ro.disconnect();
        if (productAdaptiveColorsState.onResize) {
            window.removeEventListener('resize', productAdaptiveColorsState.onResize);
        }
        productAdaptiveColorsState = null;
    }
}

function productColorRowCountFit(track, wraps) {
    const limit = track.clientWidth;
    let fit = 0;
    for (let i = 0; i < wraps.length; i++) {
        const el = wraps[i];
        const right = el.offsetLeft + el.offsetWidth;
        if (right <= limit + 1) fit = i + 1;
        else break;
    }
    return fit;
}

function layoutOneAdaptiveColorRow(host) {
    const track = host.querySelector('.product-size-colors-track');
    const moreWrap = host.querySelector('.product-color-more-wrap');
    const wraps = track ? track.querySelectorAll('.product-color-swatch-wrap') : [];
    const btn = moreWrap ? moreWrap.querySelector('.product-color-more-circle') : null;
    const n = wraps.length;
    if (!track || !n) return;

    wraps.forEach(function (w, i) {
        w.removeAttribute('hidden');
        w.style.zIndex = String(Math.max(1, 40 - i));
    });
    if (moreWrap) {
        moreWrap.setAttribute('hidden', '');
        if (btn) {
            btn.textContent = '+0';
            btn.setAttribute('aria-label', 'Показать скрытые цвета');
        }
    }

    if (!moreWrap || n <= 1) return;

    const fitWithMoreHidden = productColorRowCountFit(track, wraps);
    if (fitWithMoreHidden >= n) return;

    moreWrap.removeAttribute('hidden');
    const fit2 = productColorRowCountFit(track, wraps);
    const overflow = n - fit2;
    if (overflow <= 0) {
        moreWrap.setAttribute('hidden', '');
        if (btn) {
            btn.textContent = '+0';
            btn.setAttribute('aria-label', 'Показать скрытые цвета');
        }
        return;
    }
    for (let i = fit2; i < n; i++) {
        wraps[i].setAttribute('hidden', '');
    }
    for (let i = 0; i < fit2; i++) {
        wraps[i].style.zIndex = String(Math.max(1, 40 - i));
    }
    if (btn) {
        btn.textContent = '+' + overflow;
        btn.setAttribute('aria-label', 'Показать ещё ' + overflow + ' ' + (overflow === 1 ? 'цвет' : overflow < 5 ? 'цвета' : 'цветов'));
    }
}

function layoutProductAdaptiveColorRows(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.product-size-colors-adaptive').forEach(layoutOneAdaptiveColorRow);
}

function setupProductAdaptiveColorRows(productMainEl) {
    teardownProductAdaptiveColorRows();
    if (!productMainEl || !productMainEl.querySelector('.product-size-colors-adaptive')) return;

    const run = function () {
        layoutProductAdaptiveColorRows(productMainEl);
    };
    run();
    requestAnimationFrame(run);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(function () {
            run();
        });
        ro.observe(productMainEl);
    }
    const onResize = function () {
        run();
    };
    window.addEventListener('resize', onResize);
    productAdaptiveColorsState = { ro: ro, onResize: onResize };
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
    teardownProductAdaptiveColorRows();

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

        const images = Array.isArray(product.images) && product.images.length
            ? product.images
            : [];
        const mainImage = images.find(i => i.is_primary) || images[0] || null;
        const rawMain = mainImage ? (mainImage.url || '') : '';
        const mainSrc = sanitizeProductImageUrl(rawMain) || '/img/item.png';

        const galleryHtml =
            images.length > 1
                ? '<div class="product-gallery">' +
                  images
                      .map(function (img) {
                          const u = sanitizeProductImageUrl(img.url || '');
                          if (!u) return '';
                          return (
                              '<img src="' +
                              escapeAttr(u) +
                              '" alt="' +
                              escapeAttr(product.name || '') +
                              '" class="product-gallery-item" data-src="' +
                              escapeAttr(u) +
                              '">'
                          );
                      })
                      .join('') +
                  '</div>'
                : '';

        const variantsHtml = buildVariantsHtml(product.variants);
        const attributesHtml = buildAttributesHtml(product.attributes);

        const artHtml = product.art
            ? '<p class="product-sku">Артикул: <strong>' + escapeHtml(product.art) + '</strong></p>'
            : '';
        const brandHtml = product.brand_name
            ? '<p class="product-brand">Бренд: <strong>' + escapeHtml(product.brand_name) + '</strong></p>'
            : '';
        const seasonHtml = product.season
            ? '<p class="product-season">Сезон: <strong>' + escapeHtml(product.season) + '</strong></p>'
            : '';
        const materialsHtml = product.materials
            ? '<p class="product-materials">Состав: ' + escapeHtml(product.materials) + '</p>'
            : '';

        const metaGender = genderDisplayLabel(product.gender) || 'Товар';
        const catPart = product.category_name ? ' · ' + escapeHtml(product.category_name) : '';

        productMainEl.innerHTML =
            '<div class="product-page">' +
            '<div class="product-image-block">' +
            '<div class="product-image-wrapper">' +
            '<img src="' +
            escapeAttr(mainSrc) +
            '" alt="' +
            escapeAttr(product.name || '') +
            '" class="product-image">' +
            '</div>' +
            galleryHtml +
            '<div class="product-actions site-product-actions">' +
            '<button type="button" class="admin-ui-btn admin-ui-btn--primary product-page-action-btn favorite-action-btn ' +
            (isFavorite ? 'in-favorites' : '') +
            '" data-action="product-favorite">' +
            (isFavorite ? 'Удалить из избранного' : 'Добавить в избранное') +
            '</button>' +
            '<button type="button" class="admin-ui-btn admin-ui-btn--primary product-page-action-btn cart-action-btn ' +
            (isInCart ? 'in-cart' : '') +
            '" data-action="product-cart">' +
            (isInCart ? 'Удалить из корзины' : 'В корзину') +
            '</button>' +
            '<button type="button" class="admin-ui-btn inquire-action-btn" data-action="product-inquire">Запросить цену</button>' +
            '</div>' +
            '</div>' +
            '<div class="product-info">' +
            '<h1 class="product-title">' +
            escapeHtml(product.name || '') +
            '</h1>' +
            '<p class="product-meta">' +
            escapeHtml(metaGender) +
            catPart +
            '</p>' +
            artHtml +
            brandHtml +
            '<div class="product-summary">' +
            '<p class="product-description">' +
            (product.description
                ? escapeHtml(product.description)
                : 'Описание товара будет добавлено позже.') +
            '</p>' +
            '</div>' +
            '<div class="product-specs">' +
            seasonHtml +
            materialsHtml +
            variantsHtml +
            attributesHtml +
            '</div>' +
            '</div>' +
            '</div>';

        const favBtn = productMainEl.querySelector('[data-action="product-favorite"]');
        const cartBtnEl = productMainEl.querySelector('[data-action="product-cart"]');
        const inqBtn = productMainEl.querySelector('[data-action="product-inquire"]');
        if (favBtn) {
            favBtn.addEventListener('click', function () {
                toggleFavorite(product.id, favBtn);
            });
        }
        if (cartBtnEl) {
            cartBtnEl.addEventListener('click', function () {
                toggleCart(product.id, cartBtnEl);
            });
        }
        if (inqBtn) {
            inqBtn.addEventListener('click', function () {
                inquirePrice(product.name || '', product.id);
            });
        }

        document.title = documentTitleFromProductName(product.name);
        wireProductBackButton(product);
        setupProductBackAlign();
        setupProductAdaptiveColorRows(productMainEl);

        if (images.length > 1) {
            document.querySelectorAll('.product-gallery-item').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    const mainImg = document.querySelector('.product-image');
                    if (mainImg && thumb.dataset.src) mainImg.src = thumb.dataset.src;
                    requestProductBackAlign();
                });
            });
        }

        const legacyDlg = document.getElementById('product-colors-dialog');
        if (legacyDlg && legacyDlg.parentNode) legacyDlg.parentNode.removeChild(legacyDlg);
    } catch (err) {
        console.error('Error loading product:', err);
        if (productMainEl) productMainEl.innerHTML = '<p class="catalog-empty">Ошибка загрузки товара. Попробуйте обновить страницу.</p>';
    }
}

function colorCountLabelRu(n) {
    n = Math.max(0, Number(n) || 0);
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 14) return n + ' цветов';
    if (mod10 === 1) return n + ' цвет';
    if (mod10 >= 2 && mod10 <= 4) return n + ' цвета';
    return n + ' цветов';
}

function sizeDisplaySortKey(label) {
    const v = String(label || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    const rank = { '2xs': 1, xxs: 1, xs: 2, s: 3, m: 4, l: 5, xl: 6, xxl: 7, '2xl': 7, '3xl': 8 };
    if (rank[v] != null) return [0, rank[v], String(label)];
    const num = parseFloat(String(label).replace(',', '.'));
    if (Number.isFinite(num)) return [1, num, String(label)];
    return [2, 0, String(label)];
}

function sortSizeLabels(labels) {
    return labels.slice().sort(function(a, b) {
        const ka = sizeDisplaySortKey(a);
        const kb = sizeDisplaySortKey(b);
        for (let i = 0; i < 2; i++) {
            if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        }
        return String(ka[2]).localeCompare(String(kb[2]), 'ru', { numeric: true });
    });
}

function swatchInlineStyle(hex) {
    const h = String(hex || '').trim();
    if (/^#[0-9A-Fa-f]{3,8}$/.test(h)) return 'background-color:' + h + ';';
    if (/^[0-9A-Fa-f]{3,8}$/.test(h)) return 'background-color:#' + h + ';';
    return '';
}

function uniqueColorsForSize(activeVariants, sizeLabel) {
    const map = new Map();
    activeVariants.forEach(function(v) {
        if (String(v.size_value || '') !== String(sizeLabel)) return;
        const name = v.color_name != null ? String(v.color_name).trim() : '';
        const hex = v.color_hex != null ? String(v.color_hex).trim() : '';
        if (!name && !hex) return;
        const key =
            v.color_id != null && Number.isFinite(Number(v.color_id))
                ? 'id:' + v.color_id
                : 'n:' + name + '|' + hex;
        if (!map.has(key)) map.set(key, { name: name || 'Цвет', hex: hex });
    });
    return Array.from(map.values()).sort(function(a, b) {
        return String(a.name).localeCompare(String(b.name), 'ru');
    });
}

function uniqueColorsAll(activeVariants) {
    const map = new Map();
    activeVariants.forEach(function(v) {
        const name = v.color_name != null ? String(v.color_name).trim() : '';
        const hex = v.color_hex != null ? String(v.color_hex).trim() : '';
        if (!name && !hex) return;
        const key =
            v.color_id != null && Number.isFinite(Number(v.color_id))
                ? 'id:' + v.color_id
                : 'n:' + name + '|' + hex;
        if (!map.has(key)) map.set(key, { name: name || 'Цвет', hex: hex });
    });
    return Array.from(map.values()).sort(function(a, b) {
        return String(a.name).localeCompare(String(b.name), 'ru');
    });
}

function renderProductSwatchButton(c) {
    const name = c.name || '—';
    const st = swatchInlineStyle(c.hex);
    const styleAttr = st ? ' style="' + escapeAttr(st) + '"' : '';
    const cls = 'product-color-swatch' + (st ? '' : ' product-color-swatch--muted');
    return (
        '<span class="product-color-swatch-wrap" data-tip="' +
        escapeAttr(name) +
        '" title="' +
        escapeAttr(name) +
        '">' +
        '<button type="button" class="' +
        cls +
        '"' +
        styleAttr +
        ' aria-label="' +
        escapeAttr(name) +
        '"></button></span>'
    );
}

function renderProductColorOverflowPopover(allColors, headingLine) {
    const arr = Array.isArray(allColors) ? allColors : [];
    if (arr.length <= 1) return '';
    const rows = arr
        .map(function(c) {
            const st = swatchInlineStyle(c.hex);
            const styleAttr = st ? ' style="' + escapeAttr(st) + '"' : '';
            const dotCls = 'product-color-more-pop-dot' + (st ? '' : ' product-color-more-pop-dot--muted');
            return (
                '<div class="product-color-more-pop-row">' +
                '<span class="' +
                dotCls +
                '"' +
                styleAttr +
                ' aria-hidden="true"></span>' +
                '<span class="product-color-more-pop-name">' +
                escapeHtml(c.name || '—') +
                '</span></div>'
            );
        })
        .join('');
    const head =
        headingLine && String(headingLine).trim()
            ? '<span class="product-color-more-pop-heading">' + escapeHtml(String(headingLine).trim()) + '</span>'
            : '';
    return (
        '<span class="product-color-more-wrap" hidden>' +
        '<button type="button" class="product-color-more-circle" aria-label="Показать скрытые цвета">+0</button>' +
        '<span class="product-color-more-popover" role="tooltip">' +
        head +
        rows +
        '</span></span>'
    );
}

function buildProductColorsAdaptiveRow(colors, headingLine) {
    const arr = Array.isArray(colors) ? colors : [];
    if (!arr.length) return '';
    let row = '';
    arr.forEach(function(c) {
        row += renderProductSwatchButton(c);
    });
    const overflow = renderProductColorOverflowPopover(arr, headingLine);
    const total =
        '<span class="product-size-colors-total" title="Всего оттенков">' + escapeHtml(colorCountLabelRu(arr.length)) + '</span>';
    return (
        '<div class="product-size-colors-adaptive">' +
        '<div class="product-size-colors-track">' +
        row +
        '</div>' +
        overflow +
        total +
        '</div>'
    );
}

function buildVariantsHtml(variants) {
    if (!Array.isArray(variants) || !variants.length) return '';

    const active = variants.filter(function(v) {
        return v.is_active !== false;
    });
    if (!active.length) return '';

    const bySize = {};
    active.forEach(function(v) {
        if (!v.size_value) return;
        if (!bySize[v.size_value]) {
            bySize[v.size_value] = { hint: v.size_equivalent_hint ? String(v.size_equivalent_hint) : '' };
        } else if (!bySize[v.size_value].hint && v.size_equivalent_hint) {
            bySize[v.size_value].hint = String(v.size_equivalent_hint);
        }
    });

    let html = '<div class="product-variants">';
    const sizes = sortSizeLabels(Object.keys(bySize));

    if (sizes.length) {
        html +=
            '<div class="product-spec-group product-spec-group--sizes-colors">' +
            '<p class="product-spec-heading">Размеры и цвета</p>' +
            '<ul class="product-size-color-list">';
        sizes.forEach(function(size) {
            const meta = bySize[size];
            const hint = meta && meta.hint ? ' <span class="product-size-equiv">≈ ' + escapeHtml(meta.hint) + '</span>' : '';
            const colors = uniqueColorsForSize(active, size);
            let chips = '';
            if (!colors.length) {
                chips = '<span class="product-size-colors-empty">цвет не указан</span>';
            } else {
                chips = buildProductColorsAdaptiveRow(colors, 'Размер ' + size);
            }
            html +=
                '<li class="product-size-color-row">' +
                '<span class="product-size-color-label">' +
                escapeHtml(size) +
                hint +
                '</span>' +
                '<div class="product-size-colors">' +
                chips +
                '</div>' +
                '</li>';
        });
        html += '</ul></div>';
    } else {
        const flat = uniqueColorsAll(active);
        if (flat.length) {
            html +=
                '<div class="product-spec-group product-spec-group--sizes-colors">' +
                '<p class="product-spec-heading">Цвета</p>' +
                '<div class="product-size-color-row product-size-color-row--solo">' +
                '<div class="product-size-colors">' +
                buildProductColorsAdaptiveRow(flat, 'Все цвета') +
                '</div></div></div>';
        }
    }

    html += '</div>';
    return html;
}

function buildAttributesHtml(attributes) {
    if (!Array.isArray(attributes) || !attributes.length) return '';
    let html = '<div class="product-attributes"><p class="product-spec-heading">Характеристики</p><ul class="product-attr-list">';
    attributes.forEach(attr => {
        if (!attr || (!attr.name && !attr.value)) return;
        html +=
            '<li><span class="attr-name">' +
            escapeHtml(attr.name) +
            ':</span> <span class="attr-value">' +
            escapeHtml(attr.value) +
            '</span></li>';
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
        const u = primary ? (primary.url || '') : '';
        const clean = sanitizeProductImageUrl(u);
        return clean || '/img/item.png';
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
    const id = Number(productId);
    if (!Number.isFinite(id)) return;
    let cart = getCart();
    const idx = cart.findIndex(i => Number(i.id) === id);
    if (idx === -1) {
        cart.push({ id, source: 'product' });
        localStorage.setItem('cart', JSON.stringify(cart));
        if (buttonElement) { buttonElement.textContent = 'Удалить из корзины'; buttonElement.classList.add('in-cart'); }
    } else {
        cart.splice(idx, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        if (buttonElement) { buttonElement.textContent = 'В корзину'; buttonElement.classList.remove('in-cart'); }
    }
    refreshProductButtons();
    document.querySelectorAll('#kpvs-favorites-modal [data-action="toggle-cart"]').forEach(btn => {
        const pid = Number(btn.dataset && btn.dataset.productId);
        if (!Number.isFinite(pid)) return;
        const inCart = getCart().some(i => Number(i.id) === pid);
        btn.textContent = inCart ? 'Удалить из корзины' : 'В корзину';
        btn.classList.toggle('in-cart', inCart);
    });
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
    const id = Number(productId);
    if (!Number.isFinite(id)) return;
    localStorage.setItem('cart', JSON.stringify(getCart().filter(i => Number(i.id) !== id)));
    refreshProductButtons();
    document.querySelectorAll('#kpvs-favorites-modal [data-action="toggle-cart"]').forEach(btn => {
        const pid = Number(btn.dataset && btn.dataset.productId);
        if (!Number.isFinite(pid)) return;
        const inCart = getCart().some(i => Number(i.id) === pid);
        btn.textContent = inCart ? 'Удалить из корзины' : 'В корзину';
        btn.classList.toggle('in-cart', inCart);
    });
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
        const itemsHtml = products
            .filter(function (p) {
                return p && p.id;
            })
            .map(function (p) {
                const isInCart = getCart().some(function (i) {
                    return i.id === p.id;
                });
                const imgSrc = getProductImage(p);
                const safeSrc = escapeAttr(imgSrc);
                const disp = escapeHtml(p.name || 'Товар');
                const altA = escapeAttr(p.name || 'Товар');
                const pid = Number(p.id);
                return (
                    '<div class="modal-item" data-product-id="' +
                    pid +
                    '">' +
                    '<img src="' +
                    safeSrc +
                    '" alt="' +
                    altA +
                    '" class="modal-item-img">' +
                    '<div class="modal-item-info">' +
                    '<h3>' +
                    disp +
                    '</h3>' +
                    '<div class="modal-item-actions">' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--primary admin-ui-btn--sm ' +
                    (isInCart ? 'in-cart' : '') +
                    '" data-action="toggle-cart" data-product-id="' +
                    pid +
                    '">' +
                    (isInCart ? 'Удалить из корзины' : 'В корзину') +
                    '</button>' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--danger admin-ui-btn--sm" data-action="remove-favorite" data-product-id="' +
                    pid +
                    '">Удалить</button>' +
                    '</div></div></div>'
                );
            })
            .join('');
        modal.innerHTML =
            '<div class="modal-content modal-content--cart-favorites">' +
            '<div class="modal-header"><h2>Избранное</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>' +
            '<div class="modal-body"><div class="modal-items">' +
            itemsHtml +
            '</div></div></div>';
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
        const itemsHtml = products
            .filter(function (p) {
                return p && p.id;
            })
            .map(function (p) {
                const imgSrc = getProductImage(p);
                const safeSrc = escapeAttr(imgSrc);
                const disp = escapeHtml(p.name || 'Товар');
                const altA = escapeAttr(p.name || 'Товар');
                const pid = Number(p.id);
                return (
                    '<div class="modal-item" data-product-id="' +
                    pid +
                    '">' +
                    '<img src="' +
                    safeSrc +
                    '" alt="' +
                    altA +
                    '" class="modal-item-img">' +
                    '<div class="modal-item-info">' +
                    '<h3>' +
                    disp +
                    '</h3>' +
                    '<div class="modal-item-actions">' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--danger admin-ui-btn--sm" data-action="remove-from-cart" data-product-id="' +
                    pid +
                    '">Удалить</button>' +
                    '</div></div></div>'
                );
            })
            .join('');
        modal.innerHTML =
            '<div class="modal-content modal-content--cart-favorites">' +
            '<div class="modal-header"><h2>Корзина</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>' +
            '<div class="modal-body">' +
            '<div class="modal-items">' +
            itemsHtml +
            '</div>' +
            '<div class="cart-actions">' +
            '<button type="button" class="cart-inquire-btn" data-action="cart-inquire-all">Узнать цену на все товары</button>' +
            '</div></div></div>';
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
        const inquireAll = modal.querySelector('[data-action="cart-inquire-all"]');
        if (inquireAll) {
            inquireAll.addEventListener('click', function (e) {
                e.stopPropagation();
                window.kpvsDismissTopModal(modal);
                inquirePriceFromCart();
            });
        }
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
