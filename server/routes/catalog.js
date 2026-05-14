const SEASONS = ["\u0437\u0438\u043C\u0430", "\u043B\u0435\u0442\u043E", "\u0434\u0435\u043C\u0438\u0441\u0435\u0437\u043E\u043D"];
const CATALOG_GENDERS = new Set(["mens", "womens", "male", "female", "all", "unisex"]);
const MAX_SEARCH_LEN = 500;
const MAX_LIMIT = 500;
const MAX_OFFSET = 1e5;
function parsePositiveInt(v, fallback, cap) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), cap);
}
function isValidProductIdentifier(id) {
  const s = String(id || "").trim();
  if (!s || s.length > 200) return false;
  if (/^\d+$/.test(s)) return Number(s) <= 2147483647;
  return /^[\p{L}\p{N}_\-./]+$/u.test(s);
}
function clipQueryParam(v, max) {
  if (v == null) return v;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function mountCatalogRoutes(app, ctx) {
  const { db } = ctx;
  app.get("/api/seasons", (req, res) => {
    res.type("application/json").json(SEASONS);
  });
  app.get("/api/categories", async (req, res) => {
    try {
      res.json(await db.getCategories());
    } catch (err) {
      console.error("GET /api/categories:", err);
      res.status(500).json({ error: "Failed to load categories" });
    }
  });
  app.get("/api/brands", async (req, res) => {
    try {
      res.json(await db.getBrands());
    } catch (err) {
      console.error("GET /api/brands:", err);
      res.status(500).json({ error: "Failed to load brands" });
    }
  });
  app.get("/api/sizes", async (req, res) => {
    try {
      const raw = req.query.category_id;
      const cid = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
      const categoryId = Number.isFinite(cid) && cid > 0 ? cid : null;
      res.json(await db.getSizes(categoryId));
    } catch (err) {
      console.error("GET /api/sizes:", err);
      res.status(500).json({ error: "Failed to load sizes" });
    }
  });
  app.get("/api/size-equivalence-buckets", async (req, res) => {
    try {
      res.json(await db.listSizeEquivalenceBuckets());
    } catch (err) {
      console.error("GET /api/size-equivalence-buckets:", err);
      res.status(500).json({ error: "Failed to load size equivalence" });
    }
  });
  app.get("/api/colors", async (req, res) => {
    try {
      res.json(await db.getColors());
    } catch (err) {
      console.error("GET /api/colors:", err);
      res.status(500).json({ error: "Failed to load colors" });
    }
  });
  app.get("/api/collections", async (req, res) => {
    try {
      res.json(await db.getCollections());
    } catch (err) {
      console.error("GET /api/collections:", err);
      res.status(500).json({ error: "Failed to load collections" });
    }
  });
  app.get("/api/section-collections/:gender", async (req, res) => {
    try {
      const g = String(req.params.gender || "").trim().toLowerCase();
      if (!CATALOG_GENDERS.has(g)) {
        return res.status(400).json({ error: "Invalid gender segment" });
      }
      res.json(await db.getSectionCollectionsWithProducts(req.params.gender));
    } catch (err) {
      console.error("GET /api/section-collections/:gender:", err);
      res.status(500).json({ error: "Failed to load section collections" });
    }
  });
  app.get("/api/products/:gender", async (req, res) => {
    try {
      const g = String(req.params.gender || "").trim().toLowerCase();
      if (!CATALOG_GENDERS.has(g)) {
        return res.status(400).json({ error: "Invalid gender segment" });
      }
      const { category, q, brand, season, color, size, size_id, color_id, collection_id, limit = 20, offset = 0 } = req.query;
      const lim = parsePositiveInt(limit, 20, MAX_LIMIT) || 20;
      const off = parsePositiveInt(offset, 0, MAX_OFFSET);
      const qClip = q != null ? clipQueryParam(q, MAX_SEARCH_LEN) : q;
      res.json(
        await db.getProducts(req.params.gender, {
          category: category != null ? clipQueryParam(category, 400) : category,
          q: qClip,
          brand: brand != null ? clipQueryParam(brand, 200) : brand,
          season: season != null ? clipQueryParam(season, 120) : season,
          color: color != null ? clipQueryParam(color, 120) : color,
          size: size != null ? clipQueryParam(size, 80) : size,
          size_id,
          color_id,
          collection_id,
          limit: lim,
          offset: off
        })
      );
    } catch (err) {
      console.error("GET /api/products/:gender:", err);
      res.status(500).json({ error: "Failed to load products" });
    }
  });
  app.get("/api/product/:identifier", async (req, res) => {
    try {
      const id = req.params.identifier;
      if (!isValidProductIdentifier(id)) {
        return res.status(400).json({ error: "Invalid product identifier" });
      }
      const product = await db.getProduct(id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (err) {
      console.error("GET /api/product/:identifier:", err);
      res.status(500).json({ error: "Failed to load product" });
    }
  });
  app.get("/api/search", async (req, res) => {
    try {
      const { q, gender, category, limit = 20, offset = 0 } = req.query;
      const qs = String(q || "").trim();
      if (!qs) return res.status(400).json({ error: "Search query is required" });
      if (qs.length > MAX_SEARCH_LEN) {
        return res.status(400).json({ error: "Search query is too long" });
      }
      const g = gender != null && String(gender).trim() !== "" ? String(gender).trim().toLowerCase() : null;
      if (g && !CATALOG_GENDERS.has(g)) {
        return res.status(400).json({ error: "Invalid gender filter" });
      }
      const lim = parsePositiveInt(limit, 20, MAX_LIMIT) || 20;
      const off = parsePositiveInt(offset, 0, MAX_OFFSET);
      res.json(await db.searchProducts(qs, g || void 0, category, lim, off));
    } catch (err) {
      console.error("GET /api/search:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });
}
module.exports = { mountCatalogRoutes };
