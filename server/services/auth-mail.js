const dns = require("dns");
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
}
function stripOuterQuotes(s) {
  const t = String(s || "").trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}
function boolEnv(name, defaultValue) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultValue;
}
function numEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function logMailError(context, err) {
  const e = err && typeof err === "object" ? err : { message: String(err) };
  const parts = [context, e.message || e];
  if (e.code) parts.push("code=" + e.code);
  if (e.response) parts.push("response=" + String(e.response).slice(0, 300));
  if (e.command) parts.push("command=" + e.command);
  console.error("[mail]", parts.join(" | "));
}
function smtpLookup(hostname, options, callback) {
  const forceV4 = boolEnv("SMTP_FORCE_IPV4", true);
  if (forceV4 && typeof dns.lookup === "function") {
    return dns.lookup(hostname, { ...options, family: 4 }, callback);
  }
  return dns.lookup(hostname, options, callback);
}
function createTransportFromEnv() {
  if (!nodemailer) return null;
  const smtpUrl = String(process.env.SMTP_URL || "").trim();
  if (smtpUrl) {
    try {
      const transporter = nodemailer.createTransport(smtpUrl, { lookup: smtpLookup });
      const from = stripOuterQuotes(process.env.SMTP_FROM || process.env.SMTP_USER || "");
      if (!from) return null;
      return { transporter, from };
    } catch (err) {
      logMailError("smtp-url-invalid", err);
      return null;
    }
  }
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = stripOuterQuotes(process.env.SMTP_FROM || user || "");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !from) return null;
  const secure = boolEnv("SMTP_SECURE", port === 465);
  const requireTLS = boolEnv("SMTP_REQUIRE_TLS", port === 587 && !secure);
  const usePool = boolEnv("SMTP_POOL", false);
  const transporter = nodemailer.createTransport({
    pool: usePool,
    host,
    port,
    secure,
    requireTLS,
    lookup: smtpLookup,
    auth: { user, pass },
    connectionTimeout: numEnv("SMTP_CONNECTION_TIMEOUT_MS", 25e3),
    greetingTimeout: numEnv("SMTP_GREETING_TIMEOUT_MS", 15e3),
    socketTimeout: numEnv("SMTP_SOCKET_TIMEOUT_MS", 35e3),
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: boolEnv("SMTP_TLS_REJECT_UNAUTHORIZED", true)
    }
  });
  return { transporter, from };
}
async function sendWithSmtp(cfg, mail) {
  try {
    await cfg.transporter.sendMail(mail);
    return true;
  } catch (err) {
    logMailError("smtp-send", err);
    return false;
  }
}
async function trySendResetEmail(toEmail, link) {
  const subject = "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F \xB7 \u041A\u041F\u0412\u0421";
  const text = `\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043B\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u043F\u0430\u0440\u043E\u043B\u044F:
${link}

\u0415\u0441\u043B\u0438 \u0432\u044B \u043D\u0435 \u0437\u0430\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u043B\u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u2014 \u043F\u0440\u043E\u0441\u0442\u043E \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u044D\u0442\u043E \u043F\u0438\u0441\u044C\u043C\u043E.`;
  const cfg = createTransportFromEnv();
  if (!cfg) return false;
  return sendWithSmtp(cfg, {
    from: cfg.from,
    to: toEmail,
    subject,
    text
  });
}
async function trySendEmailVerificationCode(toEmail, code) {
  const subject = "\u041A\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F email \xB7 \u041A\u041F\u0412\u0421";
  const text = `\u0412\u0430\u0448 \u043A\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F: ${code}

\u041A\u043E\u0434 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 10 \u043C\u0438\u043D\u0443\u0442.
\u0415\u0441\u043B\u0438 \u0432\u044B \u043D\u0435 \u0437\u0430\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u043B\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u2014 \u043F\u0440\u043E\u0441\u0442\u043E \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u044D\u0442\u043E \u043F\u0438\u0441\u044C\u043C\u043E.`;
  const cfg = createTransportFromEnv();
  if (!cfg) return false;
  return sendWithSmtp(cfg, {
    from: cfg.from,
    to: toEmail,
    subject,
    text
  });
}
function isOutboundMailConfigured() {
  return !!createTransportFromEnv();
}
module.exports = { trySendResetEmail, trySendEmailVerificationCode, isOutboundMailConfigured };
