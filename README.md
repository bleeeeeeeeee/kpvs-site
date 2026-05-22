# КПВС

Каталог спецодежды: витрина, карточка товара, личный кабинет, админка. Один процесс Node.js — статика из `public/` и REST API, данные в PostgreSQL.

Node.js 18+, PostgreSQL 14+. Стек: Express, `pg`, сессии staff в таблице `session`, JWT покупателям, по желанию S3/R2 и SMTP.

## Запуск

```bash
npm install
```

`.env` в корне (в git не коммитится). Подключение к БД — `DATABASE_URL` или `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` (без `DATABASE_URL` нужен непустой `PGPASSWORD`).

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/kpvs_db
```

Миграции и первый администратор:

```bash
npm run bootstrap-admin
```

Нужны `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 6 символов); логин — `ADMIN_USERNAME` (по умолчанию `admin`). Создаётся роль **admin**. Скрипт всегда сначала накатывает миграции; повторный запуск без нового admin только обновит схему.

```bash
npm start
```

[http://localhost:3000](http://localhost:3000) → `/welcome.html`. Живость процесса: `GET /health` (работает и без БД). `npm start` схему не трогает.

## Production

Обязательно:

```env
NODE_ENV=production
SESSION_SECRET=…        # ≥ 24 символов
JWT_SECRET=…
DATABASE_URL=…
```

Часто ещё: `APP_BASE_URL` (ссылки в письмах), `PORT`, `TRUST_PROXY=1` за reverse proxy, `COOKIE_SECURE=true` по HTTPS.

Опционально: `STORAGE_ENDPOINT`, `STORAGE_KEY`, `STORAGE_SECRET`, `STORAGE_BUCKET`, `STORAGE_PUBLIC_URL` — загрузки в объектное хранилище; иначе файлы в `public/img/uploads/`. `SMTP_URL` или `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` — коды на email; `EMAIL_CODE_PEPPER`. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (по умолчанию `http://localhost:PORT/api/user/oauth/google/callback`). `PUBLIC_URL` или `MEDIA_CDN_BASE` — база для относительных URL медиа.

В development секреты сессии и JWT подставляются из кода, если не заданы.

## Команды

| Команда | Действие |
|---------|----------|
| `npm start` | HTTP-сервер |
| `npm run bootstrap-admin` | Миграции + создать admin |
| `npm run bootstrap-admin -- --reset-password` | Новый пароль staff (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) |

## Сайт

- `/`, `/welcome` — старт
- `/mens`, `/womens`, `/all` — каталог
- `/product?slug=…` — товар
- `/login` — вход (вкладки «Пользователь» / «Админ»)
- `/admin` — панель каталога
- `/error?code=404` — страница ошибки (403, 404, 500)

Пути без `.html` отдают одноимённый файл из `public/`, если он есть.

## Роли

| Роль | Доступ |
|------|--------|
| `user` | Покупатель; cookie `kpvs_user_jwt` |
| `admin` | Товары, справочники, загрузки; сессия `connect.sid` |
| `superadmin` | Staff, родительские разделы каталога |

`user` не входит через `/api/auth/login`. **superadmin** назначает существующий superadmin (API или БД), не bootstrap.

Маршруты: `server/routes/`.

## Код

```
server.js → server/index.js → server/app.js
public/              страницы и статика
public/js/utils/     api.js (fetch + CSRF), escape.js
server/routes/       HTTP
server/db/queries/   SQL
server/services/     почта, storage, валидация
scripts/             bootstrap-admin.js
```

Изменяющие запросы к API: `GET /api/csrf-token`, cookie `XSRF-TOKEN`, заголовок `X-XSRF-TOKEN`. При недоступной БД `/api/*` → **503**, HTML и `/health` — как обычно.

---

Дипломный проект ООО «КПВС».
