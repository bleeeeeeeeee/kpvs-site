-- 5. ТОВАРЫ
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    art VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    category_id INT REFERENCES categories(id),
    brand_id INT REFERENCES brands(id),
    materials VARCHAR(200),
    season VARCHAR(50),
    gender VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE
);

-- Ограничения для products
ALTER TABLE products
    ADD CONSTRAINT chk_season CHECK (season IN ('зима', 'лето', 'демисезон', 'всесезонный'));

ALTER TABLE products
    ADD CONSTRAINT chk_gender CHECK (gender IN ('male', 'female', 'unisex'));

ALTER TABLE products
    ADD CONSTRAINT chk_art_format CHECK (art ~ '^\[A-Z0-9-\]+$');

ALTER TABLE products
    ADD CONSTRAINT chk_product_slug_format CHECK (slug ~ '^\[a-z0-9-\]+$');

-- Индексы для products
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_season ON products(season);
CREATE INDEX idx_products_gender ON products(gender);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_art ON products(art);

-- Полнотекстовый поиск по товарам (работает с русским языком)
CREATE INDEX idx_products_search ON products
USING gin(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(materials, '')));