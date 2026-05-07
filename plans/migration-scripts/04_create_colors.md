-- 4. ЦВЕТА
CREATE TABLE colors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    hex_code VARCHAR(7)
);

-- Индексы для colors
CREATE INDEX idx_colors_name ON colors(name);