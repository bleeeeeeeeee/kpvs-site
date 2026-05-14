# Деплой KPVS site

Node.js (Express), PostgreSQL, статика из `public/`, загрузки изображений в S3-совместимое API (`@aws-sdk/client-s3`).

Подробный список переменных окружения см. [.env.example](.env.example).

## 1. Минимальный production-чеклист

| Шаг | Действие |
|-----|----------|
| 1 | Установить **Node.js** LTS на сервере или использовать контейнер с LTS. |
| 2 | Создать БД **PostgreSQL**, выдать строку `DATABASE_URL` (желательно с `sslmode=require`). |
| 3 | Задать **`NODE_ENV=production`**. |
| 4 | Задать **`SESSION_SECRET`** (не короче 24 символов) и желательно отдельный **`JWT_SECRET`**. |
| 5 | Настроить **S3-совместимое хранилище** и переменные `STORAGE_*` (см. раздел 4). Без них загрузка картинок в админке вернёт ошибку `storage_not_configured`. |
| 6 | Указать **`APP_BASE_URL`** как публичный `https://ваш-домен` (письма восстановления пароля). |
| 7 | Включить **`COOKIE_SECURE=true`**, если сайт отдаётся только по **HTTPS**. |
| 8 | За reverse proxy (Nginx, Caddy, Traefik) выставить **`TRUST_PROXY=1`**. |
| 9 | Проксировать HTTPS → `http://127.0.0.1:$PORT` (порт из переменной **`PORT`**, по умолчанию 3000). |
| 10 | Первого администратора создать вручную или **`npm run bootstrap-admin`** один раз на сервере с `ADMIN_EMAIL`, `ADMIN_PASSWORD` в окружении (см. README). |

## 2. Установка и запуск

```bash
npm ci
# или
npm install --omit=dev
npm start
```

Точка входа: `server.js` → Express. Сессии хранятся в PostgreSQL (`connect-pg-simple`), таблица сессий создаётся при старте при необходимости.

## 3. Переменные окружения (сводка)

| Переменная | Обязательность | Назначение |
|------------|----------------|------------|
| `NODE_ENV` | production: **да** | Режим production, проверки секретов. |
| `PORT` | нет | Порт HTTP-сервера (по умолчанию 3000). |
| `DATABASE_URL` | production: **да** | Строка подключения PostgreSQL. |
| `PG_POOL_MAX` | нет | Верхняя граница пула `pg` (по умолчанию **4** для Supabase/Neon в URL — меньше риск `EMAXCONNSESSION` на Render). |
| `PGSSLMODE` / `PGSSL` / `PGSSL_REJECT_UNAUTHORIZED` | по ситуации | SSL к облачной БД. |
| `SESSION_SECRET` | production: **да** (≥24) | Сессии staff-админки и CSRF. |
| `JWT_SECRET` | желательно | JWT пользователей магазина. |
| `COOKIE_SECURE` | за HTTPS: **true** | Флаг `Secure` у кук. |
| `TRUST_PROXY` | за прокси: `1` | `trust proxy` в Express. |
| `APP_BASE_URL` | для почты: **да** | Публичный URL сайта (https). |
| `STORAGE_*` | для загрузок: **да** | S3-совместимое API (см. ниже). |
| `PUBLIC_URL` / `MEDIA_CDN_BASE` | нет | База для публичных URL медиа в API (`server/db/media-url.js`). |
| `GOOGLE_*` | нет | OAuth Google для пользователей. |
| `RESEND_API_KEY`, `RESEND_FROM` | нет | Отправка писем через HTTPS (см. `server/services/auth-mail.js`). |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | нет, **удобно на Render** | Brevo (ex-Sendinblue): API v3 по HTTPS, без SMTP. Имя: `BREVO_SENDER_NAME`. Допускается `SENDINBLUE_API_KEY`. |
| `SMTP_*` / `SMTP_URL` | нет | Fallback после Brevo/Resend. Для Brevo SMTP: `smtp-relay.brevo.com`, порт 587. |
| `EMAIL_CODE_PEPPER` | нет | Доп. секрет для хеша кодов. |
| `ADMIN_*` | только для bootstrap | Создание первого admin. |

