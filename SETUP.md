# KPVS Site - Complete Setup

## Project Overview
Full-stack web application with frontend, backend, and SQLite database. Products are loaded from database via REST API.

## Architecture

### Frontend (HTML/CSS/JavaScript)
- **welcome.html** - Landing page with navigation
- **mens.html** - Men's products page with filter and sort
- **womens.html** - Women's products page with filter and sort
- **product.html** - Individual product detail page
- **css/style.css** - All styling
- **js/mens.js** - Fetches from `/api/products/mens`
- **js/womens.js** - Fetches from `/api/products/womens`
- **js/product.js** - Fetches from `/api/product/:id`

### Backend (Node.js + Express)
- **server.js** - Express server with CORS and static file serving
- Provides REST API endpoints:
  - `GET /api/products/:gender` - All products for gender
  - `GET /api/product/:id` - Single product by ID

### Database (SQLite)
- **db.js** - Database initialization and queries
- **kpvs.db** - SQLite database file (auto-created)
- Auto-initializes from products.json on first run
- Stores 56 products (28 mens, 28 womens) across 4 categories

## Data Flow

1. **On Startup:**
   - `db.js` creates `products` table if missing
   - Checks if table is empty
   - If empty, loads all products from `products.json`

2. **Frontend Loading:**
   - HTML page loads
   - JavaScript calls `/api/products/{gender}` endpoint
   - Products display with filter and sort
   - localStorage manages cart and favorites

3. **Product Details:**
   - Click product card → opens product.html with ID parameter
   - Fetches single product from `/api/product/:id`
   - Shows description, materials, price, actions

## Installation & Running

```bash
# Install dependencies
npm install

# Start server
npm start
```

Server runs on `http://localhost:3000`

## Features

✅ Product filtering by category (popular, outerwear, underwear, accessories)
✅ Product sorting by name or ID
✅ Shared cart across mens/womens sections
✅ Shared favorites across all sections
✅ localStorage persistence for cart and favorites
✅ Email inquiry functionality
✅ Modal windows for cart and favorites display
✅ Responsive design with CSS styling

## Files Structure

```
/
├── server.js              # Express server
├── db.js                  # SQLite wrapper
├── package.json           # Dependencies
├── kpvs.db               # Database (auto-created)
├── products.json         # Seed data
├── *.html                # Frontend pages
├── css/style.css         # Styling
├── js/
│   ├── mens.js          # Men's section logic
│   ├── womens.js        # Women's section logic
│   └── product.js       # Product detail logic
└── img/                  # Product images
```

## Database Schema

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT,
  image TEXT,
  description TEXT,
  materials TEXT,
  price TEXT,
  category TEXT,        -- popular, outerwear, underwear, accessories
  gender TEXT            -- mens, womens
)
```

## Notes

- **products.json** is only used for initial database seeding
- All product data comes from database via API
- localStorage stores cart and favorites (client-side only)
- All features preserved from original implementation
- Minimal code size with maximum functionality
