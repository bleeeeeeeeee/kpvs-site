const { pool } = require("./db/pool");
const users = require("./db/queries/users");
const catalog = require("./db/queries/catalog");
const sizes = require("./db/queries/sizes");

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

async function ensureDatabaseSchema(pool) {
  await ensureSessionTable(pool);
  await users.ensureUserAuthSchema(pool);
  await catalog.ensureCoreCatalogTables(pool);
  await catalog.ensureCatalogRoot(pool);
  await catalog.ensureCategoryHierarchy(pool);
  await catalog.ensureCollectionsSchema(pool);
  await sizes.ensureCategorySizeTypesSchema(pool);
  await sizes.ensureSizeGroupsSchema(pool);
  await sizes.ensureSizesUniqueValueIndex(pool);
  await catalog.ensureReferenceMaterialsSchema(pool);
  try {
    const purgedVerifications = await users.purgeExpiredEmailVerifications(pool);
    if (purgedVerifications > 0) {
      console.log(`  - Purged ${purgedVerifications} expired email verification(s)`);
    }
    const purgedSessions = await users.purgeExpiredSessions(pool);
    if (purgedSessions > 0) {
      console.log(`  - Purged ${purgedSessions} expired session(s)`);
    }
  } catch (e) {
    console.warn("[schema] orphan maintenance:", e && e.message);
  }
}

module.exports = { ensureDatabaseSchema, ensureSessionTable };