### Почта на production

1. Задайте **`APP_BASE_URL`** как публичный `https://ваш-домен` (ссылка в письме сброса пароля).
2. **Render / облако:** предпочтительно **[Brevo](https://www.brevo.com)** — в панели создайте **API key** (начинается с `xkeysib-`), в Render добавьте **`BREVO_API_KEY`** и **`BREVO_SENDER_EMAIL`** (тот же адрес, что подтверждён в Brevo как отправитель). Письма уходят через **HTTPS** на `api.brevo.com`, без SMTP и без проблем IPv6 (`ENETUNREACH` к `smtp.gmail.com`). Если в логах **`[mail] brevo HTTP 401`** с текстом про **неразрешённый IP**, откройте https://app.brevo.com/security/authorised_ips : для Render без статического egress надёжнее **отключить** ограничение API по IP для этого ключа; иначе добавляйте текущий egress-IP в whitelist (он может меняться при деплое).
3. Альтернатива: **[Resend](https://resend.com)** (`RESEND_API_KEY`, `RESEND_FROM`).
4. **SMTP** используется только если нет успешной отправки через Brevo/Resend. Для Brevo: хост **`smtp-relay.brevo.com`**, не Gmail. При ошибках TLS смотрите логи `[mail]` и при необходимости `SMTP_TLS_REJECT_UNAUTHORIZED=false`.
5. **Supabase + Render:** при ошибке `EMAXCONNSESSION` уменьшите параллелизм: задайте **`PG_POOL_MAX=2`** или `3` в переменных окружения (по умолчанию для Supabase в коде уже снижено до 4).

## 4. Облако для изображений (S3-совместимое)

Реализация: `server/services/storage.js` — прямой `PutObject` через AWS SDK v3, **`forcePathStyle: true`**, регион `auto` (удобно для MinIO, R2, многих провайдеров).

Нужны все пять переменных:

- `STORAGE_ENDPOINT` — URL API (например `https://s3.amazonaws.com` или endpoint MinIO/R2).
- `STORAGE_KEY`, `STORAGE_SECRET` — ключи доступа.
- `STORAGE_BUCKET` — имя бакета.
- `STORAGE_PUBLIC_URL` — базовый URL, по которому браузер открывает файлы (CDN или пубчный endpoint бакета), **без** завершающего `/`.

Права: бэкенд пишет объекты; клиентам достаточно читать объекты по `STORAGE_PUBLIC_URL` (или настроить CORS, если медиа с другого origin).

## 5. Зависимости npm

Пакет **`multer-s3`** удалён из проекта: загрузки не используют его (используется `multer.memoryStorage()` + `storage.js`). Это убирает конфликт peer-зависимостей с `@aws-sdk/client-s3`.

После изменений выполните **`npm install`**, чтобы обновился `package-lock.json`.

**`npm audit`:** используется актуальный `@aws-sdk/client-s3`. CSRF реализован **без пакета `csurf`** (устарел): токен в сессии + cookie `XSRF-TOKEN` + заголовок `X-XSRF-TOKEN`, см. `server/middleware/csrf.js`.

По **`npm audit fix --force`**: не рекомендуется без проверки — может сломать совместимость зависимостей.

## 6. Google OAuth

В консоли Google Cloud redirect URI должен **точно** совпадать с `GOOGLE_CALLBACK_URL` (схема, хост, путь, без лишних слэшей).

## 7. Обратный прокси (пример логики)

- TLS на прокси, заголовки `X-Forwarded-Proto`, `X-Forwarded-For`.
- `TRUST_PROXY=1` в приложении.
- Прокси на `http://127.0.0.1:PORT`.

## 8. Резервное копирование

- Регулярные **дампы PostgreSQL**.
- Объекты в **бакете** — политика версионирования / lifecycle по политике компании.

## 9. Полезные ссылки в репозитории

- [README.md](README.md) — запуск, замечания по безопасности и сидам.
- [.env.example](.env.example) — шаблон переменных.
