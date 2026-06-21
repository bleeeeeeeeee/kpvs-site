(function(global) {
  "use strict";
  const escapeHtml = global.KpvsEscape.escapeHtml;
  function sizeOptionTitle(value, equivalentHint) {
    const v = String(value != null ? value : "").trim();
    const h = equivalentHint != null ? String(equivalentHint).trim() : "";
    if (!h) return v;
    const full = v + " \u2014 " + h;
    return full.length > 220 ? full.slice(0, 217) + "\u2026" : full;
  }
  function sizeScalePrefix(typeSlug) {
    const slug = normalizeSizeTypeSlug(typeSlug, "");
    if (slug === "eu_clothing" || slug === "eu_footwear" || slug === "eu_accessories") return "EU ";
    return "";
  }
  function isEuEtalonValue(row) {
    if (!row) return false;
    const raw = String(row.value != null ? row.value : "").trim();
    if (/^(RU|UK|US)\s+/i.test(raw)) return false;
    const slug = rowTypeSlug(row);
    const v = sizeSortValue(row.value);
    if (slug === "eu_clothing" || slug === "eu_accessories") {
      return euLetterClothingRank(v) != null;
    }
    if (slug === "eu_footwear") {
      const n = parseFloat(v.replace(",", "."));
      return Number.isFinite(n) && n >= 35 && n <= 50;
    }
    if (slug === "universal") return true;
    return false;
  }
  function formatSizePrimaryLabel(row) {
    const v = String(row && row.value != null ? row.value : "").trim();
    if (!v) return "\u2014";
    if (!isEuEtalonValue(row)) return v;
    const prefix = sizeScalePrefix(rowTypeSlug(row));
    if (!prefix || /^eu\s/i.test(v)) return v;
    return prefix + v;
  }
  function formatEquivPart(part) {
    const p = String(part != null ? part : "").trim();
    if (!p) return "";
    if (/^(RU|UK|US|EU)\s+/i.test(p)) return p;
    if (/^\d+([.,]\d+)?$/.test(p)) return "RU " + p;
    return p;
  }
  function formatSizeEquivInline(equivalentHint) {
    const h = equivalentHint != null ? String(equivalentHint).trim() : "";
    if (!h) return "";
    const parts = h.split(/\s*,\s*/).map(formatEquivPart).filter(Boolean);
    return "\u2248 " + (parts.length ? parts.join(", ") : h);
  }
  function filterEuEtalonSizes(rows) {
    return (rows || []).filter(isEuEtalonValue);
  }
  let floatingTipEl = null;
  function ensureFloatingTip() {
    if (!floatingTipEl && typeof document !== "undefined") {
      floatingTipEl = document.createElement("div");
      floatingTipEl.id = "kpvs-size-cascade-tip";
      floatingTipEl.className = "size-cascade-floating-tip";
      floatingTipEl.hidden = true;
      floatingTipEl.setAttribute("role", "tooltip");
      document.body.appendChild(floatingTipEl);
    }
    return floatingTipEl;
  }
  function positionFloatingTip(tip, anchor) {
    if (!tip || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    tip.style.left = Math.min(window.innerWidth - 16, Math.max(16, cx)) + "px";
    tip.style.top = Math.max(8, r.top - 6) + "px";
    tip.style.transform = "translate(-50%, -100%)";
  }
  function bindCheckTooltips(scope) {
    const tip = ensureFloatingTip();
    if (!tip || !scope) return;
    scope.querySelectorAll(".size-cascade-check[data-tip]").forEach(function(lab) {
      if (lab.dataset.tipBound === "1") return;
      lab.dataset.tipBound = "1";
      const show = function() {
        const text = lab.getAttribute("data-tip");
        if (!text) return;
        tip.textContent = text;
        tip.hidden = false;
        positionFloatingTip(tip, lab);
      };
      const hide = function() {
        tip.hidden = true;
      };
      lab.addEventListener("mouseenter", show);
      lab.addEventListener("focusin", show);
      lab.addEventListener("mouseleave", hide);
      lab.addEventListener("focusout", hide);
    });
  }
  function normalizeSizeTypeSlug(slug, typeName) {
    const s = String(slug || "").toLowerCase().trim().replace(/_/g, "-");
    if (s === "eu-clothing" || s === "eu_clothing" || s === "apparel") return "eu_clothing";
    if (s === "eu-footwear" || s === "eu_footwear" || s === "footwear") return "eu_footwear";
    if (s === "eu-accessories" || s === "eu_accessories" || s === "gloves") return "eu_accessories";
    if (s === "universal") return "universal";
    const name = String(typeName || "").toLowerCase();
    if (/(eu|одежд|letter|2xs|3xl)/i.test(name) && !/обув|footwear|перчат/i.test(name)) return "eu_clothing";
    if (/обув|footwear|eu\s*3[5-9]|eu\s*4[0-7]/i.test(name)) return "eu_footwear";
    if (/аксесс|accessor|перчат|glove/i.test(name)) return "eu_accessories";
    if (/универс|universal|one\s*size/i.test(name)) return "universal";
    if (/\bru\b|росс|ru\s*\(/i.test(name) || /^ru[\s_-]/i.test(name)) return "ru_numeric";
    return s.replace(/-/g, "_") || "";
  }
  function sizeSortValue(raw) {
    return String(raw != null ? raw : "").trim().replace(/^eu\s+/i, "");
  }
  function euLetterClothingRank(raw) {
    const v = sizeSortValue(raw).toLowerCase().replace(/\s+/g, "");
    if (v === "2xs" || v === "xxs") return 1;
    if (v === "xs") return 2;
    if (v === "s") return 3;
    if (v === "m") return 4;
    if (v === "l") return 5;
    if (v === "xl") return 6;
    if (v === "xxl" || v === "2xl") return 7;
    if (v === "3xl") return 8;
    if (v === "4xl") return 9;
    if (v === "5xl") return 10;
    return null;
  }
  function numericSizeRank(raw) {
    const v = sizeSortValue(raw).replace(",", ".");
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  function rowTypeSlug(row) {
    let slug = normalizeSizeTypeSlug(row && row.size_type_slug, row && row.size_type);
    if (slug === "ru_numeric") return slug;
    const v = sizeSortValue(row && row.value);
    if (slug === "eu_clothing" || slug === "eu_accessories" || slug === "eu_footwear") return slug;
    if (euLetterClothingRank(v) != null) return "eu_clothing";
    if (numericSizeRank(v) != null && !euLetterClothingRank(v)) return "ru_numeric";
    return slug;
  }
  function sizeTypeGroupSortKey(group) {
    const slug = group && group.sizes && group.sizes[0] ? rowTypeSlug(group.sizes[0]) : normalizeSizeTypeSlug("", group && group.size_type);
    const order = { eu_clothing: 10, eu_footwear: 20, eu_accessories: 30, ru_numeric: 40, universal: 50 };
    return order[slug] != null ? order[slug] : 80;
  }
  function universalSizeRank(raw) {
    const v = String(raw != null ? raw : "").trim().toLowerCase().replace(/\s+/g, " ");
    const compact = v.replace(/\s+/g, "");
    if (v === "\u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439" || v === "\u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440" || compact === "onesize" || v === "os" || v === "one size") {
      return 1;
    }
    if (v === "osfm" || compact === "osfm") return 2;
    if (v === "\u0431\u0435\u0437 \u0440\u0430\u0437\u043C\u0435\u0440\u0430") return 3;
    if (v === "xxs/xs" || compact === "xxs/xs") return 10;
    if (v === "xs/s" || compact === "xs/s") return 11;
    if (v === "s/m" || compact === "s/m") return 12;
    if (v === "m/l" || compact === "m/l") return 13;
    if (v === "l/xl" || compact === "l/xl") return 14;
    if (v === "xl/xxl" || v === "xl/2xl" || compact === "xl/xxl" || compact === "xl/2xl") return 15;
    return 90;
  }
  function compareSizeRows(a, b, typeSlug) {
    const slug = typeSlug ? normalizeSizeTypeSlug(typeSlug, "") : rowTypeSlug(a);
    const va = sizeSortValue(a.value);
    const vb = sizeSortValue(b.value);
    if (slug === "ru_numeric") {
      const na = numericSizeRank(va);
      const nb = numericSizeRank(vb);
      if (na != null && nb != null && na !== nb) return na - nb;
      if (na != null && nb == null) return -1;
      if (na == null && nb != null) return 1;
      return va.localeCompare(vb, "ru", { numeric: true });
    }
    if (slug === "eu_clothing") {
      const ra = euLetterClothingRank(va);
      const rb = euLetterClothingRank(vb);
      if (ra != null && rb != null && ra !== rb) return ra - rb;
      if (ra != null && rb == null) return -1;
      if (ra == null && rb != null) return 1;
      return va.localeCompare(vb, "ru", { numeric: true });
    }
    if (slug === "eu_accessories") {
      const ra = euLetterClothingRank(va);
      const rb = euLetterClothingRank(vb);
      const aLet = ra != null;
      const bLet = rb != null;
      if (aLet && bLet && ra !== rb) return ra - rb;
      if (aLet && !bLet) return -1;
      if (!aLet && bLet) return 1;
      return va.localeCompare(vb, "ru", { numeric: true });
    }
    if (slug === "eu_footwear") {
      const na = parseFloat(va.replace(",", "."));
      const nb = parseFloat(vb.replace(",", "."));
      const fa = Number.isFinite(na);
      const fb = Number.isFinite(nb);
      if (fa && fb && na !== nb) return na - nb;
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      return va.localeCompare(vb, "ru", { numeric: true });
    }
    if (slug === "universal") {
      const ra = universalSizeRank(va);
      const rb = universalSizeRank(vb);
      if (ra !== rb) return ra - rb;
      return va.localeCompare(vb, "ru", { numeric: true });
    }
    return va.localeCompare(vb, "ru", { numeric: true });
  }
  function parentCategoriesForSizeFilter(categories) {
    const list = Array.isArray(categories) ? categories : [];
    if (!list.length) return [];
    const hasChild = new Set();
    list.forEach(function(c) {
      const pid = c && c.parent_id != null ? Number(c.parent_id) : NaN;
      if (Number.isFinite(pid) && pid > 0) hasChild.add(pid);
    });
    const parents = list.filter(function(c) {
      if (!c || c.id == null) return false;
      if (hasChild.has(Number(c.id))) return true;
      const depth = Number(c.depth);
      return depth === 0;
    });
    const seen = new Set();
    return parents.filter(function(c) {
      const id = Number(c.id);
      if (!Number.isFinite(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort(function(a, b) {
      const ao = a.sort_order != null ? Number(a.sort_order) : 0;
      const bo = b.sort_order != null ? Number(b.sort_order) : 0;
      if (ao !== bo) return ao - bo;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    });
  }
  function groupSizesByType(rows, options) {
    const map = new Map();
    const list = options && options.euEtalonOnly === true ? filterEuEtalonSizes(rows) : rows || [];
    list.forEach(function(s) {
      if (!s || s.id == null) return;
      const tid = s.size_type_id != null && Number.isFinite(Number(s.size_type_id)) ? Number(s.size_type_id) : NaN;
      const tname = s.size_type || "\u0422\u0438\u043F";
      const key = Number.isFinite(tid) ? "t:" + tid : "n:" + tname;
      if (!map.has(key)) map.set(key, { size_type_id: tid, size_type: tname, sizes: [] });
      map.get(key).sizes.push(s);
    });
    return Array.from(map.values()).map(function(g) {
      g.size_type_slug = g.sizes[0] ? rowTypeSlug(g.sizes[0]) : "";
      g.sizes.sort(function(a, b) {
        return compareSizeRows(a, b, rowTypeSlug(a));
      });
      return g;
    }).sort(function(a, b) {
      const ra = sizeTypeGroupSortKey(a);
      const rb = sizeTypeGroupSortKey(b);
      if (ra !== rb) return ra - rb;
      return String(a.size_type).localeCompare(String(b.size_type), "ru");
    });
  }
  function renderFlatSizeList(colSizes, groups, mode, inputName, checkedSet, opt) {
    const filterLayout = !!(opt && opt.filterLayout);
    const categoryId = opt && opt.categoryId != null ? String(opt.categoryId) : "";
    colSizes.innerHTML = "";
    if (!groups || !groups.length) {
      const empty = document.createElement("p");
      empty.className = "size-cascade-empty";
      empty.textContent = "\u041D\u0435\u0442 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432 \u0434\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0440\u0430\u0437\u0434\u0435\u043B\u0430";
      colSizes.appendChild(empty);
      return;
    }
    groups.forEach(function(g) {
      if (!g.sizes.length) return;
      const section = filterLayout ? document.createElement("div") : null;
      if (section) section.className = "size-cascade-section";
      const h = document.createElement("div");
      h.className = "size-cascade-section-title";
      h.textContent = g.size_type;
      if (section) section.appendChild(h);
      else colSizes.appendChild(h);
      const listParent = section || colSizes;
      const grid = filterLayout ? document.createElement("div") : null;
      if (grid) {
        grid.className = "size-cascade-sizes-grid";
        listParent.appendChild(grid);
      }
      const appendTarget = grid || listParent;
      g.sizes.forEach(function(s) {
        const id = String(s.id);
        const primary = formatSizePrimaryLabel(s);
        const equiv = formatSizeEquivInline(s.equivalent_hint);
        const title = sizeOptionTitle(primary, s.equivalent_hint);
        if (mode === "multi") {
          const lab = document.createElement("label");
          lab.className = "size-cascade-check";
          if (title && (!filterLayout || !equiv)) lab.setAttribute("data-tip", title);
          const ck = checkedSet.has(id);
          let inner = '<input type="checkbox" name="' + escapeHtml(inputName) + '" value="' + escapeHtml(id) + '"' + (ck ? " checked" : "") + " />";
          if (filterLayout) {
            inner += '<span class="size-cascade-check-text"><span class="size-cascade-check-value">' + escapeHtml(primary) + "</span>";
            if (equiv) inner += '<span class="size-cascade-check-equiv">' + escapeHtml(equiv) + "</span>";
            inner += "</span>";
          } else {
            inner += "<span>" + escapeHtml(primary) + "</span>";
          }
          lab.innerHTML = inner;
          const inp = lab.querySelector("input");
          inp.addEventListener("change", function() {
            if (typeof opt.onToggle === "function") {
              opt.onToggle(id, primary, inp.checked, categoryId);
            } else if (inp.checked) {
              checkedSet.add(id);
            } else {
              checkedSet.delete(id);
            }
            if (typeof opt.onChange === "function") opt.onChange();
          });
          appendTarget.appendChild(lab);
        } else {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "size-cascade-item size-cascade-size";
          btn.dataset.sizeId = id;
          btn.title = title;
          btn.textContent = primary;
          appendTarget.appendChild(btn);
        }
      });
      if (section) colSizes.appendChild(section);
    });
    if (filterLayout) bindCheckTooltips(colSizes);
  }
  function mount(root, opt) {
    const filterLayout = opt.filterLayout === true;
    const categories = filterLayout ? parentCategoriesForSizeFilter(opt.categories) : Array.isArray(opt.categories) ? opt.categories : [];
    const mode = opt.mode === "multi" ? "multi" : "single";
    const loadSizes = typeof opt.loadSizes === "function" ? opt.loadSizes : function() {
      return Promise.resolve([]);
    };
    const inputName = opt.inputName || "size_id";
    const isFilterMulti = filterLayout && mode === "multi";
    const checkedSet = new Set((opt.checkedIds || []).map(String));
    const checkedMap = new Map();
    let filterCheckedCategoryId =
      opt.checkedCategoryId != null && String(opt.checkedCategoryId).trim() !== ""
        ? String(opt.checkedCategoryId).trim()
        : null;
    const initialLabels =
      opt.checkedLabels && typeof opt.checkedLabels === "object" ? opt.checkedLabels : {};
    if (isFilterMulti) {
      if (Array.isArray(opt.checkedEntries)) {
        opt.checkedEntries.forEach(function(entry) {
          if (!entry || entry.id == null) return;
          const id = String(entry.id);
          const catId =
            entry.categoryId != null && String(entry.categoryId).trim() !== ""
              ? String(entry.categoryId).trim()
              : filterCheckedCategoryId || "";
          if (!catId) return;
          filterCheckedCategoryId = catId;
          checkedMap.set(id, {
            label: entry.label != null ? String(entry.label).trim() : "",
            categoryId: catId
          });
        });
      } else {
        (opt.checkedIds || []).forEach(function(rawId) {
          const id = String(rawId);
          if (!id || !filterCheckedCategoryId) return;
          checkedMap.set(id, {
            label: initialLabels[id] || initialLabels[String(rawId)] || "",
            categoryId: filterCheckedCategoryId
          });
        });
      }
    }
    const defCat = opt.defaultCategoryId != null && String(opt.defaultCategoryId).trim() !== "" ? String(opt.defaultCategoryId).trim() : "";
    const cache = new Map();
    let selectedCatId = null;
    let selectCategorySeq = 0;
    function checkedSetForCategory(catId) {
      const ck = String(catId || "");
      const set = new Set();
      if (!isFilterMulti) {
        checkedSet.forEach(function(id) {
          set.add(id);
        });
        return set;
      }
      if (!filterCheckedCategoryId || filterCheckedCategoryId !== ck) return set;
      checkedMap.forEach(function(meta, id) {
        if (meta && meta.categoryId === ck) set.add(id);
      });
      return set;
    }
    function handleFilterToggle(sizeId, label, checked, catId) {
      const ck = String(catId || "");
      const id = String(sizeId);
      if (!ck || !id) return;
      if (checked) {
        if (filterCheckedCategoryId && filterCheckedCategoryId !== ck) {
          checkedMap.clear();
        }
        filterCheckedCategoryId = ck;
        checkedMap.set(id, { label: label || "", categoryId: ck });
      } else {
        checkedMap.delete(id);
        if (!checkedMap.size) filterCheckedCategoryId = null;
      }
    }
    if (filterLayout) {
      root.innerHTML = '<div class="size-cascade size-cascade--filter"><div class="size-cascade-panels size-cascade-panels--two-cols"><div class="size-cascade-col size-cascade-col--cat"><p class="size-cascade-col-heading">\u0420\u0430\u0437\u0434\u0435\u043B \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430</p><div class="size-cascade-col-scroll size-cascade-col-scroll--cat"></div></div><div class="size-cascade-col size-cascade-col--sizes"><p class="size-cascade-col-heading">\u0420\u0430\u0437\u043C\u0435\u0440\u044B</p><div class="size-cascade-col-scroll size-cascade-col-scroll--sizes"></div></div></div></div>';
    } else {
      root.innerHTML = '<div class="size-cascade"><div class="size-cascade-panels size-cascade-panels--two-cols"><div class="size-cascade-col size-cascade-col--cat"></div><div class="size-cascade-col size-cascade-col--sizes size-cascade-col--sizes-scroll"></div></div></div>';
    }
    const colCat = root.querySelector(".size-cascade-col--cat");
    const colSizes = root.querySelector(".size-cascade-col--sizes");
    const colCatList = filterLayout ? root.querySelector(".size-cascade-col-scroll--cat") : colCat;
    const colSizesList = filterLayout ? root.querySelector(".size-cascade-col-scroll--sizes") : colSizes;
    function fireChange() {
      if (typeof opt.onChange === "function") opt.onChange();
    }
    async function selectCategory(catId, skipIfSame) {
      const ck = String(catId);
      if (skipIfSame && selectedCatId === ck) return;
      const mySeq = ++selectCategorySeq;
      selectedCatId = ck;
      colCat.querySelectorAll(".size-cascade-cat").forEach(function(b) {
        b.classList.toggle("is-active", b.dataset.catId === ck);
      });
      colSizesList.innerHTML = '<p class="size-cascade-loading">\u2026</p>';
      if (!cache.has(ck)) {
        try {
          const rows2 = await loadSizes(catId);
          if (mySeq !== selectCategorySeq) return;
          cache.set(ck, Array.isArray(rows2) ? rows2 : []);
        } catch (e) {
          if (mySeq !== selectCategorySeq) return;
          cache.set(ck, []);
        }
      }
      if (mySeq !== selectCategorySeq) return;
      const rows = cache.get(ck) || [];
      const groups = groupSizesByType(rows, { euEtalonOnly: filterLayout });
      const renderOpt = { onChange: fireChange, filterLayout: filterLayout, categoryId: ck };
      if (isFilterMulti) renderOpt.onToggle = handleFilterToggle;
      renderFlatSizeList(colSizesList, groups, mode, inputName, checkedSetForCategory(ck), renderOpt);
    }
    function renderCats() {
      if (!colCatList) return;
      colCatList.innerHTML = "";
      if (!categories.length) {
        const empty = document.createElement("p");
        empty.className = "size-cascade-empty";
        empty.textContent = "\u041D\u0435\u0442 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439";
        colCatList.appendChild(empty);
        return;
      }
      categories.forEach(function(c) {
        const id = String(c.id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "size-cascade-item size-cascade-cat";
        btn.dataset.catId = id;
        const depth = filterLayout ? 0 : Number(c.depth) || 0;
        btn.style.paddingLeft = 8 + depth * 12 + "px";
        btn.textContent = c.name || "";
        if (!filterLayout) {
          btn.addEventListener("mouseenter", function() {
            void selectCategory(id, true);
          });
        }
        colCatList.appendChild(btn);
      });
    }
    colCat.addEventListener("click", function(e) {
      const b = e.target.closest(".size-cascade-cat");
      if (!b || !colCat.contains(b)) return;
      void selectCategory(b.dataset.catId, false);
    });
    if (mode === "single" && typeof opt.onPick === "function") {
      colSizes.addEventListener("click", function(e) {
        const b = e.target.closest(".size-cascade-size");
        if (!b || !colSizes.contains(b)) return;
        e.preventDefault();
        const sid = b.dataset.sizeId;
        const txt = b.textContent.trim();
        opt.onPick(sid, txt);
      });
    }
    renderCats();
    const initialCatId =
      filterCheckedCategoryId && categories.some(function(c) {
        return String(c.id) === filterCheckedCategoryId;
      })
        ? filterCheckedCategoryId
        : defCat && categories.some(function(c) {
            return String(c.id) === defCat;
          })
          ? defCat
          : filterLayout && categories.length
            ? String(categories[0].id)
            : "";
    if (initialCatId) {
      void selectCategory(initialCatId, false);
    }
    const api = {
      destroy: function() {
        root.innerHTML = "";
      },
      invalidateCategory: function(catId) {
        cache.delete(String(catId));
      }
    };
    if (mode === "multi") {
      api.getCheckedIds = function() {
        if (isFilterMulti) return Array.from(checkedMap.keys());
        return Array.from(checkedSet);
      };
      api.getCheckedSnapshot = function() {
        if (!isFilterMulti) {
          return {
            categoryId: null,
            sizes: Array.from(checkedSet).map(function(id) {
              return { id: id, label: "" };
            })
          };
        }
        return {
          categoryId: filterCheckedCategoryId,
          sizes: Array.from(checkedMap.entries()).map(function(pair) {
            return { id: pair[0], label: pair[1] && pair[1].label ? pair[1].label : "" };
          })
        };
      };
      api.clearChecked = function() {
        if (isFilterMulti) {
          checkedMap.clear();
          filterCheckedCategoryId = null;
          if (selectedCatId) void selectCategory(selectedCatId, true);
        } else {
          checkedSet.clear();
        }
        fireChange();
      };
    }
    return api;
  }
  function mountVariantCell(wrap, opt) {
    const loadSizes = opt.loadSizes;
    const defaultCategoryId = opt.defaultCategoryId != null && String(opt.defaultCategoryId).trim() !== "" ? String(opt.defaultCategoryId).trim() : "";
    const initialId = opt.initialSizeId != null && opt.initialSizeId !== "" ? String(opt.initialSizeId) : "";
    const variantIndex = opt.variantIndex;
    wrap.classList.add("variant-size-cell--simple");
    wrap.innerHTML = '<select class="variant-size" data-variant-index="' + escapeHtml(String(variantIndex)) + '" data-prev-value="' + escapeHtml(initialId) + '"><option value="">\u0420\u0430\u0437\u043C\u0435\u0440\u2026</option></select>';
    const sel = wrap.querySelector(".variant-size");
    let refillPromise = Promise.resolve();
    let refillSeq = 0;
    function applySizeOptionEl(o, s) {
      const primary = formatSizePrimaryLabel(s);
      const title = sizeOptionTitle(primary, s.equivalent_hint);
      o.textContent = primary;
      o.title = title;
    }
    async function refill() {
      if (!sel) return;
      const myRefill = ++refillSeq;
      sel.innerHTML = "";
      if (!defaultCategoryId) {
        const o = document.createElement("option");
        o.value = "";
        o.disabled = true;
        o.selected = true;
        o.textContent = "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E \u0442\u043E\u0432\u0430\u0440\u0430";
        sel.appendChild(o);
        sel.disabled = true;
        return;
      }
      sel.disabled = false;
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "\u0420\u0430\u0437\u043C\u0435\u0440\u2026";
      sel.appendChild(ph);
      try {
        const rows = await loadSizes(defaultCategoryId);
        if (myRefill !== refillSeq) return;
        const groups = groupSizesByType(Array.isArray(rows) ? rows : []);
        groups.forEach(function(g) {
          if (!g.sizes.length) return;
          const og = document.createElement("optgroup");
          og.label = g.size_type;
          g.sizes.forEach(function(s) {
            const o = document.createElement("option");
            o.value = String(s.id);
            applySizeOptionEl(o, s);
            og.appendChild(o);
          });
          sel.appendChild(og);
        });
      } catch (e) {
        if (myRefill !== refillSeq) return;
        const o = document.createElement("option");
        o.value = "";
        o.disabled = true;
        o.textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0440\u044B";
        sel.appendChild(o);
      }
      if (myRefill !== refillSeq) return;
      if (initialId) {
        sel.value = String(initialId);
        if (sel.value !== String(initialId)) {
          const o = document.createElement("option");
          o.value = String(initialId);
          o.textContent = "\u0420\u0430\u0437\u043C\u0435\u0440 #" + initialId;
          sel.appendChild(o);
          sel.value = String(initialId);
        }
      }
      sel.dataset.prevValue = sel.value;
    }
    refillPromise = refill().catch(function() {
    });
    sel.addEventListener("change", function() {
      sel.dataset.prevValue = sel.value;
    });
    const handle = {
      destroy: function() {
        wrap.innerHTML = "";
        wrap.classList.remove("variant-size-cell--simple");
        wrap._sizeCascadeHandle = null;
      },
      whenReady: function() {
        return refillPromise;
      },
      setHiddenValue: function(id, label) {
        const v = id != null ? String(id) : "";
        sel.value = v;
        if (v && sel.value !== v) {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = label && String(label).trim() ? String(label).trim() : "\u0420\u0430\u0437\u043C\u0435\u0440 #" + v;
          sel.appendChild(o);
          sel.value = v;
        }
        sel.dataset.prevValue = sel.value;
      },
      getHidden: function() {
        return sel;
      },
      refreshOptions: function() {
        refillPromise = refill().catch(function() {
        });
        return refillPromise;
      }
    };
    wrap._sizeCascadeHandle = handle;
    return handle;
  }
  global.KpvsSizeCascade = {
    mount,
    mountVariantCell,
    groupSizesByType,
    formatSizePrimaryLabel,
    escapeHtml
  };
})(typeof window !== "undefined" ? window : globalThis);
