#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const db = require("../server/db/index.js");
const { runAllMigrations } = require("../server/db/migrate.js");

async function main() {
  await runAllMigrations();
  const c = await db.pool.query("SELECT COUNT(*)::int AS n FROM products");
  const n = c.rows[0] && c.rows[0].n;
  if (n > 0) {
    console.log("Skip seed: database already has", n, "product(s).");
    process.exit(0);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const st = await client.query(
      "INSERT INTO size_types (name, slug) VALUES ('Рост (демо)', 'rost-seed-demo') RETURNING id"
    );
    const sz = await client.query("INSERT INTO sizes (size_type_id, value) VALUES ($1, '182') RETURNING id", [
      st.rows[0].id
    ]);
    const col = await client.query(
      "INSERT INTO colors (name, hex_code) VALUES ('Серый (демо)', '#888888') RETURNING id"
    );
    const br = await client.query(
      "INSERT INTO brands (name, slug) VALUES ('KPVS (демо)', 'kpvs-seed-demo') RETURNING id"
    );
    let rootId = null;
    const rootRow = await client.query(
      "SELECT id FROM categories WHERE lower(btrim(slug::text)) = 'catalog-root' LIMIT 1"
    );
    if (rootRow.rows.length) {
      rootId = rootRow.rows[0].id;
    } else {
      const rootIns = await client.query(
        "INSERT INTO categories (name, slug, parent_id, sort_order) VALUES ('Каталог', 'catalog-root', NULL, 0) RETURNING id"
      );
      rootId = rootIns.rows[0].id;
    }
    const section = await client.query(
      "INSERT INTO categories (name, slug, parent_id, sort_order) VALUES ('Спецодежда (демо)', 'specodezhda-seed-demo', $1, 0) RETURNING id",
      [rootId]
    );
    const cat = await client.query(
      "INSERT INTO categories (name, slug, parent_id, sort_order) VALUES ('Демо-подкатегория', 'specodezhda-seed-demo-leaf', $1, 0) RETURNING id",
      [section.rows[0].id]
    );
    const pr = await client.query(
      `INSERT INTO products (art, name, slug, description, category_id, brand_id, season, gender, is_active)
       VALUES (
         'DEMO-001',
         'Демонстрационный товар',
         'demo-tovar-kataloga',
         'Создан скриптом npm run seed-demo-catalog. Удалите в админке или через SQL после импорта реального каталога.',
         $1, $2, 'лето', 'mens', TRUE
       ) RETURNING id`,
      [cat.rows[0].id, br.rows[0].id]
    );
    const pid = pr.rows[0].id;
    await client.query(
      `INSERT INTO product_variants (product_id, size_id, color_id, art, is_active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [pid, sz.rows[0].id, col.rows[0].id, "DEMO-001-182-SEED"]
    );
    await client.query(
      "INSERT INTO product_images (product_id, url, alt_text, is_primary, sort_order) VALUES ($1, '/img/item.png', 'Демо', TRUE, 0)",
      [pid]
    );
    await client.query("COMMIT");
    console.log("Demo catalog seeded: product id", pid, "(slug demo-tovar-kataloga).");
    console.log("Create staff login: set ADMIN_EMAIL + ADMIN_PASSWORD in .env, then npm run bootstrap-admin");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    client.release();
  }
  process.exit(0);
}

main();
