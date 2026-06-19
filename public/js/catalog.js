const Catalog = (() => {
  const escapeHtml = window.KpvsEscape.escapeHtml;
  const escapeAttr = window.KpvsEscape.escapeAttr;
  const MODAL_EMPTY_FAVORITES = "\u0412 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0442\u043E\u0432\u0430\u0440\u043E\u0432.";
  const MODAL_EMPTY_CART = "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0442\u043E\u0432\u0430\u0440\u043E\u0432.";
  function modalListEmptyHtml(msg) {
    return '<p class="catalog-empty">' + escapeHtml(msg) + "</p>";
  }
  let pageGender = "mens";
  let allProducts = [];
  let sectionCollections = [];
  let currentSort = "name_asc";
  let currentSearch = "";
  let activeFilters = {
    categories: [],
    brands: [],
    seasons: [],
    sizes: [],
    sizeLabels: {},
    colors: [],
    collections: []
  };
  let catalogCategories = [];
  let catalogCategoryRoots = [];
  let categoryBySlug = Object.create(null);
  let categoryById = Object.create(null);
  let catalogRootId = null;
  const categorySlugToSection = Object.create(null);
  const LEGACY_CATEGORY_FILTER_ALIASES = {
    outerwear: "workwear",
    underwear: "workwear",
    accessories: "ppe"
  };
  function normalizeLegacyCategoryFilterToken(slug) {
    const s = String(slug || "").trim();
    const mapped = LEGACY_CATEGORY_FILTER_ALIASES[s];
    return mapped || s;
  }
  function normalizeStoredCategoryFilters(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = Object.create(null);
    list.forEach(function(s) {
      const n = normalizeLegacyCategoryFilterToken(s);
      if (!n || seen[n]) return;
      seen[n] = 1;
      out.push(n);
    });
    return out;
  }
  function categoryRowMatchesActiveFilter(c, activeList) {
    if (!c || !Array.isArray(activeList)) return false;
    const rowKey = String(c.slug != null ? c.slug : c.id || "").trim();
    if (!rowKey) return false;
    let rowSec = null;
    if (Object.prototype.hasOwnProperty.call(categorySlugToSection, rowKey)) {
      rowSec = categorySlugToSection[rowKey];
    } else {
      rowSec = inferSectionFromSlugName(rowKey, c.name || "");
    }
    for (let i = 0; i < activeList.length; i++) {
      const f = String(activeList[i] || "").trim();
      if (!f) continue;
      if (f === rowKey) return true;
      const nf = normalizeLegacyCategoryFilterToken(f);
      if (nf === rowKey) return true;
      if (rowSec && (f === rowSec || nf === rowSec)) return true;
    }
    return false;
  }
  let catalogBrands = [];
  let catalogColors = [];
  let catalogCollections = [];
  let sizeEquivalenceAdj = null;
  const sectionTitles = {
    workwear: "\u0421\u043F\u0435\u0446\u043E\u0434\u0435\u0436\u0434\u0430",
    footwear: "\u0421\u043F\u0435\u0446\u043E\u0431\u0443\u0432\u044C",
    ppe: "\u0421\u0418\u0417",
    miscCat: "\u0414\u0440\u0443\u0433\u0438\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438",
    other: "\u0414\u0440\u0443\u0433\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u044B"
  };
  const seasonLabels = {
    "\u0437\u0438\u043C\u0430": "\u0417\u0438\u043C\u0430",
    "\u043B\u0435\u0442\u043E": "\u041B\u0435\u0442\u043E",
    "\u0434\u0435\u043C\u0438\u0441\u0435\u0437\u043E\u043D": "\u0414\u0435\u043C\u0438\u0441\u0435\u0437\u043E\u043D"
  };
  function storageKey() {
    return "kpvs.catalogState.v1." + String(pageGender || "mens");
  }
  function catalogPersistEnabled() {
    try {
      return localStorage.getItem("kpvs.catalog.persist") !== "0";
    } catch {
      return true;
    }
  }
  function loadCatalogStateFromStorage() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.sort === "string") currentSort = normalizeSortKey(parsed.sort);
      if (typeof parsed.search === "string") currentSearch = parsed.search;
      if (parsed.filters && typeof parsed.filters === "object") {
        const f = parsed.filters;
        activeFilters = {
          categories: normalizeStoredCategoryFilters(f.categories),
          brands: Array.isArray(f.brands) ? f.brands.slice() : [],
          seasons: Array.isArray(f.seasons) ? f.seasons.slice() : [],
          sizes: Array.isArray(f.sizes) ? f.sizes.slice() : [],
          sizeLabels: f.sizeLabels && typeof f.sizeLabels === "object" ? Object.assign({}, f.sizeLabels) : {},
          colors: Array.isArray(f.colors) ? f.colors.slice() : [],
          collections: Array.isArray(f.collections) ? f.collections.slice() : []
        };
      }
    } catch {
    }
  }
  function saveCatalogStateToStorage() {
    if (!catalogPersistEnabled()) return;
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
    listsPush();
  }
  function applyCatalogStateToControls() {
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) sortSelect.value = currentSort;
    const searchInput = document.getElementById("catalog-search");
    if (searchInput) searchInput.value = currentSearch || "";
    updateSearchClear();
  }
  function initCatalogPage(options) {
    options = options || {};
    pageGender = options.gender || detectPageGender() || "mens";
    loadCatalogStateFromStorage();
    attachPageEvents();
    applyCatalogStateToControls();
    document.addEventListener("kpvs-lists-synced", function() {
      loadCatalogStateFromStorage();
      applyCatalogStateToControls();
      refreshCatalogButtons();
      renderProducts();
    });
    var bootCatalog = function() {
      loadReferenceData().then(function() {
        loadProducts();
      });
    };
    if (window.KpvsListsSync && window.KpvsListsSync.pull) {
      window.KpvsListsSync.pull().finally(bootCatalog);
    } else {
      bootCatalog();
    }
  }
  function detectPageGender() {
    const body = document.body;
    if (body && body.dataset.gender) return body.dataset.gender;
    const path = window.location.pathname;
    if (path.includes("all")) return "all";
    if (path.includes("womens")) return "womens";
    if (path.includes("mens")) return "mens";
    return "mens";
  }
  function buildSizeEquivalenceAdjacency(buckets) {
    const adj = new Map();
    (buckets || []).forEach(function(bucket) {
      let ids = bucket && bucket.size_ids;
      if (typeof ids === "string") {
        try {
          ids = JSON.parse(ids);
        } catch (e) {
          ids = [];
        }
      }
      if (!Array.isArray(ids) || ids.length < 2) return;
      const strIds = ids.map(function(id) {
        return String(id);
      });
      strIds.forEach(function(a) {
        if (!adj.has(a)) adj.set(a, new Set());
        strIds.forEach(function(b) {
          if (b !== a) adj.get(a).add(b);
        });
      });
    });
    return adj;
  }
  function variantMatchesFilteredSizes(variantSizeId, filterSizeIds) {
    if (!filterSizeIds || !filterSizeIds.length) return false;
    const vid = variantSizeId != null && String(variantSizeId).trim() !== "" ? String(variantSizeId) : "";
    if (!vid) return false;
    for (let i = 0; i < filterSizeIds.length; i++) {
      const fid = String(filterSizeIds[i]);
      if (fid === vid) return true;
      const neigh = sizeEquivalenceAdj && sizeEquivalenceAdj.get(fid);
      if (neigh && neigh.has(vid)) return true;
    }
    return false;
  }
  function normalizeProductCollections(p) {
    const raw = p && p.collections;
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const j = JSON.parse(raw);
        return Array.isArray(j) ? j : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }
  async function loadReferenceData() {
    try {
      const [catRes, brandRes, colorRes, colRes, eqRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/brands"),
        fetch("/api/colors"),
        fetch("/api/collections"),
        fetch("/api/size-equivalence-buckets")
      ]);
      const catJson = catRes.ok ? await catRes.json() : [];
      catalogCategoryRoots = Array.isArray(catJson) ? catJson : [];
      catalogCategories = flattenCategories(catalogCategoryRoots);
      buildCategoryMaps();
      rebuildCategorySlugToSectionIndex();
      catalogBrands = brandRes.ok ? await brandRes.json() : [];
      catalogColors = colorRes.ok ? await colorRes.json() : [];
      catalogCollections = colRes.ok ? await colRes.json() : [];
      if (!Array.isArray(catalogCollections)) catalogCollections = [];
      if (eqRes.ok) {
        const buckets = await eqRes.json();
        sizeEquivalenceAdj = buildSizeEquivalenceAdjacency(Array.isArray(buckets) ? buckets : []);
      } else {
        sizeEquivalenceAdj = null;
      }
    } catch (e) {
      catalogCategories = [];
      catalogCategoryRoots = [];
      categoryBySlug = Object.create(null);
      categoryById = Object.create(null);
      catalogRootId = null;
      rebuildCategorySlugToSectionIndex();
      catalogBrands = [];
      catalogColors = [];
      catalogCollections = [];
      sizeEquivalenceAdj = null;
    }
  }
  function flattenCategories(list, depth, parentId) {
    depth = depth || 0;
    parentId = parentId != null ? parentId : null;
    const result = [];
    if (!Array.isArray(list)) return result;
    list.forEach(function(item) {
      if (!item) return;
      const pid = item.parent_id != null && item.parent_id !== "" ? Number(item.parent_id) : parentId;
      result.push({
        id: item.id,
        name: item.name,
        slug: item.slug,
        depth,
        parent_id: pid,
        sort_order: item.sort_order != null ? Number(item.sort_order) : 0,
        is_leaf: item.is_leaf === true || !(Array.isArray(item.children) && item.children.length)
      });
      if (Array.isArray(item.children) && item.children.length) {
        result.push.apply(result, flattenCategories(item.children, depth + 1, Number(item.id)));
      }
    });
    return result;
  }
  function buildCategoryMaps() {
    categoryBySlug = Object.create(null);
    categoryById = Object.create(null);
    catalogRootId = null;
    function walk(node, parentNode) {
      if (!node) return;
      const row = {
        id: node.id,
        name: node.name,
        slug: node.slug,
        parent_id: node.parent_id != null ? Number(node.parent_id) : parentNode ? Number(parentNode.id) : null,
        sort_order: node.sort_order != null ? Number(node.sort_order) : 0,
        children: node.children || [],
        _parent: parentNode || null
      };
      categoryById[row.id] = row;
      if (row.slug) categoryBySlug[String(row.slug)] = row;
      if (row.slug === "catalog-root") catalogRootId = Number(row.id);
      (node.children || []).forEach(function(ch) {
        walk(ch, row);
      });
    }
    catalogCategoryRoots.forEach(function(r) {
      walk(r, null);
    });
  }
  function getProductCatalogSection(product) {
    if (!product) return null;
    const parentSlug = product.category_parent_slug != null ? String(product.category_parent_slug).trim() : "";
    const parentName = product.category_parent_name != null ? String(product.category_parent_name).trim() : "";
    if (parentSlug && parentSlug !== "catalog-root" && parentName) {
      const parent = categoryBySlug[parentSlug];
      return {
        key: "cat-" + parentSlug,
        title: parentName,
        sort_order: parent ? parent.sort_order || 0 : 0
      };
    }
    const slug = product.category_slug != null ? String(product.category_slug).trim() : "";
    if (!slug) return null;
    const cat = categoryBySlug[slug];
    if (!cat) return null;
    const parent = cat._parent;
    if (!parent || parent.slug === "catalog-root") {
      return { key: "cat-" + slug, title: cat.name || slug, sort_order: cat.sort_order || 0 };
    }
    return { key: "cat-" + parent.slug, title: parent.name || parent.slug, sort_order: parent.sort_order || 0 };
  }
  function productMatchesCategoryFilter(product, filterSlug) {
    const want = normalizeLegacyCategoryFilterToken(filterSlug);
    if (!want) return false;
    const slug = product.category_slug != null ? String(product.category_slug).trim() : "";
    if (slug === want) return true;
    const sec = getProductCatalogSection(product);
    if (sec && sec.key === "cat-" + want) return true;
    if (!slug) return false;
    let node = categoryBySlug[slug];
    let guard = 0;
    while (node && guard < 24) {
      if (node.slug === want) return true;
      node = node._parent;
      guard += 1;
    }
    return false;
  }
  function collectParentCategorySections(items) {
    const map = new Map();
    (items || []).forEach(function(p) {
      const sec = getProductCatalogSection(p);
      if (!sec) return;
      if (!map.has(sec.key)) {
        map.set(sec.key, { key: sec.key, title: sec.title, sort_order: sec.sort_order, items: [] });
      }
      map.get(sec.key).items.push(p);
    });
    return Array.from(map.values()).sort(function(a, b) {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(a.title).localeCompare(String(b.title), "ru");
    });
  }
  function tokenizeForSectionInfer(text) {
    const raw = String(text || "").toLowerCase().replace(/[_-]+/g, " ");
    let tokens = raw.split(/[^a-z0-9\u0400-\u04FF]+/i).filter(function(t) {
      return t.length >= 2;
    });
    if (!tokens.length && raw.trim()) {
      tokens = raw.trim().split(/\s+/).filter(function(t) {
        return t.length >= 2;
      });
    }
    return { raw, tokens };
  }
  function inferSectionFromSlugName(slug, name) {
    const slugStr = String(slug || "").toLowerCase();
    const combined = `${String(name || "")} ${slugStr}`;
    const tokenized = tokenizeForSectionInfer(combined);
    const raw = tokenized.raw;
    const tokens = tokenized.tokens;
    const hay = " " + tokens.join(" ") + " ";
    const haySlug = " " + raw.replace(/\s+/g, " ").trim() + " ";
    if (!slugStr && !String(name || "").trim()) return null;

    const gloveRe = /(?:^|\s)(?:перчат|рукавиц|gloves?)(?:[a-zа-яё]*)?(?:\s|$)/i;
    const footRe = /(?:^|\s)(?:обувь|обуви|обувью|обувей|ботинк|сапог|кроссовк|тапочк|босоножк|валенк|мокасин|лофер|слипон|туфл|сабо|угг|эспадриль)(?:[a-zа-яё]*)?(?:\s|$)/i;
    const slugSegs = slugStr.split(/[/_.-]+/).filter(Boolean);
    const slugSegFoot = slugSegs.some(function(seg) {
      return /^(obuv|footwear|shoe|boots?|sneakers?|tapoch|tapocek)$/i.test(seg);
    });
    const specFootwearCompound = /спецобув|specobuv|spec-?obuv|spec.?footwear/i.test(raw);
    const hasFt = footRe.test(hay) || footRe.test(haySlug) || slugSegFoot || specFootwearCompound;
    if (hasFt) return "footwear";

    const slugSegPpe = slugSegs.some(function(seg) {
      return /^(siz|ppe|epi|epi\-|respirator|kaska|kasok|zashchit|zashit|sredstva|kragi|schitok|schit|protivogaz|mask|safety)$/i.test(seg);
    });
    const ppeRe =
      /(?:^|\s)(?:сиз\b|ср\.?\s*сз|средств\w*\s+защит|индивидуал\w*\s+защит|средств\w*\s+индивидуал|респиратор|противогаз|антишум|каска|наушник\w*\s+против|защитн\w*\s+очк|щиток|краг|нарукавник|напальчник|капюшон\w*\s+к\s+каск|подшлемник|визор|наплечник|наколенник|налокотник|страховочн\w*\s+пояс)/i.test(hay) ||
      /(?:^|\s)(?:сиз\b|средств\w*\s+защит|индивидуал\w*\s+защит|респиратор|противогаз|каска)/i.test(haySlug) ||
      slugSegPpe;
    if (ppeRe) return "ppe";

    if (gloveRe.test(hay) || gloveRe.test(haySlug)) return "ppe";

    const accRe =
      /(?:^|\s)(?:аксесс|сумк|рюкзак|кошел|клатч|портфел|портмон|ремен|галстук|шарф|шапк|кепк|бейсбол|панам|нарук|очк|зонт|платок|косынк|подтяжк|украшен|бижутер|часы|заколк|бусы|кольцо|браслет|серьг|цепочк|чехол|ремен|коврик|ременн|ремень|ремени|ременя)/i.test(hay) ||
      /(?:^|\s)(?:аксесс|сумк|рюкзак|ремен|шарф|шапк|кепк|зонт)/i.test(" " + slugStr.replace(/[_-]+/g, " ") + " ");
    const slugSegAcc = slugSegs.some(function(seg) {
      return /^(aksess|accessories|bags|belt|scarf|hat|gloves|jewelry|sumki|ryukzak)$/i.test(seg);
    });
    if (accRe || slugSegAcc || slugStr.includes("accessories") || slugStr.includes("acc_") || slugStr === "accessories" || hay.includes("аксессуар")) return "ppe";

    const appRe = /(?:^|\s)(?:спецодежд|одежд|костюм|куртк|брюк|рубашк|жилет|фартук|комбинезон|платье|юбк|свитер|поло|футболк|халат|трикотаж|пальто|пиджак|сорочк|шорт|трус|лифчик|пижам|худи|свитшот|кардиган|пончо|носк|колгот|легинс|манишк|торгов|вещев|одежн|форм)(?:[a-zа-яё]*)?(?:\s|$)/i;
    const slugSegApp = slugSegs.some(function(seg) {
      return (
        /^(odezhda|odezda|cloth(?:ing)?|shirt|pants|jacket|apparel|specodezhd|trikotazh|rubashka|coat|vest|outerwear|underwear)$/i.test(seg) ||
        /^kurtk/i.test(seg) ||
        /^raboch/i.test(seg) ||
        /^specodezhd/i.test(seg)
      );
    });
    const hasApp = appRe.test(hay) || slugSegApp || /(?:^|\s)рабоч(?:[a-zа-яё]*)?(?:\s|$)/i.test(hay);
    if (hasApp) return "workwear";

    const h = slugStr + " " + String(name || "").toLowerCase();
    if (slugStr.includes("outerwear") || slugStr === "outerwear" || slugStr.startsWith("outerwear")) return "workwear";
    if (slugStr.includes("underwear") || slugStr.includes("pants") || slugStr === "pants" || slugStr.startsWith("pants") || slugStr.startsWith("underwear")) return "workwear";
    if (
      h.includes("\u0432\u0435\u0440\u0445\u043D") ||
      h.includes("\u043A\u0443\u0440\u0442\u043A") ||
      h.includes("\u043F\u0430\u043B\u044C\u0442\u043E") ||
      h.includes("\u043F\u043B\u0430\u0449") ||
      h.includes("\u0436\u0438\u043B\u0435\u0442") ||
      h.includes("\u0430\u043D\u043E\u0440\u0430\u043A") ||
      h.includes("\u043A\u043E\u0441\u0442\u044E\u043C")
    ) {
      return "workwear";
    }
    if (h.includes("\u0448\u0442\u0430\u043D") || h.includes("\u0431\u0440\u044E\u043A") || h.includes("\u0440\u0443\u0431\u0430\u0448") || h.includes("\u0441\u043E\u0440\u043E\u0447\u043A")) return "workwear";
    if (h.includes("\u043D\u0438\u0436\u043D") && (h.includes("\u043E\u0434\u0435\u0436") || h.includes("\u0441\u043F\u0435\u0446"))) return "workwear";

    return null;
  }
  function rebuildCategorySlugToSectionIndex() {
    Object.keys(categorySlugToSection).forEach(function(k) {
      delete categorySlugToSection[k];
    });
    function visit(node, parentSection) {
      if (!node) return;
      const slug = node.slug != null ? String(node.slug).trim() : "";
      const mine = inferSectionFromSlugName(slug, node.name);
      const sec = mine || parentSection || null;
      if (slug && sec) categorySlugToSection[slug] = sec;
      if (Array.isArray(node.children) && node.children.length) {
        node.children.forEach(function(ch) {
          visit(ch, sec);
        });
      }
    }
    catalogCategoryRoots.forEach(function(r) {
      visit(r, null);
    });
  }
  function productHasAssignedCategory(p) {
    const s = p && (p.category_slug != null ? String(p.category_slug).trim() : "");
    return !!s;
  }
  async function loadSectionCollections() {
    sectionCollections = [];
    try {
      const r = await fetch("/api/section-collections/" + encodeURIComponent(pageGender));
      if (!r.ok) return;
      const data = await r.json();
      sectionCollections = Array.isArray(data) ? data : [];
    } catch (e) {
      sectionCollections = [];
    }
  }
  function productsByIdsFromPool(ids, pool) {
    const map = new Map();
    pool.forEach(function(p) {
      if (p && p.id != null) map.set(p.id, p);
    });
    const out = [];
    (ids || []).forEach(function(id) {
      const p = map.get(id);
      if (p) out.push(p);
    });
    return out;
  }
  async function loadProducts() {
    showLoading();
    try {
      const params = new URLSearchParams({ limit: "300", offset: "0" });
      const endpoints = pageGender === "all" ? ["mens", "womens", "unisex"] : [pageGender, "unisex"];
      const responses = await Promise.all(
        endpoints.map(function(g) {
          return fetch("/api/products/" + g + "?" + params.toString());
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
          if (!seen.has(p.id)) {
            seen.add(p.id);
            allProducts.push(p);
          }
        });
      });
      await loadSectionCollections();
      renderProducts();
    } catch (err) {
      console.error("Error loading products:", err);
      showError("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u044B.");
    }
  }
  function showLoading() {
    const container = document.getElementById("items-container");
    if (container) container.innerHTML = '<p class="catalog-loading">\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0442\u043E\u0432\u0430\u0440\u043E\u0432\u2026</p>';
  }
  function showError(msg) {
    const container = document.getElementById("items-container");
    if (container) container.innerHTML = '<p class="catalog-empty">' + escapeHtml(msg) + "</p>";
  }
  function renderProducts() {
    const container = document.getElementById("items-container");
    if (!container) return;
    let filtered = applySearchAndFilters(allProducts);
    filtered = sortProducts(filtered);
    renderActiveFilterTags();
    if (!filtered.length) {
      const hasFilters =
        currentSearch ||
        activeFilters.categories.length ||
        activeFilters.brands.length ||
        activeFilters.seasons.length ||
        activeFilters.sizes.length ||
        activeFilters.colors.length ||
        activeFilters.collections.length;
      const msg =
        !allProducts.length && !hasFilters
          ? "\u0412 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0442\u043E\u0432\u0430\u0440\u043E\u0432."
          : "\u0422\u043E\u0432\u0430\u0440\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u044B \u0438\u043B\u0438 \u043F\u043E\u0438\u0441\u043A\u043E\u0432\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441.";
      container.innerHTML = '<p class="catalog-empty">' + escapeHtml(msg) + "</p>";
      return;
    }
    container.innerHTML = "";
    const hasActiveFilters = currentSearch || activeFilters.categories.length || activeFilters.brands.length || activeFilters.seasons.length || activeFilters.sizes.length || activeFilters.colors.length || activeFilters.collections.length;
    if (activeFilters.collections.length > 0 && sectionCollections.length) {
      const selectedColl = new Set(activeFilters.collections.map(String));
      sectionCollections.forEach(function(coll) {
        if (!selectedColl.has(String(coll.id))) return;
        const ids = coll.product_ids;
        if (!ids || !ids.length) return;
        const items = productsByIdsFromPool(ids, filtered);
        if (!items.length) return;
        const ic = coll.icon != null ? String(coll.icon).trim() : "";
        const title = (ic ? ic + " " : "") + (coll.name || coll.slug || "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430");
        container.appendChild(buildSection("coll-" + coll.id, title, items));
      });
    }
    const parentSections = collectParentCategorySections(filtered);
    const sectionedProductIds = new Set();
    parentSections.forEach(function(sec) {
      if (!sec.items.length) return;
      sec.items.forEach(function(p) {
        if (p && p.id != null) sectionedProductIds.add(p.id);
      });
      container.appendChild(buildSection(sec.key, sec.title, sec.items));
    });
    const unsectioned = filtered.filter(function(p) {
      return !p || p.id == null || !sectionedProductIds.has(p.id);
    });
    const sectionKeys = ["workwear", "footwear", "ppe"];
    sectionKeys.forEach(function(key) {
      const items = unsectioned.filter(function(p) {
        return mapCategoryToSection(p) === key;
      });
      if (items.length) {
        items.forEach(function(p) {
          if (p && p.id != null) sectionedProductIds.add(p.id);
        });
        container.appendChild(buildSection(key, sectionTitles[key], items));
      }
    });
    const unknownSection = unsectioned.filter(function(p) {
      return productHasAssignedCategory(p) && !mapCategoryToSection(p) && !sectionedProductIds.has(p.id);
    });
    if (unknownSection.length) {
      unknownSection.forEach(function(p) {
        if (p && p.id != null) sectionedProductIds.add(p.id);
      });
      container.appendChild(buildSection("misc-cat", sectionTitles.miscCat, unknownSection));
    }
    const uncategorized = filtered.filter(function(p) {
      return !productHasAssignedCategory(p) && !sectionedProductIds.has(p.id);
    });
    if (uncategorized.length) {
      container.appendChild(buildSection("other", sectionTitles.other, uncategorized));
    }
    if (!container.querySelector(".itemsSection")) {
      container.innerHTML = "";
      container.appendChild(buildSection("all", "\u0412\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B", filtered));
    }
  }
  function buildSection(key, title, items) {
    const wrapper = document.createElement("div");
    wrapper.className = "itemsSection";
    const titleEl = document.createElement("p");
    titleEl.className = "section-title";
    titleEl.textContent = title;
    wrapper.appendChild(titleEl);
    const effectEl = document.createElement("div");
    effectEl.className = "effect-section";
    const itemsEl = document.createElement("div");
    itemsEl.className = "items";
    itemsEl.id = key + "-items";
    items.forEach(function(item) {
      itemsEl.appendChild(createCard(item));
    });
    effectEl.appendChild(itemsEl);
    wrapper.appendChild(effectEl);
    return wrapper;
  }
  function applySearchAndFilters(products) {
    let result = products;
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      result = result.filter(function(p) {
        return p.name && p.name.toLowerCase().includes(q) || p.art && p.art.toLowerCase().includes(q) || p.description && p.description.toLowerCase().includes(q);
      });
    }
    if (activeFilters.categories.length) {
      result = result.filter(function(p) {
        return activeFilters.categories.some(function(slug) {
          return productMatchesCategoryFilter(p, slug);
        });
      });
    }
    if (activeFilters.brands.length) {
      result = result.filter(function(p) {
        return activeFilters.brands.indexOf(String(p.brand_id)) !== -1 || activeFilters.brands.indexOf(p.brand_slug || "") !== -1;
      });
    }
    if (activeFilters.seasons.length) {
      result = result.filter(function(p) {
        return activeFilters.seasons.indexOf(p.season || "") !== -1;
      });
    }
    if (activeFilters.sizes.length) {
      result = result.filter(function(p) {
        if (!Array.isArray(p.variants)) return false;
        return p.variants.some(function(v) {
          return variantMatchesFilteredSizes(v.size_id, activeFilters.sizes);
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
    if (activeFilters.collections.length) {
      result = result.filter(function(p) {
        const cols = normalizeProductCollections(p);
        return cols.some(function(c) {
          return c && c.id != null && activeFilters.collections.indexOf(String(c.id)) !== -1;
        });
      });
    }
    return result;
  }
  function normalizeSortKey(key) {
    const k = String(key || "");
    if (k === "id_asc") return "art_asc";
    if (k === "id_desc") return "art_desc";
    return k;
  }
  function productArtKey(p) {
    return String(p && p.art != null ? p.art : "").trim();
  }
  function compareByArt(a, b, dir) {
    const artA = productArtKey(a);
    const artB = productArtKey(b);
    if (!artA && !artB) return (Number(a.id) || 0) - (Number(b.id) || 0);
    if (!artA) return 1;
    if (!artB) return -1;
    const cmp = artA.localeCompare(artB, "ru", { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return dir * cmp;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  }
  function sortProducts(products) {
    return products.slice().sort(function(a, b) {
      const dateA = a.created_at ? Date.parse(a.created_at) : 0;
      const dateB = b.created_at ? Date.parse(b.created_at) : 0;
      switch (currentSort) {
        case "name_asc":
          return (a.name || "").localeCompare(b.name || "", "ru");
        case "name_desc":
          return (b.name || "").localeCompare(a.name || "", "ru");
        case "created_desc":
          return dateB - dateA || b.id - a.id;
        case "created_asc":
          return dateA - dateB || a.id - b.id;
        case "price_asc":
          return (a.price || 0) - (b.price || 0);
        case "price_desc":
          return (b.price || 0) - (a.price || 0);
        case "art_asc":
          return compareByArt(a, b, 1);
        case "art_desc":
          return compareByArt(a, b, -1);
        default:
          return 0;
      }
    });
  }
  function renderActiveFilterTags() {
    const container = document.getElementById("active-filters");
    if (!container) return;
    const tags = [];
    if (currentSearch) {
      tags.push({ label: "\u041F\u043E\u0438\u0441\u043A: \xAB" + currentSearch + "\xBB", clear: function() {
        currentSearch = "";
        const inp = document.getElementById("catalog-search");
        if (inp) inp.value = "";
        updateSearchClear();
        saveCatalogStateToStorage();
        renderProducts();
      } });
    }
    activeFilters.categories.forEach(function(slug) {
      const cat = catalogCategories.find(function(c) {
        return c.slug === slug;
      });
      const sectionLabel = slug === "workwear" || slug === "footwear" || slug === "ppe" ? sectionTitles[slug] : "";
      const label = cat ? cat.name : sectionLabel || slug;
      tags.push({ label: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F: " + label, clear: function() {
        activeFilters.categories = activeFilters.categories.filter(function(s) {
          return s !== slug;
        });
        saveCatalogStateToStorage();
        renderProducts();
      } });
    });
    activeFilters.brands.forEach(function(id) {
      const brand = catalogBrands.find(function(b) {
        return String(b.id) === id || b.slug === id;
      });
      const label = brand ? brand.name : id;
      tags.push({ label: "\u0411\u0440\u0435\u043D\u0434: " + label, clear: function() {
        activeFilters.brands = activeFilters.brands.filter(function(s) {
          return s !== id;
        });
        saveCatalogStateToStorage();
        renderProducts();
      } });
    });
    activeFilters.seasons.forEach(function(s) {
      tags.push({ label: "\u0421\u0435\u0437\u043E\u043D: " + (seasonLabels[s] || s), clear: function() {
        activeFilters.seasons = activeFilters.seasons.filter(function(x) {
          return x !== s;
        });
        saveCatalogStateToStorage();
        renderProducts();
      } });
    });
    activeFilters.sizes.forEach(function(id) {
      const label =
        (activeFilters.sizeLabels && activeFilters.sizeLabels[id]) ||
        (activeFilters.sizeLabels && activeFilters.sizeLabels[String(id)]) ||
        id;
      tags.push({ label: "\u0420\u0430\u0437\u043C\u0435\u0440: " + label, clear: function() {
        activeFilters.sizes = activeFilters.sizes.filter(function(x) {
          return x !== id;
        });
        saveCatalogStateToStorage();
        renderProducts();
      } });
    });
    activeFilters.colors.forEach(function(id) {
      const color = catalogColors.find(function(c) {
        return String(c.id) === id;
      });
      const label = color ? color.name : id;
      tags.push({ label: "\u0426\u0432\u0435\u0442: " + label, clear: function() {
        activeFilters.colors = activeFilters.colors.filter(function(x) {
          return x !== id;
        });
        saveCatalogStateToStorage();
        renderProducts();
      } });
    });
    activeFilters.collections.forEach(function(id) {
      const col = catalogCollections.find(function(c) {
        return String(c.id) === id;
      });
      const label = col ? col.name || col.slug || id : id;
      tags.push({ label: "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430: " + label, clear: function() {
        activeFilters.collections = activeFilters.collections.filter(function(x) {
          return x !== id;
        });
        saveCatalogStateToStorage();
        renderProducts();
      } });
    });
    if (!tags.length) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }
    container.style.display = "flex";
    container.innerHTML = tags.map(function(t, i) {
      return '<span class="active-filter-tag" data-idx="' + i + '"><span class="active-filter-label">' + escapeHtml(t.label) + '</span><button type="button" class="active-filter-remove" data-idx="' + i + '" aria-label="\u0423\u0431\u0440\u0430\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440">\xD7</button></span>';
    }).join("") + '<button type="button" class="active-filter-clear-all">\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0451</button>';
    container.querySelectorAll(".active-filter-remove").forEach(function(btn) {
      btn.addEventListener("click", function() {
        tags[Number(btn.dataset.idx)].clear();
      });
    });
    const clearAll = container.querySelector(".active-filter-clear-all");
    if (clearAll) {
      clearAll.addEventListener("click", function() {
        currentSearch = "";
        activeFilters = { categories: [], brands: [], seasons: [], sizes: [], sizeLabels: {}, colors: [], collections: [] };
        const inp = document.getElementById("catalog-search");
        if (inp) inp.value = "";
        updateSearchClear();
        saveCatalogStateToStorage();
        renderProducts();
      });
    }
  }
  function openFilterModal() {
    const existing = document.getElementById("catalog-filter-modal");
    if (existing) window.kpvsDismissTopModal(existing);
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "catalog-filter-modal";
    let catalogFilterSizeCascadeHandle = null;
    const catHtml = catalogCategories.length ? catalogCategories.map(function(c) {
      const value = c.slug || String(c.id);
      const checked = categoryRowMatchesActiveFilter(c, activeFilters.categories) ? "checked" : "";
      const padding = c.depth ? 'style="padding-left:' + (12 + c.depth * 12) + 'px;"' : "";
      return '<label class="filter-option"><input type="checkbox" name="category" value="' + escapeHtml(value) + '" ' + checked + "><span " + padding + ">" + escapeHtml(c.name) + "</span></label>";
    }).join("") : '<p class="filter-empty-hint">\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B</p>';
    const catGroupHtml = '<div class="filter-group" data-group="category"><button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false"><span class="filter-group-label">\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F</span><span class="filter-group-right"><span class="filter-group-count" aria-hidden="true"></span><span class="filter-group-caret" aria-hidden="true">\u25BE</span></span></button><div class="filter-group-body" hidden><div class="filter-options">' + catHtml + "</div></div></div>";
    const brandHtml = catalogBrands.length ? catalogBrands.map(function(b) {
      const val = String(b.id);
      const checked = activeFilters.brands.indexOf(val) !== -1 || activeFilters.brands.indexOf(b.slug || "") !== -1 ? "checked" : "";
      return '<label class="filter-option"><input type="checkbox" name="brand" value="' + val + '" ' + checked + "><span>" + escapeHtml(b.name) + "</span></label>";
    }).join("") : '<p class="filter-empty-hint">\u0411\u0440\u0435\u043D\u0434\u044B \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B</p>';
    const seasons = ["\u0437\u0438\u043C\u0430", "\u043B\u0435\u0442\u043E", "\u0434\u0435\u043C\u0438\u0441\u0435\u0437\u043E\u043D"];
    const seasonHtml = seasons.map(function(s) {
      const checked = activeFilters.seasons.indexOf(s) !== -1 ? "checked" : "";
      return '<label class="filter-option"><input type="checkbox" name="season" value="' + s + '" ' + checked + "><span>" + (seasonLabels[s] || s) + "</span></label>";
    }).join("");
    const collectionFilterGroup = !catalogCollections.length ? "" : '<div class="filter-group" data-group="collection"><button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false"><span class="filter-group-label">\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0438</span><span class="filter-group-right"><span class="filter-group-count" aria-hidden="true"></span><span class="filter-group-caret" aria-hidden="true">\u25BE</span></span></button><div class="filter-group-body" hidden><div class="filter-options">' + catalogCollections.map(function(col) {
      const val = String(col.id);
      const checked = activeFilters.collections.indexOf(val) !== -1 ? "checked" : "";
      const ico = col.icon != null && String(col.icon).trim() !== "" ? String(col.icon).trim() + "\xA0" : "";
      return '<label class="filter-option"><input type="checkbox" name="collection" value="' + escapeHtml(val) + '" ' + checked + "><span>" + escapeHtml(ico) + escapeHtml(col.name || col.slug || val) + "</span></label>";
    }).join("") + "</div></div></div>";
    const sizeGroupBlock = '<div class="filter-group" data-group="size"><button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false"><span class="filter-group-label">\u0420\u0430\u0437\u043C\u0435\u0440</span><span class="filter-group-right"><span class="filter-group-count" aria-hidden="true"></span><span class="filter-group-caret" aria-hidden="true">\u25BE</span></span></button><div class="filter-group-body" hidden><div class="filter-options filter-options--size-cascade"><div class="filter-size-cascade-wrap" id="catalog-filter-size-cascade"></div></div></div></div>';
    const colorHtml = catalogColors.length ? catalogColors.map(function(c) {
      const val = String(c.id);
      const checked = activeFilters.colors.indexOf(val) !== -1 ? "checked" : "";
      return '<label class="filter-option"><input type="checkbox" name="color" value="' + val + '" ' + checked + "><span>" + escapeHtml(c.name) + "</span></label>";
    }).join("") : "";
    modal.innerHTML = '<div class="modal-content filter-modal-content"><div class="modal-header"><h2>\u0424\u0438\u043B\u044C\u0442\u0440\u044B</h2><button class="modal-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + catGroupHtml + (catalogBrands.length ? '<div class="filter-group" data-group="brand"><button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false"><span class="filter-group-label">\u0411\u0440\u0435\u043D\u0434</span><span class="filter-group-right"><span class="filter-group-count" aria-hidden="true"></span><span class="filter-group-caret" aria-hidden="true">\u25BE</span></span></button><div class="filter-group-body" hidden><div class="filter-options">' + brandHtml + "</div></div></div>" : "") + '<div class="filter-group" data-group="season"><button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false"><span class="filter-group-label">\u0421\u0435\u0437\u043E\u043D</span><span class="filter-group-right"><span class="filter-group-count" aria-hidden="true"></span><span class="filter-group-caret" aria-hidden="true">\u25BE</span></span></button><div class="filter-group-body" hidden><div class="filter-options">' + seasonHtml + "</div></div></div>" + collectionFilterGroup + sizeGroupBlock + (colorHtml ? '<div class="filter-group" data-group="color"><button type="button" class="filter-group-title filter-group-toggle" aria-expanded="false"><span class="filter-group-label">\u0426\u0432\u0435\u0442</span><span class="filter-group-right"><span class="filter-group-count" aria-hidden="true"></span><span class="filter-group-caret" aria-hidden="true">\u25BE</span></span></button><div class="filter-group-body" hidden><div class="filter-options">' + colorHtml + "</div></div></div>" : "") + '</div><div class="modal-footer catalog-filter-modal-footer"><button type="button" class="btn btn--danger catalog-filter-clear-btn">\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C</button><button type="button" class="btn btn--primary catalog-filter-apply-btn">\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C</button></div></div>';
    document.body.appendChild(modal);
    if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
    setTimeout(function() {
      modal.classList.add("show");
    }, 10);
    function setGroupOpen(groupEl, open) {
      const body = groupEl.querySelector(".filter-group-body");
      const btn = groupEl.querySelector(".filter-group-toggle");
      if (!body || !btn) return;
      groupEl.classList.toggle("is-open", open);
      body.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    function updateGroupCount(groupEl) {
      const countEl = groupEl.querySelector(".filter-group-count");
      if (!countEl) return;
      var checked = 0;
      if (groupEl.dataset && groupEl.dataset.group === "size" && catalogFilterSizeCascadeHandle && typeof catalogFilterSizeCascadeHandle.getCheckedIds === "function") {
        checked = catalogFilterSizeCascadeHandle.getCheckedIds().length;
      } else {
        checked = groupEl.querySelectorAll('input[type="checkbox"]:checked').length;
      }
      if (checked > 0) {
        countEl.textContent = String(checked);
        countEl.style.display = "inline-flex";
      } else {
        countEl.textContent = "";
        countEl.style.display = "none";
      }
    }
    const catSizeMount = modal.querySelector("#catalog-filter-size-cascade");
    const catSizeGroup = modal.querySelector('.filter-group[data-group="size"]');
    catalogFilterSizeCascadeHandle = null;
    if (catSizeMount && window.KpvsSizeCascade) {
      catalogFilterSizeCascadeHandle = window.KpvsSizeCascade.mount(catSizeMount, {
        categories: catalogCategories,
        loadSizes: function(id) {
          return fetch("/api/sizes?category_id=" + encodeURIComponent(id) + "&scope=catalog").then(function(r) {
            return r.ok ? r.json() : [];
          });
        },
        mode: "multi",
        filterLayout: true,
        inputName: "size",
        checkedIds: activeFilters.sizes,
        onChange: function() {
          if (catSizeGroup) updateGroupCount(catSizeGroup);
        }
      });
    }
    const catModalBody = modal.querySelector(".modal-body");
    if (catModalBody) {
      catModalBody.addEventListener("change", function(e) {
        const t = e.target;
        if (!t || t.type !== "checkbox") return;
        const groupEl = t.closest(".filter-group");
        if (groupEl) updateGroupCount(groupEl);
      });
    }
    modal.querySelector(".modal-close").addEventListener("click", function() {
      window.kpvsDismissTopModal(modal);
    });
    modal.addEventListener("click", function(e) {
      if (e.target === modal) window.kpvsDismissTopModal(modal);
    });
    modal.querySelectorAll(".filter-group-toggle").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const group = btn.closest(".filter-group");
        if (!group) return;
        const willOpen = !group.classList.contains("is-open");
        modal.querySelectorAll(".filter-group.is-open").forEach(function(openGroup) {
          if (openGroup !== group) setGroupOpen(openGroup, false);
        });
        setGroupOpen(group, willOpen);
      });
    });
    modal.querySelectorAll(".filter-group").forEach(function(group) {
      setGroupOpen(group, false);
      updateGroupCount(group);
    });
    if (activeFilters.sizes.length && catSizeGroup) {
      setGroupOpen(catSizeGroup, true);
    }
    modal.querySelector(".catalog-filter-apply-btn").addEventListener("click", function() {
      activeFilters.categories = Array.from(modal.querySelectorAll('input[name="category"]:checked')).map(function(i) {
        return i.value;
      });
      activeFilters.brands = Array.from(modal.querySelectorAll('input[name="brand"]:checked')).map(function(i) {
        return i.value;
      });
      activeFilters.seasons = Array.from(modal.querySelectorAll('input[name="season"]:checked')).map(function(i) {
        return i.value;
      });
      const sizeLabels = {};
      const sizeInputs = modal.querySelectorAll('input[name="size_id"]:checked, input[name="size"]:checked');
      activeFilters.sizes = [];
      sizeInputs.forEach(function(inp) {
        const id = String(inp.value || "").trim();
        if (!id) return;
        activeFilters.sizes.push(id);
        const valSpan = inp.parentElement && inp.parentElement.querySelector(".size-cascade-check-value");
        const span = valSpan || (inp.parentElement && inp.parentElement.querySelector("span"));
        if (span && span.textContent) sizeLabels[id] = span.textContent.trim();
      });
      if (!activeFilters.sizes.length && catalogFilterSizeCascadeHandle && typeof catalogFilterSizeCascadeHandle.getCheckedIds === "function") {
        activeFilters.sizes = catalogFilterSizeCascadeHandle.getCheckedIds();
        activeFilters.sizes.forEach(function(id) {
          const inp = modal.querySelector('input[name="size"][value="' + CSS.escape(String(id)) + '"]');
          const valSpan = inp && inp.parentElement && inp.parentElement.querySelector(".size-cascade-check-value");
          const span = valSpan || (inp && inp.parentElement && inp.parentElement.querySelector("span"));
          if (span && span.textContent) sizeLabels[id] = span.textContent.trim();
        });
      }
      activeFilters.sizeLabels = sizeLabels;
      activeFilters.colors = Array.from(modal.querySelectorAll('input[name="color"]:checked')).map(function(i) {
        return i.value;
      });
      activeFilters.collections = Array.from(modal.querySelectorAll('input[name="collection"]:checked')).map(function(i) {
        return i.value;
      });
      window.kpvsDismissTopModal(modal);
      saveCatalogStateToStorage();
      renderProducts();
    });
    modal.querySelector(".catalog-filter-clear-btn").addEventListener("click", function() {
      activeFilters = { categories: [], brands: [], seasons: [], sizes: [], sizeLabels: {}, colors: [], collections: [] };
      window.kpvsDismissTopModal(modal);
      saveCatalogStateToStorage();
      renderProducts();
    });
  }
  function mapCategoryToSection(product) {
    const slug = product.category_slug || product.category || "";
    if (!slug) return null;
    const key = String(slug).trim();
    if (!key) return null;
    if (Object.prototype.hasOwnProperty.call(categorySlugToSection, key)) {
      return categorySlugToSection[key];
    }
    return inferSectionFromSlugName(key, product.category_name || "");
  }
  function sanitizeProductImageUrl(u) {
    const s = String(u || "").trim();
    if (!s || s.length > 2048) return "";
    const head = s.slice(0, 16).toLowerCase();
    if (head.startsWith("javascript:") || head.startsWith("data:") || head.startsWith("vbscript:")) return "";
    if (s.startsWith("/")) return s.startsWith("//") ? "" : s;
    if (/^https?:\/\//i.test(s)) {
      try {
        const url = new URL(s);
        if (url.username || url.password) return "";
        if (url.protocol === "http:" || url.protocol === "https:") return s;
      } catch (e) {
      }
    }
    return "";
  }
  function getProductImage(item) {
    if (!item) return "/img/item.png";
    let raw = "";
    if (item.image) raw = item.image;
    else if (Array.isArray(item.images) && item.images.length) {
      const primary = item.images.find(function(i) {
        return i.is_primary;
      }) || item.images[0];
      raw = primary ? primary.url || primary.path || "" : "";
    } else return "/img/item.png";
    const clean = sanitizeProductImageUrl(raw);
    return clean || "/img/item.png";
  }
  function formatCatalogPrice(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return "";
    try {
      return new Intl.NumberFormat("ru-BY", { style: "currency", currency: "BYN", maximumFractionDigits: 2 }).format(x);
    } catch (e) {
      return String(x) + " BYN";
    }
  }
  function updateSearchClear() {
    const inp = document.getElementById("catalog-search");
    const btn = document.getElementById("catalog-search-clear");
    if (!btn) return;
    if (inp && inp.value) {
      btn.hidden = false;
    } else {
      btn.hidden = true;
    }
  }
  function createCard(item) {
    const isFavorite = getFavorites().some(function(f) {
      return Number(f.id) === Number(item.id);
    });
    const isInCart = getCart().some(function(c) {
      return Number(c.id) === Number(item.id);
    });
    const imgSrc = getProductImage(item);
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-id", item.id);
    const productLink = item.slug ? "product.html?slug=" + encodeURIComponent(item.slug) : "product.html?id=" + encodeURIComponent(item.id);
    card.onclick = function() {
      window.location.href = productLink;
    };
    const priceTxt = formatCatalogPrice(item.price);
    const pricePart = priceTxt ? '<p class="card-price">' + escapeHtml(priceTxt) + "</p>" : '<p class="card-price card-price--muted">\u041F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443</p>';
    card.innerHTML = '<div class="card-visual-wrap"><div class="card-img-clip"><img src="' + escapeAttr(imgSrc) + '" alt="' + escapeHtml(item.name) + '" class="card-img" loading="lazy" decoding="async" width="224" height="288"></div><div class="card-hover-overlay"><button class="card-favorite-btn card-hover-btn ' + (isFavorite ? "in-favorites" : "") + '" onclick="event.stopPropagation(); Catalog.toggleFavorite(' + item.id + ', this)">' + (isFavorite ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E" : "\u0412 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435") + '</button><button class="card-cart-btn card-hover-btn ' + (isInCart ? "in-cart" : "") + '" onclick="event.stopPropagation(); Catalog.toggleCart(' + item.id + ', this)">' + (isInCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443") + '</button></div></div><div class="card-content"><p class="card-name">' + escapeHtml(item.name) + "</p>" + (item.art ? '<p class="card-art">' + escapeHtml(item.art) + "</p>" : "") + pricePart + "</div>";
    return card;
  }
  function attachPageEvents() {
    const sortSelect = document.getElementById("sort-select");
    const filterButton = document.getElementById("filter-button");
    const favoritesLink = document.getElementById("favorites-link");
    const cartLink = document.getElementById("cart");
    const searchInput = document.getElementById("catalog-search");
    const searchClear = document.getElementById("catalog-search-clear");
    if (sortSelect) {
      sortSelect.addEventListener("change", function(e) {
        currentSort = normalizeSortKey(e.target.value);
        saveCatalogStateToStorage();
        renderProducts();
      });
    }
    if (filterButton) filterButton.addEventListener("click", openFilterModal);
    if (favoritesLink) favoritesLink.addEventListener("click", openFavoritesModal);
    if (cartLink) cartLink.addEventListener("click", openCartModal);
    const logo = document.querySelector(".section #logo");
    if (logo && !logo.closest("a")) {
      logo.addEventListener("click", function() {
        window.location.href = "welcome.html";
      });
    }
    if (searchInput) {
      let searchTimer;
      searchInput.addEventListener("input", function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function() {
          currentSearch = searchInput.value.trim();
          updateSearchClear();
          saveCatalogStateToStorage();
          renderProducts();
        }, 250);
      });
      searchInput.addEventListener("keydown", function(e) {
        if (e.key === "Escape") {
          searchInput.value = "";
          currentSearch = "";
          updateSearchClear();
          saveCatalogStateToStorage();
          renderProducts();
        }
      });
    }
    if (searchClear) {
      searchClear.addEventListener("click", function() {
        const inp = document.getElementById("catalog-search");
        if (inp) inp.value = "";
        currentSearch = "";
        updateSearchClear();
        saveCatalogStateToStorage();
        renderProducts();
      });
    }
    updateSearchClear();
  }
  function getFavorites() {
    try {
      const raw = localStorage.getItem("favorites");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(function(item) {
        if (typeof item === "number" || typeof item === "string") return { id: Number(item), source: pageGender };
        return { id: Number(item.id), source: item.source || pageGender };
      }).filter(function(item) {
        return Number.isFinite(item.id);
      });
    } catch {
      return [];
    }
  }
  function listsPush() {
    if (window.KpvsListsSync) window.KpvsListsSync.push();
  }
  function listsCommit(cart, favorites, afterUi) {
    if (window.KpvsListsSync && window.KpvsListsSync.writeLists && window.KpvsListsSync.commitLists) {
      window.KpvsListsSync.writeLists(cart, favorites);
      return window.KpvsListsSync.commitLists().then(function(ok) {
        if (typeof afterUi === "function") afterUi(ok);
        return ok;
      });
    }
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
      localStorage.setItem("favorites", JSON.stringify(favorites));
    } catch {
    }
    if (typeof afterUi === "function") afterUi(true);
    return Promise.resolve(true);
  }
  function getCart() {
    try {
      const raw = localStorage.getItem("cart");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(function(item) {
        if (typeof item === "number" || typeof item === "string") return { id: Number(item), source: pageGender };
        return { id: Number(item.id), source: item.source || pageGender };
      }).filter(function(item) {
        return Number.isFinite(item.id);
      });
    } catch {
      return [];
    }
  }
  function refreshCatalogButtons() {
    const favorites = getFavorites();
    const cart = getCart();
    document.querySelectorAll(".card-favorite-btn").forEach(function(btn) {
      const card = btn.closest(".card");
      const id = card ? Number(card.dataset.id) : Number(btn.dataset.productId);
      if (!Number.isFinite(id)) return;
      const isFavorite = favorites.some(function(i) {
        return Number(i.id) === id;
      });
      btn.textContent = isFavorite ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E" : "\u0412 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435";
      btn.classList.toggle("in-favorites", isFavorite);
    });
    document.querySelectorAll(".card-cart-btn").forEach(function(btn) {
      const card = btn.closest(".card");
      const id = card ? Number(card.dataset.id) : Number(btn.dataset.productId);
      if (!Number.isFinite(id)) return;
      const isInCart = cart.some(function(i) {
        return Number(i.id) === id;
      });
      btn.textContent = isInCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443";
      btn.classList.toggle("in-cart", isInCart);
    });
  }
  function syncOpenModalCartToggleButtons() {
    document.querySelectorAll('#kpvs-favorites-modal [data-action="toggle-cart"]').forEach(function(btn) {
      var pid = Number(btn.dataset && btn.dataset.productId);
      if (!Number.isFinite(pid)) return;
      var inCart = getCart().some(function(i) {
        return Number(i.id) === pid;
      });
      btn.textContent = inCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443";
      btn.classList.toggle("in-cart", inCart);
    });
  }
  function toggleFavorite(productId, buttonElement) {
    var id = Number(productId);
    if (!Number.isFinite(id)) return;
    var cart = getCart();
    var favorites = getFavorites();
    var wasFavorite = favorites.some(function(i) {
      return Number(i.id) === id;
    });
    if (wasFavorite) {
      favorites = favorites.filter(function(i) {
        return Number(i.id) !== id;
      });
    } else {
      favorites.push({ id: id, source: pageGender });
    }
    listsCommit(cart, favorites, function(ok) {
      if (!ok) {
        if (wasFavorite) {
          favorites.push({ id: id, source: pageGender });
        } else {
          favorites = favorites.filter(function(i) {
            return Number(i.id) !== id;
          });
        }
        if (window.KpvsListsSync && window.KpvsListsSync.writeLists) {
          window.KpvsListsSync.writeLists(cart, favorites);
        } else {
          try {
            localStorage.setItem("favorites", JSON.stringify(favorites));
          } catch {
          }
        }
      }
      if (buttonElement) {
        var nowFav = favorites.some(function(i) {
          return Number(i.id) === id;
        });
        buttonElement.textContent = nowFav ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E" : "\u0412 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435";
        buttonElement.classList.toggle("in-favorites", nowFav);
      }
      refreshCatalogButtons();
    });
  }
  function toggleCart(productId, buttonElement) {
    var id = Number(productId);
    if (!Number.isFinite(id)) return;
    var cart = getCart();
    var idx = cart.findIndex(function(i) {
      return Number(i.id) === id;
    });
    var favorites = getFavorites();
    var wasInCart = idx !== -1;
    if (wasInCart) {
      cart.splice(idx, 1);
    } else {
      cart.push({ id: id, source: pageGender });
    }
    listsCommit(cart, favorites, function(ok) {
      if (!ok) {
        if (wasInCart) {
          cart.push({ id: id, source: pageGender });
        } else {
          cart = cart.filter(function(i) {
            return Number(i.id) !== id;
          });
        }
        if (window.KpvsListsSync && window.KpvsListsSync.writeLists) {
          window.KpvsListsSync.writeLists(cart, favorites);
        } else {
          try {
            localStorage.setItem("cart", JSON.stringify(cart));
          } catch {
          }
        }
      }
      if (buttonElement) {
        var inCart = cart.some(function(i) {
          return Number(i.id) === id;
        });
        buttonElement.textContent = inCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443";
        buttonElement.classList.toggle("in-cart", inCart);
      }
      refreshCatalogButtons();
    });
    syncOpenModalCartToggleButtons();
  }
  function removeFromFavorites(productId) {
    var id = Number(productId);
    if (!Number.isFinite(id)) return;
    var cart = getCart();
    var favorites = getFavorites().filter(function(i) {
      return Number(i.id) !== id;
    });
    listsCommit(cart, favorites, function() {
      refreshCatalogButtons();
      renderProducts();
    });
  }
  function removeFromCart(productId) {
    var id = Number(productId);
    if (!Number.isFinite(id)) return;
    var cart = getCart().filter(function(i) {
      return Number(i.id) !== id;
    });
    listsCommit(cart, getFavorites(), function() {
      refreshCatalogButtons();
      renderProducts();
      syncOpenModalCartToggleButtons();
    });
  }
  function siteOrigin() {
    try {
      if (typeof window === "undefined" || !window.location || !window.location.origin) return "";
      return String(window.location.origin).replace(/\/$/, "");
    } catch (_) {
      return "";
    }
  }
  function productPageAbsoluteUrl(product) {
    var base = siteOrigin();
    var path = "/product.html";
    var slug = product && product.slug != null ? String(product.slug).trim() : "";
    var id = product && product.id != null ? Number(product.id) : NaN;
    if (slug) return base + path + "?slug=" + encodeURIComponent(slug);
    if (Number.isFinite(id)) return base + path + "?id=" + encodeURIComponent(String(id));
    return base + path;
  }
  function inquirePriceFromCart() {
    var cart = getCart();
    if (!cart.length) return;
    getProductsByIds(cart.map(function(i) {
      return i.id;
    })).then(function(products) {
      var list = products.filter(Boolean);
      if (!list.length) return;
      var host = typeof window !== "undefined" && window.location && window.location.hostname ? String(window.location.hostname) : "";
      var siteRef = host || "\u0441\u0430\u0439\u0442 \u041A\u041F\u0412\u0421";
      var blocks = list.map(function(p, idx) {
        var n = idx + 1;
        return [
          n + ") " + (p.name != null && String(p.name).trim() ? String(p.name).trim() : "\u0422\u043E\u0432\u0430\u0440"),
          "   \u0410\u0440\u0442\u0438\u043A\u0443\u043B: " + (p.art != null && String(p.art).trim() ? String(p.art).trim() : "\u2014"),
          "   \u0421\u0441\u044B\u043B\u043A\u0430: " + productPageAbsoluteUrl(p)
        ].join("\n");
      });
      var body = [
        "\u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C!",
        "",
        "\u041F\u0440\u043E\u0448\u0443 \u043A\u043E\u043C\u043C\u0435\u0440\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F (\u0446\u0435\u043D\u044B) \u043F\u043E \u0442\u043E\u0432\u0430\u0440\u0430\u043C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B \u043D\u0430 " + siteRef + ".",
        "",
        "\u0421\u043F\u0438\u0441\u043E\u043A:",
        "",
        blocks.join("\n\n"),
        "",
        "\u0421\u043F\u0430\u0441\u0438\u0431\u043E!"
      ].join("\n");
      var subject = encodeURIComponent("\u041A\u041F\u0412\u0421 \u2014 \u0437\u0430\u043F\u0440\u043E\u0441 \u0446\u0435\u043D \u043F\u043E \u043A\u043E\u0440\u0437\u0438\u043D\u0435 (" + list.length + " \u043F\u043E\u0437.)");
      window.location.href = "mailto:kpvssales@gmail.com?subject=" + subject + "&body=" + encodeURIComponent(body);
    });
  }
  async function getProductsByIds(ids) {
    const results = await Promise.all(ids.map(async function(id) {
      try {
        const r = await fetch("/api/product/" + encodeURIComponent(id));
        if (!r.ok) return null;
        const p = await r.json();
        return p && p.id ? p : null;
      } catch {
        return null;
      }
    }));
    return results.filter(Boolean);
  }
  function attachModalClose(modal) {
    modal.addEventListener("click", function(e) {
      if (e.target === modal) window.kpvsDismissTopModal(modal);
    });
  }
  function openFavoritesModal() {
    if (window.KpvsListsSync && window.KpvsListsSync.refreshBefore) {
      window.KpvsListsSync.refreshBefore(openFavoritesModalInner);
      return;
    }
    openFavoritesModalInner();
  }
  function openFavoritesModalInner() {
    const existing = document.getElementById("kpvs-favorites-modal");
    if (existing) window.kpvsDismissTopModal(existing);
    const favorites = getFavorites();
    const ids = favorites.map(function(i) {
      return i.id;
    });
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "kpvs-favorites-modal";
    if (!ids.length) {
      modal.innerHTML = '<div class="modal-content modal-content--cart-favorites"><div class="modal-header"><h2>\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + modalListEmptyHtml(MODAL_EMPTY_FAVORITES) + "</div></div>";
      document.body.appendChild(modal);
      if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
      setTimeout(function() {
        modal.classList.add("show");
      }, 10);
      attachModalClose(modal);
      return;
    }
    getProductsByIds(ids).then(function(products) {
      if (window.KpvsListsSync && window.KpvsListsSync.persistPrunedList) {
        if (window.KpvsListsSync.persistPrunedList("favorites", favorites, products)) {
          refreshCatalogButtons();
          renderProducts();
        }
      }
      const itemsHtml = products.length ? products.map(function(p) {
        const isInCart = getCart().some(function(i) {
          return Number(i.id) === Number(p.id);
        });
        const imgSrc = getProductImage(p);
        const artRaw = p.art != null ? String(p.art).trim() : "";
        const artHtml = artRaw ? '<p class="modal-item-art">' + escapeHtml(artRaw) + "</p>" : "";
        return '<div class="modal-item" data-product-id="' + p.id + '"><img src="' + escapeAttr(imgSrc) + '" alt="' + escapeHtml(p.name || "") + '" class="modal-item-img"><div class="modal-item-info"><h3>' + escapeHtml(p.name || "\u0422\u043E\u0432\u0430\u0440") + "</h3>" + artHtml + '<div class="modal-item-actions"><button type="button" class="btn btn--primary btn--small ' + (isInCart ? "in-cart" : "") + '" data-action="toggle-cart" data-product-id="' + p.id + '">' + (isInCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443") + '</button><button type="button" class="btn btn--danger btn--small" data-action="remove-favorite" data-product-id="' + p.id + '">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button></div></div></div>';
      }).join("") : "";
      modal.innerHTML = '<div class="modal-content modal-content--cart-favorites"><div class="modal-header"><h2>\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + (itemsHtml ? '<div class="modal-items">' + itemsHtml + "</div>" : modalListEmptyHtml(MODAL_EMPTY_FAVORITES)) + "</div></div>";
      document.body.appendChild(modal);
      if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
      setTimeout(function() {
        modal.classList.add("show");
      }, 10);
      attachModalClose(modal);
      modal.querySelectorAll('[data-action="toggle-cart"]').forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var pid = Number(btn.dataset.productId);
          if (!Number.isFinite(pid)) return;
          toggleCart(pid, btn);
        });
      });
      modal.querySelectorAll('[data-action="remove-favorite"]').forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var pid = Number(btn.dataset.productId);
          if (!Number.isFinite(pid)) return;
          removeFromFavorites(pid);
          btn.closest(".modal-item").remove();
          if (!modal.querySelector(".modal-item")) {
            modal.querySelector(".modal-body").innerHTML = modalListEmptyHtml(MODAL_EMPTY_FAVORITES);
          }
        });
      });
    });
  }
  function openCartModal() {
    if (window.KpvsListsSync && window.KpvsListsSync.refreshBefore) {
      window.KpvsListsSync.refreshBefore(openCartModalInner);
      return;
    }
    openCartModalInner();
  }
  function openCartModalInner() {
    const existing = document.getElementById("kpvs-cart-modal");
    if (existing) window.kpvsDismissTopModal(existing);
    const cart = getCart();
    const ids = cart.map(function(i) {
      return i.id;
    });
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "kpvs-cart-modal";
    if (!ids.length) {
      modal.innerHTML = '<div class="modal-content modal-content--cart-favorites"><div class="modal-header"><h2>\u041A\u043E\u0440\u0437\u0438\u043D\u0430</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + modalListEmptyHtml(MODAL_EMPTY_CART) + "</div></div>";
      document.body.appendChild(modal);
      if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
      setTimeout(function() {
        modal.classList.add("show");
      }, 10);
      attachModalClose(modal);
      return;
    }
    getProductsByIds(ids).then(function(products) {
      if (window.KpvsListsSync && window.KpvsListsSync.persistPrunedList) {
        if (window.KpvsListsSync.persistPrunedList("cart", cart, products)) {
          refreshCatalogButtons();
          renderProducts();
        }
      }
      const itemsHtml = products.length ? products.map(function(p) {
        const imgSrc = getProductImage(p);
        const artRaw = p.art != null ? String(p.art).trim() : "";
        const artHtml = artRaw ? '<p class="modal-item-art">' + escapeHtml(artRaw) + "</p>" : "";
        return '<div class="modal-item" data-product-id="' + p.id + '"><img src="' + escapeAttr(imgSrc) + '" alt="' + escapeHtml(p.name || "") + '" class="modal-item-img"><div class="modal-item-info"><h3>' + escapeHtml(p.name || "\u0422\u043E\u0432\u0430\u0440") + "</h3>" + artHtml + '<div class="modal-item-actions"><button type="button" class="btn btn--danger btn--small" data-action="remove-cart" data-product-id="' + p.id + '">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button></div></div></div>';
      }).join("") : "";
      const cartMain = itemsHtml ? '<div class="modal-items">' + itemsHtml + '</div><div class="cart-actions"><button type="button" class="cart-inquire-btn" data-action="cart-inquire-all">\u0423\u0437\u043D\u0430\u0442\u044C \u0446\u0435\u043D\u0443 \u043D\u0430 \u0432\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B</button></div>' : modalListEmptyHtml(MODAL_EMPTY_CART);
      modal.innerHTML = '<div class="modal-content modal-content--cart-favorites"><div class="modal-header"><h2>\u041A\u043E\u0440\u0437\u0438\u043D\u0430</h2><button class="modal-close ui-xbtn" type="button" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + cartMain + "</div></div>";
      document.body.appendChild(modal);
      if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
      setTimeout(function() {
        modal.classList.add("show");
      }, 10);
      attachModalClose(modal);
      modal.querySelectorAll('[data-action="remove-cart"]').forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var pid = Number(btn.dataset.productId);
          if (!Number.isFinite(pid)) return;
          removeFromCart(pid);
          btn.closest(".modal-item").remove();
          if (!modal.querySelector(".modal-item")) {
            modal.querySelector(".modal-body").innerHTML = modalListEmptyHtml(MODAL_EMPTY_CART);
          }
        });
      });
      var inquireAll = modal.querySelector('[data-action="cart-inquire-all"]');
      if (inquireAll) {
        inquireAll.addEventListener("click", function(e) {
          e.stopPropagation();
          window.kpvsDismissTopModal(modal);
          inquirePriceFromCart();
        });
      }
    });
  }
  return {
    init: initCatalogPage,
    toggleFavorite,
    toggleCart
  };
})();
document.addEventListener("DOMContentLoaded", function() {
  Catalog.init();
  try {
    const el = document.querySelector("[data-account-action]");
    if (el) {
      const next = window.KpvsApi && window.KpvsApi.currentReturnPath
        ? window.KpvsApi.currentReturnPath()
        : window.location.pathname + window.location.search;
      el.setAttribute("href", window.KpvsApi && window.KpvsApi.loginUrlWithNext
        ? window.KpvsApi.loginUrlWithNext()
        : "/login.html?mode=user&next=" + encodeURIComponent(next));
      fetch("/api/user/auth/me", { credentials: "include" }).then(function(r) {
        function showLoginBtn() {
          el.className = "btn btn--primary site-account-login-btn";
          el.removeAttribute("title");
          el.setAttribute("aria-label", "\u0412\u043E\u0439\u0442\u0438");
          el.textContent = "\u0412\u043E\u0439\u0442\u0438";
        }
        if (!r.ok) {
          showLoginBtn();
          return;
        }
        return r.json().then(function(me) {
          if (me && me.id) return;
          showLoginBtn();
        });
      }).catch(function() {
      });
    }
  } catch {
  }
});
