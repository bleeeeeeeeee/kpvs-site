-- 7. ТЕГИ
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL
);

-- Ограничения для tags
ALTER TABLE tags
    ADD CONSTRAINT chk_tag_slug_format CHECK (slug ~ '^\[a-z0-9-\]+$');

-- Индексы для tags
CREATE INDEX idx_tags_slug ON tags(slug);