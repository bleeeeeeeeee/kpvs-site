const { Pool } = require("pg");
const isProduction = process.env.NODE_ENV === "production";
function buildPoolConfig() {
  const common = {
    max: 10,
    idleTimeoutMillis: 3e4,
    connectionTimeoutMillis: 2e3
  };
  const sslMode = String(process.env.PGSSLMODE || "").toLowerCase();
  const wantSsl = sslMode === "require" || String(process.env.PGSSL || "").toLowerCase() === "true" || isProduction && Boolean(process.env.DATABASE_URL);
  const ssl = wantSsl ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } : void 0;
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ...common, ssl: wantSsl ? ssl : void 0 };
  }
  if (isProduction) {
    console.error("FATAL: Missing required environment variable: DATABASE_URL");
    process.exit(1);
  }
  const password = process.env.PGPASSWORD !== void 0 && process.env.PGPASSWORD !== "" ? process.env.PGPASSWORD : void 0;
  if (password === void 0 || password === "") {
    console.error("FATAL: Set DATABASE_URL or PGPASSWORD for database connection.");
    process.exit(1);
  }
  return {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "kpvs_db",
    user: process.env.PGUSER || "postgres",
    password,
    ...common,
    ssl: wantSsl ? ssl : void 0
  };
}
const pool = new Pool(buildPoolConfig());
module.exports = { pool, buildPoolConfig, isProduction };
