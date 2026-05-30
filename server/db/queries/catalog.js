const MEDIA_PUBLIC_BASE = String(process.env.PUBLIC_URL || process.env.MEDIA_CDN_BASE || "").replace(/\/$/, "");

function publicMediaUrl(url) {
  if (url == null) return url;
  const u = String(url).trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (!MEDIA_PUBLIC_BASE) return u.startsWith("/") ? u : "/" + u;
  return MEDIA_PUBLIC_BASE + (u.startsWith("/") ? u : "/" + u);
}

function mapProductRowMedia(row) {
  if (!row || typeof row !== "object") return row;
  if (row.image != null && String(row.image).trim() !== "") row.image = publicMediaUrl(row.image);
  if (row.collections != null && typeof row.collections === "string") {
    try {
      const parsed = JSON.parse(row.collections);
      row.collections = Array.isArray(parsed) ? parsed : [];
    } catch {
      row.collections = [];
    }
  }
  if (Array.isArray(row.images)) {
    row.images = row.images.map((img) => {
      if (!img || typeof img !== "object") return img;
      const copy = { ...img };
      if (copy.url != null && String(copy.url).trim() !== "") copy.url = publicMediaUrl(copy.url);
      return copy;
    });
  }
  return row;
}

const { slugify } = require("../lib/slugify");
const { otherScalesHintSubquery, allProductFields } = require("../lib/sql-constants");
const { buildProductListWhere } = require("../lib/product-list-filters");
const { storedSizeIdForVariant } = require("./sizes");

const CATALOG_ROOT_SLUG = "catalog-root";

async function getCatalogRootId(pool) {
  const r = await pool.query(
    "SELECT id FROM categories WHERE lower(btrim(slug::text)) = lower(btrim($1::text)) LIMIT 1",
    [CATALOG_ROOT_SLUG]
  );
  return r.rows.length ? Number(r.rows[0].id) : null;
}

async function ensureCategoryHierarchy(pool) {
  const rootId = await getCatalogRootId(pool);
  if (!rootId) return;
  await pool.query(`UPDATE categories SET parent_id = $1 WHERE parent_id IS NULL AND id <> $1`, [rootId]);
}

function rollupCategoryProductCounts(node) {
  const direct = Number(node.direct_products_count) || 0;
  let childTotal = 0;
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((ch) => {
    childTotal += rollupCategoryProductCounts(ch);
  });
  node.products_count = direct + childTotal;
  node.is_leaf = children.length === 0;
  return node.products_count;
}

function publicCategoryRoots(forest) {
  if (!Array.isArray(forest) || !forest.length) return [];
  if (forest.length === 1 && forest[0].slug === CATALOG_ROOT_SLUG) {
    return forest[0].children || [];
  }
  return forest.filter((r) => r.slug !== CATALOG_ROOT_SLUG);
}

async function getCategories(pool) {
  const result = await pool.query(`
    WITH RECURSIVE cat_tree AS (
        SELECT id, name, slug, parent_id, sort_order, 0 AS depth
        FROM categories
        WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, c.name, c.slug, c.parent_id, c.sort_order, ct.depth + 1
        FROM categories c
        JOIN cat_tree ct ON c.parent_id = ct.id
    )
    SELECT
        ct.id,
        ct.name,
        ct.slug,
        ct.parent_id,
        ct.sort_order,
        ct.depth,
        COALESCE(pc.products_count, 0) AS direct_products_count
    FROM cat_tree ct
    LEFT JOIN (
        SELECT category_id, COUNT(*)::int AS products_count
        FROM products
        WHERE is_active = TRUE
        GROUP BY category_id
    ) pc ON pc.category_id = ct.id
    ORDER BY ct.depth, ct.sort_order, ct.id
  `);
  const map = new Map();
  result.rows.forEach((row) => {
    map.set(row.id, {
      ...row,
      direct_products_count: Number(row.direct_products_count) || 0,
      products_count: Number(row.direct_products_count) || 0,
      children: []
    });
  });
  result.rows.forEach((row) => {
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id).children.push(map.get(row.id));
    }
  });
  const forest = Array.from(map.values()).filter((r) => !r.parent_id);
  forest.forEach((root) => rollupCategoryProductCounts(root));
  return publicCategoryRoots(forest);
}

async function categoryHasChildren(pool, categoryId) {
  const r = await pool.query("SELECT 1 FROM categories WHERE parent_id = $1 LIMIT 1", [categoryId]);
  return r.rows.length > 0;
}

