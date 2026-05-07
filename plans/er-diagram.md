# ER‑диаграмма новой схемы (PostgreSQL 18)

```mermaid
erDiagram
    CATEGORIES {
        int id PK
        varchar name
        varchar slug UK
        int parent_id FK
        int sort_order
    }
    BRANDS {
        int id PK
        varchar name
        varchar slug UK
        varchar logo_url
    }
    SIZE_TYPES {
        int id PK
        varchar name
    }
    SIZES {
        int id PK
        int size_type_id FK
        varchar value
        unique size_type_id, value
    }
    COLORS {
        int id PK
        varchar name
        varchar hex_code
    }
    PRODUCTS {
        int id PK
        varchar art UK
        varchar name
        varchar slug UK
        text description
        int category_id FK
        int brand_id FK
        varchar materials
        varchar season
        varchar gender
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    PRODUCT_ATTRIBUTES {
        int id PK
        int product_id FK
        varchar name
        varchar value
        int sort_order
        unique product_id, name
    }
    TAGS {
        int id PK
        varchar name
        varchar slug UK
    }
    PRODUCT_TAGS {
        int product_id PK FK
        int tag_id PK FK
    }
    PRODUCT_VARIANTS {
        int id PK
        int product_id FK
        int size_id FK
        int color_id FK
        varchar art UK
        boolean is_active
        unique product_id, size_id, color_id
    }
    PRODUCT_IMAGES {
        int id PK
        int product_id FK
        varchar url
        varchar alt_text
        boolean is_primary
        int sort_order
    }

    CATEGORIES ||..o{ CATEGORIES : parent
    CATEGORIES ||..o{ PRODUCTS : contains
    BRANDS ||..o{ PRODUCTS : has
    SIZE_TYPES ||..o{ SIZES : types
    SIZES ||..o{ PRODUCT_VARIANTS : used_in
    COLORS ||..o{ PRODUCT_VARIANTS : used_in
    PRODUCTS ||..o{ PRODUCT_VARIANTS : has
    PRODUCTS ||..o{ PRODUCT_ATTRIBUTES : has
    PRODUCTS ||..o{ PRODUCT_TAGS : tagged
    TAGS ||..o{ PRODUCT_TAGS : tagged
    PRODUCTS ||..o{ PRODUCT_IMAGES : has