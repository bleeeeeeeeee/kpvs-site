-- 11. РАЗМЕРЫ
CREATE TABLE sizes (
    id SERIAL PRIMARY KEY,
    size_type_id INT REFERENCES size_types(id),
    value VARCHAR(20) NOT NULL,
    UNIQUE(size_type_id, value)
);

-- Индексы для sizes
CREATE INDEX idx_sizes_type ON sizes(size_type_id);
CREATE INDEX idx_sizes_value ON sizes(value);