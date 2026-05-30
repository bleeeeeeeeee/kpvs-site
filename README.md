# КПВС

Каталог спецодежды: витрина, карточка товара, личный кабинет, админка. Node.js отдаёт статику из `public/` и REST API, данные в PostgreSQL.

Node.js 18+, PostgreSQL 14+. Стек: Express, `pg`, сессии staff, JWT покупателей, опционально S3/R2 и SMTP.

## Запуск

```bash
npm install
```

`.env` в корне. Подключение: `DATABASE_URL` или `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD`.

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/kpvs_db
```

Первый запуск сервера создаёт **только таблицы и колонки** (без товаров, коллекций и справочников):

```bash
npm start
```

Первый администратор — отдельной командой (только учётная запись staff):

```bash
npm run bootstrap-admin
```

В `.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 6 символов), при необходимости `ADMIN_USERNAME` (по умолчанию `admin`).

Каталог, размеры, коллекции, материалы — **только через админку**, автоматически не подставляются.

[http://localhost:3000](http://localhost:3000) → `/welcome.html`. Проверка: `GET /health`.

## Production

```env
NODE_ENV=production
SESSION_SECRET=…        # ≥ 24 символов
JWT_SECRET=…
DATABASE_URL=…
```

Часто: `APP_BASE_URL`, `TRUST_PROXY=1` на Render, `COOKIE_SECURE` (в production по умолчанию включён). Опционально: `STORAGE_*`, `SMTP_*`, `GOOGLE_*`, `PUBLIC_URL`.

## Команды

| Команда | Действие |
|---------|----------|
| `npm start` | Сервер + схема БД (DDL, без демо-данных) |
| `npm run bootstrap-admin` | Создать admin |
| `npm run bootstrap-admin -- --reset-password` | Сброс пароля staff |

## Структура

```
server/index.js       точка входа
server/app.js           Express
server/config.js        переменные окружения
server/schema.js        DDL при connectDB
server/middleware.js    CSRF, auth
server/routes/          auth, catalog, admin, system
server/services/        auth, почта, storage
server/db/queries/      SQL
public/                 фронтенд
scripts/bootstrap-admin.js
```

## Сдача диплома — чеклист

1. PostgreSQL (Supabase / Neon / локально) + `.env`
2. `npm start` — схема БД
3. `npm run bootstrap-admin` — admin
4. `/admin` — категории, товары, размеры, коллекции
5. Render: `TRUST_PROXY=1`, redeploy после push

---

Дипломный проект ООО «КПВС».
