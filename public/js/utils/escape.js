(function(global) {
  "use strict";
  function escapeAttr(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  global.KpvsEscape = { escapeAttr, escapeHtml };
})(typeof window !== "undefined" ? window : globalThis);
