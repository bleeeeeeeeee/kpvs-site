-- 8. СВЯЗЬ ТОВАРОВ С ТЕГАМИ
CREATE TABLE product_tags (
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    tag_id INT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

-- Индексы для product_tags
CREATE INDEX idx_product_tags_tag ON product_tags(tag_id);