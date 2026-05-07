-- 6. ХАРАКТЕРИСТИКИ ТОВАРОВ
CREATE TABLE product_attributes (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    value VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0,
    UNIQUE(product_id, name)
);

-- Индексы для product_attributes
CREATE INDEX idx_attributes_product ON product_attributes(product_id);