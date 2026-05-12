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

async function ensureUserAuthSchema() {
    const client = await pool.connect();
    try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id TEXT`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email) WHERE email IS NOT NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_uq ON users (oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username)`);

        // Allow storefront users to exist alongside admin users.
        // Existing DBs may have chk_user_role allowing only admin/superadmin.
        await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_role`);
        await client.query(
            `ALTER TABLE users
             ADD CONSTRAINT chk_user_role
             CHECK ((role)::text = ANY ((ARRAY['admin'::character varying, 'superadmin'::character varying, 'user'::character varying])::text[]))`
        );

        // Initialize password_set for existing rows (NULL -> derived).
        await client.query(
            `UPDATE users
             SET password_set = CASE
                 WHEN oauth_provider IS NOT NULL THEN FALSE
                 ELSE TRUE
             END
             WHERE password_set IS NULL`
        );

        // Email verification: legacy rows treat existing emails as verified.
        await client.query(
            `UPDATE users
             SET email_verified = TRUE
             WHERE email IS NOT NULL AND email_verified IS NULL`
        );
        await client.query(
            `UPDATE users
             SET email_verified = TRUE
             WHERE oauth_provider IS NOT NULL AND email IS NOT NULL`
        );

        await client.query(
            `CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
        );
        await client.query(`CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token_hash)`);
        await client.query(`CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)`);

        await client.query(
            `CREATE TABLE IF NOT EXISTS email_verifications (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                purpose TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
        );
        await client.query(`CREATE INDEX IF NOT EXISTS email_verifications_lookup_idx ON email_verifications (email, purpose, created_at DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS email_verifications_code_idx ON email_verifications (code_hash)`);
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
        size_id,
        color_id,
        active,
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

    if (!include_inactive) conditions.push('p.is_active = TRUE');
    if (include_inactive && active) {
        const a = String(active).trim().toLowerCase();
        if (a === 'active') conditions.push('p.is_active = TRUE');
        else if (a === 'inactive') conditions.push('p.is_active = FALSE');
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
        const brands = Array.isArray(brand) ? brand : String(brand).split(',').map(s => s.trim()).filter(Boolean);
        if (brands.length === 1) {
            values.push(brands[0]);
            conditions.push(`p.brand_id = (SELECT id FROM brands WHERE slug = $${idx++})`);
        } else if (brands.length > 1) {
            values.push(brands);
            conditions.push(`p.brand_id IN (SELECT id FROM brands WHERE slug = ANY($${idx++}))`);
        }
    }

    if (season) {
        const seasons = Array.isArray(season) ? season : String(season).split(',').map(s => s.trim()).filter(Boolean);
        if (seasons.length === 1) {
            values.push(seasons[0]);
            conditions.push(`p.season = $${idx++}`);
        } else if (seasons.length > 1) {
            values.push(seasons);
            conditions.push(`p.season = ANY($${idx++})`);
        }
    }

    if (tag) {
        const tags = Array.isArray(tag) ? tag : String(tag).split(',').map(s => s.trim()).filter(Boolean);
        if (tags.length === 1) {
            values.push(tags[0]);
            conditions.push(`EXISTS(
                SELECT 1 FROM product_tags pt
                JOIN tags t ON pt.tag_id = t.id
                WHERE pt.product_id = p.id AND t.slug = $${idx++}
            )`);
        } else if (tags.length > 1) {
            values.push(tags);
            conditions.push(`EXISTS(
                SELECT 1 FROM product_tags pt
                JOIN tags t ON pt.tag_id = t.id
                WHERE pt.product_id = p.id AND t.slug = ANY($${idx++})
            )`);
        }
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

    if (color_id) {
        const ids = Array.isArray(color_id) ? color_id : String(color_id).split(',').map(s => s.trim()).filter(Boolean);
        const nums = ids.map(x => Number(x)).filter(n => Number.isFinite(n));
        if (nums.length) {
            values.push(nums);
            conditions.push(`EXISTS(
                SELECT 1 FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.color_id = ANY($${idx++})
            )`);
        }
    }

    if (size_id) {
        const ids = Array.isArray(size_id) ? size_id : String(size_id).split(',').map(s => s.trim()).filter(Boolean);
        const nums = ids.map(x => Number(x)).filter(n => Number.isFinite(n));
        if (nums.length) {
            values.push(nums);
            conditions.push(`EXISTS(
                SELECT 1 FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.size_id = ANY($${idx++})
            )`);
        }
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

async function findUserById(id) {
    const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active, email, oauth_provider, oauth_id, password_set FROM users WHERE id = $1 LIMIT 1',
        [id]
    );
    return result.rows[0] || null;
}

async function findUserByEmail(email) {
    const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active, email, email_verified, oauth_provider, oauth_id, password_set FROM users WHERE email = $1 LIMIT 1',
        [email]
    );
    return result.rows[0] || null;
}

async function findUserByOAuth(provider, oauthId) {
    const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active, email, oauth_provider, oauth_id FROM users WHERE oauth_provider = $1 AND oauth_id = $2 LIMIT 1',
        [provider, oauthId]
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

function loginInputLooksLikeEmail(login) {
    const e = String(login || '').trim().toLowerCase();
    return !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

async function verifyUserByLogin(login, password) {
    const s = String(login || '').trim();
    if (!s) return null;
    const eLower = s.toLowerCase();
    let user = null;
    // Сначала email: совпадение с OAuth/аккаунтом по почте, а не с логином, случайно совпадающим с видом email.
    if (loginInputLooksLikeEmail(s)) {
        user = await findUserByEmail(eLower);
    }
    if (!user) {
        user = await findUserByUsername(s);
    }
    if (!user && !loginInputLooksLikeEmail(s)) {
        user = await findUserByEmail(eLower);
    }
    if (!user || !user.is_active) return null;
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return null;
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    return { id: user.id, username: user.username, role: user.role };
}

function assertValidUsername(username) {
    const u = String(username || '').trim();
    if (!u) throw new Error('Укажите логин');
    if (u.includes('@')) throw new Error('Логин не может содержать символ @');
    if (u.length < 3) throw new Error('Логин должен быть не короче 3 символов');
    if (u.length > 48) throw new Error('Логин слишком длинный');
    if (!/^[\p{L}\p{N}._-]+$/u.test(u)) throw new Error('Логин может содержать только буквы, цифры, точку, дефис и подчёркивание');
}

async function createUser(username, password, role, options) {
    role = role || 'admin';
    options = options || {};
    assertValidUsername(username);
    const uname = String(username || '').trim();
    const taken = await findUserByUsername(uname);
    if (taken) throw new Error('Логин уже занят');
    const email = options.email ? String(options.email).trim().toLowerCase() : null;
    const email_verified = typeof options.email_verified === 'boolean' ? options.email_verified : null;
    const oauth_provider = options.oauth_provider ? String(options.oauth_provider) : null;
    const oauth_id = options.oauth_id ? String(options.oauth_id) : null;
    const password_set = typeof options.password_set === 'boolean' ? options.password_set : true;
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
        `INSERT INTO users (username, password_hash, role, email, email_verified, oauth_provider, oauth_id, password_set)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, username, role, is_active, created_at, email, email_verified, oauth_provider, oauth_id, password_set`,
        [uname, hash, role, email, email_verified, oauth_provider, oauth_id, password_set]
    );
    return result.rows[0];
}

async function insertEmailVerificationCode(email, purpose, codeHash, expiresAt) {
    await pool.query(
        'INSERT INTO email_verifications (email, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
        [String(email).trim().toLowerCase(), String(purpose).trim(), String(codeHash), expiresAt]
    );
}

async function getLatestEmailVerification(email, purpose) {
    const r = await pool.query(
        `SELECT id, email, purpose, code_hash, expires_at, used_at, created_at
         FROM email_verifications
         WHERE email = $1 AND purpose = $2
         ORDER BY id DESC
         LIMIT 1`,
        [String(email).trim().toLowerCase(), String(purpose).trim()]
    );
    return r.rows[0] || null;
}

async function consumeEmailVerificationCode(email, purpose, codeHash) {
    const r = await pool.query(
        `SELECT id, expires_at, used_at
         FROM email_verifications
         WHERE email = $1 AND purpose = $2 AND code_hash = $3
         ORDER BY id DESC
         LIMIT 1`,
        [String(email).trim().toLowerCase(), String(purpose).trim(), String(codeHash)]
    );
    const row = r.rows[0] || null;
    if (!row) return { ok: false, error: 'invalid' };
    if (row.used_at) return { ok: false, error: 'used' };
    const exp = new Date(row.expires_at);
    if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) return { ok: false, error: 'expired' };
    await pool.query('UPDATE email_verifications SET used_at = NOW() WHERE id = $1', [row.id]);
    return { ok: true };
}

async function upsertOAuthUser(provider, oauthId, email) {
    provider = String(provider || '').trim();
    oauthId = String(oauthId || '').trim();
    email = email ? String(email).trim().toLowerCase() : null;
    if (!provider || !oauthId) return null;

    const byOauth = await findUserByOAuth(provider, oauthId);
    // If an OAuth-linked account exists but is deactivated, do NOT allow "re-creating" it via OAuth login.
    // Deactivation must hard-block access.
    if (byOauth && !byOauth.is_active) return null;
    if (byOauth && byOauth.is_active) {
        if (email) {
            const r = await pool.query(
                `UPDATE users
                 SET last_login = NOW(), email = $1::text, email_verified = TRUE
                 WHERE id = $2
                   AND NOT EXISTS (
                     SELECT 1 FROM users u2
                     WHERE u2.email IS NOT NULL
                       AND LOWER(TRIM(u2.email::text)) = LOWER(TRIM($1::text))
                       AND u2.id <> $2
                   )`,
                [email, byOauth.id]
            );
            if (!r.rowCount) {
                await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [byOauth.id]);
                console.warn('[oauth] skip email update: already used by another user', { userId: byOauth.id, email });
            }
        } else {
            await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [byOauth.id]);
        }
        return { id: byOauth.id, username: byOauth.username, role: byOauth.role };
    }

    if (email) {
        const byEmail = await findUserByEmail(email);
        // If an email-matched account exists but is deactivated, do NOT link OAuth to it and do NOT create a new one.
        if (byEmail && !byEmail.is_active) return null;
        if (byEmail && byEmail.is_active) {
            await pool.query(
                'UPDATE users SET oauth_provider = $1, oauth_id = $2, last_login = NOW(), email = $4::text, email_verified = TRUE WHERE id = $3',
                [provider, oauthId, byEmail.id, email]
            );
            return { id: byEmail.id, username: byEmail.username, role: byEmail.role };
        }
    }

    if (!email) return null;

    const uname = provider + '_' + oauthId;
    const password = oauthId + ':' + Date.now();
    const created = await createUser(uname, password, 'user', {
        email: email,
        email_verified: email ? true : null,
        oauth_provider: provider,
        oauth_id: oauthId,
        password_set: false
    });
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [created.id]);
    return { id: created.id, username: created.username, role: created.role };
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
        `SELECT id, username,
            NULLIF(trim(COALESCE(email::text, '')), '') AS email_db,
            (
                CASE
                    WHEN NULLIF(trim(COALESCE(email::text, '')), '') IS NOT NULL THEN trim(email::text)
                    WHEN trim(COALESCE(username::text, '')) LIKE '%@%'
                        AND length(trim(COALESCE(username::text, '')))
                            - length(replace(trim(COALESCE(username::text, '')), '@', '')) = 1
                        AND split_part(lower(trim(COALESCE(username::text, ''))), '@', 2) LIKE '%.%'
                    THEN lower(trim(COALESCE(username::text, '')))
                    ELSE NULL
                END
            )::text AS list_email,
            role, is_active, created_at, last_login
         FROM users
         ORDER BY id`
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
    const r = await pool.query('UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2', [hash, id]);
    return (r && typeof r.rowCount === 'number') ? r.rowCount : 0;
}

async function changeUserPasswordWithOld(id, oldPassword, newPassword) {
    const user = await findUserById(id);
    if (!user || !user.is_active) return { ok: false, error: 'not_found' };
    const okOld = await bcrypt.compare(String(oldPassword || ''), user.password_hash);
    if (!okOld) return { ok: false, error: 'wrong_old' };
    const hash = await bcrypt.hash(String(newPassword || ''), 12);
    await pool.query('UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2', [hash, id]);
    return { ok: true };
}

async function setInitialPasswordForOAuthUser(id, newPassword) {
    const user = await findUserById(id);
    if (!user || !user.is_active) return { ok: false, error: 'not_found' };
    if (String(user.role || '') !== 'user') return { ok: false, error: 'forbidden' };
    if (user.password_set) return { ok: false, error: 'already_set' };
    const hash = await bcrypt.hash(String(newPassword || ''), 12);
    await pool.query('UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2', [hash, id]);
    return { ok: true };
}

async function insertPasswordResetToken(userId, tokenHash, expiresAt) {
    await pool.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, tokenHash, expiresAt]
    );
}

async function consumePasswordResetToken(tokenHash, newPassword) {
    const r = await pool.query(
        `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.is_active, u.role
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
         WHERE pr.token_hash = $1
         ORDER BY pr.id DESC
         LIMIT 1`,
        [tokenHash]
    );
    const row = r.rows[0] || null;
    if (!row) return { ok: false, error: 'invalid' };
    if (row.used_at) return { ok: false, error: 'used' };
    if (!row.is_active) return { ok: false, error: 'inactive' };
    if (String(row.role || '') !== 'user') return { ok: false, error: 'forbidden' };
    const exp = new Date(row.expires_at);
    if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) return { ok: false, error: 'expired' };
    const hash = await bcrypt.hash(String(newPassword || ''), 12);
    await pool.query('UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2', [hash, row.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id]);
    return { ok: true, user_id: row.user_id };
}

async function setUserRole(id, role) {
    role = String(role || '').trim();
    if (!['admin', 'superadmin', 'user'].includes(role)) throw new Error('Некорректная роль');
    const result = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role, is_active, created_at, last_login, email, oauth_provider, oauth_id',
        [role, id]
    );
    return result.rows[0] || null;
}

async function changeUsername(id, newUsername) {
    assertValidUsername(newUsername);
    const u = String(newUsername || '').trim();
    const other = await findUserByUsername(u);
    if (other && Number(other.id) !== Number(id)) throw new Error('Логин уже занят');

    const result = await pool.query(
        'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, role, is_active, created_at, last_login, email, oauth_provider, oauth_id, password_set',
        [u, id]
    );
    return result.rows[0] || null;
}

async function deleteUserById(id) {
    const result = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, username, role',
        [id]
    );
    return result.rows[0] || null;
}

module.exports = {
    pool,
    connectDB,
    ensureUserAuthSchema,
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
    findUserById,
    findUserByEmail,
    findUserByOAuth,
    verifyUser,
    verifyUserByLogin,
    createUser,
    upsertOAuthUser,
    ensureDefaultUsers,
    listUsers,
    setUserActive,
    changeUserPassword,
    changeUserPasswordWithOld,
    setInitialPasswordForOAuthUser,
    insertPasswordResetToken,
    consumePasswordResetToken,
    changeUsername,
    setUserRole,
    deleteUserById,
    insertEmailVerificationCode,
    getLatestEmailVerification,
    consumeEmailVerificationCode
};
