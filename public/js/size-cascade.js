(function(global) {
  "use strict";
  var KPVS_NEW_SIZE_OPT = "__kpvs_new_size__";
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function euLetterClothingRank(raw) {
    const v = String(raw != null ? raw : "").trim().toLowerCase().replace(/\s+/g, "");
    if (v === "2xs" || v === "xxs") return 1;
    if (v === "xs") return 2;
    if (v === "s") return 3;
    if (v === "m") return 4;
    if (v === "l") return 5;
    if (v === "xl") return 6;
    if (v === "xxl" || v === "2xl") return 7;
    if (v === "3xl") return 8;
    return null;
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
    const slug = String(typeSlug || "").toLowerCase();
    const va = String(a.value || "");
    const vb = String(b.value || "");
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
  function groupSizesByType(rows) {
    const map = new Map();
    (rows || []).forEach(function(s) {
      if (!s || s.id == null) return;
      const tid = s.size_type_id != null && Number.isFinite(Number(s.size_type_id)) ? Number(s.size_type_id) : NaN;
      const tname = s.size_type || "\u0422\u0438\u043F";
      const key = Number.isFinite(tid) ? "t:" + tid : "n:" + tname;
      if (!map.has(key)) map.set(key, { size_type_id: tid, size_type: tname, sizes: [] });
      map.get(key).sizes.push(s);
    });
    return Array.from(map.values()).map(function(g) {
      const slug = g.sizes[0] && g.sizes[0].size_type_slug || "";
      g.sizes.sort(function(a, b) {
        return compareSizeRows(a, b, slug);
      });
      return g;
    }).sort(function(a, b) {
      return String(a.size_type).localeCompare(String(b.size_type), "ru");
    });
  }
  function orderTypeGroupsForCategoryName(groups, categoryName) {
    if (!groups || groups.length < 2) return groups || [];
    const n = String(categoryName || "").toLowerCase();
    const leafLooksFoot = /ботин|сапог|кроссов|босонож|валенк|мокас|лофер|туфл|тапоч|обув|угг|эспадриль|specobuv|спецобув/i.test(
      n
    );
    if (!leafLooksFoot) return groups;
    const typeLooksFoot = function(t) {
      const s = String(t || "").toLowerCase();
      return /\((обувь|обуви)\)|\bобувь\b|европейск.*обув|eu.?foot|footwear|shoe|ботин|сапог|кроссов|стель|шнур|лофер|туфл|тапоч|валенк|мокас|угг/i.test(
        s
      ) && !/\(одежда\)|\(аксесс|одежд|рост\/|рубашк|куртк|брюк|пиджак|обхват.*одеж/i.test(s);
    };
    return groups.slice().sort(function(a, b) {
      const af = typeLooksFoot(a.size_type) ? 0 : 1;
      const bf = typeLooksFoot(b.size_type) ? 0 : 1;
      if (af !== bf) return af - bf;
      return String(a.size_type).localeCompare(String(b.size_type), "ru");
    });
  }
  function renderFlatSizeList(colSizes, groups, mode, inputName, checkedSet, opt) {
    colSizes.innerHTML = "";
    if (!groups || !groups.length) {
      colSizes.innerHTML = '<p class="size-cascade-empty">\u041D\u0435\u0442 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432</p>';
      return;
    }
    groups.forEach(function(g) {
      if (!g.sizes.length) return;
      const h = document.createElement("div");
      h.className = "size-cascade-section-title";
      h.textContent = g.size_type;
      colSizes.appendChild(h);
      g.sizes.forEach(function(s) {
        const id = String(s.id);
        const hint = s.equivalent_hint && String(s.equivalent_hint).trim() ? ' <span class="size-cascade-hint-inline">(' + escapeHtml(String(s.equivalent_hint)) + ")</span>" : "";
        if (mode === "multi") {
          const lab = document.createElement("label");
          lab.className = "size-cascade-check";
          const ck = checkedSet.has(id);
          lab.innerHTML = '<input type="checkbox" name="' + escapeHtml(inputName) + '" value="' + escapeHtml(id) + '"' + (ck ? " checked" : "") + " /><span>" + escapeHtml(String(s.value)) + hint + "</span>";
          const inp = lab.querySelector("input");
          inp.addEventListener("change", function() {
            if (inp.checked) checkedSet.add(id);
            else checkedSet.delete(id);
            if (typeof opt.onChange === "function") opt.onChange();
          });
          colSizes.appendChild(lab);
        } else {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "size-cascade-item size-cascade-size";
          btn.dataset.sizeId = id;
          btn.innerHTML = escapeHtml(String(s.value)) + hint;
          colSizes.appendChild(btn);
        }
      });
    });
  }
  function mount(root, opt) {
    const categories = Array.isArray(opt.categories) ? opt.categories : [];
    const mode = opt.mode === "multi" ? "multi" : "single";
    const loadSizes = typeof opt.loadSizes === "function" ? opt.loadSizes : function() {
      return Promise.resolve([]);
    };
    const inputName = opt.inputName || "size_id";
    const checkedSet = new Set((opt.checkedIds || []).map(String));
    const defCat = opt.defaultCategoryId != null && String(opt.defaultCategoryId).trim() !== "" ? String(opt.defaultCategoryId).trim() : "";
    const cache = new Map();
    let selectedCatId = null;
    let selectCategorySeq = 0;
    root.innerHTML = '<div class="size-cascade"><div class="size-cascade-panels size-cascade-panels--two-cols"><div class="size-cascade-col size-cascade-col--cat"></div><div class="size-cascade-col size-cascade-col--sizes size-cascade-col--sizes-scroll"></div></div></div>';
    const colCat = root.querySelector(".size-cascade-col--cat");
    const colSizes = root.querySelector(".size-cascade-col--sizes");
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
      colSizes.innerHTML = '<p class="size-cascade-loading">\u2026</p>';
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
      const catMeta = categories.find(function(c) {
        return String(c.id) === ck;
      });
      const catLabel = catMeta && catMeta.name ? String(catMeta.name) : "";
      const groups = orderTypeGroupsForCategoryName(groupSizesByType(rows), catLabel);
      renderFlatSizeList(colSizes, groups, mode, inputName, checkedSet, { onChange: fireChange });
    }
    function renderCats() {
      colCat.innerHTML = "";
      if (!categories.length) {
        colCat.innerHTML = '<p class="size-cascade-empty">\u041D\u0435\u0442 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439</p>';
        return;
      }
      categories.forEach(function(c) {
        const id = String(c.id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "size-cascade-item size-cascade-cat";
        btn.dataset.catId = id;
        const depth = Number(c.depth) || 0;
        btn.style.paddingLeft = 8 + depth * 12 + "px";
        btn.textContent = c.name || "";
        btn.addEventListener("mouseenter", function() {
          void selectCategory(id, true);
        });
        colCat.appendChild(btn);
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
    if (defCat && categories.some(function(c) {
      return String(c.id) === defCat;
    })) {
      void selectCategory(defCat, false);
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
        return Array.from(checkedSet);
      };
    }
    return api;
  }
  function mountVariantCell(wrap, opt) {
    const loadSizes = opt.loadSizes;
    const defaultCategoryId = opt.defaultCategoryId != null && String(opt.defaultCategoryId).trim() !== "" ? String(opt.defaultCategoryId).trim() : "";
    const initialId = opt.initialSizeId != null && opt.initialSizeId !== "" ? String(opt.initialSizeId) : "";
    const variantIndex = opt.variantIndex;
    const onNewSize = opt.onNewSize;
    const catLabel = typeof opt.categoryLabel === "string" ? opt.categoryLabel : (function() {
      const el = document.getElementById("product-category");
      if (el && el.options && el.selectedIndex >= 0) return String(el.options[el.selectedIndex].text || "");
      return "";
    })();
    wrap.classList.add("variant-size-cell--simple");
    wrap.innerHTML = '<select class="variant-size" data-variant-index="' + escapeHtml(String(variantIndex)) + '" data-prev-value="' + escapeHtml(initialId) + '"><option value="">\u0420\u0430\u0437\u043C\u0435\u0440\u2026</option></select>';
    const sel = wrap.querySelector(".variant-size");
    let refillPromise = Promise.resolve();
    let refillSeq = 0;
    function hintSuffix(s) {
      if (!s.equivalent_hint || !String(s.equivalent_hint).trim()) return "";
      return " (" + String(s.equivalent_hint).trim() + ")";
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
        const groups = orderTypeGroupsForCategoryName(groupSizesByType(Array.isArray(rows) ? rows : []), catLabel);
        groups.forEach(function(g) {
          if (!g.sizes.length) return;
          const og = document.createElement("optgroup");
          og.label = g.size_type;
          g.sizes.forEach(function(s) {
            const o = document.createElement("option");
            o.value = String(s.id);
            o.textContent = String(s.value) + hintSuffix(s);
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
      if (typeof onNewSize === "function" && defaultCategoryId) {
        const act = document.createElement("option");
        act.value = KPVS_NEW_SIZE_OPT;
        act.textContent = "+ \u041D\u043E\u0432\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440\u2026";
        act.title = "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0432 \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432";
        sel.appendChild(act);
      }
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
      if (sel.value === KPVS_NEW_SIZE_OPT) {
        const prev = sel.dataset.prevValue != null ? String(sel.dataset.prevValue) : "";
        sel.value = prev;
        if (typeof onNewSize === "function") {
          onNewSize(sel);
        }
        return;
      }
      sel.dataset.prevValue = sel.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
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
    NEW_SIZE_OPT: KPVS_NEW_SIZE_OPT,
    mount,
    mountVariantCell,
    groupSizesByType,
    escapeHtml
  };
})(typeof window !== "undefined" ? window : globalThis);
