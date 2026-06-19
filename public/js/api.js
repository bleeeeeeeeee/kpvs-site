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

const FOOTER_MAP_URL =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Брест, ул. л-та Рябцева, 44");

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
