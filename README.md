# КПВС — сайт каталога спецодежды

Веб-приложение ООО «КПВС»: витрина каталога, карточка товара, личный кабинет покупателя и панель администратора. Один процесс Node.js отдаёт статику и REST API; данные хранятся в PostgreSQL.

## Состав проекта

| Часть | Технологии |
|-------|------------|
| Сервер | Node.js, Express 4, `pg`, `express-session` (хранилище сессий в PostgreSQL) |
| Клиент | HTML, CSS, JavaScript без сборщика |
| База | PostgreSQL (схема вручную в БД или через `npm run bootstrap-admin`; при `npm start` схема не меняется) |
| Медиа | S3-совместимое хранилище (Cloudflare R2 и аналоги) или локальная папка `public/img/uploads/` |
| Почта | SMTP (`nodemailer`) — коды подтверждения и сброс пароля |
| OAuth | Google (опционально) |

Точка входа: `server.js` → `server/index.js` → `server/app.js`.

## Структура каталогов

```
kpvs-site/
├── server.js                 # npm start
├── package.json
├── .env                      # не коммитится (см. .gitignore)
├── public/                   # фронтенд и статика
│   ├── welcome.html          # стартовая страница
│   ├── mens.html / womens.html / all.html
│   ├── product.html
│   ├── login.html
│   ├── admin.html
│   ├── css/  js/  img/
├── server/
│   ├── app.js                # Express, маршруты, запуск
│   ├── config/http-env.js    # PORT, секреты, OAuth
│   ├── db/                   # пул PostgreSQL, запросы, migrate.js
│   ├── routes/               # auth, catalog, admin, media
│   ├── middleware/           # CSRF, requireAuth, JWT пользователя
│   └── services/             # auth, storage, catalog-validation
└── scripts/
    └── bootstrap-admin.js    # миграции схемы + первый администратор
```

---

## Требования

- **Node.js** 18 или новее (рекомендуется LTS).
- **PostgreSQL** 14+ (локально, Supabase, Neon и т.п.).
- Для production за HTTPS: корректные `APP_BASE_URL`, `GOOGLE_CALLBACK_URL`, при необходимости `TRUST_PROXY=1` за reverse proxy.

Файл `.env` в корне репозитория обязателен для запуска с настройками (в git не попадает).

---

## Установка и первый запуск

### Шаг 1. Клонирование и зависимости

```bash
git clone <url-репозитория> kpvs-site
cd kpvs-site
npm install
```

### Шаг 2. База данных

Создайте пустую базу PostgreSQL. Удобнее всего передать подключение одной строкой:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Альтернатива для локальной разработки (без `DATABASE_URL`):

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=kpvs_db
PGUSER=postgres
PGPASSWORD=ваш_пароль
```

Для облачных хостов (Supabase, Neon) SSL включается автоматически по хосту в `DATABASE_URL`. При ошибках сертификата можно задать `PGSSL_REJECT_UNAUTHORIZED=false`.

### Шаг 3. Файл `.env`

Скопируйте шаблон ниже в `.env` и подставьте свои значения. Секреты генерируйте случайно (не менее 24 символов для production):

```env
# --- обязательно для production ---
NODE_ENV=production
SESSION_SECRET=случайная_строка_не_короче_24_символов
JWT_SECRET=другая_случайная_строка
DATABASE_URL=postgresql://...

# --- сервер ---
PORT=3000
TRUST_PROXY=0
COOKIE_SECURE=false
APP_BASE_URL=http://localhost:3000

# --- первый администратор (для npm run bootstrap-admin) ---
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=надёжный_пароль

# --- объектное хранилище (загрузка фото в админке) ---
STORAGE_ENDPOINT=https://...
STORAGE_KEY=...
STORAGE_SECRET=...
STORAGE_BUCKET=...
STORAGE_PUBLIC_URL=https://...

# --- Google OAuth (необязательно) ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/user/oauth/google/callback

# --- SMTP (необязательно; без него не работают письма с кодами) ---
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EMAIL_CODE_PEPPER=отдельный_секрет_для_хеша_кодов

# --- PostgreSQL (опционально) ---
# PG_POOL_MAX=4
# PGSSLMODE=require
```

В **development** (`NODE_ENV` не `production`) допустимы значения по умолчанию для `SESSION_SECRET` и `JWT_SECRET` из кода; для **production** без `SESSION_SECRET`, `JWT_SECRET` и `DATABASE_URL` процесс завершится с ошибкой.

### Шаг 4. Схема базы данных

Схему (таблицы, индексы, справочники) подготовьте **в PostgreSQL вручную** или один раз выполните:

```bash
npm run bootstrap-admin
```

Скрипт перед созданием администратора вызывает `runAllMigrations` из `server/db/migrate.js` (идемпотентно). Если админ уже не нужен, а нужно только обновить схему после изменений в репозитории — достаточно накатить DDL в БД своими средствами.

`npm start` **не** меняет схему — только проверяет подключение.

### Шаг 5. Запуск сервера

```bash
npm start
```

При успешном подключении к БД в консоли:

- `Connected to PostgreSQL`
- `Server running on http://localhost:3000`

