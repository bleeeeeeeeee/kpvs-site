# КПВС

Сайт-каталог спецодежды ООО «КПВС». Статические страницы в `public/`, REST API и админка на Node.js, данные в PostgreSQL.

Стек: Express, `pg`, сессии staff в БД, JWT для покупателей, опционально Google OAuth, загрузка изображений в S3/R2 или в `public/img/uploads/`.

Требования: Node.js 18+, PostgreSQL 14+.

## Запуск локально

```bash
npm install
npm start
```

Создай `.env` в корне:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/kpvs_db
```

Можно вместо `DATABASE_URL` указать `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`.

При старте поднимается схема БД (таблицы, колонки, индексы). Автоматически создаётся только корневая категория каталога. Товары, разделы, коллекции и размеры — через админку.

- Сайт: http://localhost:3000
- Стартовая: `/welcome.html` (с `/` редирект туда же)
- Health: `GET /health`
- API без БД отвечает 503 (кроме `/health`)

На `http://localhost` не ставь `COOKIE_SECURE=true` — cookies не сохранятся. В dev по умолчанию secure выключен.

## Администратор

```bash
npm run bootstrap-admin
```

В `.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (от 6 символов), при необходимости `ADMIN_USERNAME` (по умолчанию `admin`).

Сброс пароля staff:

```bash
npm run bootstrap-admin -- --reset-password
```

Админка: `/admin`. Вход сотрудников: `/login.html?mode=admin`.  
Покупатели: `/login.html?mode=user` (отдельный вход, роль `user`).

Роли: `admin` / `superadmin` — CMS; `superadmin` дополнительно управляет пользователями и корневыми категориями.

## Страницы

- `/welcome.html` — выбор раздела
- `/mens.html`, `/womens.html`, `/all.html` — каталог
- `/product.html` — товар (`?slug=` или `?id=`)
- `/login.html` — вход
- `/admin.html` — админка

Корзина и избранное — в `localStorage`, у авторизованных ещё на сервере. Оплаты в сайте нет, цена по запросу.

## Production (Render и аналоги)

Build: `npm install`  
Start: `npm start`  
Health check: `/health`

```env
NODE_ENV=production
DATABASE_URL=...
SESSION_SECRET=...   # не короче 24 символов
JWT_SECRET=...
TRUST_PROXY=1
APP_BASE_URL=https://твой-домен.onrender.com
```

`TRUST_PROXY=1` обязателен за reverse proxy — иначе ломаются сессии и CSRF.

Опционально: `STORAGE_*` (S3/R2), `SMTP_*` (письма), `GOOGLE_*` (OAuth), `PUBLIC_URL`, `COOKIE_SECURE`.

## Структура

```
server.js           npm start
server/             Express, routes, schema, db/queries, services
public/             HTML, CSS, JS, img
scripts/            bootstrap-admin.js
```

Точка входа: `server.js` → `server/index.js` → `server/app.js`.

---

Дипломный проект ООО «КПВС».
