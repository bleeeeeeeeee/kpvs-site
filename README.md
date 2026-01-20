# KPVS Site

## Быстрый старт

```bash
npm install
npm start
```

Открыть: **http://localhost:3000** (автоматически редирект на /welcome)

## Структура

- `server.js` - Express сервер
- `db.js` - SQLite база данных
- `*.html` - Страницы (welcome, mens, womens, product)
- `css/style.css` - Стили
- `js/*.js` - Логика

## API

- `GET /api/products/mens` - товары мужские
- `GET /api/products/womens` - товары женские
- `GET /api/product/:id` - один товар

## Как работает

1. npm start → сервер + БД инициализируется
2. Фронтенд запрашивает API → загружает товары
3. Добавление в корзину/избранное → сохраняется в localStorage
4. Все данные сохраняются при перезагрузке

## Если не работает

- Проверить свободен ли порт 3000
- Убедиться, что products.json в корне проекта