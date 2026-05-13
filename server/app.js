require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const passport = require("passport");
const db = require("./db/index.js");
const httpEnv = require("./config/http-env");
const { createCsrfProtection, createApplyCsrfWhenNeeded } = require("./middleware/csrf");
const { requireAuth } = require("./middleware/require-auth");
const { createRequireUserJwt } = require("./middleware/require-user-jwt");
const { installGoogleStrategy } = require("./passport/setup-google");
const { mountAuthRoutes } = require("./routes/auth");
const { mountCatalogRoutes } = require("./routes/catalog");
const { mountAdminRoutes } = require("./routes/admin");
const { mountMediaRoutes } = require("./routes/media");
const { renderErrorHtml, sendHtmlError, isApiPath } = require("./http/errors");
const storageService = require("./services/storage");
const {
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
} = httpEnv;
const app = express();
const appState = { dbHealthy: false };
if (String(process.env.TRUST_PROXY || "").trim() === "1") {
  app.set("trust proxy", 1);
}
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(cors({ origin: false }));
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    store: new PgSession({
      pool: db.pool,
      tableName: "session",
      createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1e3,
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE
    }
  })
);
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
installGoogleStrategy({
  clientId: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackUrl: GOOGLE_CALLBACK_URL
});
app.use(passport.initialize());
const csrfProtection = createCsrfProtection(COOKIE_SECURE);
const applyCsrfWhenNeeded = createApplyCsrfWhenNeeded(csrfProtection);
app.use(applyCsrfWhenNeeded);
if (!isProduction) {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}
const requireUserJwt = createRequireUserJwt(JWT_COOKIE_NAME, JWT_SECRET);
const uploadsDir = path.join(PUB_ROOT, "img", "uploads");
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch {
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageService.MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && storageService.ALLOWED_MIME.has(String(file.mimetype))) return cb(null, true);
    cb(new Error("invalid_mime"));
  }
});
const routeCtx = {
  pool: db.pool,
  db,
  PORT,
  JWT_SECRET,
  JWT_COOKIE_NAME,
  COOKIE_SECURE,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  requireAuth,
  requireUserJwt,
  upload,
  PUB_ROOT,
  allowDebugNdjsonRoute,
  csrfProtection,
  publicMediaUrl: db.publicMediaUrl
};
app.get("/", (req, res) => res.redirect("/welcome.html"));
mountMediaRoutes(app, routeCtx);
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/api/__debug_ndjson") return next();
  if (!appState.dbHealthy && typeof req.path === "string" && req.path.startsWith("/api")) {
    return res.status(503).type("application/json").json({ error: "\u0421\u0435\u0440\u0432\u0438\u0441 \u0431\u0430\u0437\u044B \u0434\u0430\u043D\u043D\u044B\u0445 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" });
  }
  next();
});
mountAuthRoutes(app, routeCtx);
mountCatalogRoutes(app, routeCtx);
mountAdminRoutes(app, routeCtx);
app.get("/error.html", (req, res) => {
  const q = Number(req.query.code);
  const code = [403, 404, 500].includes(q) ? q : 404;
  res.status(code).type("html").send(renderErrorHtml(PUB_ROOT, code));
});
app.use(express.static(PUB_ROOT));
app.get("/:file", (req, res, next) => {
  const seg = path.basename(String(req.params.file || ""));
  if (!seg || seg.includes(".")) return next();
  if (seg === "api") return next();
  const filePath = path.join(PUB_ROOT, `${seg}.html`);
  if (!fs.existsSync(filePath)) return next();
  if (seg === "error") {
    return sendHtmlError(res, PUB_ROOT, 404);
  }
  res.sendFile(filePath);
});
app.use((req, res) => {
  if (isApiPath(req.path)) {
    return res.status(404).json({ error: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(404).json({ error: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" });
  }
  sendHtmlError(res, PUB_ROOT, 404);
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err && err.code === "EBADCSRFTOKEN" && isApiPath(req.path)) {
    return res.status(403).type("application/json").json({
      error:
        "\u041D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 CSRF-\u0442\u043E\u043A\u0435\u043D. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0438\u043B\u0438 \u0437\u0430\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430."
    });
  }
  if (isApiPath(req.path)) {
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
  }
  sendHtmlError(res, PUB_ROOT, 500);
});
async function bootDatabase() {
  await db.connectDB();
  await db.ensureUserAuthSchema();
  await db.ensureProductsEditorColumn();
  await db.ensureCollectionsSchema();
  await db.ensureCategorySizeTypesSchema();
  await db.ensureSizeGroupsSchema();
  await db.ensureSizesUniqueValueIndex();
  await db.ensureReferenceSizesSeed();
  await db.ensureReferenceMaterialsSchema();
  appState.dbHealthy = true;
}
async function startServer() {
  try {
    await bootDatabase();
  } catch (err) {
    console.error("Database startup failed:", err && err.message ? err.message : err);
    appState.dbHealthy = false;
  }
  app.listen(PORT, () => {
    console.log(`  - Server running on http://localhost:${PORT}`);
  }).on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      const next = Number(PORT) + 1;
      console.error(`Port ${PORT} is already in use. Stop the other process or run: PORT=${next} npm start`);
      process.exit(1);
    }
    throw err;
  });
}
module.exports = { app, startServer };
