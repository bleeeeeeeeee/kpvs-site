# КПВС

Сайт-каталог спецодежды. Статика в `public/`, API и админка на Node.js, данные в PostgreSQL.

Нужны Node.js 18+ и PostgreSQL 14+.

## Локально

```bash
npm install
npm start
```

В `.env` минимум:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/kpvs_db
```

Можно вместо `DATABASE_URL` указать `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`.

При старте поднимается схема БД (таблицы, колонки, индексы). Из «данных» автоматически появляется только служебная категория `catalog-root`. Товары, разделы, коллекции, размеры — через `/admin`.

Первого админа создаёшь отдельно:

```bash
npm run bootstrap-admin
```

В `.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (от 6 символов), по желанию `ADMIN_USERNAME` (по умолчанию `admin`).

Сброс пароля staff:

```bash
npm run bootstrap-admin -- --reset-password
```

Сайт: http://localhost:3000 (стартовая — `/welcome.html`). Жив ли сервер: `GET /health`.

## Production / Render

```env
NODE_ENV=production
DATABASE_URL=...
SESSION_SECRET=...   # от 24 символов
JWT_SECRET=...
TRUST_PROXY=1
APP_BASE_URL=https://твой-домен.onrender.com
```

Build: `npm install`. Start: `npm start`. Health check: `/health`.

На Render без `TRUST_PROXY=1` за прокси могут ломаться сессии и CSRF.

По желанию: `STORAGE_*` (S3/R2), `SMTP_*`, `GOOGLE_*`, `PUBLIC_URL`, `COOKIE_SECURE` (в production по умолчанию включён).

## Структура

```
server.js          → npm start
server/            Express, routes, schema, db/queries
public/            фронт
scripts/           bootstrap-admin
```

---

Дипломный проект ООО «КПВС».
