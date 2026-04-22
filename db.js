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

function slugifyProductName(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Транслитерация русских символов
    const translitMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
        'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm',
        'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
        'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
        'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya'
    };

    return text
        .toString()
        .trim()
        .toLowerCase()
        .split('')
        .map(char => translitMap[char] || char)
        .join('')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

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

function normalizeCategoryInput(category) {
    if (!category) return [];
    if (Array.isArray(category)) {
        return category
            .flatMap((value) => typeof value === 'string' ? value.split(',') : [])
            .map((value) => value.trim())
            .filter(Boolean);
    }
    if (typeof category === 'string') {
        return category
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    }
    return [];
}

function buildCategoriesCondition(categories, values, startIndex) {
    const items = normalizeCategoryInput(categories);
    if (!items.length) {
        return { condition: null, nextIndex: startIndex };
    }

    const conditions = [];
    let nextIndex = startIndex;

    items.forEach((category) => {
        const built = buildCategoryCondition(category, values, nextIndex);
        if (built.condition) {
            conditions.push(built.condition);
            nextIndex = built.nextIndex;
        }
    });

    if (!conditions.length) {
        return { condition: null, nextIndex: startIndex };
    }

    return {
        condition: conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`,
        nextIndex
    };
}

async function getProducts(gender, options = {}) {
    const {
        gender: genderFilter,
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
    if (!gender && genderFilter) {
        values.push(genderFilter);
        conditions.push(`p.gender_code = $${nextIndex}`);
        nextIndex += 1;
    }

    if (category) {
        if (category === 'popular') {
            internalTag = 'popular';
        } else {
            const categoryCondition = buildCategoriesCondition(category, values, nextIndex);
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
        const queryText = String(q).trim();
        values.push(`%${queryText}%`);
        const textIndex = nextIndex;
        nextIndex += 1;
        
        // Проверяем, является ли запрос числом для поиска по ID
        const isNumeric = /^\d+$/.test(queryText);
        if (isNumeric) {
            values.push(Number(queryText));
            const idIndex = nextIndex;
            nextIndex += 1;
            conditions.push(`(
                CAST(p.id AS TEXT) ILIKE $${textIndex}
                OR p.name ILIKE $${textIndex}
                OR p.description ILIKE $${textIndex}
                OR p.id = $${idIndex}
            )`);
        } else {
            conditions.push(`(
                p.name ILIKE $${textIndex}
                OR p.description ILIKE $${textIndex}
            )`);
        }
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
        id: 'p.id',
        created_at: 'p.created_at',
        name: 'p.name',
        price: 'p.price'
    };
    const sortField = allowedSortFields[sort_by] || 'p.id';
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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const slug = (product.slug && product.slug.trim()) || slugifyProductName(product.name);
        const query = `
            INSERT INTO products (id, name, slug, description, price, image_path, gender_code, category_code, created_at)
            VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id, name, slug, description, price, image_path AS image, gender_code AS gender, category_code AS category, created_at;
        `;
        const values = [
            product.name,
            slug,
            product.description || null,
            product.price,
            product.image_path || null,
            product.gender_code,
            product.category_code
        ];

        const result = await client.query(query, values);
        const created = result.rows[0];

        if (created?.id) {
            if (Array.isArray(product.images) && product.images.length) {
                await replaceProductImages(client, created.id, product.images);
            }
            if (Array.isArray(product.sizes) && product.sizes.length) {
                await replaceProductSizes(client, created.id, product.sizes);
            }
            if (Array.isArray(product.tags) && product.tags.length) {
                await replaceProductTags(client, created.id, product.tags);
            }
            if (Array.isArray(product.materials) && product.materials.length) {
                await replaceProductMaterials(client, created.id, product.materials);
            }
        }

        await client.query('COMMIT');
        return created;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
    } finally {
        client.release();
    }
}

async function updateProduct(id, product) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const slug = (product.slug && product.slug.trim()) || slugifyProductName(product.name);
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
            slug,
            product.description || null,
            product.price,
            product.image_path || null,
            product.gender_code,
            product.category_code,
            id
        ];

        const result = await client.query(query, values);
        const updated = result.rows[0] || null;

        if (updated) {
            if (Array.isArray(product.images)) {
                await replaceProductImages(client, id, product.images);
            }
            if (Array.isArray(product.sizes)) {
                await replaceProductSizes(client, id, product.sizes);
            }
            if (Array.isArray(product.tags)) {
                await replaceProductTags(client, id, product.tags);
            }
            if (Array.isArray(product.materials)) {
                await replaceProductMaterials(client, id, product.materials);
            }
        }

        await client.query('COMMIT');
        return updated;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
    } finally {
        client.release();
    }
}

function normalizeImagesInput(images) {
    if (!Array.isArray(images)) return [];
    return images
        .map((img, idx) => {
            if (!img || typeof img !== 'object') return null;
            const path = typeof img.path === 'string' ? img.path.trim() : '';
            if (!path) return null;
            return {
                path,
                is_main: Boolean(img.is_main),
                sort_order: Number.isFinite(Number(img.sort_order)) ? Number(img.sort_order) : idx
            };
        })
        .filter(Boolean);
}

async function replaceProductImages(client, productId, images) {
    const normalized = normalizeImagesInput(images);
    await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    if (!normalized.length) return;

    const hasMain = normalized.some((i) => i.is_main);
    const rows = hasMain
        ? normalized
        : normalized.map((item, idx) => ({ ...item, is_main: idx === 0 }));

    for (let i = 0; i < rows.length; i += 1) {
        const item = rows[i];
        await client.query(
            'INSERT INTO product_images (product_id, image_path, is_main, sort_order) VALUES ($1, $2, $3, $4)',
            [productId, item.path, item.is_main, item.sort_order]
        );
    }
}

async function replaceProductSizes(client, productId, sizes) {
    await client.query('DELETE FROM product_sizes WHERE product_id = $1', [productId]);
    if (!Array.isArray(sizes) || !sizes.length) return;

    for (let size of sizes) {
        if (!size.name || typeof size.quantity !== 'number') continue;
        await client.query(
            'INSERT INTO product_sizes (product_id, size_name, quantity) VALUES ($1, $2, $3)',
            [productId, size.name, size.quantity]
        );
    }
}

async function replaceProductTags(client, productId, tags) {
    await client.query('DELETE FROM product_tags WHERE product_id = $1', [productId]);
    if (!Array.isArray(tags) || !tags.length) return;

    for (let tag of tags) {
        if (!tag.code) continue;
        await client.query(
            'INSERT INTO product_tags (product_id, tag_code) VALUES ($1, $2)',
            [productId, tag.code]
        );
    }
}

async function replaceProductMaterials(client, productId, materials) {
    await client.query('DELETE FROM product_materials WHERE product_id = $1', [productId]);
    if (!Array.isArray(materials) || !materials.length) return;

    for (let material of materials) {
        if (!material.code || typeof material.percentage !== 'number') continue;
        await client.query(
            'INSERT INTO product_materials (product_id, material_name, percentage) VALUES ($1, $2, $3)',
            [productId, material.code, material.percentage]
        );
    }
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

