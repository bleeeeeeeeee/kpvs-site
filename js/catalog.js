const Catalog = (() => {
    let pageGender = 'mens';
    let allProducts = [];
    let currentSort = 'name_asc';
    let currentSearch = '';
    let activeFilters = {
        categories: [],
        brands: [],
        seasons: [],
        sizes: [],
        colors: [],
        tags: []
    };

    let catalogCategories = [];
    let catalogBrands = [];
    let catalogSizes = [];
    let catalogColors = [];

    const sectionTitles = {
        popular:     'Популярные товары',
        outerwear:   'Верхняя одежда',
        underwear:   'Нижняя одежда',
        accessories: 'Аксессуары',
        other:       'Другие товары'
    };

    const seasonLabels = {
        'зима':        'Зима',
        'лето':        'Лето',
        'демисезон':   'Демисезон',
        'всесезонный': 'Всесезонный'
    };

    function storageKey() {
        return 'kpvs.catalogState.v1.' + String(pageGender || 'mens');
    }

    function loadCatalogStateFromStorage() {
        try {
            const raw = localStorage.getItem(storageKey());
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;

            if (typeof parsed.sort === 'string') currentSort = parsed.sort;
            if (typeof parsed.search === 'string') currentSearch = parsed.search;
            if (parsed.filters && typeof parsed.filters === 'object') {
                const f = parsed.filters;
                activeFilters = {
                    categories: Array.isArray(f.categories) ? f.categories.slice() : [],
                    brands: Array.isArray(f.brands) ? f.brands.slice() : [],
                    seasons: Array.isArray(f.seasons) ? f.seasons.slice() : [],
                    sizes: Array.isArray(f.sizes) ? f.sizes.slice() : [],
                    colors: Array.isArray(f.colors) ? f.colors.slice() : [],
                    tags: Array.isArray(f.tags) ? f.tags.slice() : []
                };
            }
        } catch {
        }
    }

    function saveCatalogStateToStorage() {
        try {
            const payload = {
                v: 1,
                gender: pageGender,
                sort: currentSort,
                search: currentSearch,
                filters: activeFilters
            };
            localStorage.setItem(storageKey(), JSON.stringify(payload));
        } catch {
        }
    }

    function applyCatalogStateToControls() {
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) sortSelect.value = currentSort;
        const searchInput = document.getElementById('catalog-search');
        if (searchInput) searchInput.value = currentSearch || '';
        updateSearchClear();
    }

    function initCatalogPage(options) {
        options = options || {};
        pageGender = options.gender || detectPageGender() || 'mens';
        loadCatalogStateFromStorage();
        attachPageEvents();
        applyCatalogStateToControls();
        loadReferenceData().then(function() { loadProducts(); });
    }

    function detectPageGender() {
        const body = document.body;
        if (body && body.dataset.gender) return body.dataset.gender;
        const path = window.location.pathname;
        if (path.includes('all')) return 'all';
        if (path.includes('womens')) return 'womens';
        if (path.includes('mens')) return 'mens';
        return 'mens';
    }

    async function loadReferenceData() {
        try {
            const [catRes, brandRes, sizeRes, colorRes] = await Promise.all([
                fetch('/api/categories'),
                fetch('/api/brands'),
                fetch('/api/sizes'),
                fetch('/api/colors')
            ]);
            catalogCategories = catRes.ok ? flattenCategories(await catRes.json()) : [];
            catalogBrands = brandRes.ok ? await brandRes.json() : [];
            catalogSizes = sizeRes.ok ? await sizeRes.json() : [];
            catalogColors = colorRes.ok ? await colorRes.json() : [];
        } catch (e) {
            catalogCategories = [];
            catalogBrands = [];
            catalogSizes = [];
            catalogColors = [];
        }
    }

    function flattenCategories(list, depth) {
        depth = depth || 0;
        const result = [];
        if (!Array.isArray(list)) return result;
        list.forEach(function(item) {
            if (!item) return;
            result.push({ id: item.id, name: item.name, slug: item.slug, depth: depth });
            if (Array.isArray(item.children) && item.children.length) {
                result.push.apply(result, flattenCategories(item.children, depth + 1));
            }
        });
        return result;
    }

    async function loadProducts() {
        showLoading();
        try {
            const params = new URLSearchParams({ limit: '300', offset: '0' });

            const endpoints = pageGender === 'all'
                ? ['mens', 'womens', 'unisex']
                : [pageGender, 'unisex'];

            const responses = await Promise.all(
                endpoints.map(function(g) {
                    return fetch('/api/products/' + g + '?' + params.toString());
                })
            );

            const lists = await Promise.all(
                responses.map(async function(r) {
                    return r.ok ? await r.json() : [];
                })
            );

            const seen = new Set();
            allProducts = [];
            lists.forEach(function(arr) {
                (arr || []).forEach(function(p) {
                    if (!p || !p.id) return;
                    if (!seen.has(p.id)) { seen.add(p.id); allProducts.push(p); }
                });
            });

            renderProducts();
        } catch (err) {
            console.error('Error loading products:', err);
            showError('Не удалось загрузить товары.');
        }
    }

    function showLoading() {
        const container = document.getElementById('items-container');
        if (container) container.innerHTML = '<p class="catalog-loading">Загрузка товаров…</p>';
    }

    function showError(msg) {
        const container = document.getElementById('items-container');
        if (container) container.innerHTML = '<p class="catalog-empty">' + escapeHtml(msg) + '</p>';
    }

    function renderProducts() {
        const container = document.getElementById('items-container');
        if (!container) return;

        let filtered = applySearchAndFilters(allProducts);
        filtered = sortProducts(filtered);

        renderActiveFilterTags();

        if (!filtered.length) {
            container.innerHTML = '<p class="catalog-empty">Товары не найдены. Попробуйте изменить фильтры или поисковый запрос.</p>';
            return;
        }

        container.innerHTML = '';

        const hasActiveFilters = currentSearch || activeFilters.categories.length || activeFilters.brands.length || activeFilters.seasons.length || activeFilters.sizes.length || activeFilters.colors.length || activeFilters.tags.length;

        if (!hasActiveFilters) {
            const popular = filtered.filter(function(p) { return hasTag(p, 'popular'); });
            if (popular.length) {
                container.appendChild(buildSection('popular', sectionTitles.popular, popular));
            }
        }

        const sectionKeys = ['outerwear', 'underwear', 'accessories'];
        sectionKeys.forEach(function(key) {
            const items = filtered.filter(function(p) { return mapCategoryToSection(p) === key; });
            if (items.length) {
                container.appendChild(buildSection(key, sectionTitles[key], items));
            }
        });

        const uncategorized = filtered.filter(function(p) {
            return !mapCategoryToSection(p) && (!hasActiveFilters ? !hasTag(p, 'popular') : true);
        });
        if (uncategorized.length) {
            container.appendChild(buildSection('other', sectionTitles.other, uncategorized));
        }

        if (!container.querySelector('.itemsSection')) {
            container.innerHTML = '';
            container.appendChild(buildSection('all', 'Все товары', filtered));
        }
    }

    function buildSection(key, title, items) {
        const wrapper = document.createElement('div');
        wrapper.className = 'itemsSection';
        const titleEl = document.createElement('p');
        titleEl.className = 'section-title';
        titleEl.textContent = title;
        wrapper.appendChild(titleEl);
        const effectEl = document.createElement('div');
        effectEl.className = 'effect-section';
        const itemsEl = document.createElement('div');
        itemsEl.className = 'items';
        itemsEl.id = key + '-items';
        items.forEach(function(item) { itemsEl.appendChild(createCard(item)); });
        effectEl.appendChild(itemsEl);
        wrapper.appendChild(effectEl);
        return wrapper;
    }

    function applySearchAndFilters(products) {
        let result = products;

        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            result = result.filter(function(p) {
                return (p.name && p.name.toLowerCase().includes(q))
                    || (p.art && p.art.toLowerCase().includes(q))
                    || (p.description && p.description.toLowerCase().includes(q));
            });
        }

        if (activeFilters.categories.length) {
            result = result.filter(function(p) {
                return activeFilters.categories.some(function(slug) {
                    return p.category_slug === slug || mapCategoryToSection(p) === slug;
                });
            });
        }

        if (activeFilters.brands.length) {
            result = result.filter(function(p) {
                return activeFilters.brands.indexOf(String(p.brand_id)) !== -1
                    || activeFilters.brands.indexOf(p.brand_slug || '') !== -1;
            });
        }

        if (activeFilters.seasons.length) {
            result = result.filter(function(p) {
                return activeFilters.seasons.indexOf(p.season || '') !== -1;
            });
        }

        if (activeFilters.sizes.length) {
            result = result.filter(function(p) {
                if (!Array.isArray(p.variants)) return false;
                return p.variants.some(function(v) {
                    return activeFilters.sizes.indexOf(String(v.size_id)) !== -1;
                });
            });
        }

        if (activeFilters.colors.length) {
            result = result.filter(function(p) {
                if (!Array.isArray(p.variants)) return false;
                return p.variants.some(function(v) {
                    return activeFilters.colors.indexOf(String(v.color_id)) !== -1;
                });
            });
        }

        if (activeFilters.tags.length) {
            result = result.filter(function(p) {
                return activeFilters.tags.some(function(slug) { return hasTag(p, slug); });
            });
        }

        return result;
    }

    function sortProducts(products) {
        return products.slice().sort(function(a, b) {
            const dateA = a.created_at ? Date.parse(a.created_at) : 0;
            const dateB = b.created_at ? Date.parse(b.created_at) : 0;
            switch (currentSort) {
                case 'name_asc':      return (a.name || '').localeCompare(b.name || '', 'ru');
                case 'name_desc':     return (b.name || '').localeCompare(a.name || '', 'ru');
                case 'created_desc':  return dateB - dateA || b.id - a.id;
                case 'created_asc':   return dateA - dateB || a.id - b.id;
                case 'price_asc':     return (a.price || 0) - (b.price || 0);
                case 'price_desc':    return (b.price || 0) - (a.price || 0);
                case 'id_desc':       return b.id - a.id;
                case 'id_asc':        return a.id - b.id;
                default:              return 0;
            }
        });
    }

    function renderActiveFilterTags() {
        const container = document.getElementById('active-filters');
        if (!container) return;
        const tags = [];

        if (currentSearch) {
            tags.push({ label: 'Поиск: «' + currentSearch + '»', clear: function() { currentSearch = ''; const inp = document.getElementById('catalog-search'); if (inp) inp.value = ''; updateSearchClear(); saveCatalogStateToStorage(); renderProducts(); } });
        }
        activeFilters.categories.forEach(function(slug) {
            const cat = catalogCategories.find(function(c) { return c.slug === slug; });
            const label = cat ? cat.name : slug;
            tags.push({ label: 'Категория: ' + label, clear: function() { activeFilters.categories = activeFilters.categories.filter(function(s) { return s !== slug; }); saveCatalogStateToStorage(); renderProducts(); } });
        });
        activeFilters.brands.forEach(function(id) {
            const brand = catalogBrands.find(function(b) { return String(b.id) === id || b.slug === id; });
            const label = brand ? brand.name : id;
            tags.push({ label: 'Бренд: ' + label, clear: function() { activeFilters.brands = activeFilters.brands.filter(function(s) { return s !== id; }); saveCatalogStateToStorage(); renderProducts(); } });
        });
        activeFilters.seasons.forEach(function(s) {
            tags.push({ label: 'Сезон: ' + (seasonLabels[s] || s), clear: function() { activeFilters.seasons = activeFilters.seasons.filter(function(x) { return x !== s; }); saveCatalogStateToStorage(); renderProducts(); } });
        });
        activeFilters.sizes.forEach(function(id) {
            const size = catalogSizes.find(function(s) { return String(s.id) === id; });
            const label = size ? size.value : id;
            tags.push({ label: 'Размер: ' + label, clear: function() { activeFilters.sizes = activeFilters.sizes.filter(function(x) { return x !== id; }); saveCatalogStateToStorage(); renderProducts(); } });
        });
        activeFilters.colors.forEach(function(id) {
            const color = catalogColors.find(function(c) { return String(c.id) === id; });
            const label = color ? color.name : id;
            tags.push({ label: 'Цвет: ' + label, clear: function() { activeFilters.colors = activeFilters.colors.filter(function(x) { return x !== id; }); saveCatalogStateToStorage(); renderProducts(); } });
        });
        activeFilters.tags.forEach(function(slug) {
            tags.push({ label: 'Тег: ' + slug, clear: function() { activeFilters.tags = activeFilters.tags.filter(function(s) { return s !== slug; }); saveCatalogStateToStorage(); renderProducts(); } });
        });

        if (!tags.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
        container.style.display = 'flex';
        container.innerHTML = tags.map(function(t, i) {
            return '<span class="active-filter-tag" data-idx="' + i + '"><span class="active-filter-label">' + escapeHtml(t.label) + '</span><button type="button" class="active-filter-remove" data-idx="' + i + '" aria-label="Убрать фильтр">×</button></span>';
        }).join('') + '<button type="button" class="active-filter-clear-all">Сбросить всё</button>';

        container.querySelectorAll('.active-filter-remove').forEach(function(btn) {
            btn.addEventListener('click', function() { tags[Number(btn.dataset.idx)].clear(); });
        });
        const clearAll = container.querySelector('.active-filter-clear-all');
        if (clearAll) {
            clearAll.addEventListener('click', function() {
                currentSearch = '';
                activeFilters = { categories: [], brands: [], seasons: [], sizes: [], colors: [], tags: [] };
                const inp = document.getElementById('catalog-search');
                if (inp) inp.value = '';
                updateSearchClear();
                saveCatalogStateToStorage();
                renderProducts();
            });
        }
    }

    function openFilterModal() {
        const existing = document.getElementById('catalog-filter-modal');
        if (existing) window.kpvsDismissTopModal(existing);

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'catalog-filter-modal';

        const catHtml = catalogCategories.length
            ? catalogCategories.map(function(c) {
                const value = c.slug || String(c.id);
                const checked = activeFilters.categories.indexOf(value) !== -1 ? 'checked' : '';
                const padding = c.depth ? 'style="padding-left:' + (12 + c.depth * 12) + 'px;"' : '';
                return '<label class="filter-option"><input type="checkbox" name="category" value="' + escapeHtml(value) + '" ' + checked + '><span ' + padding + '>' + escapeHtml(c.name) + '</span></label>';
            }).join('')
            : '<p class="filter-empty-hint">Категории не загружены</p>';

        const catGroupHtml =
            '<div class="filter-group" data-group="category">' +
                '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                    '<span class="filter-group-label">Категория</span>' +
                    '<span class="filter-group-right">' +
                        '<span class="filter-group-count" aria-hidden="true"></span>' +
                        '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                    '</span>' +
                '</button>' +
                '<div class="filter-group-body" hidden>' +
                    '<div class="filter-options">' + catHtml + '</div>' +
                '</div>' +
            '</div>';

        const brandHtml = catalogBrands.length
            ? catalogBrands.map(function(b) {
                const val = String(b.id);
                const checked = activeFilters.brands.indexOf(val) !== -1 || activeFilters.brands.indexOf(b.slug || '') !== -1 ? 'checked' : '';
                return '<label class="filter-option"><input type="checkbox" name="brand" value="' + val + '" ' + checked + '><span>' + escapeHtml(b.name) + '</span></label>';
            }).join('')
            : '<p class="filter-empty-hint">Бренды не загружены</p>';

        const seasons = ['зима', 'лето', 'демисезон', 'всесезонный'];
        const seasonHtml = seasons.map(function(s) {
            const checked = activeFilters.seasons.indexOf(s) !== -1 ? 'checked' : '';
            return '<label class="filter-option"><input type="checkbox" name="season" value="' + s + '" ' + checked + '><span>' + (seasonLabels[s] || s) + '</span></label>';
        }).join('');

        const sizeHtml = catalogSizes.length
            ? catalogSizes.map(function(s) {
                const val = String(s.id);
                const checked = activeFilters.sizes.indexOf(val) !== -1 ? 'checked' : '';
                return '<label class="filter-option"><input type="checkbox" name="size" value="' + val + '" ' + checked + '><span>' + escapeHtml(s.value) + ' (' + escapeHtml(s.size_type) + ')</span></label>';
            }).join('')
            : '';

        const colorHtml = catalogColors.length
            ? catalogColors.map(function(c) {
                const val = String(c.id);
                const checked = activeFilters.colors.indexOf(val) !== -1 ? 'checked' : '';
                return '<label class="filter-option"><input type="checkbox" name="color" value="' + val + '" ' + checked + '><span>' + escapeHtml(c.name) + '</span></label>';
            }).join('')
            : '';

        modal.innerHTML =
            '<div class="modal-content filter-modal-content">' +
                '<div class="modal-header">' +
                    '<h2>Фильтры</h2>' +
                    '<button class="modal-close" type="button" aria-label="Закрыть">&times;</button>' +
                '</div>' +
                '<div class="modal-body">' +
                    catGroupHtml +
                    (catalogBrands.length
                        ? '<div class="filter-group" data-group="brand">' +
                            '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                                '<span class="filter-group-label">Бренд</span>' +
                                '<span class="filter-group-right">' +
                                    '<span class="filter-group-count" aria-hidden="true"></span>' +
                                    '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                                '</span>' +
                            '</button>' +
                            '<div class="filter-group-body" hidden><div class="filter-options">' + brandHtml + '</div></div>' +
                          '</div>'
                        : '') +
                    '<div class="filter-group" data-group="season">' +
                        '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                            '<span class="filter-group-label">Сезон</span>' +
                            '<span class="filter-group-right">' +
                                '<span class="filter-group-count" aria-hidden="true"></span>' +
                                '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                            '</span>' +
                        '</button>' +
                        '<div class="filter-group-body" hidden><div class="filter-options">' + seasonHtml + '</div></div>' +
                    '</div>' +
                    (sizeHtml
                        ? '<div class="filter-group" data-group="size">' +
                            '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                                '<span class="filter-group-label">Размер</span>' +
                                '<span class="filter-group-right">' +
                                    '<span class="filter-group-count" aria-hidden="true"></span>' +
                                    '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                                '</span>' +
                            '</button>' +
                            '<div class="filter-group-body" hidden><div class="filter-options">' + sizeHtml + '</div></div>' +
                          '</div>'
                        : '') +
                    (colorHtml
                        ? '<div class="filter-group" data-group="color">' +
                            '<button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false">' +
                                '<span class="filter-group-label">Цвет</span>' +
                                '<span class="filter-group-right">' +
                                    '<span class="filter-group-count" aria-hidden="true"></span>' +
                                    '<span class="filter-group-caret" aria-hidden="true">▾</span>' +
                                '</span>' +
                            '</button>' +
                            '<div class="filter-group-body" hidden><div class="filter-options">' + colorHtml + '</div></div>' +
                          '</div>'
                        : '') +
                '</div>' +
                '<div class="modal-footer catalog-filter-modal-footer">' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--danger catalog-filter-clear-btn">Сбросить</button>' +
                    '<button type="button" class="admin-ui-btn admin-ui-btn--primary catalog-filter-apply-btn">Применить</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
        setTimeout(function() { modal.classList.add('show'); }, 10);

        modal.querySelector('.modal-close').addEventListener('click', function() { window.kpvsDismissTopModal(modal); });
        modal.addEventListener('click', function(e) { if (e.target === modal) window.kpvsDismissTopModal(modal); });

        function setGroupOpen(groupEl, open) {
            const body = groupEl.querySelector('.filter-group-body');
            const btn = groupEl.querySelector('.filter-group-toggle');
            if (!body || !btn) return;
            groupEl.classList.toggle('is-open', open);
            body.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function updateGroupCount(groupEl) {
            const countEl = groupEl.querySelector('.filter-group-count');
            if (!countEl) return;
            const checked = groupEl.querySelectorAll('input[type="checkbox"]:checked').length;
            if (checked > 0) {
                countEl.textContent = String(checked);
                countEl.style.display = 'inline-flex';
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
            }
        }

        modal.querySelectorAll('.filter-group-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const group = btn.closest('.filter-group');
                if (!group) return;
                const willOpen = !group.classList.contains('is-open');
                modal.querySelectorAll('.filter-group.is-open').forEach(function(openGroup) {
                    if (openGroup !== group) setGroupOpen(openGroup, false);
                });
                setGroupOpen(group, willOpen);
            });
        });

        modal.querySelectorAll('.filter-group').forEach(function(group) {
            setGroupOpen(group, false);
            updateGroupCount(group);
            group.querySelectorAll('input[type="checkbox"]').forEach(function(inp) {
                inp.addEventListener('change', function() { updateGroupCount(group); });
            });
        });

        modal.querySelector('.catalog-filter-apply-btn').addEventListener('click', function() {
            activeFilters.categories = Array.from(modal.querySelectorAll('input[name="category"]:checked')).map(function(i) { return i.value; });
            activeFilters.brands = Array.from(modal.querySelectorAll('input[name="brand"]:checked')).map(function(i) { return i.value; });
            activeFilters.seasons = Array.from(modal.querySelectorAll('input[name="season"]:checked')).map(function(i) { return i.value; });
            activeFilters.sizes = Array.from(modal.querySelectorAll('input[name="size"]:checked')).map(function(i) { return i.value; });
            activeFilters.colors = Array.from(modal.querySelectorAll('input[name="color"]:checked')).map(function(i) { return i.value; });
            window.kpvsDismissTopModal(modal);
            saveCatalogStateToStorage();
            renderProducts();
        });

        modal.querySelector('.catalog-filter-clear-btn').addEventListener('click', function() {
            activeFilters = { categories: [], brands: [], seasons: [], sizes: [], colors: [], tags: [] };
            window.kpvsDismissTopModal(modal);
            saveCatalogStateToStorage();
            renderProducts();
        });
    }

    function hasTag(product, tagSlug) {
        if (!Array.isArray(product.tags)) return false;
        return product.tags.some(function(t) { return t.slug === tagSlug || t.code === tagSlug; });
    }

    function mapCategoryToSection(product) {
        const slug = product.category_slug || product.category || '';
        if (!slug) return null;
        if (slug.startsWith('outerwear') || slug === 'outerwear') return 'outerwear';
        if (slug.startsWith('pants') || slug.startsWith('underwear') || slug === 'pants') return 'underwear';
        if (slug.startsWith('accessories') || slug.startsWith('acc_') || slug === 'accessories') return 'accessories';
        return null;
    }

    function getProductImage(item) {
        if (item.image) return item.image;
        if (Array.isArray(item.images) && item.images.length) {
            const primary = item.images.find(function(i) { return i.is_primary; }) || item.images[0];
            return primary ? (primary.url || primary.path || '') : '';
        }
        return '/img/item.png';
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function updateSearchClear() {
        const inp = document.getElementById('catalog-search');
        const btn = document.getElementById('catalog-search-clear');
        if (!btn) return;
        if (inp && inp.value) {
            btn.hidden = false;
        } else {
            btn.hidden = true;
        }
    }

    function createCard(item) {
        const isFavorite = getFavorites().some(function(f) { return f.id === item.id; });
        const isInCart = getCart().some(function(c) { return c.id === item.id; });
        const imgSrc = getProductImage(item);
        const tagsHtml = (item.tags || []).map(function(tag) {
            const label = tag.icon || (tag.name ? tag.name.charAt(0) : '');
            const color = tag.color || '#727B26';
            return '<span class="card-tag" title="' + escapeHtml(tag.name || '') + '" style="background:' + escapeHtml(color) + ';">' + escapeHtml(label) + '</span>';
        }).join('');
        const tagOverlay = tagsHtml ? '<div class="card-tags">' + tagsHtml + '</div>' : '';

        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-id', item.id);
        const productLink = item.slug
            ? 'product.html?slug=' + encodeURIComponent(item.slug)
            : 'product.html?id=' + encodeURIComponent(item.id);
        card.onclick = function() { window.location.href = productLink; };

        card.innerHTML =
            '<div class="card-img-container">' +
                '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(item.name) + '" class="card-img" loading="lazy">' +
                tagOverlay +
                '<div class="card-hover-overlay">' +
                    '<button class="card-favorite-btn card-hover-btn ' + (isFavorite ? 'in-favorites' : '') + '" onclick="event.stopPropagation(); Catalog.toggleFavorite(' + item.id + ', this)">' +
                        (isFavorite ? 'Удалить из избранного' : 'В избранное') +
                    '</button>' +
                    '<button class="card-cart-btn card-hover-btn ' + (isInCart ? 'in-cart' : '') + '" onclick="event.stopPropagation(); Catalog.toggleCart(' + item.id + ', this)">' +
                        (isInCart ? 'Удалить из корзины' : 'В корзину') +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="card-content">' +
                '<p class="card-name">' + escapeHtml(item.name) + '</p>' +
                (item.art ? '<p class="card-art">' + escapeHtml(item.art) + '</p>' : '') +
            '</div>';
        return card;
    }

    function attachPageEvents() {
        const sortSelect = document.getElementById('sort-select');
        const filterButton = document.getElementById('filter-button');
        const favoritesLink = document.getElementById('favorites-link');
        const cartLink = document.getElementById('cart');
        const searchInput = document.getElementById('catalog-search');
        const searchClear = document.getElementById('catalog-search-clear');

        if (sortSelect) {
            sortSelect.addEventListener('change', function(e) {
                currentSort = e.target.value;
                saveCatalogStateToStorage();
                renderProducts();
            });
        }
        if (filterButton) filterButton.addEventListener('click', openFilterModal);
        if (favoritesLink) favoritesLink.addEventListener('click', openFavoritesModal);
        if (cartLink) cartLink.addEventListener('click', openCartModal);
        const logo = document.querySelector('.section #logo');
        if (logo && !logo.closest('a')) {
            logo.addEventListener('click', function() { window.location.href = 'welcome.html'; });
        }

        if (searchInput) {
            let searchTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function() {
                    currentSearch = searchInput.value.trim();
                    updateSearchClear();
                    saveCatalogStateToStorage();
                    renderProducts();
                }, 250);
            });
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    currentSearch = '';
                    updateSearchClear();
                    saveCatalogStateToStorage();
                    renderProducts();
                }
            });
        }
        if (searchClear) {
            searchClear.addEventListener('click', function() {
                const inp = document.getElementById('catalog-search');
                if (inp) inp.value = '';
                currentSearch = '';
                updateSearchClear();
                saveCatalogStateToStorage();
                renderProducts();
            });
        }

        document.querySelectorAll('.footer-contact').forEach(function(contact) {
            if (contact.textContent.includes('ул.')) {
                contact.addEventListener('click', openMap);
            } else if (contact.textContent.includes('+375')) {
                contact.addEventListener('click', function() { window.location.href = 'tel:+375162580931'; });
            }
        });

        updateSearchClear();
    }

    function openMap() {
        window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Брест, ул. л-та Рябцева, 44'), '_blank');
    }

    function getFavorites() {
        try {
            const raw = localStorage.getItem('favorites');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map(function(item) {
                if (typeof item === 'number' || typeof item === 'string') return { id: Number(item), source: pageGender };
                return { id: Number(item.id), source: item.source || pageGender };
            }).filter(function(item) { return Number.isFinite(item.id); });
        } catch { return []; }
    }

    function getCart() {
        try {
            const raw = localStorage.getItem('cart');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map(function(item) {
                if (typeof item === 'number' || typeof item === 'string') return { id: Number(item), source: pageGender };
                return { id: Number(item.id), source: item.source || pageGender };
            }).filter(function(item) { return Number.isFinite(item.id); });
        } catch { return []; }
    }

    function refreshCatalogButtons() {
        const favorites = getFavorites();
        const cart = getCart();
        document.querySelectorAll('.card-favorite-btn').forEach(function(btn) {
            const card = btn.closest('.card');
            const id = card ? Number(card.dataset.id) : Number(btn.dataset.productId);
            if (!Number.isFinite(id)) return;
            const isFavorite = favorites.some(function(i) { return i.id === id; });
            btn.textContent = isFavorite ? 'Удалить из избранного' : 'В избранное';
            btn.classList.toggle('in-favorites', isFavorite);
        });
        document.querySelectorAll('.card-cart-btn').forEach(function(btn) {
            const card = btn.closest('.card');
            const id = card ? Number(card.dataset.id) : Number(btn.dataset.productId);
            if (!Number.isFinite(id)) return;
            const isInCart = cart.some(function(i) { return i.id === id; });
            btn.textContent = isInCart ? 'Удалить из корзины' : 'В корзину';
            btn.classList.toggle('in-cart', isInCart);
        });
    }

    function toggleFavorite(productId, buttonElement) {
        let favorites = getFavorites();
        const wasFavorite = favorites.some(function(i) { return i.id === productId; });
        if (wasFavorite) {
            favorites = favorites.filter(function(i) { return i.id !== productId; });
        } else {
            favorites.push({ id: productId, source: pageGender });
        }
        localStorage.setItem('favorites', JSON.stringify(favorites));
        if (buttonElement) {
            buttonElement.textContent = wasFavorite ? 'В избранное' : 'Удалить из избранного';
            buttonElement.classList.toggle('in-favorites', !wasFavorite);
        }
        refreshCatalogButtons();
    }

    function toggleCart(productId, buttonElement) {
        let cart = getCart();
        const idx = cart.findIndex(function(i) { return i.id === productId; });
        if (idx === -1) {
            cart.push({ id: productId, source: pageGender });
            localStorage.setItem('cart', JSON.stringify(cart));
            if (buttonElement) { buttonElement.textContent = 'Удалить из корзины'; buttonElement.classList.add('in-cart'); }
        } else {
            cart.splice(idx, 1);
            localStorage.setItem('cart', JSON.stringify(cart));
            if (buttonElement) { buttonElement.textContent = 'В корзину'; buttonElement.classList.remove('in-cart'); }
        }
        refreshCatalogButtons();
    }

    function removeFromFavorites(productId) {
        localStorage.setItem('favorites', JSON.stringify(getFavorites().filter(function(i) { return i.id !== productId; })));
        refreshCatalogButtons();
        renderProducts();
    }

    function removeFromCart(productId) {
        localStorage.setItem('cart', JSON.stringify(getCart().filter(function(i) { return i.id !== productId; })));
        refreshCatalogButtons();
        renderProducts();
    }

    async function getProductsByIds(ids) {
        const results = await Promise.all(ids.map(async function(id) {
            try {
                const r = await fetch('/api/product/' + encodeURIComponent(id));
                if (!r.ok) return null;
                const p = await r.json();
                return p && p.id ? p : null;
            } catch { return null; }
        }));
        return results.filter(Boolean);
    }

    function attachModalClose(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) window.kpvsDismissTopModal(modal);
        });
    }

    function openFavoritesModal() {
        const existing = document.getElementById('kpvs-favorites-modal');
        if (existing) window.kpvsDismissTopModal(existing);

        const favorites = getFavorites();
        const ids = favorites.map(function(i) { return i.id; });
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'kpvs-favorites-modal';

        if (!ids.length) {
            modal.innerHTML =
                '<div class="modal-content modal-content--cart-favorites">' +
                    '<div class="modal-header"><h2>Избранное</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>' +
                    '<div class="modal-body"><p class="empty-message">У вас пока нет товаров в избранном</p></div>' +
                '</div>';
            document.body.appendChild(modal);
            if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
            setTimeout(function() { modal.classList.add('show'); }, 10);
            attachModalClose(modal);
            return;
        }

        getProductsByIds(ids).then(function(products) {
            const itemsHtml = products.length
                ? products.map(function(p) {
                    const isInCart = getCart().some(function(i) { return i.id === p.id; });
                    const imgSrc = getProductImage(p);
                    const art = p.art ? String(p.art) : '';
                    return '<div class="modal-item" data-product-id="' + p.id + '">' +
                        '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(p.name || '') + '" class="modal-item-img">' +
                        '<div class="modal-item-info">' +
                            '<h3>' + escapeHtml(p.name || 'Товар') + '</h3>' +
                            (art ? '<p class="modal-item-art">арт. ' + escapeHtml(art) + '</p>' : '') +
                            '<div class="modal-item-actions">' +
                                '<button class="admin-ui-btn admin-ui-btn--primary admin-ui-btn--sm ' + (isInCart ? 'in-cart' : '') + '" data-action="toggle-cart" data-product-id="' + p.id + '">' + (isInCart ? 'Удалить из корзины' : 'В корзину') + '</button>' +
                                '<button class="admin-ui-btn admin-ui-btn--danger admin-ui-btn--sm" data-action="remove-favorite" data-product-id="' + p.id + '">Удалить</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }).join('')
                : '';
            modal.innerHTML =
                '<div class="modal-content modal-content--cart-favorites">' +
                    '<div class="modal-header"><h2>Избранное</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>' +
                    '<div class="modal-body">' + (itemsHtml ? '<div class="modal-items">' + itemsHtml + '</div>' : '<p class="empty-message">Товары не найдены</p>') + '</div>' +
                '</div>';
            document.body.appendChild(modal);
            if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
            setTimeout(function() { modal.classList.add('show'); }, 10);
            attachModalClose(modal);

            modal.querySelectorAll('[data-action="toggle-cart"]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const pid = Number(btn.dataset.productId);
                    toggleCart(pid, btn);
                });
            });
            modal.querySelectorAll('[data-action="remove-favorite"]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const pid = Number(btn.dataset.productId);
                    removeFromFavorites(pid);
                    btn.closest('.modal-item').remove();
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
        const ids = cart.map(function(i) { return i.id; });
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'kpvs-cart-modal';

        if (!ids.length) {
            modal.innerHTML =
                '<div class="modal-content modal-content--cart-favorites">' +
                    '<div class="modal-header"><h2>Корзина</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>' +
                    '<div class="modal-body"><p class="empty-message">Ваша корзина пуста</p></div>' +
                '</div>';
            document.body.appendChild(modal);
            if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
            setTimeout(function() { modal.classList.add('show'); }, 10);
            attachModalClose(modal);
            return;
        }

        getProductsByIds(ids).then(function(products) {
            const itemsHtml = products.length
                ? products.map(function(p) {
                    const imgSrc = getProductImage(p);
                    const art = p.art ? String(p.art) : '';
                    return '<div class="modal-item" data-product-id="' + p.id + '">' +
                        '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(p.name || '') + '" class="modal-item-img">' +
                        '<div class="modal-item-info">' +
                            '<h3>' + escapeHtml(p.name || 'Товар') + '</h3>' +
                            (art ? '<p class="modal-item-art">арт. ' + escapeHtml(art) + '</p>' : '') +
                            '<div class="modal-item-actions">' +
                                '<button class="admin-ui-btn admin-ui-btn--danger admin-ui-btn--sm" data-action="remove-cart" data-product-id="' + p.id + '">Удалить</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }).join('')
                : '';
            modal.innerHTML =
                '<div class="modal-content modal-content--cart-favorites">' +
                    '<div class="modal-header"><h2>Корзина</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="Закрыть">&times;</button></div>' +
                    '<div class="modal-body">' + (itemsHtml ? '<div class="modal-items">' + itemsHtml + '</div>' : '<p class="empty-message">Товары не найдены</p>') + '</div>' +
                '</div>';
            document.body.appendChild(modal);
            if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
            setTimeout(function() { modal.classList.add('show'); }, 10);
            attachModalClose(modal);

            modal.querySelectorAll('[data-action="remove-cart"]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const pid = Number(btn.dataset.productId);
                    removeFromCart(pid);
                    btn.closest('.modal-item').remove();
                    if (!modal.querySelector('.modal-item')) {
                        modal.querySelector('.modal-body').innerHTML = '<p class="empty-message">Ваша корзина пуста</p>';
                    }
                });
            });
        });
    }

    return {
        init: initCatalogPage,
        toggleFavorite: toggleFavorite,
        toggleCart: toggleCart
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    Catalog.init();
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
                    .then(function(r) {
                        if (r.ok) return;
                        try { localStorage.removeItem('kpvs.user.jwt'); } catch {}
                        el.className = 'admin-ui-btn admin-ui-btn--primary site-account-login-btn';
                        el.removeAttribute('title');
                        el.setAttribute('aria-label', 'Войти');
                        el.textContent = 'Войти';
                    })
                    .catch(function() {});
            }
        }
    } catch {}
});
