const isProduction = process.env.NODE_ENV === "production";
const PRODUCTION_REQUIRED = [
  "SESSION_SECRET",
  "JWT_SECRET",
  "DATABASE_URL"
];
function fatalMissing(name) {
  console.error(`FATAL: Missing required environment variable: ${name}`);
  process.exit(1);
}
function validateProductionEnv() {
  if (!isProduction) return;
  for (const key of PRODUCTION_REQUIRED) {
    const v = process.env[key];
    if (v == null || String(v).trim() === "") fatalMissing(key);
  }
  if (String(process.env.SESSION_SECRET || "").length < 24) {
    console.error("FATAL: In production set SESSION_SECRET (at least 24 characters).");
    process.exit(1);
  }
}
module.exports = { validateProductionEnv };
