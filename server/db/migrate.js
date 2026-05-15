const db = require("./index.js");

async function ensureSessionTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    )
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
      ) THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
      END IF;
    END $$
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
}

async function runAllMigrations() {
  await db.connectDB();
  console.log("  - Applying database schema…");
  await ensureSessionTable(db.pool);
  await db.ensureUserAuthSchema();
  await db.ensureCoreCatalogTables();
  await db.ensureCategoryHierarchy();
  await db.ensureProductsEditorColumn();
  await db.ensureCollectionsSchema();
  await db.ensureCategorySizeTypesSchema();
  await db.ensureSizeGroupsSchema();
  await db.ensureSizesUniqueValueIndex();
  await db.ensureReferenceSizesSeed();
  await db.ensureReferenceMaterialsSchema();
  console.log("  - Database schema is up to date");
}

module.exports = { runAllMigrations, ensureSessionTable };
