# КПВС

Сайт-каталог спецодежды. Дипломный проект ООО «КПВС».

Статика лежит в `public/`, API и админка — в `server/`. База — PostgreSQL.

**Стек:** Node.js, Express, PostgreSQL. На фронте — обычный HTML/CSS/JS без сборщика.

**Страницы:** стартовая (`/welcome.html`), каталог (мужской / женский / весь), карточка товара, вход, админка (`/admin.html`).

---

## Требования

- Node.js 18+
- PostgreSQL 14+

## Локальный запуск

```bash
npm install
npm start
```

Создай `.env` в корне проекта:

```env
DATABASE_URL=postgresql://postgres:пароль@localhost:5432/kpvs_db
```

Вместо `DATABASE_URL` можно задать `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` — но `PGPASSWORD` обязателен.

При старте сервер сам накатывает схему (таблицы, колонки, индексы). Автоматически появляется только служебная категория `catalog-root`. Товары, разделы, коллекции и размеры — через админку.

**Первый администратор** — отдельной командой, после того как БД доступна:

```env
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=пароль_от_6_символов
ADMIN_USERNAME=admin
```

```bash
npm run bootstrap-admin
```

Сброс пароля существующего staff-аккаунта:

```bash
npm run bootstrap-admin -- --reset-password
```

Сайт: http://localhost:3000  
Стартовая страница: `/welcome.html`  
Проверка сервера: `GET /health`

---

## Production

Минимум в `.env`:

```env
NODE_ENV=production
DATABASE_URL=...
SESSION_SECRET=...   # не короче 24 символов
JWT_SECRET=...
TRUST_PROXY=1
APP_BASE_URL=https://ваш-домен
```

`TRUST_PROXY=1` нужен за reverse proxy (Render, nginx и т.п.) — иначе могут ломаться сессии и CSRF.

Сборка: `npm install`. Запуск: `npm start`. Health check: `/health`.

По желанию:

- `STORAGE_*` — загрузка картинок в S3/R2
- `SMTP_*` или `SMTP_URL` — почта (восстановление пароля)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — вход через Google
- `PUBLIC_URL` — базовый URL для медиа в ответах API
- `COOKIE_SECURE` — в production по умолчанию `true`

---

## Структура

```
server.js              точка входа (npm start)
server/
  app.js               Express, middleware, статика
  routes/              catalog, admin, auth, system
  db/                  пул, запросы, схема
public/                HTML, CSS, JS
scripts/
  bootstrap-admin.js   создание / сброс пароля админа
```
