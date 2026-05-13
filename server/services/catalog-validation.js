const ALLOWED_PRODUCT_GENDERS = ["mens", "womens", "unisex"];
function isSafeProductImageUrl(url) {
  const s = String(url || "").trim();
  if (!s || s.length > 2048) return false;
  const head = s.slice(0, 16).toLowerCase();
  if (head.startsWith("javascript:") || head.startsWith("data:") || head.startsWith("vbscript:")) return false;
  if (s.startsWith("/")) return !s.startsWith("//");
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.username || u.password) return false;
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  return false;
}
function normalizeProductGenderInPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const raw = payload.gender;
  if (raw == null || raw === "") {
    payload.gender = null;
    return;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) {
    payload.gender = null;
    return;
  }
  const legacy = { male: "mens", female: "womens" };
  payload.gender = legacy[s] || s;
}
function validateProductPayload(payload) {
  if (!payload || typeof payload !== "object") return ["\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0442\u0435\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430"];
  normalizeProductGenderInPayload(payload);
  const errors = [];
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const art = typeof payload.art === "string" ? payload.art.trim().toUpperCase() : "";
  if (!name) errors.push("\u041F\u043E\u043B\u0435 name \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
  if (!art) errors.push("\u041F\u043E\u043B\u0435 art \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
  else if (!/^[A-Z0-9-]+$/.test(art)) {
    errors.push("\u041F\u043E\u043B\u0435 art \u0434\u043E\u043B\u0436\u043D\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0433\u043B\u0430\u0432\u043D\u044B\u0435 \u0431\u0443\u043A\u0432\u044B, \u0446\u0438\u0444\u0440\u044B \u0438 \u0434\u0435\u0444\u0438\u0441");
  }
  if (payload.gender && !ALLOWED_PRODUCT_GENDERS.includes(payload.gender)) {
    errors.push("\u041F\u043E\u043B\u0435 gender: mens, womens \u0438\u043B\u0438 unisex");
  }
  if (payload.season != null && String(payload.season).trim() !== "") {
    const sk = String(payload.season).trim().toLowerCase();
    const allowedSeasons = new Set(["\u0437\u0438\u043C\u0430", "\u043B\u0435\u0442\u043E", "\u0434\u0435\u043C\u0438\u0441\u0435\u0437\u043E\u043D", "\u0432\u0441\u0435\u0441\u0435\u0437\u043E\u043D\u043D\u044B\u0439"]);
    if (!allowedSeasons.has(sk)) {
      errors.push("\u041F\u043E\u043B\u0435 season: \u0437\u0438\u043C\u0430, \u043B\u0435\u0442\u043E, \u0434\u0435\u043C\u0438\u0441\u0435\u0437\u043E\u043D \u0438\u043B\u0438 \u0432\u0441\u0435\u0441\u0435\u0437\u043E\u043D\u043D\u044B\u0439");
    } else {
      payload.season = sk;
    }
  }
  if (payload.slug !== void 0 && payload.slug && typeof payload.slug === "string") {
    const slug = payload.slug.trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      errors.push("Slug \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u0440\u043E\u0447\u043D\u044B\u0435 \u043B\u0430\u0442\u0438\u043D\u0441\u043A\u0438\u0435 \u0431\u0443\u043A\u0432\u044B, \u0446\u0438\u0444\u0440\u044B \u0438 \u0434\u0435\u0444\u0438\u0441\u044B");
    }
  }
  if (payload.images !== void 0) {
    if (!Array.isArray(payload.images)) errors.push("\u041F\u043E\u043B\u0435 images \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C");
    else if (payload.images.length > 30) errors.push("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439 (\u043C\u0430\u043A\u0441. 30)");
    else
      payload.images.forEach((img) => {
        if (!img || typeof img !== "object" || !img.url || typeof img.url !== "string") {
          errors.push("\u041A\u0430\u0436\u0434\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 images \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043F\u043E\u043B\u0435 url (\u0441\u0442\u0440\u043E\u043A\u0430)");
        } else if (!isSafeProductImageUrl(img.url)) {
          errors.push("\u041F\u043E\u043B\u0435 images.url: \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0443\u0442\u0438 (/...) \u0438\u043B\u0438 http(s) URL");
        }
      });
  }
  if (payload.variants !== void 0 && !Array.isArray(payload.variants)) errors.push("\u041F\u043E\u043B\u0435 variants \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C");
  if (payload.attributes !== void 0 && !Array.isArray(payload.attributes)) errors.push("\u041F\u043E\u043B\u0435 attributes \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C");
  if (payload.collections !== void 0) {
    if (!Array.isArray(payload.collections)) errors.push("\u041F\u043E\u043B\u0435 collections \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C");
    else
      payload.collections.forEach((c) => {
        if (!c || typeof c !== "object" || !Number.isFinite(Number(c.id))) {
          errors.push("\u041A\u0430\u0436\u0434\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 collections \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C id (\u0447\u0438\u0441\u043B\u043E)");
        }
      });
  }
  return errors;
}
module.exports = {
  ALLOWED_PRODUCT_GENDERS,
  isSafeProductImageUrl,
  normalizeProductGenderInPayload,
  validateProductPayload
};
