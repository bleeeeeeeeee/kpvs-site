const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'kpvs_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '12345678',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

function slugify(text) {
    if (!text || typeof text !== 'string') return '';
    const map = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e',
        'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
        'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
        'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
        'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        'А':'a','Б':'b','В':'v','Г':'g','Д':'d','Е':'e','Ё':'e',
        'Ж':'zh','З':'z','И':'i','Й':'y','К':'k','Л':'l','М':'m',
        'Н':'n','О':'o','П':'p','Р':'r','С':'s','Т':'t','У':'u',
        'Ф':'f','Х':'kh','Ц':'ts','Ч':'ch','Ш':'sh','Щ':'shch',
        'Ъ':'','Ы':'y','Ь':'','Э':'e','Ю':'yu','Я':'ya'
    };
    return text.toString().trim().toLowerCase()
        .split('').map(c => map[c] !== undefined ? map[c] : c).join('')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, '')
        .replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
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

async function getCategories() {
    const result = await pool.query(`
        WITH RECURSIVE cat_tree AS (
            SELECT id, name, slug, parent_id, sort_order, 0 AS depth
            FROM categories
            WHERE parent_id IS NULL
            UNION ALL
            SELECT c.id, c.name, c.slug, c.parent_id, c.sort_order, ct.depth + 1
            FROM categories c
            JOIN cat_tree ct ON c.parent_id = ct.id
        )
        SELECT
            ct.id,
            ct.name,
            ct.slug,
            ct.parent_id,
            ct.sort_order,
            ct.depth,
            COALESCE(pc.products_count, 0) AS products_count
        FROM cat_tree ct
        LEFT JOIN (
            SELECT category_id, COUNT(*) AS products_count
            FROM products
            WHERE is_active = TRUE
            GROUP BY category_id
        ) pc ON pc.category_id = ct.id
        ORDER BY ct.depth, ct.sort_order, ct.id
    `);

    const map = new Map();
    result.rows.forEach(row => {
        map.set(row.id, { ...row, products_count: Number(row.products_count), children: [] });
    });
    result.rows.forEach(row => {
        if (row.parent_id && map.has(row.parent_id)) {
            map.get(row.parent_id).children.push(map.get(row.id));
        }
    });
    return Array.from(map.values()).filter(r => !r.parent_id);
}

async function getBrands() {
    const result = await pool.query('SELECT id, name, slug, logo_url FROM brands ORDER BY name');
    return result.rows;
}

async function getSizes() {
    const result = await pool.query(`
        SELECT s.id, s.value, st.name AS size_type
        FROM sizes s
        JOIN size_types st ON s.size_type_id = st.id
        ORDER BY st.name, s.value
    `);
    return result.rows;
}

async function getColors() {
    const result = await pool.query('SELECT id, name, hex_code FROM colors ORDER BY name');
    return result.rows;
}

async function getTags() {
    const result = await pool.query('SELECT id, name, slug FROM tags ORDER BY name');
    return result.rows;
}

