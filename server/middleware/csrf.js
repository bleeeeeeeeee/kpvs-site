const csrf = require("csurf");
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
  if (p === "/api/__debug_ndjson") return true;
  return false;
}
function createCsrfProtection(cookieSecure) {
  return csrf({
    cookie: {
      httpOnly: false,
      sameSite: "lax",
      secure: cookieSecure,
      key: "_csrf"
    }
  });
}
function createApplyCsrfWhenNeeded(csrfProtection) {
  return function applyCsrfWhenNeeded(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    if (skipPublicAuthMutations(req)) return next();
    return csrfProtection(req, res, next);
  };
}
module.exports = { createCsrfProtection, createApplyCsrfWhenNeeded, skipPublicAuthMutations };
