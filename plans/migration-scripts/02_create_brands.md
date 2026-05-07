-- 2. БРЕНДЫ
CREATE TABLE brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    logo_url VARCHAR(500)
);

-- Индексы для brands
CREATE INDEX idx_brands_slug ON brands(slug);