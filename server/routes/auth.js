const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const {
  normalizeEmail,
  isValidEmail,
  sanitizeOAuthNextPath,
  assertSameOriginRelativeDest,
  userJwtCookieOptions,
  userJwtCookieClearOptions,
  createJwtToken,
  emailForProfile,
  makeSixDigitCode,
  emailCodeHash,
  resolveGoogleLoginEmail,
  sha256Hex,
  readUserJwtToken
} = require("../services/auth-helpers");
const { trySendResetEmail, trySendEmailVerificationCode, isOutboundMailConfigured } = require("../services/auth-mail");
const MAX_LOGIN_USERNAME_LEN = 128;
const MAX_PASSWORD_INPUT_LEN = 500;
const MAX_EMAIL_LEN = 254;
function sessionUserPublicJson(u) {
  if (!u || typeof u !== "object") return null;
  return {
    id: Number(u.id),
    username: String(u.username || ""),
    role: String(u.role || "")
  };
}
function trustedRecoverBaseUrl(rawBase, port) {
  const isProd = String(process.env.NODE_ENV || "") === "production";
  const p = Number(port);
  const portSafe = Number.isFinite(p) && p > 0 && p < 65536 ? p : 3000;
  const fallbackDev = `http://localhost:${portSafe}`;
  const rawStr = String(rawBase || "").trim().replace(/\/+$/, "");
  if (!rawStr) return isProd ? null : fallbackDev;
  let u;
  try {
    u = new URL(rawStr);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  if (isProd && u.protocol !== "https:") return null;
  const h = u.hostname;
  if (!h || /[\s\r\n\0]/.test(h)) return null;
  if (h === "localhost" || h === "127.0.0.1") return isProd ? null : rawStr;
  return rawStr;
}
async function verifyEmailCodePending(getLatestEmailVerification, jwtSecret, email, purpose, code) {
  const e = normalizeEmail(email);
  const p = String(purpose || "register").trim() || "register";
  const c = String(code || "").trim();
  if (!isValidEmail(e) || !/^\d{6}$/.test(c)) return { ok: false, error: "invalid_input" };
  const codeHash = emailCodeHash(e, p, c, jwtSecret);
  const latest = await getLatestEmailVerification(e, p);
  if (!latest || latest.used_at) return { ok: false, error: "invalid" };
  if (String(latest.code_hash || "") !== codeHash) return { ok: false, error: "mismatch" };
  const exp = new Date(latest.expires_at);
  if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) return { ok: false, error: "expired" };
  return { ok: true };
}
function mountAuthRoutes(app, ctx) {
  const {
    PORT,
    JWT_SECRET,
    JWT_COOKIE_NAME,
    COOKIE_SECURE,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    requireUserJwt,
    db
  } = ctx;
  const cookieOpts = () => userJwtCookieOptions(COOKIE_SECURE);
  const jwtClearOpts = () => userJwtCookieClearOptions(COOKIE_SECURE);
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const u = String(username || "").trim();
      const p = String(password || "").trim();
      if (!u || !p) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C" });
      if (u.length > MAX_LOGIN_USERNAME_LEN || p.length > MAX_PASSWORD_INPUT_LEN) {
        return res.status(400).json({ error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435" });
      }
      const user = await db.verifyUser(u, p);
      if (!user) return res.status(200).json({ ok: false, error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C" });
      if (user.role === "user") {
        return res.status(200).json({
          ok: false,
          error: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D",
          code: "shop_account_use_user_login"
        });
      }
      req.session.user = user;
      res.json({ ok: true, id: user.id, username: user.username, role: user.role });
    } catch (err) {
      console.error("POST /api/auth/login:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  });
  const sessionCookieClearOpts = () => ({
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: !!COOKIE_SECURE
  });
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E" });
      }
      res.clearCookie("connect.sid", sessionCookieClearOpts());
      res.json({ ok: true });
    });
  });
  app.get("/api/auth/me", (req, res) => {
    if (req.session && req.session.user) {
      const pub = sessionUserPublicJson(req.session.user);
      if (pub) return res.json(pub);
    }
    res.json(null);
  });
  async function handleUserRegister(req, res) {
    try {
      const { username, email, password, email_code } = req.body || {};
      const u = String(username || "").trim();
      const e = normalizeEmail(email);
      const p = String(password || "");
      if (!u) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D" });
      if (u.length > MAX_LOGIN_USERNAME_LEN) return res.status(400).json({ error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D" });
      if (!isValidEmail(e)) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 email" });
      if (e.length > MAX_EMAIL_LEN) return res.status(400).json({ error: "Email \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      if (!p || p.length < 6) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432" });
      if (p.length > MAX_PASSWORD_INPUT_LEN) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      const code = String(email_code || "").trim();
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 email: \u0432\u0432\u0435\u0434\u0438\u0442\u0435 6-\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u043A\u043E\u0434 \u0438\u0437 \u043F\u0438\u0441\u044C\u043C\u0430" });
      }
      const codeHashVal = emailCodeHash(e, "register", code, JWT_SECRET);
      const v = await db.consumeEmailVerificationCode(e, "register", codeHashVal);
      if (!v.ok) return res.status(400).json({ error: "\u041A\u043E\u0434 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0438\u043B\u0438 \u0438\u0441\u0442\u0451\u043A. \u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439." });
      const user = await db.createUser(u, p, "user", { email: e, email_verified: true });
      res.status(201).json({ id: user.id, username: user.username, role: "user" });
    } catch (err) {
      if (err && err.code === "23505") return res.status(409).json({ error: "\u041B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 email \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442" });
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F" });
    }
  }
  app.post("/api/user/auth/register", handleUserRegister);
  app.post("/api/user/register", handleUserRegister);
  async function postEmailVerificationCode(req, res) {
    try {
      const { email, purpose } = req.body || {};
      const e = normalizeEmail(email);
      const p = String(purpose || "").trim() || "register";
      if (!isValidEmail(e)) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 email" });
      if (e.length > MAX_EMAIL_LEN) return res.status(400).json({ error: "Email \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      if (!["register"].includes(p)) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441" });
      const already = await db.findUserByEmail(e);
      if (already) {
        return res.status(409).json({
          error: "\u042D\u0442\u043E\u0442 email \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442 (\u0432 \u0442\u043E\u043C \u0447\u0438\u0441\u043B\u0435 \u0435\u0441\u043B\u0438 \u0432\u0445\u043E\u0434\u0438\u043B\u0438 \u0447\u0435\u0440\u0435\u0437 Google). \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 Google \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C \u0432 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0435."
        });
      }
      const latest = await db.getLatestEmailVerification(e, p);
      if (latest && latest.created_at) {
        const created = new Date(latest.created_at);
        if (!isNaN(created.getTime()) && created.getTime() > Date.now() - 60 * 1e3) {
          return res.status(429).json({ error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0447\u0430\u0441\u0442\u043E. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043C\u0438\u043D\u0443\u0442\u0443" });
        }
      }
      if (!isOutboundMailConfigured()) {
        return res.status(503).json({
          error:
            "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u0438\u0441\u044C\u043C \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 SMTP_URL \u0438\u043B\u0438 SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.",
          code: "mail_not_configured"
        });
      }
      const code = makeSixDigitCode();
      const sent = await trySendEmailVerificationCode(e, code);
      if (!sent) {
        return res.status(503).json({
          error:
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0438\u0441\u044C\u043C\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (\u043F\u0440\u0435\u0444\u0438\u043A\u0441 [mail]) \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 SMTP_* / SMTP_URL.",
          code: "email_send_failed"
        });
      }
      const codeHashVal = emailCodeHash(e, p, code, JWT_SECRET);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
      await db.insertEmailVerificationCode(e, p, codeHashVal, expiresAt);
      res.json({ ok: true });
    } catch (err) {
      console.error("POST /api/user/auth/email-code:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  }
  app.post("/api/auth/request-code", postEmailVerificationCode);
  app.post("/api/user/auth/email-code", postEmailVerificationCode);
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { email, purpose, code } = req.body || {};
      const r = await verifyEmailCodePending(db.getLatestEmailVerification, JWT_SECRET, email, purpose, code);
      if (!r.ok) return res.status(400).json({ error: "\u041A\u043E\u0434 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0438\u043B\u0438 \u0438\u0441\u0442\u0451\u043A" });
      res.json({ ok: true });
    } catch (err) {
      console.error("POST /api/auth/verify-code:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  });
  app.post("/api/user/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const u = String(username || "").trim();
      const p = String(password || "");
      if (!u || !p) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C" });
      if (u.length > MAX_LOGIN_USERNAME_LEN || p.length > MAX_PASSWORD_INPUT_LEN) {
        return res.status(400).json({ error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435" });
      }
      const user = await db.verifyUserByLogin(u, p);
      if (!user) {
        const asEmail = normalizeEmail(u);
        if (isValidEmail(asEmail)) {
          const [byEmail, byUsername] = await Promise.all([db.findUserByEmail(asEmail), db.findUserByUsername(u)]);
          if (byEmail && byEmail.is_active && String(byEmail.role || "") === "user") {
            const hasOauth = !!(byEmail.oauth_provider && String(byEmail.oauth_provider).trim());
            const pwdSet = byEmail.password_set === true || byEmail.password_set === 1;
            if (hasOauth && !pwdSet) {
              res.set("X-Login-Code", "oauth_password_not_set");
              return res.status(200).json({
                ok: false,
                error: "\u042D\u0442\u043E\u0442 email \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D \u043A \u0432\u0445\u043E\u0434\u0443 \u0447\u0435\u0440\u0435\u0437 Google. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 Google \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0410\u043A\u043A\u0430\u0443\u043D\u0442\xBB \u043F\u043E\u0441\u043B\u0435 \u0432\u0445\u043E\u0434\u0430.",
                code: "oauth_password_not_set"
              });
            }
          }
          if (!byEmail && !byUsername) {
            res.set("X-Login-Code", "email_not_registered");
            return res.status(200).json({
              ok: false,
              error: "\u0422\u0430\u043A\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F\xBB \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u0432\u0445\u043E\u0434\u0430.",
              code: "email_not_registered"
            });
          }
        } else {
          const byUsernameOnly = await db.findUserByUsername(u);
          if (!byUsernameOnly) {
            res.set("X-Login-Code", "username_not_registered");
            return res.status(200).json({
              ok: false,
              error: "\u0422\u0430\u043A\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F\xBB \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u0432\u0445\u043E\u0434\u0430.",
              code: "username_not_registered"
            });
          }
        }
        return res.status(200).json({ ok: false, error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C" });
      }
      if (user.role !== "user") {
        return res.status(200).json({
          ok: false,
          error: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0440\u0435\u0436\u0438\u043C \xAB\u0410\u0434\u043C\u0438\u043D\xBB",
          code: "staff_use_admin_login"
        });
      }
      const token = createJwtToken(user, JWT_SECRET);
      res.cookie(JWT_COOKIE_NAME, token, cookieOpts());
      res.type("application/json").json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      console.error("POST /api/user/auth/login:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  });
  app.get("/api/user/auth/me", async (req, res) => {
    try {
      const token = readUserJwtToken(req, JWT_COOKIE_NAME);
      if (!token) return res.json(null);
      let payload;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch {
        res.clearCookie(JWT_COOKIE_NAME, jwtClearOpts());
        return res.json(null);
      }
      const id = Number(payload && payload.sub);
      if (!Number.isFinite(id) || id <= 0) {
        res.clearCookie(JWT_COOKIE_NAME, jwtClearOpts());
        return res.json(null);
      }
      const row = await db.findUserById(id);
      if (!row || !row.is_active) {
        res.clearCookie(JWT_COOKIE_NAME, jwtClearOpts());
        return res.json(null);
      }
      res.json({
        id: Number(row.id),
        username: row.username,
        role: row.role,
        email: emailForProfile(row),
        oauth_provider: row.oauth_provider || null,
        password_set: !!row.password_set
      });
    } catch (err) {
      console.error("GET /api/user/auth/me:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  });
  app.patch("/api/user/auth/username", requireUserJwt, async (req, res) => {
    try {
      const id = Number(req.userJwt.sub);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441" });
      const row = await db.findUserById(id);
      if (!row) return res.status(404).json({ error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
      if (!row.is_active) return res.status(403).json({ error: "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D" });
      if (String(row.role || "") !== "user") {
        return res.status(403).json({ error: "\u0421\u043C\u0435\u043D\u0430 \u043B\u043E\u0433\u0438\u043D\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u0433\u043E \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430" });
      }
      const { username } = req.body || {};
      const uname = String(username || "").trim();
      if (!uname || uname.length > MAX_LOGIN_USERNAME_LEN) {
        return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D" });
      }
      const user = await db.changeUsername(id, uname);
      if (!user) return res.status(404).json({ error: "User not found" });
      const token = createJwtToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
      res.cookie(JWT_COOKIE_NAME, token, cookieOpts());
      res.json({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: emailForProfile(user),
          password_set: !!user.password_set
        }
      });
    } catch (err) {
      if (err && err.code === "23505") return res.status(409).json({ error: "\u041B\u043E\u0433\u0438\u043D \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442" });
      res.status(400).json({ error: err && err.message ? err.message : "Failed to change username" });
    }
  });
  app.patch("/api/user/auth/password", requireUserJwt, async (req, res) => {
    try {
      const id = Number(req.userJwt.sub);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441" });
      const row = await db.findUserById(id);
      if (!row) return res.status(404).json({ error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
      if (!row.is_active) return res.status(403).json({ error: "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D" });
      if (String(row.role || "") !== "user") return res.status(403).json({ error: "Forbidden" });
      const { old_password, password } = req.body || {};
      const next = String(password || "");
      if (!next || next.length < 6) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432" });
      if (next.length > MAX_PASSWORD_INPUT_LEN) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      if (!row.password_set) {
        const r = await db.setInitialPasswordForOAuthUser(id, next);
        if (!r.ok) return res.status(400).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C" });
      } else {
        const prev = String(old_password || "");
        if (!prev) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" });
        if (prev.length > MAX_PASSWORD_INPUT_LEN) {
          return res.status(400).json({ error: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" });
        }
        const r = await db.changeUserPasswordWithOld(id, prev, next);
        if (!r.ok && r.error === "wrong_old") return res.status(400).json({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" });
        if (!r.ok) return res.status(400).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C" });
      }
      const updated = await db.findUserById(id);
      const token = updated ? createJwtToken({ id: updated.id, username: updated.username, role: updated.role }, JWT_SECRET) : "";
      if (token) res.cookie(JWT_COOKIE_NAME, token, cookieOpts());
      res.type("application/json").json({ ok: true });
    } catch (err) {
      console.error("PATCH /api/user/auth/password:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  });
  app.post("/api/user/auth/logout", (req, res) => {
    res.clearCookie(JWT_COOKIE_NAME, jwtClearOpts());
    const hasStaffSession = !!(req.session && req.session.user);
    if (hasStaffSession) {
      res.type("application/json").json({ ok: true });
      return;
    }
    const finish = () => {
      res.clearCookie("connect.sid", sessionCookieClearOpts());
      res.type("application/json").json({ ok: true });
    };
    if (req.session && typeof req.session.destroy === "function") {
      req.session.destroy((destroyErr) => {
        if (destroyErr) console.error("POST /api/user/auth/logout session destroy:", destroyErr);
        finish();
      });
    } else {
      finish();
    }
  });
  async function handleRecover(req, res) {
    try {
      const { email } = req.body || {};
      const e = normalizeEmail(String(email || ""));
      if (!isValidEmail(e)) {
        return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 email", code: "recover_invalid_email" });
      }
      if (e.length > MAX_EMAIL_LEN) {
        return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 email", code: "recover_invalid_email" });
      }
      const row = await db.findUserByEmail(e);
      if (!row) {
        return res.status(404).json({
          error: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0441 \u0442\u0430\u043A\u0438\u043C email \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442.",
          code: "recover_email_unknown"
        });
      }
      if (!row.is_active) {
        return res.status(403).json({
          error: "\u042D\u0442\u043E\u0442 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D. \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F \u043F\u043E \u043F\u043E\u0447\u0442\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E.",
          code: "recover_inactive"
        });
      }
      if (String(row.role || "") !== "user") {
        return res.status(400).json({
          error: "\u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u0443\u0447\u0451\u0442\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 \u0441\u0430\u0439\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E.",
          code: "recover_role"
        });
      }
      const base = trustedRecoverBaseUrl(process.env.APP_BASE_URL, PORT);
      if (!base) {
        return res.status(503).json({
          error: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E: \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 APP_BASE_URL (https \u0432 production).",
          code: "recover_base_misconfigured"
        });
      }
      if (!isOutboundMailConfigured()) {
        return res.status(503).json({
          error:
            "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u0438\u0441\u044C\u043C \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 SMTP_URL \u0438\u043B\u0438 SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.",
          code: "recover_mail_disabled"
        });
      }
      const rawToken = crypto.randomBytes(32).toString("hex");
      const link = base.replace(/\/+$/, "") + "/login.html?mode=user&reset=" + encodeURIComponent(rawToken);
      const sent = await trySendResetEmail(e, link);
      if (!sent) {
        return res.status(503).json({
          error:
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0438\u0441\u044C\u043C\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (\u043F\u0440\u0435\u0444\u0438\u043A\u0441 [mail]) \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 SMTP.",
          code: "recover_send_failed"
        });
      }
      const tokenHash = sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
      await db.insertPasswordResetToken(Number(row.id), tokenHash, expiresAt);
      res.json({
        ok: true,
        message: "\u041D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 email \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u043F\u0438\u0441\u044C\u043C\u043E \u0441\u043E \u0441\u0441\u044B\u043B\u043A\u043E\u0439 \u0434\u043B\u044F \u0441\u0431\u0440\u043E\u0441\u0430 \u043F\u0430\u0440\u043E\u043B\u044F."
      });
    } catch (err) {
      console.error("POST /api/user/auth/recover:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  }
  app.post("/api/user/auth/recover", handleRecover);
  async function handleResetPassword(req, res) {
    try {
      const { token, password } = req.body || {};
      const t = String(token || "").trim();
      const p = String(password || "");
      if (!t || t.length > 200) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0442\u043E\u043A\u0435\u043D" });
      if (!p || p.length < 6) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432" });
      if (p.length > MAX_PASSWORD_INPUT_LEN) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      const tokenHash = sha256Hex(t);
      const r = await db.consumePasswordResetToken(tokenHash, p);
      if (!r.ok) return res.status(400).json({ error: "\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430" });
      res.json({ ok: true });
    } catch (err) {
      console.error("POST /api/user/auth/reset:", err);
      res.status(500).json({ error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" });
    }
  }
  app.post("/api/user/auth/reset", handleResetPassword);
  app.post("/api/auth/reset-password", handleResetPassword);
  app.get("/api/user/oauth/google/start", (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect("/login.html?mode=user&oauth_error=not_configured");
    }
    const nextUrl = typeof req.query.next === "string" ? req.query.next : "";
    req.session.oauth_next = sanitizeOAuthNextPath(nextUrl);
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("OAuth session save:", saveErr);
        return res.redirect("/login.html?mode=user&oauth_error=session");
      }
      passport.authenticate("google", {
        scope: [
          "openid",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile"
        ],
        session: false
      })(req, res, next);
    });
  });
  app.get("/api/user/oauth/google/callback", (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect("/login.html?mode=user&oauth_error=not_configured");
    }
    passport.authenticate("google", { session: false }, async (err, oauthCtx) => {
      try {
        if (err) {
          console.error("OAuth Google callback error:", err);
          return res.redirect("/login.html?mode=user&oauth_error=callback");
        }
        const profile = oauthCtx && oauthCtx.profile;
        const accessToken = oauthCtx && oauthCtx.accessToken;
        const tokenParams = oauthCtx && oauthCtx.tokenParams;
        if (!profile || !profile.id) {
          console.error("OAuth Google callback missing profile");
          return res.redirect("/login.html?mode=user&oauth_error=profile");
        }
        const email = await resolveGoogleLoginEmail({ profile, accessToken, tokenParams }, GOOGLE_CLIENT_ID);
        if (!email) {
          console.error("OAuth Google callback: no verified email for profile");
          return res.redirect("/login.html?mode=user&oauth_error=no_email");
        }
        const user = await db.upsertOAuthUser("google", String(profile.id), email);
        if (!user) {
          console.error("OAuth Google upsertOAuthUser returned null");
          return res.redirect("/login.html?mode=user&oauth_error=user");
        }
        const token = createJwtToken(user, JWT_SECRET);
        let dest = assertSameOriginRelativeDest(req, req.session.oauth_next);
        try {
          delete req.session.oauth_next;
        } catch {
        }
        const row = await db.findUserById(user.id);
        const suggestPassword = row && String(row.role || "") === "user" && !row.password_set;
        if (suggestPassword) {
          try {
            const u = new URL(dest, `${req.protocol}://${req.get("host")}`);
            if (!u.hash || u.hash === "#") u.hash = "oauthPasswordPrompt";
            dest = u.pathname + u.search + u.hash;
          } catch {
            dest = (dest || "/welcome.html") + "#oauthPasswordPrompt";
          }
        }
        res.cookie(JWT_COOKIE_NAME, token, cookieOpts());
        req.session.save(() => {
          res.redirect(dest);
        });
      } catch (e) {
        console.error("OAuth Google callback exception:", e);
        res.redirect("/login.html?mode=user&oauth_error=exception");
      }
    })(req, res, next);
  });
}
module.exports = { mountAuthRoutes };
