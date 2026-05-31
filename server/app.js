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
const httpEnv = require("./config");
const {
  createCsrfProtection,
  createApplyCsrfWhenNeeded,
  requireAuth,
  createRequireUserJwt
} = require("./middleware");
const { installGoogleStrategy } = require("./services/auth");
const { mountAuthRoutes } = require("./routes/auth");
const { mountCatalogRoutes } = require("./routes/catalog");
const { mountAdminRoutes } = require("./routes/admin");
const { mountSystemRoutes } = require("./routes/system");
const { renderErrorHtml, sendHtmlError, isApiPath } = require("./errors");
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
  GOOGLE_CALLBACK_URL
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
      createTableIfMissing: false
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
const csrfProtection = createCsrfProtection();
const applyCsrfWhenNeeded = createApplyCsrfWhenNeeded();
app.use((req, res, next) => {
  csrfProtection(req, res, (err) => (err ? next(err) : next()));
});
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
  csrfProtection,
  publicMediaUrl: db.publicMediaUrl
};
const SITE_FAVICON = path.join(PUB_ROOT, "img", "logo-preview.png");
app.get("/favicon.ico", (req, res) => {
  res.type("image/png");
  res.sendFile(SITE_FAVICON);
});
app.get("/apple-touch-icon.png", (req, res) => {
  res.type("image/png");
  res.sendFile(SITE_FAVICON);
});
app.get("/", (req, res) => res.redirect("/welcome.html"));
mountSystemRoutes(app, routeCtx);
app.use((req, res, next) => {
  if (req.path === "/health") return next();
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
  if (res.headersSent) return next(err);
  if (err && err.code === "EBADCSRFTOKEN" && isApiPath(req.path)) {
    return res.status(403).type("application/json").json({
      error:
        "\u041D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 CSRF-\u0442\u043E\u043A\u0435\u043D. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0438\u043B\u0438 \u0437\u0430\u0439\u0434\u0438\u0442\u0435 \u0441\u043D\u043E\u0432\u0430."
    });
  }
  console.error(err);
  if (isApiPath(req.path)) {
    return res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
  }
  sendHtmlError(res, PUB_ROOT, 500);
});
async function bootDatabase() {
  await db.connectDB();
  appState.dbHealthy = true;
}
async function startServer() {
  try {
    await bootDatabase();
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error("Database startup failed:", msg);
    if (/ENOTFOUND/i.test(msg)) {
      console.error(
        "  Hint: the database host in DATABASE_URL could not be resolved. Replace a template host such as \"HOST\" with a real hostname (e.g. localhost). Until then, /api/* returns 503."
      );
    } else if (/ECONNREFUSED/i.test(msg)) {
      console.error("  Hint: nothing is accepting connections on that host:port — start PostgreSQL or fix PGPORT.");
    } else if (/does not exist/i.test(msg)) {
      console.error(
        "  Hint: if this is a new database, prepare the schema in PostgreSQL or run once: npm run bootstrap-admin"
      );
    }
    appState.dbHealthy = false;
  }
  app.listen(PORT, () => {
    console.log(`  - Server running on http://localhost:${PORT}`);
    if (!isProduction && COOKIE_SECURE) {
      console.warn(
        "  Warning: COOKIE_SECURE=true on HTTP — session/JWT cookies may not work locally. Remove COOKIE_SECURE from .env or use HTTPS."
      );
    }
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
