const path = require("path");
const fs = require("fs");

const ERROR_PAGE_META = {
  403: {
    title: "Доступ запрещён",
    description: "У вас нет прав для просмотра этого ресурса."
  },
  404: {
    title: "Страница не найдена",
    description:
      "Запрошенный адрес отсутствует или был перемещён. Проверьте ссылку или вернитесь на главную."
  },
  500: {
    title: "Ошибка сервера",
    description: "Не удалось обработать запрос. Попробуйте позже или сообщите администратору."
  }
};

function renderErrorHtml(pubRoot, statusCode) {
  const code = [403, 404, 500].includes(Number(statusCode)) ? Number(statusCode) : 404;
  const meta = ERROR_PAGE_META[code];
  const errorPath = path.join(pubRoot, "error.html");
  if (!fs.existsSync(errorPath)) {
    return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/img/logo-preview.png" type="image/png"><link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/img/logo-preview.png"><title>Error</title></head><body><p>Ошибка</p></body></html>';
  }
  let html = fs.readFileSync(errorPath, "utf8");
  return html
    .replace(/\{\{CODE\}\}/g, String(code))
    .replace(/\{\{TITLE\}\}/g, meta.title)
    .replace(/\{\{DESCRIPTION\}\}/g, meta.description);
}

function sendHtmlError(res, pubRoot, statusCode) {
  const code = [403, 404, 500].includes(Number(statusCode)) ? Number(statusCode) : 404;
  res.status(code).type("html").send(renderErrorHtml(pubRoot, code));
}

function isApiPath(p) {
  return p === "/api" || (typeof p === "string" && p.startsWith("/api/"));
}

module.exports = { renderErrorHtml, sendHtmlError, isApiPath };
