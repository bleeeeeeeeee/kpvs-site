(function (global) {
  "use strict";

  function escapeAttr(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  global.KpvsEscape = { escapeAttr, escapeHtml };
})(typeof window !== "undefined" ? window : globalThis);

function readCookie(name) {
  const m = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return m ? decodeURIComponent(m[1]) : "";
}

function apiFetch(url, init) {
  const next = Object.assign({}, init || {});
  if (!next.credentials) next.credentials = "include";
  const method = String(next.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const xsrf = readCookie("XSRF-TOKEN");
    next.headers = Object.assign({}, next.headers || {});
    if (xsrf && !next.headers["X-XSRF-TOKEN"]) next.headers["X-XSRF-TOKEN"] = xsrf;
  }
  return window.fetch(url, next);
}

const PROFILE_SYNC_KEY = "kpvs.profile.revision";

function notifyProfileChanged(kind) {
  const stamp = String(Date.now()) + ":" + String(kind || "profile");
  try {
    localStorage.setItem(PROFILE_SYNC_KEY, stamp);
  } catch {
  }
  try {
    document.dispatchEvent(
      new CustomEvent("kpvs-profile-changed", { detail: { kind: String(kind || "profile") } })
    );
  } catch {
  }
}

function currentReturnPath() {
  return (window.location.pathname || "/") + (window.location.search || "");
}

function loginUrlWithNext(nextPath) {
  const raw = String(nextPath != null ? nextPath : currentReturnPath()).trim() || "/welcome.html";
  const path = raw.startsWith("/") ? raw : "/" + raw;
  return "/login.html?mode=user&next=" + encodeURIComponent(path);
}

const FOOTER_MAP_PLACE = "КПВС ООО";
const FOOTER_MAP_ADDRESS = "ул. Лейтенанта Рябцева 44, Брест";
const FOOTER_MAP_LAT = 52.1179672;
const FOOTER_MAP_LNG = 23.6695065;
const FOOTER_MAP_PLACE_REF = "0x47210bdbccd7789b:0x18c9ae031a4dfc67";
const FOOTER_MAP_URL =
  "https://www.google.com/maps/place/" +
  encodeURIComponent(FOOTER_MAP_PLACE + ", " + FOOTER_MAP_ADDRESS) +
  "/@" +
  FOOTER_MAP_LAT +
  "," +
  FOOTER_MAP_LNG +
  ",17z/data=!3m1!4b1!4m6!3m5!1s" +
  FOOTER_MAP_PLACE_REF +
  "!8m2!3d" +
  FOOTER_MAP_LAT +
  "!4d" +
  FOOTER_MAP_LNG +
  "!16s%2Fg%2F1hc329r6q?hl=ru";

function initFooterContacts() {
  document.querySelectorAll(".footer-contact").forEach(function (el) {
    if (el.querySelector("a[href^='tel:'], a[href^='mailto:']")) return;
    if (!(el.textContent || "").includes("ул.")) return;
    el.addEventListener("click", function () {
      window.open(FOOTER_MAP_URL, "_blank", "noopener,noreferrer");
    });
    el.style.cursor = "pointer";
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFooterContacts);
} else {
  initFooterContacts();
}

window.KpvsApi = { apiFetch, readCookie, notifyProfileChanged, PROFILE_SYNC_KEY, currentReturnPath, loginUrlWithNext };
