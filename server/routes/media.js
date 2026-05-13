const path = require("path");
const fs = require("fs");
const DEBUG_BODY_MAX = 65536;
function mountMediaRoutes(app, ctx) {
  const { allowDebugNdjsonRoute, csrfProtection, COOKIE_SECURE } = ctx;
  const xsrfCookieOpts = {
    httpOnly: false,
    sameSite: "lax",
    secure: Boolean(COOKIE_SECURE),
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  };
  app.get("/health", (req, res) => {
    res.status(200).type("application/json").json({ status: "ok" });
  });
  app.get("/api/csrf-token", (req, res, next) => {
    csrfProtection(req, res, (err) => {
      if (err) return next(err);
      const token = req.csrfToken();
      res.cookie("XSRF-TOKEN", token, xsrfCookieOpts);
      res.type("application/json").json({ csrfToken: token });
    });
  });
  if (allowDebugNdjsonRoute) {
    const KPVS_DEBUG_LOG_FILE = path.join(__dirname, "..", "..", ".cursor", "debug-575784.log");
    app.post("/api/__debug_ndjson", (req, res, next) => {
      try {
        const body = req.body;
        let line;
        try {
          line = JSON.stringify(body === void 0 ? null : body);
        } catch (serErr) {
          return res.status(400).type("application/json").json({ error: "Invalid JSON body" });
        }
        if (line.length > DEBUG_BODY_MAX) {
          return res.status(413).type("application/json").json({ error: "Payload too large" });
        }
        if (body && typeof body === "object") {
          fs.mkdirSync(path.dirname(KPVS_DEBUG_LOG_FILE), { recursive: true });
          fs.appendFileSync(KPVS_DEBUG_LOG_FILE, line + "\n", "utf8");
        }
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    });
  }
}
module.exports = { mountMediaRoutes };