async function getProducts(genderParam, options = {}) {
    const {
        category,
        tag,
        q,
        brand,
        season,
        color,
        size,
        sort_by,
        sort_direction,
        include_inactive,
        gender: genderOpt,
        limit = 20,
        offset = 0
    } = options || {};

    const genderFilter = (genderParam || genderOpt || '').trim();

    const conditions = [];
    const values = [];
    let idx = 1;

    if (!include_inactive) {
        conditions.push('p.is_active = TRUE');
    }

    if (genderFilter) {
        const g = genderFilter;
        if (g === 'mens' || g === 'male') {
            conditions.push(`(p.gender IN ('mens', 'male'))`);
        } else if (g === 'womens' || g === 'female') {
            conditions.push(`(p.gender IN ('womens', 'female'))`);
        } else {
            values.push(g);
            conditions.push(`p.gender = $${idx++}`);
        }
    }

    if (category) {
        const cats = Array.isArray(category) ? category : String(category).split(',').map(s => s.trim()).filter(Boolean);
        if (cats.length) {
            const placeholders = cats.map(() => `$${idx++}`).join(', ');
            cats.forEach(c => values.push(c));
            conditions.push(`(
                p.category_id IN (
                    SELECT id FROM categories WHERE slug IN (${placeholders})
                )
                OR p.category_id IN (
                    SELECT c.id FROM categories c
                    JOIN categories parent ON c.parent_id = parent.id
                    WHERE parent.slug IN (${placeholders.replace(/\$(\d+)/g, (_, n) => `$${Number(n) - cats.length}`)})
                )
            )`);
        }
    }

    if (brand) {
        values.push(brand);
        conditions.push(`p.brand_id = (SELECT id FROM brands WHERE slug = $${idx++})`);
    }

    if (season) {
        values.push(season);
        conditions.push(`p.season = $${idx++}`);
    }

    if (tag) {
        values.push(tag);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_tags pt
            JOIN tags t ON pt.tag_id = t.id
            WHERE pt.product_id = p.id AND t.slug = $${idx++}
        )`);
    }

    if (color) {
        values.push(color);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_variants pv
            JOIN colors col ON pv.color_id = col.id
            WHERE pv.product_id = p.id AND pv.is_active = TRUE AND col.name = $${idx++}
        )`);
    }

    if (size) {
        values.push(size);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_variants pv
            JOIN sizes s ON pv.size_id = s.id
            WHERE pv.product_id = p.id AND pv.is_active = TRUE AND s.value = $${idx++}
        )`);
    }

    if (q) {
        const qText = String(q).trim();
        values.push(qText);
        conditions.push(`(
            to_tsvector('russian', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.materials,''))
            @@ plainto_tsquery('russian', $${idx++})
            OR p.name ILIKE '%' || $${idx - 1} || '%'
            OR p.art ILIKE '%' || $${idx - 1} || '%'
        )`);
    }

    const allowedSort = { id: 'p.id', name: 'p.name', created_at: 'p.created_at' };
    const sortField = allowedSort[sort_by] || 'p.id';
    const direction = sort_direction === 'asc' ? 'ASC' : 'DESC';

    values.push(Number(limit) || 20, Number(offset) || 0);

    const query = `
        SELECT
            p.id,
            p.art,
            p.name,
            p.slug,
            p.description,
            p.materials,
            p.season,
            p.gender,
            p.is_active,
            p.created_at,
            p.updated_at,
            c.name AS category_name,
            c.slug AS category_slug,
            b.name AS brand_name,
            b.slug AS brand_slug,
            (
                SELECT url FROM product_images
                WHERE product_id = p.id AND is_primary = TRUE
                ORDER BY sort_order LIMIT 1
            ) AS image,
            (
                SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug) ORDER BY t.name)
                FROM product_tags pt JOIN tags t ON pt.tag_id = t.id
                WHERE pt.product_id = p.id
            ) AS tags,
            (
                SELECT json_agg(json_build_object(
                    'id', pv.id, 'art', pv.art,
                    'size_id', pv.size_id, 'size_value', s.value, 'size_type', st.name,
                    'color_id', pv.color_id, 'color_name', col.name, 'color_hex', col.hex_code,
                    'is_active', pv.is_active
                ) ORDER BY s.value, col.name)
                FROM product_variants pv
                LEFT JOIN sizes s ON pv.size_id = s.id
                LEFT JOIN size_types st ON s.size_type_id = st.id
                LEFT JOIN colors col ON pv.color_id = col.id
                WHERE pv.product_id = p.id AND pv.is_active = TRUE
            ) AS variants
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE ${conditions.length ? conditions.join(' AND ') : 'TRUE'}
        ORDER BY ${sortField} ${direction}
        LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const result = await pool.query(query, values);
    return result.rows;
}