async function validateCategoryIdForProduct(pool, categoryId) {
  if (categoryId == null || categoryId === "") return null;
  const id = Number(categoryId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Некорректная категория");
  const r = await pool.query(
    `SELECT c.id, c.parent_id, c.slug,
            (SELECT COUNT(*)::int FROM categories ch WHERE ch.parent_id = c.id) AS child_count
     FROM categories c WHERE c.id = $1`,
    [id]
  );
  if (!r.rows.length) throw new Error("Категория не найдена");
  const row = r.rows[0];
  const rootId = await getCatalogRootId(pool);
  if (row.slug === CATALOG_ROOT_SLUG) throw new Error("Нельзя назначить товар на корневую категорию");
  if (!row.parent_id) throw new Error("У каждой категории товара должна быть родительская категория");
  if (Number(row.child_count) > 0) throw new Error("Товар можно назначить только конечной подкатегории");
  if (rootId && Number(row.id) === rootId) throw new Error("Нельзя назначить товар на корневую категорию");
  return id;
}

async function assertValidParentForCategory(pool, parentId, excludeId) {
  const pid = Number(parentId);
  if (!Number.isFinite(pid) || pid <= 0) throw new Error("Укажите родительскую категорию");
  const r = await pool.query("SELECT id, slug, parent_id FROM categories WHERE id = $1", [pid]);
  if (!r.rows.length) throw new Error("Родительская категория не найдена");
  if (r.rows[0].slug === CATALOG_ROOT_SLUG) return pid;
  if (excludeId != null && pid === Number(excludeId)) {
    throw new Error("Категория не может быть родителем самой себе");
  }
  if (excludeId != null) {
    const cycle = await pool.query(
      `WITH RECURSIVE anc AS (
          SELECT id, parent_id FROM categories WHERE id = $1
          UNION ALL
          SELECT c.id, c.parent_id FROM categories c
          INNER JOIN anc ON c.id = anc.parent_id
       )
       SELECT 1 FROM anc WHERE id = $2 LIMIT 1`,
      [pid, Number(excludeId)]
    );
    if (cycle.rows.length) throw new Error("Недопустимый родитель: получится цикл в иерархии");
  }
  return pid;
}

async function createCategory(pool, data, ctx = {}) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Укажите название категории");
  let slug = String(data.slug || "").trim();
  if (!slug) slug = slugify(name);
  if (!slug) throw new Error("Укажите slug или более говорящее название");
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Slug может содержать только строчные латинские буквы, цифры и дефисы");
  }
  const isParent = data.is_parent_category === true || data.is_parent_category === "true" || data.is_parent_category === 1;
  let parentId;
  if (isParent) {
    if (ctx.role !== "superadmin") {
      throw new Error("Создавать родительскую категорию раздела может только суперадмин");
    }
    const rootId = await getCatalogRootId(pool);
    if (!rootId) throw new Error("Корневая категория каталога не найдена");
    parentId = rootId;
  } else {
    parentId = await assertValidParentForCategory(pool, data.parent_id, null);
  }
  const sort_order = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;
  try {
    const ins = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, parent_id, sort_order`,
      [name, slug, parentId, sort_order]
    );
    return ins.rows[0];
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("Категория с таким slug уже есть");
    throw e;
  }
}

async function updateCategory(pool, id, data) {
  const catId = Number(id);
  if (!Number.isFinite(catId) || catId <= 0) return null;
  const existing = await pool.query("SELECT id, slug FROM categories WHERE id = $1", [catId]);
  if (!existing.rows.length) return null;
  if (existing.rows[0].slug === CATALOG_ROOT_SLUG) throw new Error("Корневую категорию каталога нельзя изменить");
  const fields = [];
  const vals = [];
  let idx = 1;
  if (data.name !== void 0) {
    const name = String(data.name || "").trim();
    if (!name) throw new Error("Название не может быть пустым");
    fields.push(`name = $${idx++}`);
    vals.push(name);
  }
  if (data.slug !== void 0) {
    let slug = String(data.slug || "").trim();
    if (!slug && data.name !== void 0) slug = slugify(String(data.name || "").trim());
    if (!slug) throw new Error("Slug не может быть пустым");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error("Slug может содержать только строчные латинские буквы, цифры и дефисы");
    }
    fields.push(`slug = $${idx++}`);
    vals.push(slug);
  }
  if (data.parent_id !== void 0) {
    const parentId = await assertValidParentForCategory(pool, data.parent_id, catId);
    fields.push(`parent_id = $${idx++}`);
    vals.push(parentId);
  }
  if (data.sort_order !== void 0 && Number.isFinite(Number(data.sort_order))) {
    fields.push(`sort_order = $${idx++}`);
    vals.push(Number(data.sort_order));
  }
  if (!fields.length) {
    const cur = await pool.query(
      "SELECT id, name, slug, parent_id, sort_order FROM categories WHERE id = $1",
      [catId]
    );
    return cur.rows[0] || null;
  }
  vals.push(catId);
  try {
    const r = await pool.query(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = $${idx}
       RETURNING id, name, slug, parent_id, sort_order`,
      vals
    );
    return r.rows[0] || null;
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("Категория с таким slug уже есть");
    throw e;
  }
}

