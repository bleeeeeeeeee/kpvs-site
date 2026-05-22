let currentProductId = null;
const escapeHtml = window.KpvsEscape.escapeHtml;
const escapeAttr = window.KpvsEscape.escapeAttr;
const BTN_ADD_FAVORITE = "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435";
const BTN_REMOVE_FAVORITE = "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E";
const BTN_ADD_CART = "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0443";
const BTN_REMOVE_CART = "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B";
function genderDisplayLabel(g) {
  if (g === "mens" || g === "male") return "\u041C\u0443\u0436\u0441\u043A\u043E\u0439";
  if (g === "womens" || g === "female") return "\u0416\u0435\u043D\u0441\u043A\u0438\u0439";
  if (g === "unisex") return "\u0423\u043D\u0438\u0441\u0435\u043A\u0441";
  return "";
}
function formatProductDescriptionHtml(raw) {
  if (raw == null) return "";
  const text = String(raw).trim();
  if (!text) return "";
  const blocks = text.split(/\n\s*\n/).map(function(b) {
    return b.trim();
  }).filter(Boolean);
  if (!blocks.length) return "";
  return blocks.map(function(block) {
    const inner = escapeHtml(block).replace(/\r\n|\r|\n/g, "<br />");
    return '<p class="product-desc-p">' + inner + "</p>";
  }).join("");
}
function formatProductSpecMultilineHtml(raw) {
  if (raw == null) return "";
  const text = String(raw).trim();
  if (!text) return "";
  const blocks = text.split(/\n\s*\n/).map(function(b) {
    return b.trim();
  }).filter(Boolean);
  if (!blocks.length) return "";
  return blocks.map(function(block) {
    const inner = escapeHtml(block).replace(/\r\n|\r|\n/g, "<br />");
    return '<p class="product-spec-para">' + inner + "</p>";
  }).join("");
}
function capitalizeRuLine(str) {
  const s = String(str || "").trim();
  if (!s) return "";
  return s.charAt(0).toLocaleUpperCase("ru-RU") + s.slice(1);
}
function capitalizeSeasonDisplaySource(season) {
  const s = String(season || "").trim();
  if (!s) return "";
  return s.split(/\n/).map(function(line) {
    return capitalizeRuLine(line);
  }).join("\n");
}
function buildSeasonSpecGroup(season) {
  if (!season || !String(season).trim()) return "";
  const inner = formatProductSpecMultilineHtml(capitalizeSeasonDisplaySource(season));
  return '<div class="product-spec-group product-spec-group--season"><p class="product-spec-heading">\u0421\u0435\u0437\u043E\u043D</p><div class="product-spec-indent">' + inner + "</div></div>";
}
function parseProductMaterialsString(str) {
  const out = [];
  String(str || "")
    .split(",")
    .forEach(function(part) {
      part = part.trim();
      if (!part) return;
      const m = part.match(/^(.+?)\s+(\d{1,3})\s*%?\s*$/);
      if (m) {
        const pct = parseInt(m[2], 10);
        out.push({ name: m[1].trim(), percent: pct });
      } else {
        out.push({ fallback: true, text: part });
      }
    });
  return out;
}
function normalizeCompositionRows(product) {
  if (product && Array.isArray(product.materials_list) && product.materials_list.length) {
    return product.materials_list
      .map(function(m) {
        if (!m || typeof m !== "object") return null;
        const name = m.name != null ? String(m.name).trim() : "";
        if (!name) return null;
        const p = m.percent != null ? Number(m.percent) : NaN;
        if (Number.isFinite(p) && p >= 1 && p <= 100) return { name, percent: p };
        return { name, percent: 0 };
      })
      .filter(Boolean);
  }
  const raw = product && product.materials != null ? String(product.materials).trim() : "";
  if (!raw) return [];
  return parseProductMaterialsString(raw);
}
function buildCompositionSpecGroup(product) {
  const rows = normalizeCompositionRows(product || null);
  if (!rows.length) return "";
  let html = '<div class="product-spec-group product-spec-group--composition"><p class="product-spec-heading">\u0421\u043E\u0441\u0442\u0430\u0432</p><ul class="product-attr-rows">';
  rows.forEach(function(row) {
    if (row.fallback) {
      html += '<li class="product-attr-row product-composition-row--freeform"><div class="product-attr-value">' + escapeHtml(row.text) + "</div></li>";
    } else {
      let val = "\u2014";
      if (row.percent != null && row.percent >= 1 && row.percent <= 100) val = String(row.percent) + "%";
      html +=
        '<li class="product-attr-row"><span class="product-attr-name">' +
        escapeHtml(row.name) +
        ':</span><div class="product-attr-value">' +
        escapeHtml(val) +
        "</div></li>";
    }
  });
  html += "</ul></div>";
  return html;
}
function formatProductPrice(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "";
  try {
    return new Intl.NumberFormat("ru-BY", { style: "currency", currency: "BYN", maximumFractionDigits: 2 }).format(x);
  } catch (_) {
    return String(x) + " BYN";
  }
}
function productAvailabilityState(product) {
  const v = product && product.variants;
  if (!Array.isArray(v) || !v.length) return "in";
  return v.some(function(x) {
    return x && x.is_active !== false;
  }) ? "in" : "out";
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
    } catch (_) {
    }
  }
  return "";
}
function documentTitleFromProductName(name) {
  const d = document.createElement("div");
  d.textContent = name == null || name === "" ? "\u0422\u043E\u0432\u0430\u0440" : String(name);
  return d.textContent + " \xB7 \u041A\u041F\u0412\u0421";
}
function catalogHrefForGender(g) {
  const x = String(g || "").toLowerCase();
  if (x === "mens" || x === "male") return "/mens.html";
  if (x === "womens" || x === "female") return "/womens.html";
  if (x === "unisex") return "/all.html";
  return "/all.html";
}
let productBackAlignState = null;
function teardownProductBackAlign() {
  if (productBackAlignState) {
    if (productBackAlignState.ro) productBackAlignState.ro.disconnect();
    if (productBackAlignState.onResize) {
      window.removeEventListener("resize", productBackAlignState.onResize);
    }
    productBackAlignState = null;
  }
  const shell = document.getElementById("product-details");
  if (shell) shell.style.removeProperty("--product-back-top");
}
function requestProductBackAlign() {
  if (productBackAlignState && typeof productBackAlignState.schedule === "function") {
    productBackAlignState.schedule();
  }
}
let productAdaptiveColorsState = null;
const PRODUCT_COLOR_MORE_CLOSE_MS = 220;
function clearProductColorMoreCloseTimer(wrap) {
  if (!wrap || wrap._morePopCloseTimer == null) return;
  clearTimeout(wrap._morePopCloseTimer);
  wrap._morePopCloseTimer = null;
}
function setProductColorMoreOpen(wrap, open) {
  if (!wrap) return;
  wrap.classList.toggle("product-color-more-wrap--open", !!open);
  const btn = wrap.querySelector(".product-color-more-circle");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}