Проверка: откройте `http://localhost:3000/` (редирект на `/welcome.html`) или `GET http://localhost:3000/health` → `{"status":"ok"}`.

Если БД недоступна, сервер всё равно слушает порт, но запросы к `/api/*` возвращают **503** («Сервис базы данных недоступен»). Если таблиц нет — подготовьте схему в PostgreSQL или выполните `npm run bootstrap-admin`.

### Шаг 6. Первый администратор

Если на шаге 4 вы ещё не запускали `bootstrap-admin`, выполните:

```bash
npm run bootstrap-admin
```

В `.env` должны быть заданы `ADMIN_EMAIL`, `ADMIN_PASSWORD` (не короче 6 символов), при необходимости `ADMIN_USERNAME` (по умолчанию `admin`). Создаётся пользователь с ролью **admin**.

Сброс пароля существующего staff-аккаунта:

```bash
npm run bootstrap-admin -- --reset-password
```

Вход в админку: `/login.html` → вкладка **Админ** → `/admin.html`. Товары добавляйте в админ-панели или импортируйте в БД.

---

## Роли и доступ

| Роль | Назначение | Вход |
|------|------------|------|
| `user` | Покупатель | `/login.html` → **Пользователь**, JWT в cookie `kpvs_user_jwt` |
| `admin` | Редактор каталога | `/login.html` → **Админ**, сессия `connect.sid` |
| `superadmin` | Управление staff и структурой категорий | То же, что admin |

Ограничения API (кратко):

- **superadmin**: список/создание/удаление staff, смена ролей; `PUT`/`DELETE` категорий; создание родительской категории раздела (`is_parent_category`).
- **admin**: товары, цвета, бренды, коллекции, размеры, создание подкатегорий (`POST /api/admin/categories`), загрузка изображений.
- Роль `user` **не** может войти через `/api/auth/login` (только через пользовательские эндпоинты).

Первый bootstrap создаёт `admin`. Роль `superadmin` назначается существующим superadmin через API или напрямую в БД.

---

## Категории каталога

Иерархия:

1. Корень **`catalog-root`** (`parent_id IS NULL`) — служебный, на витрине не показывается.
2. **Разделы** — дочерние корня (например «Мужская», «Женская»); создаёт superadmin с флагом «родительская категория раздела».
3. **Листовые категории** — к ним привязываются товары.

Товар можно разместить только в **листовой** категории. На страницах `mens.html`, `womens.html`, `all.html` товары группируются по разделам.

---

## Страницы сайта

| URL | Назначение |
|-----|------------|
| `/welcome.html` | Старт: мужской / женский раздел, весь каталог |
| `/mens.html`, `/womens.html`, `/all.html` | Каталог с фильтрами |
| `/product.html?slug=...` | Карточка товара |
| `/login.html` | Вход admin / user, регистрация, восстановление |
| `/admin.html` | Панель управления каталогом |
| `/error.html?code=403\|404\|500` | Страница ошибки |

Чистые URL без `.html`: запрос `/mens` отдаёт `mens.html`, если файл существует.

---

## API (обзор)

### Публичный каталог

- `GET /api/categories`, `/api/brands`, `/api/colors`, `/api/sizes`, `/api/collections`, `/api/seasons`
- `GET /api/products/:gender` — `mens`, `womens`, `all`
- `GET /api/product/:identifier` — slug или id
- `GET /api/search?q=...`