async function deleteCategory(pool, id) {
  const catId = Number(id);
  if (!Number.isFinite(catId) || catId <= 0) return false;
  const existing = await pool.query("SELECT id, slug FROM categories WHERE id = $1", [catId]);
  if (!existing.rows.length) return false;
  if (existing.rows[0].slug === CATALOG_ROOT_SLUG) throw new Error("Корневую категорию каталога нельзя удалить");
  if (await categoryHasChildren(pool, catId)) {
    throw new Error("Сначала удалите или перенесите дочерние категории");
  }
  const prod = await pool.query("SELECT 1 FROM products WHERE category_id = $1 LIMIT 1", [catId]);
  if (prod.rows.length) throw new Error("В категории есть товары — переназначьте их или удалите");
  await pool.query("DELETE FROM categories WHERE id = $1", [catId]);
  return true;
}
async function getBrands(pool) {
  const result = await pool.query("SELECT id, name, slug FROM brands ORDER BY name");
  return result.rows;
}
async function createBrand(pool, data) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0431\u0440\u0435\u043D\u0434\u0430");
  let slug = String(data.slug || "").trim();
  if (!slug) slug = slugify(name);
  if (!slug) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 slug \u0438\u043B\u0438 \u0431\u043E\u043B\u0435\u0435 \u0433\u043E\u0432\u043E\u0440\u044F\u0449\u0435\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435");
  try {
    const ins = await pool.query(
      `INSERT INTO brands (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [name, slug]
    );
    return ins.rows[0];
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("\u0411\u0440\u0435\u043D\u0434 \u0441 \u0442\u0430\u043A\u0438\u043C slug \u0443\u0436\u0435 \u0435\u0441\u0442\u044C");
    throw e;
  }
}
async function getColors(pool) {
  const result = await pool.query("SELECT id, name, hex_code FROM colors ORDER BY name");
  return result.rows;
}

function normalizeColorHex(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  let h = String(raw).trim();
  if (!h.startsWith("#")) h = "#" + h;
  if (!/^#[0-9A-Fa-f]{3}$/.test(h) && !/^#[0-9A-Fa-f]{6}$/.test(h)) {
    throw new Error("hex_code: укажите цвет в формате #RGB или #RRGGBB");
  }
  if (h.length === 4) {
    h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h.toUpperCase();
}

async function createColor(pool, data) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Укажите название цвета");
  if (name.length > 120) throw new Error("Слишком длинное название цвета");
  let hex_code = null;
  if (data.hex_code !== void 0 && data.hex_code !== null && String(data.hex_code).trim() !== "") {
    hex_code = normalizeColorHex(data.hex_code);
  }
  const dup = await pool.query(
    "SELECT id, name, hex_code FROM colors WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1",
    [name]
  );
  if (dup.rows.length) {
    const row = dup.rows[0];
    if (hex_code && (!row.hex_code || String(row.hex_code).trim() === "")) {
      const upd = await pool.query(
        "UPDATE colors SET hex_code = $1 WHERE id = $2 RETURNING id, name, hex_code",
        [hex_code, row.id]
      );
      return upd.rows[0];
    }
    return row;
  }
  try {
    const ins = await pool.query(
      "INSERT INTO colors (name, hex_code) VALUES ($1, $2) RETURNING id, name, hex_code",
      [name, hex_code]
    );
    return ins.rows[0];
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("Такой цвет уже есть");
    throw e;
  }
}
async function migrateTagsToCollectionsIfNeeded(pool) {
  const r = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'collections'
    ) AS has_coll
`);
  const row = r.rows[0];
  if (!row.has_coll) {
    await pool.query(`
        CREATE TABLE collections (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            icon TEXT,
            section TEXT NOT NULL DEFAULT 'all',
            sort_order INT NOT NULL DEFAULT 0
        )
    `);
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)");
    await pool.query(`
        CREATE TABLE product_collections (
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            PRIMARY KEY (product_id, collection_id)
        )
    `);
  }
}
async function ensureCoreCatalogTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      hex_code TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS size_types (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sizes (
      id SERIAL PRIMARY KEY,
      size_type_id INTEGER NOT NULL REFERENCES size_types(id) ON DELETE CASCADE,
      value TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      art TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
      materials TEXT,
      season TEXT,
      gender TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      icon TEXT,
      section TEXT NOT NULL DEFAULT 'all',
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_collections (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, collection_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      alt_text TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size_id INTEGER REFERENCES sizes(id) ON DELETE SET NULL,
      color_id INTEGER REFERENCES colors(id) ON DELETE SET NULL,
      art TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_attributes (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  const idxStatements = [
    "CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_uq ON brands (lower(btrim(slug::text)))",
    "CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_uq ON categories (lower(btrim(slug::text)))",
    "CREATE UNIQUE INDEX IF NOT EXISTS products_slug_uq ON products (lower(btrim(slug::text)))",
    "CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)",
    "CREATE UNIQUE INDEX IF NOT EXISTS product_variants_art_uq ON product_variants (art)"
  ];
  for (let i = 0; i < idxStatements.length; i++) {
    try {
      await pool.query(idxStatements[i]);
    } catch (e) {
      console.warn("[schema] ensureCoreCatalogTables index:", e && e.message);
    }
  }
}
async function ensureProductsEditorColumn(pool) {
  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
`);
}
async function ensureCollectionsSchema(pool) {
  await migrateTagsToCollectionsIfNeeded(pool);
  await pool.query("ALTER TABLE collections ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'all'");
  await pool.query("ALTER TABLE collections ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE collections ADD COLUMN IF NOT EXISTS icon TEXT");
  try {
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)");
  } catch (e) {
    console.warn("[schema] collections_slug_uq:", e && e.message);
  }
  try {
    await mergeDuplicateCollectionsByName(pool);
  } catch (e) {
    console.warn("[schema] mergeDuplicateCollectionsByName:", e && e.message);
  }
  await ensureCollectionUniqueIndexes(pool);
}
async function getCollections(pool) {
  const result = await pool.query(
    "SELECT id, name, slug, icon, section, sort_order FROM collections ORDER BY sort_order ASC, name ASC"
  );
  return result.rows;
}
async function getCollectionsAdmin(pool) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.slug, c.icon, c.section, c.sort_order,
        (SELECT COUNT(*)::int FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
     FROM collections c
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  return result.rows;
}
async function mergeDuplicateCollectionsByName(pool) {
  const groups = await pool.query(`
    SELECT lower(btrim(name)) AS nk, min(id) AS keep_id
    FROM collections
    GROUP BY lower(btrim(name))
    HAVING count(*) > 1
`);
  for (const g of groups.rows) {
    const keepId = Number(g.keep_id);
    const losers = await pool.query(
      "SELECT id FROM collections WHERE lower(btrim(name)) = $1 AND id <> $2 ORDER BY id",
      [g.nk, keepId]
    );
    for (const row of losers.rows) {
      const loserId = Number(row.id);
      await pool.query(
        `INSERT INTO product_collections (product_id, collection_id)
             SELECT pc.product_id, $1::int FROM product_collections pc WHERE pc.collection_id = $2::int
             ON CONFLICT (product_id, collection_id) DO NOTHING`,
        [keepId, loserId]
      );
      await pool.query("DELETE FROM product_collections WHERE collection_id = $1", [loserId]);
      await pool.query("DELETE FROM collections WHERE id = $1", [loserId]);
    }
  }
}
async function ensureCollectionUniqueIndexes(pool) {
  try {
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS collections_name_lower_uq ON collections (lower(btrim(name)))"
    );
  } catch (e) {
    console.warn("[schema] collections_name_lower_uq:", e && e.message);
  }
}
async function createCollection(pool, data) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0438");
  let slug = String(data.slug || "").trim();
  if (!slug) slug = slugify(name);
  if (!slug) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 slug \u0438\u043B\u0438 \u0431\u043E\u043B\u0435\u0435 \u0433\u043E\u0432\u043E\u0440\u044F\u0449\u0435\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E slug");
  const icon = data.icon != null && String(data.icon).trim() !== "" ? String(data.icon).trim() : null;
  const sec = String(data.section || "all").toLowerCase();
  const section = sec === "mens" || sec === "womens" || sec === "all" ? sec : "all";
  const sort_order = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;
  try {
    const r = await pool.query(
      `INSERT INTO collections (name, slug, icon, section, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, slug, icon, section, sort_order`,
      [name, slug, icon, section, sort_order]
    );
    return r.rows[0];
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u0441 \u0442\u0430\u043A\u0438\u043C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C \u0438\u043B\u0438 slug \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
    throw e;
  }
}
async function updateCollection(pool, id, data) {
  const existing = await pool.query("SELECT id FROM collections WHERE id = $1", [id]);
  if (!existing.rows.length) return null;
  const name = data.name !== void 0 ? String(data.name || "").trim() : null;
  if (name !== null && !name) throw new Error("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C");
  let slug = data.slug !== void 0 ? String(data.slug || "").trim() : null;
  if (slug !== null && !slug) {
    const nm = name !== null ? name : (await pool.query("SELECT name FROM collections WHERE id = $1", [id])).rows[0]?.name;
    slug = slugify(String(nm || "").trim()) || null;
  }
  if (slug !== null && !slug) throw new Error("Slug \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C");
  const icon = data.icon !== void 0 ? data.icon != null && String(data.icon).trim() !== "" ? String(data.icon).trim() : null : void 0;
  const sectionRaw = data.section !== void 0 ? String(data.section || "all").toLowerCase() : null;
  const section = sectionRaw === null ? null : sectionRaw === "mens" || sectionRaw === "womens" || sectionRaw === "all" ? sectionRaw : "all";
  const sort_order = data.sort_order !== void 0 && Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : null;
  const fields = [];
  const vals = [];
  let idx = 1;
  if (name !== null) {
    fields.push("name = $" + idx++);
    vals.push(name);
  }
  if (slug !== null) {
    fields.push("slug = $" + idx++);
    vals.push(slug);
  }
  if (icon !== void 0) {
    fields.push("icon = $" + idx++);
    vals.push(icon);
  }
  if (section !== null) {
    fields.push("section = $" + idx++);
    vals.push(section);
  }
  if (sort_order !== null) {
    fields.push("sort_order = $" + idx++);
    vals.push(sort_order);
  }
  if (!fields.length) {
    const r = await pool.query(
      "SELECT id, name, slug, icon, section, sort_order FROM collections WHERE id = $1",
      [id]
    );
    return r.rows[0] || null;
  }
  vals.push(id);
  try {
    const r = await pool.query(
      `UPDATE collections SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, name, slug, icon, section, sort_order`,
      vals
    );
    return r.rows[0] || null;
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u0441 \u0442\u0430\u043A\u0438\u043C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C \u0438\u043B\u0438 slug \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
    throw e;
  }
}
async function deleteCollection(pool, id) {
  const r = await pool.query("DELETE FROM collections WHERE id = $1 RETURNING id", [id]);
  return r.rowCount > 0;
}
async function getSectionCollectionsWithProducts(pool, pageGender) {
  const g = String(pageGender || "mens").toLowerCase();
  let sectionSql;
  if (g === "all") sectionSql = "(c.section = 'all' OR c.section IN ('mens','womens'))";
  else if (g === "mens" || g === "male") sectionSql = "(c.section = 'all' OR c.section = 'mens')";
  else if (g === "womens" || g === "female") sectionSql = "(c.section = 'all' OR c.section = 'womens')";
  else sectionSql = "(c.section = 'all')";
  let genderSql;
  if (g === "all") genderSql = "(p.gender IN ('mens','male','womens','female','unisex'))";
  else if (g === "mens" || g === "male") genderSql = "(p.gender IN ('mens','male','unisex'))";
  else if (g === "womens" || g === "female") genderSql = "(p.gender IN ('womens','female','unisex'))";
  else genderSql = "TRUE";
  const colRes = await pool.query(
    `SELECT c.id, c.name, c.slug, c.icon, c.sort_order
     FROM collections c
     WHERE ${sectionSql}
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  const out = [];
  for (const c of colRes.rows) {
    const pr = await pool.query(
      `SELECT p.id FROM products p
         INNER JOIN product_collections pc ON pc.product_id = p.id AND pc.collection_id = $1
         WHERE p.is_active = TRUE AND ${genderSql}
         ORDER BY p.name ASC
         LIMIT 60`,
      [c.id]
    );
    const product_ids = pr.rows.map((r) => r.id);
    if (!product_ids.length) continue;
    out.push({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      sort_order: c.sort_order,
      product_ids
    });
  }
  return out;
}
async function getProducts(pool, genderParam, options = {}) {
  const built = buildProductListWhere(genderParam, options || {});
  const { conditions, values, idx, sortField, direction, limit, offset } = built;
  const allValues = [...values, limit, offset];
  const query = `
    SELECT
        ${allProductFields},
        (
            SELECT url FROM product_images
            WHERE product_id = p.id AND is_primary = TRUE
            ORDER BY sort_order LIMIT 1
        ) AS image,
        (
            SELECT json_agg(json_build_object(
                'id', pv.id, 'art', pv.art,
                'size_id', pv.size_id, 'size_value', s.value, 'size_type', st.name,
                'size_equivalent_hint', ${otherScalesHintSubquery},
                'color_id', pv.color_id, 'color_name', col.name, 'color_hex', col.hex_code,
                'is_active', pv.is_active
            ) ORDER BY s.value, col.name)
            FROM product_variants pv
            LEFT JOIN sizes s ON pv.size_id = s.id
            LEFT JOIN size_types st ON s.size_type_id = st.id
            LEFT JOIN colors col ON pv.color_id = col.id
            WHERE pv.product_id = p.id AND pv.is_active = TRUE
        ) AS variants,
        (
            SELECT COALESCE(
                json_agg(json_build_object('id', col.id, 'name', col.name, 'slug', col.slug) ORDER BY col.name)
                FILTER (WHERE col.id IS NOT NULL),
                '[]'::json
            )
            FROM product_collections pc2
            JOIN collections col ON pc2.collection_id = col.id
            WHERE pc2.product_id = p.id
        ) AS collections
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE ${conditions.length ? conditions.join(" AND ") : "TRUE"}
    ORDER BY ${sortField} ${direction}
    LIMIT $${idx} OFFSET $${idx + 1}
`;
  const result = await pool.query(query, allValues);
  return result.rows.map(mapProductRowMedia);
}
async function getProduct(pool, identifier, options) {
  const opts = options && typeof options === "object" ? options : {};
  const includeInactive = opts.includeInactive === true;
  const isNumeric = /^\s*\d+\s*$/.test(String(identifier));
  const values = [identifier];
  let whereClause = "p.slug = $1";
  if (isNumeric) {
    values.push(Number(identifier));
    whereClause = "p.slug = $1 OR p.id = $2";
  }
  const activeClause = includeInactive ? "TRUE" : "p.is_active = TRUE";
  const query = `
    SELECT
        p.id,
        p.art,
        p.name,
        p.slug,
        p.description,
        p.materials,
        p.season,
        p.gender,
        p.is_active,
        p.created_at,
        p.updated_at,
        p.updated_by_user_id,
        uu.username AS updated_by_username,
        p.category_id,
        p.brand_id,
        c.name AS category_name,
        c.slug AS category_slug,
        c.parent_id AS category_parent_id,
        pc.name AS category_parent_name,
        pc.slug AS category_parent_slug,
        b.name AS brand_name,
        b.slug AS brand_slug,
        (
            SELECT json_agg(json_build_object(
                'id', pi.id, 'url', pi.url, 'alt_text', pi.alt_text,
                'is_primary', pi.is_primary, 'sort_order', pi.sort_order
            ) ORDER BY pi.sort_order, pi.id)
            FROM product_images pi WHERE pi.product_id = p.id
        ) AS images,
        (
            SELECT json_agg(json_build_object('id', col.id, 'name', col.name, 'slug', col.slug, 'icon', col.icon) ORDER BY col.name)
            FROM product_collections pc JOIN collections col ON pc.collection_id = col.id
            WHERE pc.product_id = p.id
        ) AS collections,
        (
            SELECT json_agg(json_build_object(
                'id', pv.id, 'art', pv.art,
                'size_id', pv.size_id, 'size_value', s.value, 'size_type', st.name,
                'size_equivalent_hint', ${otherScalesHintSubquery},
                'color_id', pv.color_id, 'color_name', col.name, 'color_hex', col.hex_code,
                'is_active', pv.is_active
            ) ORDER BY s.value, col.name)
            FROM product_variants pv
            LEFT JOIN sizes s ON pv.size_id = s.id
            LEFT JOIN size_types st ON s.size_type_id = st.id
            LEFT JOIN colors col ON pv.color_id = col.id
            WHERE pv.product_id = p.id
        ) AS variants,
        (
            SELECT json_agg(json_build_object(
                'id', pa.id, 'name', pa.name, 'value', pa.value, 'sort_order', pa.sort_order
            ) ORDER BY pa.sort_order, pa.name)
            FROM product_attributes pa WHERE pa.product_id = p.id
        ) AS attributes
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN users uu ON p.updated_by_user_id = uu.id
    WHERE (${whereClause}) AND (${activeClause})
    LIMIT 1
`;
  const result = await pool.query(query, values);
  const row = result.rows[0] || null;
  return row ? mapProductRowMedia(row) : null;
}
async function createProduct(pool, data, ctx = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const slug = data.slug && data.slug.trim() || slugify(data.name);
    const art = data.art && data.art.trim() ? data.art.trim().toUpperCase() : null;
    const editorId = ctx.editorUserId != null && Number.isFinite(Number(ctx.editorUserId)) ? Number(ctx.editorUserId) : null;
    if (art) {
      const existing = await client.query("SELECT id FROM products WHERE art = $1", [art]);
      if (existing.rows.length > 0) {
        throw new Error("\u0410\u0440\u0442\u0438\u043A\u0443\u043B \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
      }
    }
    const categoryId = await validateCategoryIdForProduct(pool, data.category_id);
    const res = await client.query(`
        INSERT INTO products (art, name, slug, description, category_id, brand_id, materials, season, gender, is_active, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
    `, [
      art,
      data.name,
      slug,
      data.description || null,
      categoryId,
      data.brand_id || null,
      data.materials || null,
      data.season || null,
      data.gender || null,
      data.is_active !== false,
      editorId
    ]);
    const productId = res.rows[0].id;
    if (Array.isArray(data.images) && data.images.length) {
      await replaceProductImages(client, productId, data.images);
    }
    if (Array.isArray(data.collections)) {
      await replaceProductCollections(client, productId, data.collections);
    }
    if (Array.isArray(data.variants) && data.variants.length) {
      await replaceProductVariants(pool, client, productId, data.variants);
    }
    if (Array.isArray(data.attributes) && data.attributes.length) {
      await replaceProductAttributes(client, productId, data.attributes);
    }
    await client.query("COMMIT");
    return getProduct(pool, String(productId), { includeInactive: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    throw err;
  } finally {
    client.release();
  }
}
async function updateProduct(pool, id, data, ctx = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const slug = data.slug && data.slug.trim() || slugify(data.name);
    const art = data.art && data.art.trim() ? data.art.trim().toUpperCase() : null;
    const editorId = ctx.editorUserId != null && Number.isFinite(Number(ctx.editorUserId)) ? Number(ctx.editorUserId) : null;
    if (art) {
      const existing = await client.query("SELECT id FROM products WHERE art = $1 AND id != $2", [art, id]);
      if (existing.rows.length > 0) {
        throw new Error("\u0410\u0440\u0442\u0438\u043A\u0443\u043B \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
      }
    }
    const categoryId = await validateCategoryIdForProduct(pool, data.category_id);
    const res = await client.query(`
        UPDATE products
        SET art = $1, name = $2, slug = $3, description = $4,
            category_id = $5, brand_id = $6, materials = $7,
            season = $8, gender = $9, is_active = $10,
            updated_at = NOW(), updated_by_user_id = $11
        WHERE id = $12
        RETURNING id
    `, [
      art,
      data.name,
      slug,
      data.description || null,
      categoryId,
      data.brand_id || null,
      data.materials || null,
      data.season || null,
      data.gender || null,
      data.is_active !== false,
      editorId,
      id
    ]);
    if (!res.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    if (Array.isArray(data.images)) {
      await replaceProductImages(client, id, data.images);
    }
    if (Array.isArray(data.collections)) {
      await replaceProductCollections(client, id, data.collections);
    }
    if (Array.isArray(data.variants)) {
      await replaceProductVariants(pool, client, id, data.variants);
    }
    if (Array.isArray(data.attributes)) {
      await replaceProductAttributes(client, id, data.attributes);
    }
    await client.query("COMMIT");
    return getProduct(pool, String(id), { includeInactive: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    throw err;
  } finally {
    client.release();
  }
}
async function deleteProduct(pool, id) {
  const result = await pool.query("DELETE FROM products WHERE id = $1", [id]);
  const deleted = result.rowCount > 0;
  if (deleted) {
    try {
      const users = require("./users");
      await users.removeProductIdFromAllUserLists(pool, id);
    } catch (e) {
      console.warn("[lists] prune after product delete:", e && e.message);
    }
  }
  return deleted;
}
async function updateProductActiveFlag(pool, id, isActive) {
  const result = await pool.query(
    "UPDATE products SET is_active = $1 WHERE id = $2 RETURNING id, is_active",
    [Boolean(isActive), id]
  );
  return result.rows[0] || null;
}
async function replaceProductImages(client, productId, images) {
  await client.query("DELETE FROM product_images WHERE product_id = $1", [productId]);
  if (!Array.isArray(images) || !images.length) return;
  const hasPrimary = images.some((i) => i.is_primary);
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const url = typeof img.url === "string" ? img.url.trim() : "";
    if (!url) continue;
    await client.query(
      "INSERT INTO product_images (product_id, url, alt_text, is_primary, sort_order) VALUES ($1,$2,$3,$4,$5)",
      [productId, url, img.alt_text || null, hasPrimary ? Boolean(img.is_primary) : i === 0, img.sort_order ?? i]
    );
  }
}
async function replaceProductCollections(client, productId, collections) {
  await client.query("DELETE FROM product_collections WHERE product_id = $1", [productId]);
  if (!Array.isArray(collections) || !collections.length) return;
  for (const col of collections) {
    const collectionId = Number(col && col.id);
    if (!Number.isFinite(collectionId) || collectionId <= 0) continue;
    await client.query(
      "INSERT INTO product_collections (product_id, collection_id) VALUES ($1,$2)",
      [productId, collectionId]
    );
  }
}
function variantSizeSortKeyFromDbValue(val) {
  if (val == null || String(val).trim() === "") return [9, 0, ""];
  const v = String(val).trim().toLowerCase().replace(/\s+/g, "");
  const rank = { "2xs": 1, xxs: 1, xs: 2, s: 3, m: 4, l: 5, xl: 6, xxl: 7, "2xl": 7, "3xl": 8 };
  if (rank[v] != null) return [0, rank[v], String(val)];
  const num = parseFloat(String(val).replace(",", "."));
  if (Number.isFinite(num)) return [1, num, String(val)];
  return [2, 0, String(val)];
}
function compareProductVariantsForSaveOrder(a, b, idToValue) {
  const va = a.size_id != null && Number.isFinite(Number(a.size_id)) ? idToValue.get(Number(a.size_id)) : "";
  const vb = b.size_id != null && Number.isFinite(Number(b.size_id)) ? idToValue.get(Number(b.size_id)) : "";
  const ka = variantSizeSortKeyFromDbValue(va);
  const kb = variantSizeSortKeyFromDbValue(vb);
  for (let i = 0; i < 3; i++) {
    if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  }
  const ca = a.color_id != null && Number.isFinite(Number(a.color_id)) ? Number(a.color_id) : 0;
  const cb = b.color_id != null && Number.isFinite(Number(b.color_id)) ? Number(b.color_id) : 0;
  if (ca !== cb) return ca - cb;
  return String(a.art || "").localeCompare(String(b.art || ""), "ru");
}
async function replaceProductVariants(pool, client, productId, variants) {
  await client.query("DELETE FROM product_variants WHERE product_id = $1", [productId]);
  if (!Array.isArray(variants) || !variants.length) return;
  const prepared = [];
  for (const v of variants) {
    const art = v.art && String(v.art).trim() ? String(v.art).trim().toUpperCase() : null;
    if (!art) continue;
    prepared.push(v);
  }
  if (!prepared.length) return;
  const sizeIds = Array.from(
    new Set(
      prepared.map(function(v) {
        return v.size_id != null && Number.isFinite(Number(v.size_id)) ? Number(v.size_id) : null;
      }).filter(function(id) {
        return id != null && id > 0;
      })
    )
  );
  const idToValue = new Map();
  if (sizeIds.length) {
    const res = await client.query("SELECT id, value FROM sizes WHERE id = ANY($1::int[])", [sizeIds]);
    res.rows.forEach(function(row) {
      idToValue.set(Number(row.id), row.value);
    });
  }
  prepared.sort(function(a, b) {
    return compareProductVariantsForSaveOrder(a, b, idToValue);
  });
  for (const v of prepared) {
    const art = v.art && String(v.art).trim() ? String(v.art).trim().toUpperCase() : null;
    if (!art) continue;
    const rawSid = v.size_id != null && Number.isFinite(Number(v.size_id)) ? Number(v.size_id) : null;
    const storeSid = rawSid != null ? await storedSizeIdForVariant(pool, rawSid, client) : null;
    await client.query(
      `INSERT INTO product_variants (product_id, size_id, color_id, art, is_active)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (art) DO UPDATE SET size_id=$2, color_id=$3, is_active=$5`,
      [productId, storeSid, v.color_id || null, art, v.is_active !== false]
    );
  }
}
async function replaceProductAttributes(client, productId, attributes) {
  await client.query("DELETE FROM product_attributes WHERE product_id = $1", [productId]);
  if (!Array.isArray(attributes) || !attributes.length) return;
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (!attr.name || !attr.value) continue;
    await client.query(
      "INSERT INTO product_attributes (product_id, name, value, sort_order) VALUES ($1,$2,$3,$4)",
      [productId, attr.name.trim(), attr.value.trim(), attr.sort_order ?? i]
    );
  }
}

const MAX_REFERENCE_MATERIAL_NAME = 120;

async function ensureReferenceMaterialsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reference_materials (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  try {
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS reference_materials_name_lower_uq ON reference_materials (lower(btrim(name)))"
    );
  } catch (e) {
    console.warn("[schema] reference_materials_name_lower_uq:", e && e.message);
  }
}

async function listReferenceMaterials(pool) {
  const r = await pool.query(
    "SELECT id, name, sort_order FROM reference_materials ORDER BY sort_order ASC, lower(name) ASC"
  );
  return r.rows;
}

async function createReferenceMaterial(pool, body) {
  const raw = body && typeof body === "object" ? body.name : "";
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name) throw new Error("Укажите название материала");
  if (name.length > MAX_REFERENCE_MATERIAL_NAME) throw new Error("Слишком длинное название");
  try {
    const next = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM reference_materials");
    const sortOrder = next.rows.length ? Number(next.rows[0].n) || 0 : 0;
    const ins = await pool.query(
      "INSERT INTO reference_materials (name, sort_order) VALUES ($1, $2) RETURNING id, name, sort_order",
      [name, sortOrder]
    );
    return ins.rows[0];
  } catch (e) {
    if (e && e.code === "23505") throw new Error("Такой материал уже есть в справочнике");
    throw e;
  }
}

async function searchProducts(pool, q, gender, category, limit = 20, offset = 0) {
  return getProducts(pool, gender, {
    category,
    q,
    limit: Number(limit) || 20,
    offset: Number(offset) || 0
  });
}
module.exports.publicMediaUrl = publicMediaUrl;
module.exports.mapProductRowMedia = mapProductRowMedia;
module.exports.CATALOG_ROOT_SLUG = CATALOG_ROOT_SLUG;
module.exports.getCatalogRootId = getCatalogRootId;
module.exports.ensureCategoryHierarchy = ensureCategoryHierarchy;
module.exports.getCategories = getCategories;
module.exports.createCategory = createCategory;
module.exports.updateCategory = updateCategory;
module.exports.deleteCategory = deleteCategory;
module.exports.validateCategoryIdForProduct = validateCategoryIdForProduct;
module.exports.getBrands = getBrands;
module.exports.createBrand = createBrand;
module.exports.getColors = getColors;
module.exports.createColor = createColor;
module.exports.ensureCoreCatalogTables = ensureCoreCatalogTables;
module.exports.ensureProductsEditorColumn = ensureProductsEditorColumn;
module.exports.ensureCollectionsSchema = ensureCollectionsSchema;
module.exports.getCollections = getCollections;
module.exports.getCollectionsAdmin = getCollectionsAdmin;
module.exports.getSectionCollectionsWithProducts = getSectionCollectionsWithProducts;
module.exports.createCollection = createCollection;
module.exports.updateCollection = updateCollection;
module.exports.deleteCollection = deleteCollection;
module.exports.getProducts = getProducts;
module.exports.getProduct = getProduct;
module.exports.createProduct = createProduct;
module.exports.updateProduct = updateProduct;
module.exports.deleteProduct = deleteProduct;
module.exports.updateProductActiveFlag = updateProductActiveFlag;
module.exports.searchProducts = searchProducts;
module.exports.ensureReferenceMaterialsSchema = ensureReferenceMaterialsSchema;
module.exports.listReferenceMaterials = listReferenceMaterials;
module.exports.createReferenceMaterial = createReferenceMaterial;
