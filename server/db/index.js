const { pool } = require("./pool");
const catalog = require("./queries/catalog");
const sizes = require("./queries/sizes");
const users = require("./queries/users");

const CATALOG_EXPORT_SKIP = new Set(["publicMediaUrl", "mapProductRowMedia"]);

function bindPool(mod, skipKeys) {
  const skip = skipKeys || new Set();
  const out = {};
  for (const k of Object.keys(mod)) {
    if (skip.has(k)) continue;
    const fn = mod[k];
    if (typeof fn === "function") {
      out[k] = (...args) => fn(pool, ...args);
    }
  }
  return out;
}

async function connectDB() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    const { ensureDatabaseSchema } = require("../schema.js");
    await ensureDatabaseSchema(pool);
    console.log("  - Connected to PostgreSQL");
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  connectDB,
  ...bindPool(catalog, CATALOG_EXPORT_SKIP),
  ...bindPool(sizes),
  ...bindPool(users),
  publicMediaUrl: catalog.publicMediaUrl,
  mapProductRowMedia: catalog.mapProductRowMedia
};
