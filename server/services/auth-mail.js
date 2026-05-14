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
class MailProviderError extends Error {
  constructor(message, { clientCode = "mail_provider_error", httpStatus = 503 } = {}) {
    super(message);
    this.name = "MailProviderError";
    this.clientCode = clientCode;
    this.httpStatus = httpStatus;
  }
}
function brevoApiKey() {
  return String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || "").trim();
}
function parseNameEmailFromFromHeader(fromRaw) {
  const s = stripOuterQuotes(fromRaw || "");
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    return { name: m[1].trim().replace(/^["']|["']$/g, ""), email: m[2].trim() };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { name: "", email: s };
  return { name: "", email: "" };
}
function brevoSender() {
  const direct = String(process.env.BREVO_SENDER_EMAIL || process.env.SMTP_SENDER_EMAIL || "").trim();
  if (direct && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(direct)) {
    const name = String(process.env.BREVO_SENDER_NAME || process.env.SMTP_SENDER_NAME || "KPVS").trim() || "KPVS";
    return { name, email: direct };
  }
  const from = stripOuterQuotes(process.env.SMTP_FROM || process.env.SMTP_USER || "");
  const parsed = parseNameEmailFromFromHeader(from);
  if (parsed.email) {
    return { name: parsed.name || "KPVS", email: parsed.email };
  }
  const user = String(process.env.SMTP_USER || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) return { name: "KPVS", email: user };
  return { name: "", email: "" };
}
function sendgridApiKey() {
  return String(process.env.SENDGRID_API_KEY || "").trim();
}
function sendgridSender() {
  const direct = String(process.env.SENDGRID_FROM_EMAIL || "").trim();
  if (direct && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(direct)) {
    const name = String(process.env.SENDGRID_FROM_NAME || process.env.SMTP_SENDER_NAME || "KPVS").trim() || "KPVS";
    return { name, email: direct };
  }
  const resendHdr = stripOuterQuotes(process.env.RESEND_FROM || "");
  const fromResend = parseNameEmailFromFromHeader(resendHdr);
  if (fromResend.email) {
    return { name: fromResend.name || "KPVS", email: fromResend.email };
  }
  return brevoSender();
}
function sendgridFirstErrorMessage(parsed) {
  if (!parsed || typeof parsed !== "object") return "";
  const arr = parsed.errors;
  if (!Array.isArray(arr) || !arr.length) return "";
  const m = arr[0] && arr[0].message;
  return typeof m === "string" ? m : "";
}
async function trySendViaSendGrid(toEmail, subject, text) {
  const apiKey = sendgridApiKey();
  const sender = sendgridSender();
  if (!apiKey || !sender.email) return false;
  const apiHost = String(process.env.SENDGRID_API_HOST || "api.sendgrid.com")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  const sendUrl = "https://" + (apiHost || "api.sendgrid.com") + "/v3/mail/send";
  const payload = {
    personalizations: [{ to: [{ email: String(toEmail || "").trim() }] }],
    from: { email: sender.email, name: sender.name || "KPVS" },
    subject: String(subject || ""),
    content: [{ type: "text/plain", value: String(text || "") }]
  };
  let res;
  try {
    res = await fetch(sendUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    logMailError("sendgrid-fetch", err);
    return false;
  }
  if (!res.ok) {
    let raw = "";
    try {
      raw = await res.text();
    } catch {
    }
    console.error("[mail] sendgrid HTTP", res.status, raw.slice(0, 1200));
    let j = null;
    try {
      j = JSON.parse(raw);
    } catch {
    }
    const apiMsg = sendgridFirstErrorMessage(j) || raw.slice(0, 500);
    if (res.status === 401) {
      throw new MailProviderError(
        "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0437\u043E\u0432\u0430\u043D\u043D\u044B\u0439 SendGrid API key (\u043E\u0442\u0432\u0435\u0442 401). \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0443\u044E SENDGRID_API_KEY \u0432 \u043F\u0430\u043D\u0435\u043B\u0438 SendGrid (\u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 API Keys) \u0438 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A API." +
          (apiMsg ? " SendGrid: " + apiMsg : ""),
        { clientCode: "sendgrid_unauthorized", httpStatus: 503 }
      );
    }
    const first = Array.isArray(j && j.errors) ? j.errors[0] : null;
    const firstField = first && String(first.field || "");
    const firstMsg = first && typeof first.message === "string" ? first.message : "";
    if (res.status === 403 && (firstField === "from" || /verified Sender Identity|Sender Identity|authenticated domain|does not match a verified/i.test(firstMsg + apiMsg))) {
      throw new MailProviderError(
        "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u0432 SendGrid (Single Sender \u0438\u043B\u0438 Domain Authentication). \u0412 \u043A\u0430\u0431\u0438\u043D\u0435\u0442\u0435 SendGrid \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0442\u043E\u0442 \u0436\u0435 email, \u0447\u0442\u043E \u0432 SENDGRID_FROM_EMAIL / \u0430\u0434\u0440\u0435\u0441 \u0432 From." +
          (apiMsg ? " SendGrid: " + apiMsg : ""),
        { clientCode: "sendgrid_sender_not_verified", httpStatus: 503 }
      );
    }
    return false;
  }
  return true;
}
async function trySendViaBrevo(toEmail, subject, text) {
  const apiKey = brevoApiKey();
  const sender = brevoSender();
  if (!apiKey || !sender.email) return false;
  let res;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender: { email: sender.email, name: sender.name || "KPVS" },
        to: [{ email: String(toEmail || "").trim() }],
        subject: String(subject || ""),
        textContent: String(text || "")
      })
    });
  } catch (err) {
    logMailError("brevo-fetch", err);
    return false;
  }
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
    }
    console.error("[mail] brevo HTTP", res.status, body.slice(0, 1200));
    let j = null;
    try {
      j = JSON.parse(body);
    } catch {
    }
    const apiMsg = String((j && j.message) || body || "");
    if (res.status === 401) {
      if (/unrecognised IP|unrecognized IP|IP address|unrecognised/i.test(apiMsg) || (j && j.code === "unauthorized" && /IP/i.test(apiMsg))) {
        throw new MailProviderError(
          "\u0412 Brevo \u0434\u043B\u044F API-\u043A\u043B\u044E\u0447\u0430 \u0432\u043A\u043B\u044E\u0447\u0451\u043D \u0441\u043F\u0438\u0441\u043E\u043A \u0440\u0430\u0437\u0440\u0451\u0448\u0451\u043D\u043D\u044B\u0445 IP, \u0430 IP \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (Render) \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0438\u043B\u0438 \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 https://app.brevo.com/security/authorised_ips \u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043F\u043E IP \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043A\u043B\u044E\u0447\u0430 (\u0434\u043B\u044F Render \u044D\u0442\u043E \u043D\u0430\u0434\u0451\u0436\u043D\u0435\u0435, \u0447\u0435\u043C \u0431\u0435\u043B\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A IP).",
          { clientCode: "brevo_ip_not_allowed", httpStatus: 503 }
        );
      }
    }
    if (res.status === 403 && j && j.code === "permission_denied") {
      throw new MailProviderError(
        "\u0412 Brevo \u0435\u0449\u0451 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u0438\u0441\u0435\u043C (\u043E\u0442\u0432\u0435\u0442 API: permission_denied). \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0443 \u0438 \u0432\u0435\u0440\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044E \u0432 \u043B\u0438\u0447\u043D\u043E\u043C \u043A\u0430\u0431\u0438\u043D\u0435\u0442\u0435 Brevo (\u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C, \u0434\u043E\u043C\u0435\u043D) \u0438\u043B\u0438 \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0443 contact@brevo.com. \u041F\u043E\u043A\u0430 \u044D\u0442\u043E \u043D\u0435 \u0441\u0434\u0435\u043B\u0430\u043D\u043E, \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0439 SMTP \u043A Brevo \u0442\u043E\u0436\u0435 \u043C\u043E\u0436\u0435\u0442 \u043D\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C.",
        { clientCode: "brevo_smtp_not_activated", httpStatus: 503 }
      );
    }
    return false;
  }
  return true;
}
async function trySendViaResend(toEmail, subject, text) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = stripOuterQuotes(process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "");
  if (!apiKey || !from) return false;
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [String(toEmail || "").trim()],
        subject: String(subject || ""),
        text: String(text || "")
      })
    });
  } catch (err) {
    logMailError("resend-fetch", err);
    return false;
  }
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
    }
    console.error("[mail] resend HTTP", res.status, body.slice(0, 800));
    return false;
  }
  return true;
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
  if (await trySendViaSendGrid(toEmail, subject, text)) return true;
  if (await trySendViaBrevo(toEmail, subject, text)) return true;
  if (await trySendViaResend(toEmail, subject, text)) return true;
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
  if (await trySendViaSendGrid(toEmail, subject, text)) return true;
  if (await trySendViaBrevo(toEmail, subject, text)) return true;
  if (await trySendViaResend(toEmail, subject, text)) return true;
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
  if (sendgridApiKey()) {
    return !!sendgridSender().email;
  }
  if (brevoApiKey()) {
    return !!brevoSender().email;
  }
  if (String(process.env.RESEND_API_KEY || "").trim()) {
    const from = stripOuterQuotes(process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "");
    return !!from;
  }
  return !!createTransportFromEnv();
}
module.exports = { trySendResetEmail, trySendEmailVerificationCode, isOutboundMailConfigured, MailProviderError };