function scheduleProductColorMoreClose(wrap) {
  if (!wrap) return;
  clearProductColorMoreCloseTimer(wrap);
  wrap._morePopCloseTimer = setTimeout(function() {
    wrap._morePopCloseTimer = null;
    setProductColorMoreOpen(wrap, false);
  }, PRODUCT_COLOR_MORE_CLOSE_MS);
}
function bindProductColorMoreWrap(wrap) {
  if (!wrap || wrap.dataset.morePopBound === "1") return;
  wrap.dataset.morePopBound = "1";
  const btn = wrap.querySelector(".product-color-more-circle");
  const pop = wrap.querySelector(".product-color-more-popover");
  const openNow = function() {
    clearProductColorMoreCloseTimer(wrap);
    setProductColorMoreOpen(wrap, true);
  };
  const leaveLater = function() {
    scheduleProductColorMoreClose(wrap);
  };
  wrap.addEventListener("mouseenter", openNow);
  wrap.addEventListener("mouseleave", leaveLater);
  wrap.addEventListener("pointerenter", openNow);
  wrap.addEventListener("pointerleave", leaveLater);
  if (pop) {
    pop.addEventListener("mouseenter", openNow);
    pop.addEventListener("mouseleave", leaveLater);
    pop.addEventListener("pointerenter", openNow);
    pop.addEventListener("pointerleave", leaveLater);
  }
  if (btn) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      openNow();
    });
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
  }
}
function bindAllProductColorMoreWraps(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll(".product-color-more-wrap").forEach(bindProductColorMoreWrap);
}
function teardownProductAdaptiveColorRows() {
  if (productAdaptiveColorsState) {
    if (productAdaptiveColorsState.ro) productAdaptiveColorsState.ro.disconnect();
    if (productAdaptiveColorsState.onResize) {
      window.removeEventListener("resize", productAdaptiveColorsState.onResize);
    }
    productAdaptiveColorsState = null;
  }
  document.querySelectorAll(".product-color-more-wrap").forEach(function(wrap) {
    wrap.classList.remove("product-color-more-wrap--open");
    clearProductColorMoreCloseTimer(wrap);
  });
}
function productColorTrackClip(host) {
  return host.querySelector(".product-size-colors-track-clip");
}
function productColorSetVisibleCount(wraps, count) {
  wraps.forEach(function(w, i) {
    if (i < count) w.removeAttribute("hidden");
    else w.setAttribute("hidden", "");
  });
}
function productColorRowCountFit(track, clip, wraps) {
  const limit = clip ? clip.clientWidth : 0;
  const n = wraps.length;
  if (!limit || !n) return n;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    productColorSetVisibleCount(wraps, mid);
    void track.offsetWidth;
    if (track.scrollWidth <= limit) lo = mid;
    else hi = mid - 1;
  }
  productColorSetVisibleCount(wraps, lo);
  void track.offsetWidth;
  return lo;
}
function productColorTightenRowFit(track, clip, wraps, fit) {
  const limit = clip ? clip.clientWidth : 0;
  const n = wraps.length;
  if (!limit || !n) return fit;
  let f = Math.min(Math.max(0, fit), n);
  while (f > 0) {
    productColorSetVisibleCount(wraps, f);
    void track.offsetWidth;
    if (track.scrollWidth <= limit) break;
    f -= 1;
  }
  return f;
}
function swatchMetaFromWrap(w) {
  return {
    name: w.getAttribute("data-tip") || "",
    hex: w.getAttribute("data-hex") || ""
  };
}
function refreshMorePopover(moreWrap, wraps, fit, headingLine) {
  if (!moreWrap) return;
  const pop = moreWrap.querySelector(".product-color-more-popover");
  if (!pop) return;
  const hidden = wraps.slice(fit).map(swatchMetaFromWrap);
  const rows = hidden.map(function(c) {
    const st = swatchInlineStyle(c.hex);
    const styleAttr = st ? ' style="' + escapeAttr(st) + '"' : "";
    const dotCls = "product-color-more-pop-dot" + (st ? "" : " product-color-more-pop-dot--muted");
    return '<div class="product-color-more-pop-row"><span class="' + dotCls + '"' + styleAttr + ' aria-hidden="true"></span><span class="product-color-more-pop-name">' + escapeHtml(c.name || "\u2014") + "</span></div>";
  }).join("");
  const head = headingLine && String(headingLine).trim() ? '<span class="product-color-more-pop-heading">' + escapeHtml(String(headingLine).trim()) + "</span>" : "";
  pop.innerHTML = head + rows;
}
function alignProductSwatchTooltips(track, host) {
  if (!track) return;
  const row = host || track.closest(".product-size-colors-adaptive");
  const bounds = row ? row.getBoundingClientRect() : track.getBoundingClientRect();
  const tipHalf = 80;
  track.querySelectorAll(".product-color-swatch-wrap").forEach(function(w) {
    w.classList.remove("swatch-tip-left", "swatch-tip-right", "swatch-tip-center");
    if (w.hasAttribute("hidden")) return;
    const r = w.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    if (cx - tipHalf < bounds.left + 2) {
      w.classList.add("swatch-tip-left");
    } else if (cx + tipHalf > bounds.right - 2) {
      w.classList.add("swatch-tip-right");
    } else {
      w.classList.add("swatch-tip-center");
    }
  });
}
function layoutOneAdaptiveColorRow(host) {
  const clip = productColorTrackClip(host);
  const track = host.querySelector(".product-size-colors-track");
  const moreWrap = host.querySelector(".product-color-more-wrap");
  const wraps = track ? Array.from(track.querySelectorAll(".product-color-swatch-wrap")) : [];
  const btn = moreWrap ? moreWrap.querySelector(".product-color-more-circle") : null;
  const headingLine = moreWrap ? moreWrap.getAttribute("data-heading") || "" : "";
  const n = wraps.length;
  if (!track || !clip || !n) return;
  wraps.forEach(function(w) {
    w.removeAttribute("hidden");
    w.style.removeProperty("z-index");
  });
  if (moreWrap) {
    moreWrap.setAttribute("hidden", "");
    if (btn) {
      btn.textContent = "+0";
      btn.setAttribute("aria-label", "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u043A\u0440\u044B\u0442\u044B\u0435 \u0446\u0432\u0435\u0442\u0430");
    }
  }
  if (!moreWrap || n <= 1) {
    alignProductSwatchTooltips(track, host);
    return;
  }
  let fit = productColorRowCountFit(track, clip, wraps);
  if (fit >= n) {
    alignProductSwatchTooltips(track, host);
    return;
  }
  moreWrap.removeAttribute("hidden");
  void moreWrap.offsetWidth;
  fit = productColorRowCountFit(track, clip, wraps);
  fit = productColorTightenRowFit(track, clip, wraps, fit);
  let overflow = n - fit;
  if (overflow <= 0) {
    moreWrap.setAttribute("hidden", "");
    if (btn) {
      btn.textContent = "+0";
      btn.setAttribute("aria-label", "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u043A\u0440\u044B\u0442\u044B\u0435 \u0446\u0432\u0435\u0442\u0430");
    }
    wraps.forEach(function(w) {
      w.removeAttribute("hidden");
    });
    alignProductSwatchTooltips(track, host);
    return;
  }
  productColorSetVisibleCount(wraps, fit);
  overflow = n - fit;
  if (btn) {
    btn.textContent = "+" + overflow;
    btn.setAttribute("aria-label", "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0435\u0449\u0451 " + overflow + " " + (overflow === 1 ? "\u0446\u0432\u0435\u0442" : overflow < 5 ? "\u0446\u0432\u0435\u0442\u0430" : "\u0446\u0432\u0435\u0442\u043E\u0432"));
  }
  refreshMorePopover(moreWrap, wraps, fit, headingLine);
  if (moreWrap) bindProductColorMoreWrap(moreWrap);
  alignProductSwatchTooltips(track, host);
}
function layoutProductAdaptiveColorRows(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll(".product-size-colors-adaptive").forEach(layoutOneAdaptiveColorRow);
}
function setupProductAdaptiveColorRows(productMainEl) {
  teardownProductAdaptiveColorRows();
  if (!productMainEl || !productMainEl.querySelector(".product-size-colors-adaptive")) return;
  const run = function() {
    layoutProductAdaptiveColorRows(productMainEl);
  };
  run();
  requestAnimationFrame(run);
  requestAnimationFrame(function() {
    run();
  });
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(function() {
      run();
    });
    ro.observe(productMainEl);
    productMainEl.querySelectorAll(".product-size-colors-adaptive").forEach(function(row) {
      ro.observe(row);
    });
  }
  const onResize = function() {
    run();
  };
  window.addEventListener("resize", onResize);
  bindAllProductColorMoreWraps(productMainEl);
  productAdaptiveColorsState = { ro, onResize };
}
function setupProductBackAlign() {
  teardownProductBackAlign();
  const shell = document.getElementById("product-details");
  const img = shell && shell.querySelector(".product-image");
  if (!shell || !img) return;
  const wrap = shell.querySelector(".product-back-wrap");
  const backBtn = document.getElementById("product-back-btn");
  const backImg = backBtn && backBtn.querySelector("img");
  let raf = 0;
  const apply = () => {
    const shellRect = shell.getBoundingClientRect();
    const prodTopRel = img.getBoundingClientRect().top - shellRect.top;
    let y = prodTopRel;
    if (wrap && backImg) {
      const delta = backImg.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
      y = prodTopRel - delta;
    }
    shell.style.setProperty("--product-back-top", Math.max(0, y) + "px");
  };
  const schedule = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };
  schedule();
  if (!img.complete) img.addEventListener("load", schedule, { once: true });
  const mainEl = document.getElementById("product-details-main");
  let ro = null;
  if (mainEl && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(schedule);
    ro.observe(mainEl);
  }
  const onResize = () => schedule();
  window.addEventListener("resize", onResize);
  productBackAlignState = { ro, onResize, schedule };
}
function wireProductBackButton(product) {
  const el = document.getElementById("product-back-btn");
  if (!el) return;
  el.setAttribute("href", catalogHrefForGender(product && product.gender));
  el.onclick = function(ev) {
    const ref = document.referrer || "";
    try {
      const sameSite = ref.indexOf(window.location.origin) === 0;
      const fromListing = /\/(mens|womens|all)\.html/i.test(ref) || /\/welcome\.html/i.test(ref);
      if (sameSite && fromListing && window.history.length > 1) {
        ev.preventDefault();
        window.history.back();
      }
    } catch (_) {
    }
  };
}
function wireProductGallery(root, urls, initialIdx) {
  if (!root || !Array.isArray(urls) || urls.length < 2) return;
  const img = root.querySelector(".product-image--main");
  const prev = root.querySelector(".product-gallery-nav--prev");
  const next = root.querySelector(".product-gallery-nav--next");
  const stage = root.querySelector(".product-gallery-stage");
  if (!img) return;
  urls.forEach(function(u) {
    const pre = new Image();
    pre.src = u;
  });
  let idx = Math.min(Math.max(0, Number(initialIdx) || 0), urls.length - 1);
  const thumbs = root.querySelectorAll(".product-gallery-thumb");
  function syncThumbs() {
    thumbs.forEach(function(t, i) {
      if (i === idx) t.classList.add("is-active");
      else t.classList.remove("is-active");
    });
  }
  function applyIndex(nextIdx) {
    idx = (nextIdx + urls.length) % urls.length;
    img.style.opacity = "0";
    window.setTimeout(function() {
      img.src = urls[idx];
      img.dataset.galleryIdx = String(idx);
      const done = function() {
        img.style.opacity = "1";
      };
      img.onload = done;
      if (img.complete) done();
      syncThumbs();
      requestProductBackAlign();
    }, 120);
  }
  img.style.transition = "opacity 0.3s ease";
  img.style.opacity = "1";
  syncThumbs();
  if (prev) {
    prev.addEventListener("click", function() {
      applyIndex(idx - 1);
    });
  }
  if (next) {
    next.addEventListener("click", function() {
      applyIndex(idx + 1);
    });
  }
  thumbs.forEach(function(btn) {
    btn.addEventListener("click", function() {
      const raw = btn.getAttribute("data-gallery-idx");
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      if (n === idx) return;
      applyIndex(n);
    });
  });
  if (!stage) return;
  let touchStartX = 0;
  stage.addEventListener(
    "touchstart",
    function(e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      touchStartX = e.changedTouches[0].clientX;
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchend",
    function(e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 48) return;
      if (dx < 0) applyIndex(idx + 1);
      else applyIndex(idx - 1);
    },
    { passive: true }
  );
}
async function loadProduct() {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get("slug");
  const productId = urlParams.get("id");
  const identifier = slug || productId;
  const productMainEl = document.getElementById("product-details-main");
  if (!productMainEl) return;
  teardownProductBackAlign();
  teardownProductAdaptiveColorRows();
  if (!identifier) {
    productMainEl.innerHTML = '<p class="catalog-empty">\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 <a href="/mens.html">\u043A\u0430\u0442\u0430\u043B\u043E\u0433</a>.</p>';
    return;
  }
  try {
    const res = await fetch("/api/product/" + encodeURIComponent(identifier));
    if (!res.ok) throw new Error("Server returned " + res.status);
    const product = await res.json();
    if (!product || !product.id) {
      productMainEl.innerHTML = '<p class="catalog-empty">\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.</p>';
      return;
    }
    currentProductId = product.id;
    const isFavorite = getFavorites().some((f) => f.id === product.id);
    const isInCart = getCart().some((c) => c.id === product.id);
    const images = Array.isArray(product.images) && product.images.length ? product.images : [];
    const galleryItems = [];
    images.forEach(function(img) {
      const u = sanitizeProductImageUrl(img.url || "");
      if (!u) return;
      galleryItems.push({ url: u, primary: !!img.is_primary });
    });
    const fallbackSrc = "/img/item.png";
    if (!galleryItems.length) {
      galleryItems.push({ url: fallbackSrc, primary: true });
    }
    let startIdx = galleryItems.findIndex(function(x) {
      return x.primary;
    });
    if (startIdx < 0) startIdx = 0;
    const imageUrls = galleryItems.map(function(x) {
      return x.url;
    });
    const stageSrc = imageUrls[startIdx] || fallbackSrc;
    const showNav = imageUrls.length > 1;
    const navHtml = showNav ? '<button type="button" class="product-gallery-nav product-gallery-nav--prev" aria-label="\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0444\u043E\u0442\u043E"></button><button type="button" class="product-gallery-nav product-gallery-nav--next" aria-label="\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0444\u043E\u0442\u043E"></button>' : "";
    let thumbsHtml = "";
    if (showNav) {
      thumbsHtml += '<div class="product-gallery product-gallery--thumbs" role="tablist">';
      galleryItems.forEach(function(item, ix) {
        const active = ix === startIdx ? " is-active" : "";
        thumbsHtml += '<button type="button" role="tab" class="product-gallery-thumb' + active + '" data-gallery-idx="' + ix + '" aria-label="\u0424\u043E\u0442\u043E ' + (ix + 1) + '"><img src="' + escapeAttr(item.url) + '" alt="" loading="lazy" decoding="async" width="88" height="88"></button>';
      });
      thumbsHtml += "</div>";
    }
    const variantsHtml = buildVariantsHtml(product.variants);
    const attributesHtml = buildAttributesHtml(product.attributes);
    const artHtml = product.art ? '<p class="product-sku">\u0410\u0440\u0442\u0438\u043A\u0443\u043B: ' + escapeHtml(product.art) + "</p>" : "";
    const brandHtml = product.brand_name ? '<p class="product-brand">\u0411\u0440\u0435\u043D\u0434: ' + escapeHtml(product.brand_name) + "</p>" : "";
    const seasonHtml = buildSeasonSpecGroup(product.season);
    const materialsHtml = buildCompositionSpecGroup(product);
    const metaGender = genderDisplayLabel(product.gender) || "\u0422\u043E\u0432\u0430\u0440";
    const catPart = product.category_name ? " \xB7 " + escapeHtml(product.category_name) : "";
    const priceFormatted = formatProductPrice(product.price);
    const priceHtml = priceFormatted ? '<p class="product-price">' + escapeHtml(priceFormatted) + "</p>" : '<p class="product-price product-price--placeholder">\u0426\u0435\u043D\u0430 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443</p>';
    const avail = productAvailabilityState(product);
    const availHtml = '<p class="product-availability ' + (avail === "in" ? "product-availability--in" : "product-availability--out") + '">' + (avail === "in" ? "\u0412 \u043D\u0430\u043B\u0438\u0447\u0438\u0438" : "\u041D\u0435\u0442 \u0432 \u043D\u0430\u043B\u0438\u0447\u0438\u0438") + "</p>";
    const descPlaceholder = "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430 \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u043F\u043E\u0437\u0436\u0435.";
    const descSummaryInner = product.description && String(product.description).trim() ? formatProductDescriptionHtml(product.description) : '<p class="product-desc-p">' + escapeHtml(descPlaceholder) + "</p>";
    productMainEl.innerHTML = '<div class="product-page"><div class="product-image-block"><div class="product-gallery-stage">' + navHtml + '<div class="product-image-wrapper"><img src="' + escapeAttr(stageSrc) + '" alt="' + escapeAttr(product.name || "") + '" class="product-image product-image--main" data-gallery-idx="' + startIdx + '"></div></div>' + thumbsHtml + '<div class="product-actions site-product-actions"><button type="button" class="btn btn--primary product-page-action-btn favorite-action-btn ' + (isFavorite ? "in-favorites" : "") + '" data-action="product-favorite">' + (isFavorite ? BTN_REMOVE_FAVORITE : BTN_ADD_FAVORITE) + '</button><button type="button" class="btn btn--primary product-page-action-btn cart-action-btn ' + (isInCart ? "in-cart" : "") + '" data-action="product-cart">' + (isInCart ? BTN_REMOVE_CART : BTN_ADD_CART) + '</button><button type="button" class="btn inquire-action-btn" data-action="product-inquire">\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0446\u0435\u043D\u0443</button></div></div><div class="product-info"><h1 class="product-title">' + escapeHtml(product.name || "") + '</h1><p class="product-meta">' + escapeHtml(metaGender) + catPart + "</p>" + priceHtml + availHtml + artHtml + brandHtml + '<div class="product-summary"><div class="product-description">' + descSummaryInner + '</div></div><div class="product-specs">' + seasonHtml + materialsHtml + variantsHtml + attributesHtml + "</div></div></div>";
    const favBtn = productMainEl.querySelector('[data-action="product-favorite"]');
    const cartBtnEl = productMainEl.querySelector('[data-action="product-cart"]');
    const inqBtn = productMainEl.querySelector('[data-action="product-inquire"]');
    if (favBtn) {
      favBtn.addEventListener("click", function() {
        toggleFavorite(product.id, favBtn);
      });
    }
    if (cartBtnEl) {
      cartBtnEl.addEventListener("click", function() {
        toggleCart(product.id, cartBtnEl);
      });
    }
    if (inqBtn) {
      inqBtn.addEventListener("click", function() {
        inquirePrice(product);
      });
    }
    document.title = documentTitleFromProductName(product.name);
    wireProductBackButton(product);
    setupProductBackAlign();
    setupProductAdaptiveColorRows(productMainEl);
    wireProductGallery(productMainEl, imageUrls, startIdx);
    requestProductBackAlign();
    const legacyDlg = document.getElementById("product-colors-dialog");
    if (legacyDlg && legacyDlg.parentNode) legacyDlg.parentNode.removeChild(legacyDlg);
  } catch (err) {
    console.error("Error loading product:", err);
    if (productMainEl) productMainEl.innerHTML = '<p class="catalog-empty">\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0442\u043E\u0432\u0430\u0440\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.</p>';
  }
}
function colorCountLabelRu(n) {
  n = Math.max(0, Number(n) || 0);
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return n + " \u0446\u0432\u0435\u0442\u043E\u0432";
  if (mod10 === 1) return n + " \u0446\u0432\u0435\u0442";
  if (mod10 >= 2 && mod10 <= 4) return n + " \u0446\u0432\u0435\u0442\u0430";
  return n + " \u0446\u0432\u0435\u0442\u043E\u0432";
}
function sizeDisplaySortKey(label) {
  const v = String(label || "").trim().toLowerCase().replace(/\s+/g, "");
  const rank = { "2xs": 1, xxs: 1, xs: 2, s: 3, m: 4, l: 5, xl: 6, xxl: 7, "2xl": 7, "3xl": 8 };
  if (rank[v] != null) return [0, rank[v], String(label)];
  const num = parseFloat(String(label).replace(",", "."));
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
    return String(ka[2]).localeCompare(String(kb[2]), "ru", { numeric: true });
  });
}
function swatchInlineStyle(hex) {
  const h = String(hex || "").trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(h)) return "background-color:" + h + ";";
  if (/^[0-9A-Fa-f]{3,8}$/.test(h)) return "background-color:#" + h + ";";
  return "";
}
function uniqueColorsForSize(activeVariants, sizeLabel) {
  const map = new Map();
  activeVariants.forEach(function(v) {
    if (String(v.size_value || "") !== String(sizeLabel)) return;
    const name = v.color_name != null ? String(v.color_name).trim() : "";
    const hex = v.color_hex != null ? String(v.color_hex).trim() : "";
    if (!name && !hex) return;
    const key = v.color_id != null && Number.isFinite(Number(v.color_id)) ? "id:" + v.color_id : "n:" + name + "|" + hex;
    if (!map.has(key)) map.set(key, { name: name || "\u0426\u0432\u0435\u0442", hex });
  });
  return Array.from(map.values()).sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "ru");
  });
}
function uniqueColorsAll(activeVariants) {
  const map = new Map();
  activeVariants.forEach(function(v) {
    const name = v.color_name != null ? String(v.color_name).trim() : "";
    const hex = v.color_hex != null ? String(v.color_hex).trim() : "";
    if (!name && !hex) return;
    const key = v.color_id != null && Number.isFinite(Number(v.color_id)) ? "id:" + v.color_id : "n:" + name + "|" + hex;
    if (!map.has(key)) map.set(key, { name: name || "\u0426\u0432\u0435\u0442", hex });
  });
  return Array.from(map.values()).sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "ru");
  });
}
function renderProductSwatchButton(c) {
  const name = c.name || "\u2014";
  const st = swatchInlineStyle(c.hex);
  const styleAttr = st ? ' style="' + escapeAttr(st) + '"' : "";
  const cls = "product-color-swatch" + (st ? "" : " product-color-swatch--muted");
  return '<span class="product-color-swatch-wrap" data-tip="' + escapeAttr(name) + '" data-hex="' + escapeAttr(c.hex || "") + '"><button type="button" class="' + cls + '"' + styleAttr + ' title="' + escapeAttr(name) + '" aria-label="' + escapeAttr(name) + '"></button></span>';
}
function renderProductColorOverflowPopover(allColors, headingLine) {
  const arr = Array.isArray(allColors) ? allColors : [];
  if (arr.length <= 1) return "";
  const rows = arr.map(function(c) {
    const st = swatchInlineStyle(c.hex);
    const styleAttr = st ? ' style="' + escapeAttr(st) + '"' : "";
    const dotCls = "product-color-more-pop-dot" + (st ? "" : " product-color-more-pop-dot--muted");
    return '<div class="product-color-more-pop-row"><span class="' + dotCls + '"' + styleAttr + ' aria-hidden="true"></span><span class="product-color-more-pop-name">' + escapeHtml(c.name || "\u2014") + "</span></div>";
  }).join("");
  const head = headingLine && String(headingLine).trim() ? '<span class="product-color-more-pop-heading">' + escapeHtml(String(headingLine).trim()) + "</span>" : "";
  return '<span class="product-color-more-wrap" hidden data-heading="' + escapeAttr(headingLine || "") + '"><button type="button" class="product-color-more-circle" aria-label="\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u043A\u0440\u044B\u0442\u044B\u0435 \u0446\u0432\u0435\u0442\u0430" aria-haspopup="listbox" aria-expanded="false">+0</button><span class="product-color-more-popover" role="listbox" tabindex="-1">' + head + rows + "</span></span>";
}
function buildProductColorsAdaptiveRow(colors, headingLine) {
  const arr = Array.isArray(colors) ? colors : [];
  if (!arr.length) return "";
  let row = "";
  arr.forEach(function(c) {
    row += renderProductSwatchButton(c);
  });
  const overflow = renderProductColorOverflowPopover(arr, headingLine);
  const total = '<span class="product-size-colors-total" title="\u0412\u0441\u0435\u0433\u043E \u043E\u0442\u0442\u0435\u043D\u043A\u043E\u0432">' + escapeHtml(colorCountLabelRu(arr.length)) + "</span>";
  return '<div class="product-size-colors-adaptive"><div class="product-size-colors-track-clip"><div class="product-size-colors-track">' + row + "</div></div>" + overflow + total + "</div>";
}
function buildVariantsHtml(variants) {
  if (!Array.isArray(variants) || !variants.length) return "";
  const active = variants.filter(function(v) {
    return v.is_active !== false;
  });
  if (!active.length) return "";
  const bySize = {};
  active.forEach(function(v) {
    if (!v.size_value) return;
    if (!bySize[v.size_value]) {
      bySize[v.size_value] = { hint: v.size_equivalent_hint ? String(v.size_equivalent_hint) : "" };
    } else if (!bySize[v.size_value].hint && v.size_equivalent_hint) {
      bySize[v.size_value].hint = String(v.size_equivalent_hint);
    }
  });
  let html = '<div class="product-variants">';
  const sizes = sortSizeLabels(Object.keys(bySize));
  if (sizes.length) {
    html += '<div class="product-spec-group product-spec-group--sizes-colors"><p class="product-spec-heading">\u0420\u0430\u0437\u043C\u0435\u0440\u044B \u0438 \u0446\u0432\u0435\u0442\u0430</p><ul class="product-size-color-list">';
    sizes.forEach(function(size) {
      const meta = bySize[size];
      const hint = meta && meta.hint ? ' <span class="product-size-equiv">\u2248 ' + escapeHtml(meta.hint) + "</span>" : "";
      const colors = uniqueColorsForSize(active, size);
      let chips = "";
      if (!colors.length) {
        chips = '<span class="product-size-colors-empty">\u0446\u0432\u0435\u0442 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D</span>';
      } else {
        chips = buildProductColorsAdaptiveRow(colors, "\u0420\u0430\u0437\u043C\u0435\u0440 " + size);
      }
      html += '<li class="product-size-color-row"><span class="product-size-color-label">' + escapeHtml(size) + hint + '</span><div class="product-size-colors">' + chips + "</div></li>";
    });
    html += "</ul></div>";
  } else {
    const flat = uniqueColorsAll(active);
    if (flat.length) {
      html += '<div class="product-spec-group product-spec-group--sizes-colors"><p class="product-spec-heading">\u0426\u0432\u0435\u0442\u0430</p><div class="product-size-color-row product-size-color-row--solo"><div class="product-size-colors">' + buildProductColorsAdaptiveRow(flat, "\u0412\u0441\u0435 \u0446\u0432\u0435\u0442\u0430") + "</div></div></div>";
    }
  }
  html += "</div>";
  return html;
}
function buildAttributesHtml(attributes) {
  if (!Array.isArray(attributes) || !attributes.length) return "";
  let html = '<div class="product-spec-group product-spec-group--attributes"><p class="product-spec-heading">\u0425\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043A\u0438</p><ul class="product-attr-rows">';
  attributes.forEach((attr) => {
    if (!attr || !attr.name && !attr.value) return;
    const name = (attr.name != null ? String(attr.name).trim() : "") || "\u2014";
    const rawVal = attr.value != null ? String(attr.value) : "";
    const valueInner = rawVal.trim() ? formatProductSpecMultilineHtml(rawVal) : '<p class="product-spec-para">\u2014</p>';
    html += '<li class="product-attr-row"><span class="product-attr-name">' + escapeHtml(name) + ':</span><div class="product-attr-value">' + valueInner + "</div></li>";
  });
  html += "</ul></div>";
  return html;
}
async function getProductsByIds(ids) {
  try {
    const results = await Promise.all(ids.map(async (id) => {
      const r = await fetch("/api/product/" + id);
      if (!r.ok) return null;
      return r.json();
    }));
    return results.filter(Boolean);
  } catch {
    return [];
  }
}
function getProductImage(product) {
  if (!product) return "/img/item.png";
  if (Array.isArray(product.images) && product.images.length) {
    const primary = product.images.find((i) => i.is_primary) || product.images[0];
    const u = primary ? primary.url || "" : "";
    const clean = sanitizeProductImageUrl(u);
    return clean || "/img/item.png";
  }
  return "/img/item.png";
}
function listsPush() {
  if (window.KpvsListsSync) window.KpvsListsSync.push();
}
function listsPushNow() {
  if (window.KpvsListsSync) window.KpvsListsSync.pushNow();
}
function refreshProductButtons() {
  if (!currentProductId) return;
  const favorites = getFavorites();
  const cart = getCart();
  const isFavorite = favorites.some((i) => i.id === currentProductId);
  const isInCart = cart.some((i) => i.id === currentProductId);
  document.querySelectorAll(".favorite-action-btn").forEach((btn) => {
    btn.textContent = isFavorite ? BTN_REMOVE_FAVORITE : BTN_ADD_FAVORITE;
    btn.classList.toggle("in-favorites", isFavorite);
  });
  document.querySelectorAll(".cart-action-btn").forEach((btn) => {
    btn.textContent = isInCart ? BTN_REMOVE_CART : BTN_ADD_CART;
    btn.classList.toggle("in-cart", isInCart);
  });
}
function toggleCart(productId, buttonElement) {
  const id = Number(productId);
  if (!Number.isFinite(id)) return;
  let cart = getCart();
  const idx = cart.findIndex((i) => Number(i.id) === id);
  if (idx === -1) {
    cart.push({ id, source: "product" });
    localStorage.setItem("cart", JSON.stringify(cart));
    listsPushNow();
    if (buttonElement) {
      buttonElement.textContent = BTN_REMOVE_CART;
      buttonElement.classList.add("in-cart");
    }
  } else {
    cart.splice(idx, 1);
    localStorage.setItem("cart", JSON.stringify(cart));
    listsPushNow();
    if (buttonElement) {
      buttonElement.textContent = BTN_ADD_CART;
      buttonElement.classList.remove("in-cart");
    }
  }
  refreshProductButtons();
  document.querySelectorAll('#kpvs-favorites-modal [data-action="toggle-cart"]').forEach((btn) => {
    const pid = Number(btn.dataset && btn.dataset.productId);
    if (!Number.isFinite(pid)) return;
    const inCart = getCart().some((i) => Number(i.id) === pid);
    btn.textContent = inCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443";
    btn.classList.toggle("in-cart", inCart);
  });
}
function toggleCartFromModal(productId, buttonElement) {
  toggleCart(productId, buttonElement);
}
function toggleFavorite(productId, buttonElement) {
  let favorites = getFavorites();
  const wasFavorite = favorites.some((i) => i.id === productId);
  if (wasFavorite) {
    favorites = favorites.filter((i) => i.id !== productId);
  } else {
    favorites.push({ id: productId, source: "product" });
  }
  localStorage.setItem("favorites", JSON.stringify(favorites));
  listsPushNow();
  const btn = buttonElement || document.querySelector(".favorite-action-btn");
  if (btn) {
    btn.textContent = wasFavorite ? BTN_ADD_FAVORITE : BTN_REMOVE_FAVORITE;
    btn.classList.toggle("in-favorites", !wasFavorite);
  }
  refreshProductButtons();
}
function removeFromFavorites(productId) {
  localStorage.setItem("favorites", JSON.stringify(getFavorites().filter((i) => i.id !== productId)));
  listsPushNow();
  refreshProductButtons();
}
function removeFromCart(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id)) return;
  localStorage.setItem("cart", JSON.stringify(getCart().filter((i) => Number(i.id) !== id)));
  listsPushNow();
  refreshProductButtons();
  document.querySelectorAll('#kpvs-favorites-modal [data-action="toggle-cart"]').forEach((btn) => {
    const pid = Number(btn.dataset && btn.dataset.productId);
    if (!Number.isFinite(pid)) return;
    const inCart = getCart().some((i) => Number(i.id) === pid);
    btn.textContent = inCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443";
    btn.classList.toggle("in-cart", inCart);
  });
}
function getFavorites() {
  try {
    const raw = localStorage.getItem("favorites");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (typeof item === "number" || typeof item === "string") return { id: Number(item), source: "product" };
      return { id: Number(item.id), source: item.source || "product" };
    }).filter((item) => Number.isFinite(item.id));
  } catch {
    return [];
  }
}
function getCart() {
  try {
    const raw = localStorage.getItem("cart");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (typeof item === "number" || typeof item === "string") return { id: Number(item), source: "product" };
      return { id: Number(item.id), source: item.source || "product" };
    }).filter((item) => Number.isFinite(item.id));
  } catch {
    return [];
  }
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
  const base = siteOrigin();
  const path = "/product.html";
  const slug = product && product.slug != null ? String(product.slug).trim() : "";
  const id = product && product.id != null ? Number(product.id) : NaN;
  if (slug) return base + path + "?slug=" + encodeURIComponent(slug);
  if (Number.isFinite(id)) return base + path + "?id=" + encodeURIComponent(String(id));
  return base + path;
}
function priceInquiryMailLinesForProduct(product) {
  const p = product && typeof product === "object" ? product : {};
  const name = p.name != null ? String(p.name).trim() : "";
  const art = p.art != null ? String(p.art).trim() : "";
  const slug = p.slug != null ? String(p.slug).trim() : "";
  const id = p.id != null && Number.isFinite(Number(p.id)) ? Number(p.id) : null;
  const host = typeof window !== "undefined" && window.location && window.location.hostname ? String(window.location.hostname) : "";
  const siteRef = host || "\u0441\u0430\u0439\u0442 \u041A\u041F\u0412\u0421";
  const lines = [
    "\u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C!",
    "",
    "\u041F\u0440\u043E\u0448\u0443 \u043A\u043E\u043C\u043C\u0435\u0440\u0447\u0435\u0441\u043A\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 (\u0446\u0435\u043D\u0443) \u043F\u043E \u0442\u043E\u0432\u0430\u0440\u0443, \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0441 " + siteRef + ".",
    "",
    "\u0422\u043E\u0432\u0430\u0440:",
    "\u2014 \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435: " + (name || "\u2014"),
    "\u2014 \u0410\u0440\u0442\u0438\u043A\u0443\u043B: " + (art || "\u2014"),
    "\u2014 \u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0442\u043E\u0432\u0430\u0440\u0430: " + productPageAbsoluteUrl(p)
  ];
  if (id != null && !slug) {
    lines.push("\u2014 \u0418\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 (id): " + id);
  }
  lines.push("", "\u041F\u0440\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 \u0443\u0442\u043E\u0447\u043D\u044E \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E, \u0444\u0430\u0441\u043E\u0432\u043A\u0443 \u0438 \u0441\u0440\u043E\u043A.", "\u0421\u043F\u0430\u0441\u0438\u0431\u043E!");
  return lines.join("\n");
}
function inquirePrice(product) {
  const p = product && typeof product === "object" ? product : {};
  const name = p.name != null ? String(p.name).trim() : "";
  const subjectBase = "\u041A\u041F\u0412\u0421 \u2014 \u0437\u0430\u043F\u0440\u043E\u0441 \u0446\u0435\u043D\u044B";
  const subjectText = name ? subjectBase + ": " + name : subjectBase;
  const body = priceInquiryMailLinesForProduct(p);
  window.location.href = "mailto:kpvssales@gmail.com?subject=" + encodeURIComponent(subjectText) + "&body=" + encodeURIComponent(body);
}
function inquirePriceFromCart() {
  const cart = getCart();
  if (!cart.length) return;
  getProductsByIds(cart.map((i) => i.id)).then((products) => {
    const list = products.filter(Boolean);
    if (!list.length) return;
    const host = typeof window !== "undefined" && window.location && window.location.hostname ? String(window.location.hostname) : "";
    const siteRef = host || "\u0441\u0430\u0439\u0442 \u041A\u041F\u0412\u0421";
    const blocks = list.map(function(p, idx) {
      const n = idx + 1;
      return [
        n + ") " + (p.name != null && String(p.name).trim() ? String(p.name).trim() : "\u0422\u043E\u0432\u0430\u0440"),
        "   \u0410\u0440\u0442\u0438\u043A\u0443\u043B: " + (p.art != null && String(p.art).trim() ? String(p.art).trim() : "\u2014"),
        "   \u0421\u0441\u044B\u043B\u043A\u0430: " + productPageAbsoluteUrl(p)
      ].join("\n");
    });
    const body = [
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
    const subject = encodeURIComponent("\u041A\u041F\u0412\u0421 \u2014 \u0437\u0430\u043F\u0440\u043E\u0441 \u0446\u0435\u043D \u043F\u043E \u043A\u043E\u0440\u0437\u0438\u043D\u0435 (" + list.length + " \u043F\u043E\u0437.)");
    window.location.href = "mailto:kpvssales@gmail.com?subject=" + subject + "&body=" + encodeURIComponent(body);
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
  const ids = favorites.map((i) => i.id);
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "kpvs-favorites-modal";
  if (!ids.length) {
    modal.innerHTML = `
            <div class="modal-content modal-content--cart-favorites">
                <div class="modal-header"><h2>\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div>
                <div class="modal-body"></div>
            </div>`;
    document.body.appendChild(modal);
    if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
    setTimeout(() => modal.classList.add("show"), 10);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.kpvsDismissTopModal(modal);
    });
    return;
  }
  getProductsByIds(ids).then((products) => {
    if (window.KpvsListsSync && window.KpvsListsSync.persistPrunedList) {
      window.KpvsListsSync.persistPrunedList("favorites", favorites, products);
      refreshProductButtons();
    }
    const itemsHtml = products.filter(function(p) {
      return p && p.id;
    }).map(function(p) {
      const isInCart = getCart().some(function(i) {
        return i.id === p.id;
      });
      const imgSrc = getProductImage(p);
      const safeSrc = escapeAttr(imgSrc);
      const disp = escapeHtml(p.name || "\u0422\u043E\u0432\u0430\u0440");
      const altA = escapeAttr(p.name || "\u0422\u043E\u0432\u0430\u0440");
      const pid = Number(p.id);
      const artRaw = p.art != null ? String(p.art).trim() : "";
      const artHtml = artRaw ? '<p class="modal-item-art">' + escapeHtml(artRaw) + "</p>" : "";
      return '<div class="modal-item" data-product-id="' + pid + '"><img src="' + safeSrc + '" alt="' + altA + '" class="modal-item-img"><div class="modal-item-info"><h3>' + disp + "</h3>" + artHtml + '<div class="modal-item-actions"><button type="button" class="btn btn--primary btn--small ' + (isInCart ? "in-cart" : "") + '" data-action="toggle-cart" data-product-id="' + pid + '">' + (isInCart ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u043A\u043E\u0440\u0437\u0438\u043D\u044B" : "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0443") + '</button><button type="button" class="btn btn--danger btn--small" data-action="remove-favorite" data-product-id="' + pid + '">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button></div></div></div>';
    }).join("");
    const favBody = itemsHtml ? '<div class="modal-items">' + itemsHtml + "</div>" : "";
    modal.innerHTML = '<div class="modal-content modal-content--cart-favorites"><div class="modal-header"><h2>\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + favBody + "</div></div>";
    document.body.appendChild(modal);
    if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
    setTimeout(() => modal.classList.add("show"), 10);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.kpvsDismissTopModal(modal);
    });
    modal.querySelectorAll('[data-action="toggle-cart"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleCartFromModal(Number(btn.dataset.productId), btn);
      });
    });
    modal.querySelectorAll('[data-action="remove-favorite"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromFavorites(Number(btn.dataset.productId));
        const item = btn.closest(".modal-item");
        if (item) item.remove();
        if (!modal.querySelector(".modal-item")) {
          modal.querySelector(".modal-body").innerHTML = "";
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
  const ids = cart.map((i) => i.id);
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "kpvs-cart-modal";
  if (!ids.length) {
    modal.innerHTML = `
            <div class="modal-content modal-content--cart-favorites">
                <div class="modal-header"><h2>\u041A\u043E\u0440\u0437\u0438\u043D\u0430</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div>
                <div class="modal-body"></div>
            </div>`;
    document.body.appendChild(modal);
    if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
    setTimeout(() => modal.classList.add("show"), 10);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.kpvsDismissTopModal(modal);
    });
    return;
  }
  getProductsByIds(ids).then((products) => {
    if (window.KpvsListsSync && window.KpvsListsSync.persistPrunedList) {
      window.KpvsListsSync.persistPrunedList("cart", cart, products);
      refreshProductButtons();
    }
    const itemsHtml = products.filter(function(p) {
      return p && p.id;
    }).map(function(p) {
      const imgSrc = getProductImage(p);
      const safeSrc = escapeAttr(imgSrc);
      const disp = escapeHtml(p.name || "\u0422\u043E\u0432\u0430\u0440");
      const altA = escapeAttr(p.name || "\u0422\u043E\u0432\u0430\u0440");
      const pid = Number(p.id);
      const artRaw = p.art != null ? String(p.art).trim() : "";
      const artHtml = artRaw ? '<p class="modal-item-art">' + escapeHtml(artRaw) + "</p>" : "";
      return '<div class="modal-item" data-product-id="' + pid + '"><img src="' + safeSrc + '" alt="' + altA + '" class="modal-item-img"><div class="modal-item-info"><h3>' + disp + "</h3>" + artHtml + '<div class="modal-item-actions"><button type="button" class="btn btn--danger btn--small" data-action="remove-from-cart" data-product-id="' + pid + '">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button></div></div></div>';
    }).join("");
    const cartMain = itemsHtml ? '<div class="modal-items">' + itemsHtml + '</div><div class="cart-actions"><button type="button" class="cart-inquire-btn" data-action="cart-inquire-all">\u0423\u0437\u043D\u0430\u0442\u044C \u0446\u0435\u043D\u0443 \u043D\u0430 \u0432\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B</button></div>' : "";
    modal.innerHTML = '<div class="modal-content modal-content--cart-favorites"><div class="modal-header"><h2>\u041A\u043E\u0440\u0437\u0438\u043D\u0430</h2><button type="button" class="modal-close ui-xbtn" onclick="kpvsDismissTopModal(this)" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">&times;</button></div><div class="modal-body">' + cartMain + "</div></div>";
    document.body.appendChild(modal);
    if (window.KpvsModalOverlay) window.KpvsModalOverlay.lock();
    setTimeout(() => modal.classList.add("show"), 10);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.kpvsDismissTopModal(modal);
    });
    modal.querySelectorAll('[data-action="remove-from-cart"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromCart(Number(btn.dataset.productId));
        const item = btn.closest(".modal-item");
        if (item) item.remove();
        if (!modal.querySelector(".modal-item")) {
          modal.querySelector(".modal-body").innerHTML = "";
        }
      });
    });
    const inquireAll = modal.querySelector('[data-action="cart-inquire-all"]');
    if (inquireAll) {
      inquireAll.addEventListener("click", function(e) {
        e.stopPropagation();
        window.kpvsDismissTopModal(modal);
        inquirePriceFromCart();
      });
    }
  });
}
function openMap() {
  window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("\u0411\u0440\u0435\u0441\u0442, \u0443\u043B. \u043B-\u0442\u0430 \u0420\u044F\u0431\u0446\u0435\u0432\u0430, 44"), "_blank");
}
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("kpvs-lists-synced", () => {
    refreshProductButtons();
  });
  const bootProduct = () => loadProduct();
  if (window.KpvsListsSync && window.KpvsListsSync.pull) {
    window.KpvsListsSync.pull().finally(bootProduct);
  } else {
    bootProduct();
  }
  try {
    const el = document.querySelector("[data-account-action]");
    if (el) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      el.setAttribute("href", "/login.html?mode=user&next=" + next);
      fetch("/api/user/auth/me", { credentials: "include" }).then((r) => {
        const showLoginBtn = () => {
          el.className = "btn btn--primary site-account-login-btn";
          el.removeAttribute("title");
          el.setAttribute("aria-label", "\u0412\u043E\u0439\u0442\u0438");
          el.textContent = "\u0412\u043E\u0439\u0442\u0438";
        };
        if (!r.ok) {
          showLoginBtn();
          return;
        }
        return r.json().then((me) => {
          if (me && me.id) return;
          showLoginBtn();
        });
      }).catch(() => {
      });
    }
  } catch {
  }
  const logo = document.querySelector(".section #logo");
  if (logo && !logo.closest("a")) {
    logo.addEventListener("click", () => {
      window.location.href = "welcome.html";
    });
  }
  const favoritesLink = document.getElementById("favorites-link");
  if (favoritesLink) favoritesLink.addEventListener("click", openFavoritesModal);
  const cartLink = document.getElementById("cart");
  if (cartLink) cartLink.addEventListener("click", openCartModal);
  document.querySelectorAll(".footer-contact").forEach((contact) => {
    if (contact.textContent.includes("\u0443\u043B.")) {
      contact.addEventListener("click", openMap);
    } else if (contact.textContent.includes("+375")) {
      contact.addEventListener("click", () => {
        window.location.href = "tel:+375162580931";
      });
    } else if (contact.textContent.includes("@")) {
      contact.addEventListener("click", () => {
        window.location.href = "mailto:kpvssales@gmail.com";
      });
    }
  });
});