async function getProduct(identifier) {
    const isNumeric = /^\s*\d+\s*$/.test(String(identifier));
    const values = [identifier];
    let whereClause = 'p.slug = $1';
    if (isNumeric) {
        values.push(Number(identifier));
        whereClause = 'p.slug = $1 OR p.id = $2';
    }

    const query = `
        SELECT
            p.id,
            p.art,
            p.name,
            p.slug,
            p.description,
            p.materials,
            p.season,
            p.gender,
            p.is_active,
            p.created_at,
            p.updated_at,
            p.category_id,
            p.brand_id,
            c.name AS category_name,
            c.slug AS category_slug,
            c.parent_id AS category_parent_id,
            b.name AS brand_name,
            b.slug AS brand_slug,
            b.logo_url AS brand_logo,
            (
                SELECT json_agg(json_build_object(
                    'id', pi.id, 'url', pi.url, 'alt_text', pi.alt_text,
                    'is_primary', pi.is_primary, 'sort_order', pi.sort_order
                ) ORDER BY pi.sort_order, pi.id)
                FROM product_images pi WHERE pi.product_id = p.id
            ) AS images,
            (
                SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug) ORDER BY t.name)
                FROM product_tags pt JOIN tags t ON pt.tag_id = t.id
                WHERE pt.product_id = p.id
            ) AS tags,
            (
                SELECT json_agg(json_build_object(
                    'id', pv.id, 'art', pv.art,
                    'size_id', pv.size_id, 'size_value', s.value, 'size_type', st.name,
                    'color_id', pv.color_id, 'color_name', col.name, 'color_hex', col.hex_code,
                    'is_active', pv.is_active
                ) ORDER BY s.value, col.name)
                FROM product_variants pv
                LEFT JOIN sizes s ON pv.size_id = s.id
                LEFT JOIN size_types st ON s.size_type_id = st.id
                LEFT JOIN colors col ON pv.color_id = col.id
                WHERE pv.product_id = p.id
            ) AS variants,
            (
                SELECT json_agg(json_build_object(
                    'id', pa.id, 'name', pa.name, 'value', pa.value, 'sort_order', pa.sort_order
                ) ORDER BY pa.sort_order, pa.name)
                FROM product_attributes pa WHERE pa.product_id = p.id
            ) AS attributes
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE ${whereClause}
        LIMIT 1
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
}

async function createProduct(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const slug = (data.slug && data.slug.trim()) || slugify(data.name);
        const art = data.art && data.art.trim() ? data.art.trim().toUpperCase() : null;

        if (art) {
            const existing = await client.query('SELECT id FROM products WHERE art = $1', [art]);
            if (existing.rows.length > 0) {
                throw new Error('Артикул уже существует');
            }
        }

        const res = await client.query(`
            INSERT INTO products (art, name, slug, description, category_id, brand_id, materials, season, gender, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            art,
            data.name,
            slug,
            data.description || null,
            data.category_id || null,
            data.brand_id || null,
            data.materials || null,
            data.season || null,
            data.gender || null,
            data.is_active !== false
        ]);

        const productId = res.rows[0].id;

        if (Array.isArray(data.images) && data.images.length) {
            await replaceProductImages(client, productId, data.images);
        }
        if (Array.isArray(data.tags) && data.tags.length) {
            await replaceProductTags(client, productId, data.tags);
        }
        if (Array.isArray(data.variants) && data.variants.length) {
            await replaceProductVariants(client, productId, data.variants);
        }
        if (Array.isArray(data.attributes) && data.attributes.length) {
            await replaceProductAttributes(client, productId, data.attributes);
        }

        await client.query('COMMIT');
        return getProduct(String(productId));
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        throw err;
    } finally {
        client.release();
    }
}

async function updateProduct(id, data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const slug = (data.slug && data.slug.trim()) || slugify(data.name);
        const art = data.art && data.art.trim() ? data.art.trim().toUpperCase() : null;

        if (art) {
            const existing = await client.query('SELECT id FROM products WHERE art = $1 AND id != $2', [art, id]);
            if (existing.rows.length > 0) {
                throw new Error('Артикул уже существует');
            }
        }

        const res = await client.query(`
            UPDATE products
            SET art = $1, name = $2, slug = $3, description = $4,
                category_id = $5, brand_id = $6, materials = $7,
                season = $8, gender = $9, is_active = $10
            WHERE id = $11
            RETURNING id
        `, [
            art,
            data.name,
            slug,
            data.description || null,
            data.category_id || null,
            data.brand_id || null,
            data.materials || null,
            data.season || null,
            data.gender || null,
            data.is_active !== false,
            id
        ]);

        if (!res.rows.length) {
            await client.query('ROLLBACK');
            return null;
        }

        if (Array.isArray(data.images)) {
            await replaceProductImages(client, id, data.images);
        }
        if (Array.isArray(data.tags)) {
            await replaceProductTags(client, id, data.tags);
        }
        if (Array.isArray(data.variants)) {
            await replaceProductVariants(client, id, data.variants);
        }
        if (Array.isArray(data.attributes)) {
            await replaceProductAttributes(client, id, data.attributes);
        }

        await client.query('COMMIT');
        return getProduct(String(id));
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        throw err;
    } finally {
        client.release();
    }
}

