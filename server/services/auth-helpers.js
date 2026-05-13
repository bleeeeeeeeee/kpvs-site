const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const https = require("https");
function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function normalizeEmail(s) {
  if (s == null || s === void 0) return "";
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(s)) {
    try {
      s = s.toString("utf8");
    } catch {
      return "";
    }
  }
  return String(s).trim().toLowerCase();
}
function isValidEmail(e) {
  return !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}
function sanitizeOAuthNextPath(raw) {
  const s = String(raw || "").trim();
  if (!s.startsWith("/") || s.startsWith("//")) return "/welcome.html";
  if (s.includes("\0") || s.includes("\\")) return "/welcome.html";
  if (s.length > 512) return "/welcome.html";
  const pathOnly = s.split("?")[0];
  if (/[\s<>"'`]/.test(pathOnly)) return "/welcome.html";
  return s;
}
function assertSameOriginRelativeDest(req, relativePath) {
  const dest = sanitizeOAuthNextPath(relativePath);
  const host = req.get("host");
  if (!host) return "/welcome.html";
  const baseOrigin = `${req.protocol}://${host}`;
  try {
    const resolved = new URL(dest, baseOrigin);
    if (resolved.origin !== new URL(baseOrigin).origin) return "/welcome.html";
    return dest;
  } catch {
    return "/welcome.html";
  }
}
function userJwtCookieOptions(secureFlag) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: secureFlag,
    maxAge: 7 * 24 * 60 * 60 * 1e3,
    path: "/"
  };
}
function createJwtToken(user, jwtSecret) {
  return jwt.sign(
    { sub: String(user.id), username: user.username || "", role: user.role || "user" },
    jwtSecret,
    { expiresIn: "7d" }
  );
}
function getBearerToken(req) {
  const h = req.headers && req.headers.authorization ? String(req.headers.authorization) : "";
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}
function readUserJwtToken(req, cookieName) {
  const fromCookie = req.cookies && req.cookies[cookieName] ? String(req.cookies[cookieName]).trim() : "";
  if (fromCookie) return fromCookie;
  return getBearerToken(req);
}
function extractEmailFromGoogleIdToken(idToken, clientId) {
  if (!idToken || typeof idToken !== "string") return null;
  const cid = String(clientId || "").trim();
  if (!cid) return null;
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    const payload = decoded && decoded.payload && typeof decoded.payload === "object" ? decoded.payload : null;
    if (!payload) return null;
    const iss = String(payload.iss || "");
    const okIss = iss === "https://accounts.google.com" || iss === "accounts.google.com";
    if (!okIss) return null;
    const aud = payload.aud;
    const okAud = aud === cid || Array.isArray(aud) && aud.indexOf(cid) !== -1;
    if (!okAud) return null;
    if (payload.email_verified === false || payload.email_verified === "false") return null;
    const e = normalizeEmail(payload.email);
    return isValidEmail(e) ? e : null;
  } catch {
    return null;
  }
}
function extractGoogleProfileEmail(profile) {
  if (!profile) return null;
  const seen = new Set();
  const push = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s || !isValidEmail(s) || seen.has(s)) return null;
    seen.add(s);
    return s;
  };
  const ordered = [];
  const add = (raw) => {
    const v = push(raw);
    if (v) ordered.push(v);
  };
  if (profile.emails && Array.isArray(profile.emails)) {
    const arr = profile.emails.slice();
    arr.sort((a, b) => {
      const av = a && typeof a === "object" && a.verified ? 1 : 0;
      const bv = b && typeof b === "object" && b.verified ? 1 : 0;
      return bv - av;
    });
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e && typeof e === "object" && e.value) add(e.value);
      else if (typeof e === "string") add(e);
    }
  }
  if (typeof profile.email === "string") add(profile.email);
  const j = profile._json || {};
  add(j.email);
  add(j.email_address);
  if (typeof profile._raw === "string") {
    try {
      const raw = JSON.parse(profile._raw);
      if (raw && typeof raw === "object") {
        add(raw.email);
        if (Array.isArray(raw.emails)) {
          for (let i = 0; i < raw.emails.length; i++) {
            const ex = raw.emails[i];
            if (ex && typeof ex === "object" && ex.value) add(ex.value);
          }
        }
      }
    } catch {
    }
  }
  return ordered.length ? ordered[0] : null;
}
function fetchGoogleUserinfoEmail(accessToken) {
  return new Promise((resolve) => {
    const tok = String(accessToken || "").trim();
    if (!tok) return resolve(null);
    const attempts = [
      { hostname: "openidconnect.googleapis.com", path: "/v1/userinfo" },
      { hostname: "www.googleapis.com", path: "/oauth2/v2/userinfo" },
      { hostname: "www.googleapis.com", path: "/oauth2/v3/userinfo" }
    ];
    let i = 0;
    const next = () => {
      if (i >= attempts.length) return resolve(null);
      const { hostname, path } = attempts[i++];
      const req = https.request(
        {
          hostname,
          path,
          method: "GET",
          headers: {
            Authorization: "Bearer " + tok,
            Accept: "application/json",
            "User-Agent": "kpvs-site-oauth/1.0"
          },
          timeout: 15e3
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            if (res.statusCode !== 200) {
              console.error("[oauth-google] userinfo HTTP", hostname + path, res.statusCode, body.slice(0, 200));
              return next();
            }
            try {
              const j = JSON.parse(body);
              const e = j && j.email != null ? normalizeEmail(j.email) : "";
              if (isValidEmail(e)) return resolve(e);
            } catch (ex) {
              console.error("[oauth-google] userinfo JSON parse", ex && ex.message);
            }
            next();
          });
        }
      );
      req.on("error", (e) => {
        console.error("[oauth-google] userinfo request error", e && e.message);
        next();
      });
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {
        }
        next();
      });
      req.end();
    };
    next();
  });
}
async function resolveGoogleLoginEmail(ctx, googleClientId) {
  const profile = ctx && ctx.profile;
  const accessToken = ctx && ctx.accessToken;
  const tokenParams = ctx && ctx.tokenParams && typeof ctx.tokenParams === "object" ? ctx.tokenParams : {};
  const idTok = tokenParams.id_token || tokenParams.idToken;
  let email = extractEmailFromGoogleIdToken(idTok, googleClientId);
  if (email) return email;
  email = extractGoogleProfileEmail(profile);
  if (email) return email;
  if (accessToken) email = await fetchGoogleUserinfoEmail(accessToken);
  return email || null;
}
function emailForProfile(row) {
  if (!row) return null;
  const stored = row.email != null ? normalizeEmail(row.email) : "";
  if (isValidEmail(stored)) return stored;
  const fromLogin = row.username != null ? normalizeEmail(row.username) : "";
  if (isValidEmail(fromLogin)) return fromLogin;
  return null;
}
function emailForAdminUserList(row) {
  if (!row) return null;
  const p = emailForProfile(row);
  if (p) return p;
  const rawNorm = row.email != null ? normalizeEmail(row.email) : "";
  return rawNorm || null;
}
function makeSixDigitCode() {
  const n = crypto.randomInt(0, 1e6);
  return String(n).padStart(6, "0");
}
function emailCodeHash(email, purpose, code, jwtSecret) {
  const pepper = process.env.EMAIL_CODE_PEPPER || jwtSecret;
  return sha256Hex([normalizeEmail(email), String(purpose || ""), String(code || ""), pepper].join("|"));
}
module.exports = {
  sha256Hex,
  normalizeEmail,
  isValidEmail,
  sanitizeOAuthNextPath,
  assertSameOriginRelativeDest,
  userJwtCookieOptions,
  createJwtToken,
  getBearerToken,
  readUserJwtToken,
  extractEmailFromGoogleIdToken,
  extractGoogleProfileEmail,
  fetchGoogleUserinfoEmail,
  resolveGoogleLoginEmail,
  emailForProfile,
  emailForAdminUserList,
  makeSixDigitCode,
  emailCodeHash
};