### Аутентификация staff

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`

### Пользователь (магазин)

- `POST /api/user/auth/register`, `/api/user/auth/login`, `/api/user/auth/logout`
- `POST /api/user/auth/email-code`, `/api/user/auth/recover`, `/api/user/auth/reset`
- `GET /api/user/oauth/google/start`, callback на `GOOGLE_CALLBACK_URL`

### Админка (нужна сессия staff)

Префикс `/api/admin/`: товары, категории, цвета, бренды, коллекции, размеры, справочники материалов, `POST /api/admin/uploads`.

### Служебное

- `GET /health` — проверка процесса
- `GET /api/csrf-token` — выдача CSRF-токена

Полный список маршрутов — в `server/routes/`.

---

## CSRF

Для изменяющих запросов (`POST`, `PUT`, `PATCH`, `DELETE`) клиент:

1. Выполняет `GET /api/csrf-token` (с `credentials: 'include'`).
2. Получает cookie **`XSRF-TOKEN`** и поле `csrfToken` в JSON.
3. Отправляет заголовок **`X-XSRF-TOKEN`** с тем же значением.

На сервере значение сверяется с `req.session.csrfToken` (`server/middleware/csrf.js`). В фронтенде используется обёртка `KpvsApi.apiFetch` из `public/js/utils/api.js`.

---

## Загрузка изображений

`POST /api/admin/uploads` (multipart, поле `images`, до 12 файлов):

- Если заданы `STORAGE_*` — файлы уходят в S3-совместимое хранилище, в ответе публичные URL (`STORAGE_PUBLIC_URL`).
- Если хранилище не настроено — сохранение в `public/img/uploads/` (каталог в `.gitignore`).

Допустимые типы: JPEG, PNG, WebP, AVIF; максимум **10 МБ** на файл. URL в карточке товара проверяются: относительный путь с одной `/` или `http:`/`https:` без опасных схем.

---

## Переменные окружения

| Переменная | Обязательность | Описание |
|------------|----------------|----------|
| `NODE_ENV` | production | `production` включает строгие проверки |
| `SESSION_SECRET` | production | Секрет сессии staff, ≥ 24 символов |
| `JWT_SECRET` | production | Подпись JWT покупателя |
| `DATABASE_URL` | production | Строка подключения PostgreSQL |
| `PORT` | нет | Порт HTTP (по умолчанию `3000`) |
| `TRUST_PROXY` | нет | `1` — доверять `X-Forwarded-*` (за nginx, Render, Cloudflare) |
| `COOKIE_SECURE` | нет | `true` — cookie только по HTTPS |
| `APP_BASE_URL` | для писем | Публичный URL сайта (`https://...`) для ссылок сброса пароля |
| `ADMIN_*` | bootstrap | Логин/email/пароль первого admin |
| `STORAGE_*` | для облачных фото | Endpoint, ключи, bucket, публичный URL |
| `GOOGLE_*` | OAuth | Client ID/secret и callback URL |
| `SMTP_*` / `SMTP_URL` | почта | Иначе коды на email не отправляются |
| `EMAIL_CODE_PEPPER` | рекомендуется | Доп. секрет для хеша кодов (иначе используется `JWT_SECRET`) |
| `PUBLIC_URL` / `MEDIA_CDN_BASE` | нет | База для относительных путей медиа |
| `PGHOST`, `PGPORT`, … | dev | Альтернатива `DATABASE_URL` |
| `PG_POOL_MAX` | нет | Размер пула (для Supabase pooler по умолчанию до 4) |

---

## Production

1. `NODE_ENV=production`
2. Уникальные длинные `SESSION_SECRET` и `JWT_SECRET`
3. Рабочий `DATABASE_URL`
4. После деплоя кода с изменениями схемы: накатите DDL в PostgreSQL или `npm run bootstrap-admin` (применит миграции из `server/db/migrate.js`)
5. `COOKIE_SECURE=true` при работе только по HTTPS
6. `APP_BASE_URL=https://ваш-домен` (без завершающего `/`)
7. За reverse proxy: `TRUST_PROXY=1`
8. В Google Cloud Console — redirect URI = `GOOGLE_CALLBACK_URL`
9. Настроить `STORAGE_*` (на production локальная папка uploads обычно не подходит)

Пример деплоя: Render, Fly.io, VPS с systemd + nginx. Статику отдаёт тот же Node-процесс из `public/`.

---

## npm-скрипты

| Команда | Действие |
|---------|----------|
| `npm start` | Запуск сервера (без изменений БД) |
| `npm run bootstrap-admin` | Миграции схемы + создать admin или сбросить пароль (`-- --reset-password`) |

---

## Устранение неполадок

| Симптом | Что проверить |
|---------|----------------|
| `FATAL: Missing required environment variable` | В production заданы `SESSION_SECRET`, `JWT_SECRET`, `DATABASE_URL` |
| `503` на `/api/*` | PostgreSQL недоступен, неверный `DATABASE_URL` или схема не подготовлена |
| `relation "users" does not exist` и похожие | Накатите схему в PostgreSQL или `npm run bootstrap-admin` |
| `ENOTFOUND` в логе | В `DATABASE_URL` указан несуществующий хост |
| `ECONNREFUSED` | PostgreSQL не запущен или неверный порт |
| `EBADCSRFTOKEN` / 403 CSRF | Обновите страницу, запросите `/api/csrf-token`, используйте `apiFetch` |
| Загрузка фото в админке падает | `STORAGE_*` или права на `public/img/uploads/` |
| Google OAuth не работает | `GOOGLE_CLIENT_ID`, `SECRET`, точный `GOOGLE_CALLBACK_URL`, HTTPS в production |
| Письма не приходят | `SMTP_*`, для Gmail — пароль приложения, не обычный пароль |
| Порт занят | `PORT=3001 npm start` или остановите другой процесс |

---

## Безопасность

- Пароли staff и user хранятся в виде bcrypt-хешей.
- Сессии staff — httpOnly cookie, 8 часов.
- OAuth `next` — только безопасные внутренние пути (`sanitizeOAuthNextPath` в `server/services/auth-helpers.js`).
- Helmet подключён (CSP отключён из‑за inline-стилей legacy-вёрстки).
- Файл `.env` не коммитить; секреты из репозитория при утечке сменить.

---

## Лицензия и контакты

Проект дипломной / учебной разработки ООО «КПВС». По вопросам эксплуатации — к ответственному за инфраструктуру проекта.