async function deleteProduct(id) {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function updateProductActiveFlag(id, isActive) {
    const result = await pool.query(
        'UPDATE products SET is_active = $1 WHERE id = $2 RETURNING id, is_active',
        [Boolean(isActive), id]
    );
    return result.rows[0] || null;
}

async function replaceProductImages(client, productId, images) {
    await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    if (!Array.isArray(images) || !images.length) return;

    const hasPrimary = images.some(i => i.is_primary);
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const url = typeof img.url === 'string' ? img.url.trim() : '';
        if (!url) continue;
        await client.query(
            'INSERT INTO product_images (product_id, url, alt_text, is_primary, sort_order) VALUES ($1,$2,$3,$4,$5)',
            [productId, url, img.alt_text || null, hasPrimary ? Boolean(img.is_primary) : i === 0, img.sort_order ?? i]
        );
    }
}

async function replaceProductTags(client, productId, tags) {
    await client.query('DELETE FROM product_tags WHERE product_id = $1', [productId]);
    if (!Array.isArray(tags) || !tags.length) return;

    for (const tag of tags) {
        const tagId = tag.id || null;
        if (!tagId) continue;
        await client.query(
            'INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [productId, tagId]
        );
    }
}

async function replaceProductVariants(client, productId, variants) {
    await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);
    if (!Array.isArray(variants) || !variants.length) return;

    for (const v of variants) {
        const art = v.art && v.art.trim() ? v.art.trim().toUpperCase() : null;
        if (!art) continue;
        await client.query(
            `INSERT INTO product_variants (product_id, size_id, color_id, art, is_active)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (art) DO UPDATE SET size_id=$2, color_id=$3, is_active=$5`,
            [productId, v.size_id || null, v.color_id || null, art, v.is_active !== false]
        );
    }
}

async function replaceProductAttributes(client, productId, attributes) {
    await client.query('DELETE FROM product_attributes WHERE product_id = $1', [productId]);
    if (!Array.isArray(attributes) || !attributes.length) return;

    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        if (!attr.name || !attr.value) continue;
        await client.query(
            `INSERT INTO product_attributes (product_id, name, value, sort_order)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (product_id, name) DO UPDATE SET value=$3, sort_order=$4`,
            [productId, attr.name.trim(), attr.value.trim(), attr.sort_order ?? i]
        );
    }
}

async function searchProducts(q, gender, category, limit = 20, offset = 0) {
    return getProducts(gender, {
        category,
        q,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0
    });
}

async function findUserByUsername(username) {
    const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1 LIMIT 1',
        [username]
    );
    return result.rows[0] || null;
}

async function verifyUser(username, password) {
    const user = await findUserByUsername(username);
    if (!user || !user.is_active) return null;
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return null;
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    return { id: user.id, username: user.username, role: user.role };
}

async function createUser(username, password, role) {
    role = role || 'admin';
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, username, role, is_active, created_at`,
        [username, hash, role]
    );
    return result.rows[0];
}

async function ensureDefaultUsers() {
    const defaults = [
        { username: 'admin', password: 'admin', role: 'admin' },
        { username: 'superadmin', password: 'superadmin', role: 'superadmin' }
    ];
    for (const u of defaults) {
        const existing = await findUserByUsername(u.username);
        if (!existing) {
            await createUser(u.username, u.password, u.role);
            console.log('  - Default user created:', u.username);
        }
    }
}

async function listUsers() {
    const result = await pool.query(
        'SELECT id, username, role, is_active, created_at, last_login FROM users ORDER BY id'
    );
    return result.rows;
}

async function setUserActive(id, isActive) {
    const result = await pool.query(
        'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, role, is_active',
        [isActive, id]
    );
    return result.rows[0] || null;
}

async function changeUserPassword(id, newPassword) {
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
}

module.exports = {
    pool,
    connectDB,
    getCategories,
    getBrands,
    getSizes,
    getColors,
    getTags,
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    updateProductActiveFlag,
    searchProducts,
    findUserByUsername,
    verifyUser,
    createUser,
    ensureDefaultUsers,
    listUsers,
    setUserActive,
    changeUserPassword
};
