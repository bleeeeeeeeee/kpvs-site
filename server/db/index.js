const { pool } = require("./pool");
const { publicMediaUrl } = require("./media-url");
const catalog = require("./queries/catalog");
const sizes = require("./queries/sizes");
const users = require("./queries/users");
async function connectDB() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("  - Connected to PostgreSQL");
  } finally {
    client.release();
  }
}
function bindPool(mod) {
  const out = {};
  for (const k of Object.keys(mod)) {
    const fn = mod[k];
    if (typeof fn === "function") {
      out[k] = (...args) => fn(pool, ...args);
    }
  }
  return out;
}
module.exports = {
  pool,
  publicMediaUrl,
  connectDB,
  ...bindPool(catalog),
  ...bindPool(sizes),
  ...bindPool(users)
};
