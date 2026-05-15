const path = require("path");
const fs = require("fs");
const ERROR_PAGE_META = {
  403: {
    title: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D",
    description: "\u0423 \u0432\u0430\u0441 \u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u044D\u0442\u043E\u0433\u043E \u0440\u0435\u0441\u0443\u0440\u0441\u0430."
  },
  404: {
    title: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
    description: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0438\u043B\u0438 \u0431\u044B\u043B \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0451\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u0438\u043B\u0438 \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E."
  },
  500: {
    title: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    description: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435 \u0438\u043B\u0438 \u0441\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443."
  }
};
function renderErrorHtml(pubRoot, statusCode) {
  const code = [403, 404, 500].includes(Number(statusCode)) ? Number(statusCode) : 404;
  const meta = ERROR_PAGE_META[code];
  const errorPath = path.join(pubRoot, "error.html");
  if (!fs.existsSync(errorPath)) {
    return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/img/logo-preview.png" type="image/png"><link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/img/logo-preview.png"><title>Error</title></head><body><p>\u041E\u0448\u0438\u0431\u043A\u0430</p></body></html>';
  }
  let html = fs.readFileSync(errorPath, "utf8");
  return html.replace(/\{\{CODE\}\}/g, String(code)).replace(/\{\{TITLE\}\}/g, meta.title).replace(/\{\{DESCRIPTION\}\}/g, meta.description);
}
function sendHtmlError(res, pubRoot, statusCode) {
  const code = [403, 404, 500].includes(Number(statusCode)) ? Number(statusCode) : 404;
  res.status(code).type("html").send(renderErrorHtml(pubRoot, code));
}
function isApiPath(p) {
  return p === "/api" || typeof p === "string" && p.startsWith("/api/");
}
module.exports = { renderErrorHtml, sendHtmlError, isApiPath };
