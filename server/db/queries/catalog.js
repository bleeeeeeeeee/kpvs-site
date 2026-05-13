const { mapProductRowMedia, mapBrandRowMedia } = require("../media-url");
const { slugify } = require("../lib/slugify");
const { otherScalesHintSubquery, allProductFields } = require("../lib/sql-constants");
const { buildProductListWhere } = require("../lib/product-list-filters");
const { storedSizeIdForVariant } = require("./sizes");
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
        COALESCE(pc.products_count, 0) AS products_count
    FROM cat_tree ct
    LEFT JOIN (
        SELECT category_id, COUNT(*) AS products_count
        FROM products
        WHERE is_active = TRUE
        GROUP BY category_id
    ) pc ON pc.category_id = ct.id
    ORDER BY ct.depth, ct.sort_order, ct.id
`);
  const map = new Map();
  result.rows.forEach((row) => {
    map.set(row.id, { ...row, products_count: Number(row.products_count), children: [] });
  });
  result.rows.forEach((row) => {
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id).children.push(map.get(row.id));
    }
  });
  return Array.from(map.values()).filter((r) => !r.parent_id);
}
async function getBrands(pool) {
  const result = await pool.query("SELECT id, name, slug, logo_url FROM brands ORDER BY name");
  return result.rows.map(mapBrandRowMedia);
}
async function createBrand(pool, data) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0431\u0440\u0435\u043D\u0434\u0430");
  let slug = String(data.slug || "").trim();
  if (!slug) slug = slugify(name);
  if (!slug) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 slug \u0438\u043B\u0438 \u0431\u043E\u043B\u0435\u0435 \u0433\u043E\u0432\u043E\u0440\u044F\u0449\u0435\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435");
  try {
    const ins = await pool.query(
      `INSERT INTO brands (name, slug, logo_url)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug, logo_url`,
      [name, slug, null]
    );
    return mapBrandRowMedia(ins.rows[0]);
  } catch (e) {
    if (String(e.code) === "23505") throw new Error("\u0411\u0440\u0435\u043D\u0434 \u0441 \u0442\u0430\u043A\u0438\u043C slug \u0443\u0436\u0435 \u0435\u0441\u0442\u044C");
    throw e;
  }
}
async function getColors(pool) {
  const result = await pool.query("SELECT id, name, hex_code FROM colors ORDER BY name");
  return result.rows;
}
async function migrateTagsToCollectionsIfNeeded(pool) {
  const r = await pool.query(`
    SELECT
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tags') AS has_tags,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'collections') AS has_coll
`);
  const row = r.rows[0];
  if (row.has_tags && !row.has_coll) {
    await pool.query("ALTER TABLE tags RENAME TO collections");
    await pool.query("ALTER TABLE product_tags RENAME TO product_collections");
    await pool.query("ALTER TABLE product_collections RENAME COLUMN tag_id TO collection_id");
    try {
      await pool.query("ALTER INDEX tags_slug_uq RENAME TO collections_slug_uq");
    } catch (e) {
      try {
        await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)");
      } catch (e2) {
        console.warn("[schema] collections_slug_uq:", e2 && e2.message);
      }
    }
  } else if (!row.has_coll) {
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
async function backfillCollectionIcons(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
        UPDATE collections AS t SET icon = m.icon
        FROM (
            VALUES
                ('popular', '\u{1F525}'),
                ('populyarnoe', '\u{1F525}'),
                ('new', '\u2728'),
                ('novinki', '\u2728'),
                ('novinka', '\u2728'),
                ('sale', '\u{1F3F7}'),
                ('skidka', '\u{1F4B8}'),
                ('aktsiya', '\u{1F4B8}'),
                ('akciya', '\u{1F4B8}'),
                ('akcia', '\u{1F4B8}'),
                ('action', '\u{1F4B8}'),
                ('discount', '\u{1F4B8}'),
                ('promo', '\u{1F4B8}'),
                ('recommend', '\u2B50'),
                ('recommended', '\u2B50'),
                ('rekomenduem', '\u2B50'),
                ('hit', '\u{1F3C6}'),
                ('bestseller', '\u{1F3C6}'),
                ('hit-prodazh', '\u{1F3C6}'),
                ('hit_prodazh', '\u{1F3C6}'),
                ('khit-prodazh', '\u{1F3C6}'),
                ('khit_prodazh', '\u{1F3C6}')
        ) AS m(slug, icon)
        WHERE lower(btrim(t.slug)) = m.slug
          AND (t.icon IS NULL OR btrim(coalesce(t.icon::text, '')) = '')
    `);
    await client.query(`
        UPDATE collections SET icon = v.icon
        FROM (VALUES
            ('\u0430\u043A\u0446\u0438\u044F', '\u{1F4B8}'),
            ('\u043D\u043E\u0432\u0438\u043D\u043A\u0438', '\u2728'),
            ('\u043D\u043E\u0432\u0438\u043D\u043A\u0430', '\u2728'),
            ('\u043F\u043E\u043F\u0443\u043B\u044F\u0440\u043D\u043E\u0435', '\u{1F525}'),
            ('\u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u043C', '\u2B50'),
            ('\u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u043E\u0432\u0430\u043D\u043E', '\u2B50'),
            ('\u0445\u0438\u0442 \u043F\u0440\u043E\u0434\u0430\u0436', '\u{1F3C6}'),
            ('\u0445\u0438\u0442', '\u{1F3C6}'),
            ('\u0432\u044B\u0433\u043E\u0434\u043D\u043E', '\u{1F3F7}'),
            ('\u0441\u043A\u0438\u0434\u043A\u0430', '\u{1F4B8}'),
            ('\u0440\u0430\u0441\u043F\u0440\u043E\u0434\u0430\u0436\u0430', '\u{1F4B8}')
        ) AS v(tag_name, icon)
        WHERE lower(btrim(collections.name)) = v.tag_name
          AND (collections.icon IS NULL OR btrim(coalesce(collections.icon::text, '')) = '')
    `);
    await client.query(`
        UPDATE collections SET icon = '\u{1F3F7}'
        WHERE icon IS NULL OR btrim(coalesce(icon::text, '')) = ''
    `);
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    console.warn("[schema] backfillCollectionIcons:", e && e.message);
  } finally {
    client.release();
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
  await pool.query(`
    INSERT INTO collections (name, slug, icon, section, sort_order)
    SELECT v.name, v.slug, v.icon, v.section, v.sort_order
    FROM (
        VALUES
            ('\u041F\u043E\u043F\u0443\u043B\u044F\u0440\u043D\u043E\u0435'::text, 'popular'::text, '\u{1F525}'::text, 'all'::text, 0::int),
            ('\u041D\u043E\u0432\u0438\u043D\u043A\u0438'::text, 'new'::text, '\u2728'::text, 'all'::text, 1::int),
            ('\u0412\u044B\u0433\u043E\u0434\u043D\u043E'::text, 'sale'::text, '\u{1F3F7}'::text, 'all'::text, 2::int),
            ('\u0410\u043A\u0446\u0438\u044F'::text, 'aktsiya'::text, '\u{1F4B8}'::text, 'all'::text, 3::int),
            ('\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u043C'::text, 'rekomenduem'::text, '\u2B50'::text, 'all'::text, 4::int),
            ('\u0425\u0438\u0442 \u043F\u0440\u043E\u0434\u0430\u0436'::text, 'hit-prodazh'::text, '\u{1F3C6}'::text, 'all'::text, 5::int)
    ) AS v(name, slug, icon, section, sort_order)
    WHERE NOT EXISTS (
        SELECT 1 FROM collections c
        WHERE c.slug = v.slug OR lower(btrim(c.name::text)) = lower(btrim(v.name::text))
    )
`);
  try {
    await mergeDuplicateCollectionsByName(pool);
  } catch (e) {
    console.warn("[schema] mergeDuplicateCollectionsByName:", e && e.message);
  }
  await ensureCollectionUniqueIndexes(pool);
  await backfillCollectionIcons(pool);
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
        b.name AS brand_name,
        b.slug AS brand_slug,
        b.logo_url AS brand_logo,
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
    const res = await client.query(`
        INSERT INTO products (art, name, slug, description, category_id, brand_id, materials, season, gender, is_active, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
    `, [
      art,
      data.name,
      slug,
      data.description || null,
      data.category_id || null,
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
      data.category_id || null,
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
  return result.rowCount > 0;
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
const SEED_REFERENCE_MATERIALS = [
  "Хлопок",
  "П/Э",
  "Полиэстер",
  "Полиамид",
  "Вискоза",
  "Шерсть",
  "Лён",
  "Спандекс",
  "Эластан",
  "Нейлон",
  "Модал",
  "Бамбук",
  "Акрил",
  "Шёлк",
  "Кашемир",
  "Флис",
  "Тенсель (лиоцелл)",
  "Район",
  "Микрофибра",
  "Полиуретан",
  "Кожа (нат.)",
  "Кожа (искусств.)",
  "Мех (нат.)",
  "Мех (искусств.)",
  "Пух",
  "Перо",
  "Резина",
  "EVA"
];

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
  await upsertSeedReferenceMaterials(pool);
}

async function upsertSeedReferenceMaterials(pool) {
  const mx = await pool.query("SELECT COALESCE(MAX(sort_order), -1)::int AS mx FROM reference_materials");
  let next = mx.rows.length ? Number(mx.rows[0].mx) + 1 : 0;
  if (!Number.isFinite(next)) next = 0;
  for (const name of SEED_REFERENCE_MATERIALS) {
    const ins = await pool.query(
      `INSERT INTO reference_materials (name, sort_order)
       SELECT $1::text, $2::int
       WHERE NOT EXISTS (
         SELECT 1 FROM reference_materials rm
         WHERE lower(btrim(rm.name)) = lower(btrim($1::text))
       )
       RETURNING id`,
      [name, next]
    );
    if (ins.rows.length) next += 1;
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
module.exports.getCategories = getCategories;
module.exports.getBrands = getBrands;
module.exports.createBrand = createBrand;
module.exports.getColors = getColors;
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
