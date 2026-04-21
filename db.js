const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || 'kpvs_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '12345678',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

async function connectDB() {
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        console.log('  - Connected to PostgreSQL');
    } finally {
        client.release();
    }
}

function normalizeCategoryCode(category) {
    if (!category || typeof category !== 'string') return null;
    const normalized = category.trim().toLowerCase();
    if (normalized === 'underwear') return 'pants';
    return normalized;
}

function buildCategoryCondition(category, values, startIndex) {
    const code = normalizeCategoryCode(category);
    if (!code) {
        return { condition: null, nextIndex: startIndex };
    }

    if (['outerwear', 'pants', 'accessories'].includes(code)) {
        values.push(code, `${code}_%`);
        return {
            condition: `(p.category_code = $${startIndex} OR p.category_code LIKE $${startIndex + 1})`,
            nextIndex: startIndex + 2
        };
    }

    values.push(code);
    return {
        condition: `p.category_code = $${startIndex}`,
        nextIndex: startIndex + 1
    };
}

async function getProducts(gender, options = {}) {
    const {
        category,
        material,
        size,
        tag,
        q,
        price_min,
        price_max,
        sort_by,
        sort_direction,
        limit = 20,
        offset = 0
    } = options || {};

    const conditions = ['1=1'];
    const values = [];
    let nextIndex = 1;
    let internalTag = tag;

    if (gender) {
        values.push(gender);
        conditions.push(`p.gender_code = $${nextIndex}`);
        nextIndex += 1;
    }

    if (category) {
        if (category === 'popular') {
            internalTag = 'popular';
        } else {
            const categoryCondition = buildCategoryCondition(category, values, nextIndex);
            if (categoryCondition.condition) {
                conditions.push(categoryCondition.condition);
                nextIndex = categoryCondition.nextIndex;
            }
        }
    }

    if (internalTag) {
        values.push(internalTag);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_tags pt
            WHERE pt.product_id = p.id AND pt.tag_code = $${nextIndex}
        )`);
        nextIndex += 1;
    }

    if (material) {
        values.push(material);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_materials pm
            WHERE pm.product_id = p.id
              AND pm.material_name = $${nextIndex}
              AND pm.percentage > 0
        )`);
        nextIndex += 1;
    }

    if (size) {
        values.push(size);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_sizes ps
            WHERE ps.product_id = p.id
              AND ps.size_name = $${nextIndex}
              AND ps.quantity > 0
        )`);
        nextIndex += 1;
    }

    if (q) {
        values.push(`%${q}%`);
        conditions.push(`(
            p.name ILIKE $${nextIndex}
            OR p.description ILIKE $${nextIndex}
        )`);
        nextIndex += 1;
    }

    if (price_min != null && price_min !== '') {
        values.push(Number(price_min));
        conditions.push(`p.price >= $${nextIndex}`);
        nextIndex += 1;
    }

    if (price_max != null && price_max !== '') {
        values.push(Number(price_max));
        conditions.push(`p.price <= $${nextIndex}`);
        nextIndex += 1;
    }

    const allowedSortFields = {
        created_at: 'p.created_at',
        name: 'p.name',
        price: 'p.price'
    };
    const sortField = allowedSortFields[sort_by] || 'p.created_at';
    const direction = sort_direction === 'asc' ? 'ASC' : 'DESC';

    values.push(Number(limit) || 20, Number(offset) || 0);

    const query = `
        SELECT
            p.id,
            p.name,
            p.slug,
            p.description,
            p.price,
            p.image_path AS image,
            p.gender_code AS gender,
            p.category_code AS category,
            p.created_at,
            (SELECT json_agg(json_build_object(
                'code', t.code,
                'name', t.name,
                'icon', t.icon,
                'color', t.color
            ) ORDER BY t.sort_order)
             FROM product_tags pt
             JOIN tags t ON pt.tag_code = t.code
             WHERE pt.product_id = p.id) AS tags,
            (SELECT json_agg(ps.size_name ORDER BY ps.size_name)
             FROM product_sizes ps
             WHERE ps.product_id = p.id AND ps.quantity > 0) AS available_sizes,
            (SELECT json_agg(json_build_object(
                'material', pm.material_name,
                'percentage', pm.percentage
            ) ORDER BY pm.percentage DESC)
             FROM product_materials pm
             WHERE pm.product_id = p.id) AS materials
        FROM products p
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${sortField} ${direction}
        LIMIT $${nextIndex} OFFSET $${nextIndex + 1};
    `;

    const result = await pool.query(query, values);
    return result.rows.map((row) => ({
        ...row,
        price: row.price === null ? null : Number(row.price)
    }));
}

async function getProduct(identifier) {
    const isNumeric = /^\s*\d+\s*$/.test(identifier);
    const values = [identifier];
    let whereClause = 'p.slug = $1';

    if (isNumeric) {
        values.push(Number(identifier));
        whereClause = 'p.slug = $1 OR p.id = $2';
    }

    const query = `
        SELECT
            p.id,
            p.name,
            p.slug,
            p.description,
            p.price,
            p.image_path AS image,
            p.gender_code AS gender,
            p.category_code AS category,
            g.name AS gender_name,
            c.name AS category_name,
            c.parent_code AS category_parent,
            p.created_at,
            (SELECT json_agg(json_build_object(
                'material', pm.material_name,
                'percentage', pm.percentage
            ) ORDER BY pm.percentage DESC)
             FROM product_materials pm
             WHERE pm.product_id = p.id) AS materials,
            (SELECT json_agg(json_build_object(
                'size', ps.size_name,
                'quantity', ps.quantity
            ) ORDER BY ps.size_name)
             FROM product_sizes ps
             WHERE ps.product_id = p.id AND ps.quantity > 0) AS sizes,
            (SELECT json_agg(json_build_object(
                'code', t.code,
                'name', t.name,
                'icon', t.icon,
                'color', t.color
            ) ORDER BY t.sort_order)
             FROM product_tags pt
             JOIN tags t ON pt.tag_code = t.code
             WHERE pt.product_id = p.id) AS tags,
            (SELECT json_agg(json_build_object(
                'path', pi.image_path,
                'is_main', pi.is_main,
                'sort_order', pi.sort_order
            ) ORDER BY pi.sort_order)
             FROM product_images pi
             WHERE pi.product_id = p.id) AS images
        FROM products p
        JOIN genders g ON p.gender_code = g.code
        JOIN categories c ON p.category_code = c.code
        WHERE ${whereClause}
        LIMIT 1;
    `;

    const result = await pool.query(query, values);
    if (!result.rows.length) {
        return null;
    }

    const row = result.rows[0];
    return {
        ...row,
        price: row.price === null ? null : Number(row.price)
    };
}

function buildCategoryTree(rows) {
    const map = new Map();
    rows.forEach((row) => {
        map.set(row.code, { ...row, children: [] });
    });

    rows.forEach((row) => {
        if (row.parent_code && map.has(row.parent_code)) {
            map.get(row.parent_code).children.push(map.get(row.code));
        }
    });

    return Array.from(map.values()).filter((row) => !row.parent_code);
}

async function getCategories() {
    const query = `
        WITH category_counts AS (
            SELECT category_code, COUNT(*) AS products_count
            FROM products
            GROUP BY category_code
        )
        SELECT
            c.code,
            c.name,
            c.parent_code,
            c.level,
            c.sort_order,
            c.description,
            c.is_active,
            COALESCE(cc.products_count, 0) AS products_count
        FROM categories c
        LEFT JOIN category_counts cc ON c.code = cc.category_code
        WHERE c.is_active = true
        ORDER BY c.level, c.sort_order;
    `;

    const result = await pool.query(query);
    const categories = result.rows.map((row) => ({
        ...row,
        products_count: Number(row.products_count)
    }));
    return buildCategoryTree(categories);
}

async function createProduct(product) {
    const query = `
        INSERT INTO products (name, slug, description, price, image_path, gender_code, category_code, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, name, slug, description, price, image_path AS image, gender_code AS gender, category_code AS category, created_at;
    `;
    const values = [
        product.name,
        product.slug,
        product.description || null,
        product.price,
        product.image_path || null,
        product.gender_code,
        product.category_code
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
}

async function updateProduct(id, product) {
    const query = `
        UPDATE products
        SET name = $1,
            slug = $2,
            description = $3,
            price = $4,
            image_path = $5,
            gender_code = $6,
            category_code = $7
        WHERE id = $8
        RETURNING id, name, slug, description, price, image_path AS image, gender_code AS gender, category_code AS category, created_at;
    `;
    const values = [
        product.name,
        product.slug,
        product.description || null,
        product.price,
        product.image_path || null,
        product.gender_code,
        product.category_code,
        id
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
}

async function deleteProduct(id) {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function searchProducts(q, gender, category, limit = 20, offset = 0) {
    return getProducts(gender, {
        category,
        q,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0
    });
}

module.exports = {
    connectDB,
    getProducts,
    getProduct,
    getCategories,
    createProduct,
    updateProduct,
    deleteProduct,
    searchProducts
};

