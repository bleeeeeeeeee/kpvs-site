const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { readUserJwtToken } = require("./services/auth");

function skipPublicAuthMutations(req) {
  const p = (req.originalUrl || "").split("?")[0];
  const open = new Set([
    "/api/auth/login",
    "/api/user/auth/login",
    "/api/user/auth/email-code",
    "/api/auth/request-code",
    "/api/auth/verify-code",
    "/api/user/auth/recover",
    "/api/user/auth/reset",
    "/api/auth/reset-password",
    "/api/user/register",
    "/api/user/auth/register"
  ]);
  if (open.has(p)) return true;
  if (p.startsWith("/api/user/oauth/")) return true;
  return false;
}

function timingSafeEqualStr(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length) return false;
  if (x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

function ensureSessionCsrf(req) {
  if (!req.session) return;
  if (!req.session.csrfToken || typeof req.session.csrfToken !== "string" || req.session.csrfToken.length < 32) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
}

function createCsrfProtection() {
  return function csrfProtection(req, res, next) {
    try {
      ensureSessionCsrf(req);
      req.csrfToken = function csrfToken() {
        return req.session && req.session.csrfToken ? String(req.session.csrfToken) : "";
      };
      next();
    } catch (e) {
      next(e);
    }
  };
}

function badCsrfError() {
  const err = new Error("EBADCSRFTOKEN");
  err.code = "EBADCSRFTOKEN";
  return err;
}

function createApplyCsrfWhenNeeded() {
  return function applyCsrfWhenNeeded(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    if (skipPublicAuthMutations(req)) return next();
    const fromHeader = req.get("X-XSRF-TOKEN") || req.get("X-CSRF-Token") || "";
    const fromCookie = req.cookies && req.cookies["XSRF-TOKEN"] != null ? String(req.cookies["XSRF-TOKEN"]) : "";
    const sessionTok = req.session && req.session.csrfToken ? String(req.session.csrfToken) : "";
    if (!timingSafeEqualStr(fromHeader, fromCookie) || !timingSafeEqualStr(fromHeader, sessionTok)) {
      return next(badCsrfError());
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function createRequireUserJwt(jwtCookieName, jwtSecret) {
  return function requireUserJwt(req, res, next) {
    const token = readUserJwtToken(req, jwtCookieName);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      req.userJwt = jwt.verify(token, jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}

module.exports = {
  createCsrfProtection,
  createApplyCsrfWhenNeeded,
  skipPublicAuthMutations,
  requireAuth,
  createRequireUserJwt
};
