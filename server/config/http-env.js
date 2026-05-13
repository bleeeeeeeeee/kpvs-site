const path = require("path");
const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3e3);
const PUB_ROOT = path.join(__dirname, "..", "..", "public");
const SESSION_SECRET = process.env.SESSION_SECRET || "kpvs-dev-session-secret";
const JWT_SECRET = process.env.JWT_SECRET || SESSION_SECRET;
const JWT_COOKIE_NAME = "kpvs_user_jwt";
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/api/user/oauth/google/callback`;
const allowDebugNdjsonRoute = !isProduction;
if (isProduction && (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).length < 24)) {
  console.error("FATAL: In production set SESSION_SECRET (at least 24 characters).");
  process.exit(1);
}
module.exports = {
  isProduction,
  PORT,
  PUB_ROOT,
  SESSION_SECRET,
  JWT_SECRET,
  JWT_COOKIE_NAME,
  COOKIE_SECURE,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  allowDebugNdjsonRoute
};
