const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const isProduction = process.env.NODE_ENV === 'production';
const MEDIA_PUBLIC_BASE = String(process.env.PUBLIC_URL || process.env.MEDIA_CDN_BASE || '').replace(/\/$/, '');

function publicMediaUrl(url) {
    if (url == null) return url;
    const u = String(url).trim();
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (!MEDIA_PUBLIC_BASE) return u.startsWith('/') ? u : '/' + u;
    return MEDIA_PUBLIC_BASE + (u.startsWith('/') ? u : '/' + u);
}

function mapProductRowMedia(row) {
    if (!row || typeof row !== 'object') return row;
    if (row.image != null && String(row.image).trim() !== '') row.image = publicMediaUrl(row.image);
    if (row.brand_logo != null && String(row.brand_logo).trim() !== '') row.brand_logo = publicMediaUrl(row.brand_logo);
    if (row.collections != null && typeof row.collections === 'string') {
        try {
            const parsed = JSON.parse(row.collections);
            row.collections = Array.isArray(parsed) ? parsed : [];
        } catch {
            row.collections = [];
        }
    }
    if (Array.isArray(row.images)) {
        row.images = row.images.map((img) => {
            if (!img || typeof img !== 'object') return img;
            const copy = { ...img };
            if (copy.url != null && String(copy.url).trim() !== '') copy.url = publicMediaUrl(copy.url);
            return copy;
        });
    }
    return row;
}

function mapBrandRowMedia(row) {
    if (!row || typeof row !== 'object') return row;
    if (row.logo_url != null && String(row.logo_url).trim() !== '') row.logo_url = publicMediaUrl(row.logo_url);
    return row;
}

function buildPoolConfig() {
    const common = {
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
    };
    const sslMode = String(process.env.PGSSLMODE || '').toLowerCase();
    const wantSsl =
        sslMode === 'require' ||
        String(process.env.PGSSL || '').toLowerCase() === 'true' ||
        (isProduction && Boolean(process.env.DATABASE_URL));
    const ssl = wantSsl
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined;
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL, ...common, ssl: wantSsl ? ssl : undefined };
    }
    const password =
        process.env.PGPASSWORD !== undefined && process.env.PGPASSWORD !== ''
            ? process.env.PGPASSWORD
            : isProduction
                ? undefined
                : '12345678';
    return {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'kpvs_db',
        user: process.env.PGUSER || 'postgres',
        password,
        ...common,
        ssl: wantSsl ? ssl : undefined
    };
}

const pool = new Pool(buildPoolConfig());

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
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
        await client.query(`UPDATE users SET is_active = TRUE WHERE is_active IS NULL`);
        /* Уникальность email без учёта регистра и краевых пробелов (fallback на старый индекс при дубликатах в данных). */
        try {
            await client.query('DROP INDEX IF EXISTS users_email_uq');
        } catch (e) {
            console.warn('[schema] drop users_email_uq:', e && e.message);
        }
        try {
            await client.query(
                `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
                 ON users (lower(trim(email::text)))
                 WHERE email IS NOT NULL AND trim(email::text) <> ''`
            );
        } catch (e) {
            console.warn('[schema] users_email_lower_uq не создан (проверьте дубликаты email):', e && e.message);
            await client.query(
                'CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email) WHERE email IS NOT NULL'
            );
        }
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
    return result.rows.map(mapBrandRowMedia);
}

/**
 * Текст «другие шкалы» для строки размера s: все члены той же группы, кроме s.id.
 * Варианты товара хранят один stored id на группу; этот фрагмент — только подсказка в UI.
 */
const otherScalesHintSubquery = `
    (
        SELECT string_agg(partner_label, ' · ' ORDER BY partner_label)
        FROM (
            SELECT DISTINCT ste.name || ': ' || sp.value AS partner_label
            FROM size_group_members m_self
            JOIN size_group_members m_other
              ON m_other.group_id = m_self.group_id AND m_other.size_id <> m_self.size_id
            JOIN sizes sp ON sp.id = m_other.size_id
            JOIN size_types ste ON ste.id = sp.size_type_id
            WHERE m_self.size_id = s.id
        ) eqs
    )
`;

/** В SELECT справочника размеров поле по-прежнему называется equivalent_hint (админка). */
const otherScalesHintSqlColumn = `${otherScalesHintSubquery} AS equivalent_hint`;

/** Порядок вывода: тип (имя) → EU-буквы 2XS…3XL → обувь по числу → прочее по значению. */
const sizeRowDisplayOrderSql = `
  CASE lower(btrim(COALESCE(st.slug::text, '')))
    WHEN 'eu_clothing' THEN (
      CASE lower(btrim(s.value::text))
        WHEN '2xs' THEN 1 WHEN 'xxs' THEN 1
        WHEN 'xs' THEN 2
        WHEN 's' THEN 3
        WHEN 'm' THEN 4
        WHEN 'l' THEN 5
        WHEN 'xl' THEN 6
        WHEN 'xxl' THEN 7 WHEN '2xl' THEN 7
        WHEN '3xl' THEN 8
        ELSE 100
      END
    )
    WHEN 'eu_accessories' THEN (
      CASE lower(btrim(s.value::text))
        WHEN '2xs' THEN 1 WHEN 'xxs' THEN 1
        WHEN 'xs' THEN 2
        WHEN 's' THEN 3
        WHEN 'm' THEN 4
        WHEN 'l' THEN 5
        WHEN 'xl' THEN 6
        WHEN 'xxl' THEN 7 WHEN '2xl' THEN 7
        WHEN '3xl' THEN 8
        ELSE 50
      END
    )
    WHEN 'eu_footwear' THEN (
      LEAST(200, GREATEST(0, COALESCE(NULLIF(regexp_replace(btrim(s.value::text), ',', '.', 'g'), '')::numeric, 999)))
    )
    WHEN 'universal' THEN (
      CASE lower(btrim(s.value::text))
        WHEN 'универсальный' THEN 1
        WHEN 'универсальный размер' THEN 1
        WHEN 'os' THEN 1
        WHEN 'one size' THEN 1
        WHEN 'osfm' THEN 2
        WHEN 'без размера' THEN 3
        WHEN 'xxs/xs' THEN 10
        WHEN 'xs/s' THEN 11
        WHEN 's/m' THEN 12
        WHEN 'm/l' THEN 13
        WHEN 'l/xl' THEN 14
        WHEN 'xl/xxl' THEN 15
        WHEN 'xl/2xl' THEN 15
        ELSE 90
      END
    )
    ELSE 0
  END
`;

/**
 * Размеры для категории: типы из category_size_types по цепочке предков + уточнение по самой категории
 * (имя/slug листа через classifyCategorySizeTypeSlugs — набор региональных сеток: RU/EU/… для одежды или обуви).
 * Если у предка только сетки одежды, а лист — обувь, пересечение пустое — берём сетки листа.
 * Если и явных связей нет, и классификация не дала типов — возвращаются все размеры.
 */
async function getSizes(categoryId) {
    const cid = Number(categoryId);
    if (!Number.isFinite(cid) || cid <= 0) {
        const result = await pool.query(`
            SELECT s.id, s.value, s.size_type_id, st.name AS size_type,
            COALESCE(NULLIF(btrim(st.slug::text), ''), '') AS size_type_slug,
            ${otherScalesHintSqlColumn}
            FROM sizes s
            JOIN size_types st ON s.size_type_id = st.id
            ORDER BY st.name, ${sizeRowDisplayOrderSql}, s.value
        `);
        return result.rows;
    }

    const catRes = await pool.query('SELECT id, name, slug FROM categories WHERE id = $1', [cid]);
    const cat = catRes.rows[0];
    const inferredSlugs = cat ? classifyCategorySizeTypeSlugs(cat.name, cat.slug) : Array.from(SIZE_GRID_DEFAULT);

    const slugRows = await pool.query(
        `SELECT id FROM size_types
         WHERE lower(btrim(slug::text)) = ANY(SELECT lower(btrim(x)) FROM unnest($1::text[]) AS t(x))`,
        [inferredSlugs]
    );
    const inferredIds = slugRows.rows.map(r => Number(r.id)).filter(n => Number.isFinite(n) && n > 0);

    const explicitRes = await pool.query(
        `
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM categories WHERE id = $1::int
            UNION ALL
            SELECT p.id, p.parent_id
            FROM categories p
            INNER JOIN ancestors a ON p.id = a.parent_id
        )
        SELECT DISTINCT cst.size_type_id AS id
        FROM category_size_types cst
        WHERE cst.category_id IN (SELECT id FROM ancestors)
        `,
        [cid]
    );
    const explicitIds = explicitRes.rows.map(r => Number(r.id)).filter(n => Number.isFinite(n) && n > 0);

    let filterIds = [];
    if (inferredIds.length) {
        if (explicitIds.length) {
            const inter = inferredIds.filter(id => explicitIds.includes(id));
            filterIds = inter.length ? inter : inferredIds;
        } else {
            filterIds = inferredIds;
        }
    } else {
        filterIds = explicitIds;
    }

    if (!filterIds.length) {
        const result = await pool.query(`
            SELECT s.id, s.value, s.size_type_id, st.name AS size_type,
            COALESCE(NULLIF(btrim(st.slug::text), ''), '') AS size_type_slug,
            ${otherScalesHintSqlColumn}
            FROM sizes s
            JOIN size_types st ON s.size_type_id = st.id
            ORDER BY st.name, ${sizeRowDisplayOrderSql}, s.value
        `);
        return result.rows;
    }

    const result = await pool.query(
        `
        SELECT s.id, s.value, s.size_type_id, st.name AS size_type,
        COALESCE(NULLIF(btrim(st.slug::text), ''), '') AS size_type_slug,
        ${otherScalesHintSqlColumn}
        FROM sizes s
        JOIN size_types st ON s.size_type_id = st.id
        WHERE s.size_type_id = ANY($1::int[])
        ORDER BY st.name, ${sizeRowDisplayOrderSql}, s.value
        `,
        [filterIds]
    );
    return result.rows;
}

async function getSizeTypes() {
    const r = await pool.query(`
        SELECT id, name, COALESCE(NULLIF(btrim(slug::text), ''), '') AS slug
        FROM size_types
        ORDER BY id
    `);
    return r.rows;
}

async function getCategorySizeTypeLinks() {
    const r = await pool.query(
        'SELECT category_id, size_type_id FROM category_size_types ORDER BY category_id, size_type_id'
    );
    return r.rows.map(row => ({
        category_id: Number(row.category_id),
        size_type_id: Number(row.size_type_id)
    }));
}

async function createBrand(data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Укажите название бренда');
    let slug = String(data.slug || '').trim();
    if (!slug) slug = slugify(name);
    if (!slug) throw new Error('Укажите slug или более говорящее название');
    try {
        const ins = await pool.query(
            `INSERT INTO brands (name, slug, logo_url)
             VALUES ($1, $2, $3)
             RETURNING id, name, slug, logo_url`,
            [name, slug, null]
        );
        return mapBrandRowMedia(ins.rows[0]);
    } catch (e) {
        if (String(e.code) === '23505') throw new Error('Бренд с таким slug уже есть');
        throw e;
    }
}

/**
 * Только европейские шкалы + универсальный тип (OS, унисекс-буквы).
 * Домен: одежда / обувь / аксессуары; СИЗ — одежда + аксессуары + универсальный.
 */
const SIZE_GRID_SLUGS_CLOTHING = Object.freeze(['eu_clothing']);
const SIZE_GRID_SLUGS_FOOTWEAR = Object.freeze(['eu_footwear']);
const SIZE_GRID_SLUGS_ACCESSORIES = Object.freeze(['eu_accessories', 'universal']);
const SIZE_GRID_SLUGS_PPE = Object.freeze(['eu_clothing', 'eu_accessories', 'universal']);
/** По умолчанию (неопознанная категория): одежда + универсальный. */
const SIZE_GRID_DEFAULT = Object.freeze(['eu_clothing', 'universal']);

/**
 * Подбор типов размеров по названию/slug категории.
 * Токены + окончания; slug: обувь только отдельным сегментом (obuv, footwear…), не подстрокой в «kurtki-vs-obuv».
 */
function classifyCategorySizeTypeSlugs(name, slug) {
    const raw = `${String(name || '')} ${String(slug || '')}`.toLowerCase().replace(/[_-]+/g, ' ');
    const tokens = raw.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);
    const hay = ` ${tokens.join(' ')} `;

    const gloveRe = /(?:^|\s)(?:перчат|рукавиц|gloves?)(?:[a-zа-яё]*)?(?:\s|$)/i;
    const footRe =
        /(?:^|\s)(?:обувь|обуви|обувью|обувей|ботинк|сапог|кроссовк|тапочк|босоножк|валенк|мокасин|лофер|слипон|туфл|сабо|угг|эспадриль)(?:[a-zа-яё]*)?(?:\s|$)/i;
    /** Без «рабоч» — иначе «Ботинки рабочие» попадают и в одежду, и в обувь, и пересечение с БД даёт только одежду. */
    const appRe =
        /(?:^|\s)(?:спецодежд|одежд|костюм|куртк|брюк|рубашк|жилет|фартук|комбинезон|платье|юбк|свитер|поло|футболк|халат|трикотаж|пальто|пиджак|сорочк|шорт|трус|лифчик|пижам|худи|свитшот|кардиган|пончо|носк|колгот|легинс|манишк|торгов|вещев|одежн|форм)(?:[a-zа-яё]*)?(?:\s|$)/i;
    const accRe =
        /(?:^|\s)(?:аксесс|сумк|рюкзак|кошел|клатч|портфел|портмон|ремен|галстук|шарф|шапк|кепк|бейсбол|панам|нарук|очк|зонт|платок|косынк|подтяжк|украшен|бижутер|часы|заколк|бусы|кольцо|браслет|серьг|цепочк|чехол|ремен|коврик|ременн|ремень|ремени|ременя)/i.test(
            hay
        ) ||
        /(?:^|\s)(?:аксесс|сумк|рюкзак|ремен|шарф|шапк|кепк|зонт)/i.test(` ${String(slug || '').toLowerCase().replace(/[_-]+/g, ' ')} `);

    const slugStr = String(slug || '').toLowerCase();
    const slugSegs = slugStr.split(/[/_.-]+/).filter(Boolean);
    const slugSegFoot = slugSegs.some(function(s) {
        return /^(obuv|footwear|shoe|boots?|sneakers?|tapoch|tapocek)$/i.test(s);
    });
    const slugSegApp = slugSegs.some(function(s) {
        return (
            /^(odezhda|odezda|cloth(?:ing)?|shirt|pants|jacket|apparel|specodezhd|trikotazh|rubashka|coat|vest)$/i.test(s) ||
            /^kurtk/i.test(s) ||
            /^raboch/i.test(s) ||
            /^specodezhd/i.test(s)
        );
    });
    const slugSegAcc = slugSegs.some(function(s) {
        return /^(aksess|accessories|bags|belt|scarf|hat|gloves|jewelry|sumki|ryukzak)$/i.test(s);
    });
    const slugSegUnisex = slugSegs.some(function(s) {
        return /^(unisex|univ|universal)$/i.test(s);
    });

    const haySlug = ` ${raw.replace(/\s+/g, ' ').trim()} `;
    const specFootwearCompound = /спецобув|specobuv|spec-?obuv|spec.?footwear/i.test(raw);

    const slugSegPpe = slugSegs.some(function(s) {
        return /^(siz|ppe|epi|epi\-|respirator|kaska|kasok|zashchit|zashit|sredstva|kragi|schitok|schit|protivogaz|mask|safety)$/i.test(
            s
        );
    });
    const ppeRe =
        /(?:^|\s)(?:сиз\b|ср\.?\s*сз|средств\w*\s+защит|индивидуал\w*\s+защит|средств\w*\s+индивидуал|респиратор|противогаз|антишум|каска|наушник\w*\s+против|защитн\w*\s+очк|щиток|краг|нарукавник|напальчник|капюшон\w*\s+к\s+каск|подшлемник|визор|наплечник|наколенник|налокотник|страховочн\w*\s+пояс)/i.test(
            hay
        ) ||
        /(?:^|\s)(?:сиз\b|средств\w*\s+защит|индивидуал\w*\s+защит|респиратор|противогаз|каска)/i.test(haySlug) ||
        slugSegPpe;

    const unisexHay =
        /(?:^|\s)(?:унисекс|unisex|универсал|для\s+всех|для\s+люб)/i.test(hay) ||
        /(?:^|\s)(?:унисекс|unisex|универсал)/i.test(haySlug) ||
        slugSegUnisex;

    if (gloveRe.test(hay) || gloveRe.test(haySlug)) return Array.from(SIZE_GRID_SLUGS_ACCESSORIES);

    const hasFt = footRe.test(hay) || footRe.test(haySlug) || slugSegFoot || specFootwearCompound;
    /** Обувь по названию/slug важнее общих слов («рабочие» у ботинок не должны включать тип «одежда»). */
    if (hasFt) return Array.from(SIZE_GRID_SLUGS_FOOTWEAR);

    if (ppeRe) return Array.from(SIZE_GRID_SLUGS_PPE);

    if (accRe || slugSegAcc) return Array.from(SIZE_GRID_SLUGS_ACCESSORIES);

    const hasApp = appRe.test(hay) || slugSegApp || /(?:^|\s)рабоч(?:[a-zа-яё]*)?(?:\s|$)/i.test(hay);
    if (hasApp) {
        return unisexHay ? Array.from(SIZE_GRID_DEFAULT) : Array.from(SIZE_GRID_SLUGS_CLOTHING);
    }

    if (unisexHay) return Array.from(SIZE_GRID_DEFAULT);
    return Array.from(SIZE_GRID_DEFAULT);
}

/** Slug apparel / footwear / gloves у трёх «легаси» типов — для старых строк sizes; активные сетки: eu_clothing / eu_footwear / … */
async function reconcileCanonicalSizeTypeSlugs() {
    const { rows } = await pool.query('SELECT id, name FROM size_types ORDER BY id');
    const ln = s => String(s || '').toLowerCase();

    const byExactName = exact => {
        const e = exact.toLowerCase();
        for (const r of rows) {
            if (ln(r.name) === e) return Number(r.id);
        }
        return null;
    };
    const byNameStarts = prefix => {
        const p = prefix.toLowerCase();
        for (const r of rows) {
            const n = ln(r.name);
            if (n === p || n.startsWith(p + ' ') || n.startsWith(p + '(')) return Number(r.id);
        }
        return null;
    };

    const pickId = pred => {
        for (const r of rows) {
            if (pred(ln(r.name))) return Number(r.id);
        }
        return null;
    };

    const gloveId =
        byExactName('перчатки') ||
        byNameStarts('перчатки') ||
        pickId(
            n =>
                /^(перчат|рукавиц)/.test(n) ||
                /\bперчат/.test(n) ||
                /\bрукавиц/.test(n) ||
                /\bgloves?\b/.test(n)
        );
    const footId = byExactName('обувь') || byNameStarts('обувь') || pickId(
        n =>
            /обув|ботин|сапог|кроссов|тапоч|босонож|валенк|мокасин|лофер|слипон|туфл|сабо|угг/.test(n) &&
            !/одежд|спецодежд|трикотаж|костюм|бель|брюк|куртк|рубашк|свитер|футболк|поло|халат|пальто|пиджак|сорочк|шорт|платье|юбк|жилет|комбинезон|фартук|манишк|худи|свитшот|кардиган|пончо|носк|колгот|легинс|трус|лифчик|пижам|манжет|воротник/.test(
                n
            )
    );
    const appId =
        byExactName('одежда') ||
        byNameStarts('одежда') ||
        pickId(
            n =>
                /одежд|спецодежд|трикотаж|костюм|бель|брюк|куртк|рубашк|свитер|футболк|поло|халат|пальто|пиджак|сорочк|шорт|платье|юбк|жилет|комбинезон|фартук|манишк|худи|свитшот|кардиган|пончо|носк|колгот|легинс|трус|лифчик|пижам|манжет|воротник|размер/.test(
                    n
                ) &&
                !/обув|ботин|сапог|кроссов|тапоч|босонож|валенк|мокасин|лофер|туфл|сабо|угг/.test(n)
        );

    await pool.query(`
        UPDATE size_types
        SET slug = 'stype-' || id::text
        WHERE lower(btrim(COALESCE(slug, ''))) IN ('apparel', 'footwear', 'gloves')
    `);

    const assign = async (id, slug) => {
        if (id == null || !Number.isFinite(id) || id <= 0) return;
        await pool.query('UPDATE size_types SET slug = $1 WHERE id = $2', [slug, id]);
    };
    await assign(gloveId, 'gloves');
    await assign(footId, 'footwear');
    await assign(appId, 'apparel');

    const still = await pool.query(`
        SELECT lower(btrim(COALESCE(slug, ''))) AS s
        FROM size_types
        WHERE lower(btrim(COALESCE(slug, ''))) IN ('apparel', 'footwear', 'gloves')
    `);
    const have = new Set(still.rows.map(r => r.s));
    if (!have.has('apparel')) {
        const up = await pool.query(`
            UPDATE size_types SET slug = 'apparel'
            WHERE id = (
                SELECT id FROM size_types
                WHERE lower(btrim(name)) = 'одежда' OR lower(btrim(name)) LIKE 'одежда %' OR lower(btrim(name)) LIKE 'одежда(%'
                ORDER BY id LIMIT 1
            )
            RETURNING id`);
        if (!up.rows.length) {
            await pool.query(`INSERT INTO size_types (name, slug) VALUES ('Одежда', 'apparel')`);
        }
    }
    if (!have.has('footwear')) {
        const up = await pool.query(`
            UPDATE size_types SET slug = 'footwear'
            WHERE id = (
                SELECT id FROM size_types
                WHERE lower(btrim(name)) = 'обувь' OR lower(btrim(name)) LIKE 'обувь %' OR lower(btrim(name)) LIKE 'обувь(%'
                ORDER BY id LIMIT 1
            )
            RETURNING id`);
        if (!up.rows.length) {
            await pool.query(`INSERT INTO size_types (name, slug) VALUES ('Обувь', 'footwear')`);
        }
    }
    if (!have.has('gloves')) {
        const up = await pool.query(`
            UPDATE size_types SET slug = 'gloves'
            WHERE id = (
                SELECT id FROM size_types
                WHERE lower(btrim(name)) = 'перчатки' OR lower(btrim(name)) LIKE 'перчатки %' OR lower(btrim(name)) LIKE 'перчатки(%'
                ORDER BY id LIMIT 1
            )
            RETURNING id`);
        if (!up.rows.length) {
            await pool.query(`INSERT INTO size_types (name, slug) VALUES ('Перчатки', 'gloves')`);
        }
    }
}

/** Таблица category_size_types + slug у size_types; синхронизация связей категория→тип размера по правилам. */
async function ensureCategorySizeTypesSchema() {
    await pool.query('ALTER TABLE size_types ADD COLUMN IF NOT EXISTS slug TEXT');
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS size_types_slug_lower_uq
            ON size_types (lower(btrim(slug)))
            WHERE slug IS NOT NULL AND btrim(slug::text) <> ''
        `);
    } catch (e) {
        console.warn('[schema] size_types_slug_lower_uq:', e && e.message);
    }

    const types = await pool.query('SELECT id, name, slug FROM size_types ORDER BY id');
    for (const t of types.rows) {
        if (t.slug != null && String(t.slug).trim() !== '') continue;
        const base = slugify(String(t.name || 'type')) || 'type';
        await pool.query('UPDATE size_types SET slug = $1 WHERE id = $2', [`${base}-${t.id}`, t.id]);
    }

    const canonical = [
        { name: 'Обувь', slug: 'footwear' },
        { name: 'Перчатки', slug: 'gloves' }
    ];
    for (const c of canonical) {
        await pool.query(
            `INSERT INTO size_types (name, slug)
             SELECT $1::text, $2::text
             WHERE NOT EXISTS (SELECT 1 FROM size_types WHERE lower(btrim(slug::text)) = lower(btrim($2::text)))`,
            [c.name, c.slug]
        );
    }

    const apparelMissing = await pool.query(
        `SELECT 1 FROM size_types WHERE lower(btrim(slug::text)) = 'apparel' LIMIT 1`
    );
    if (!apparelMissing.rows.length) {
        await pool.query(
            `INSERT INTO size_types (name, slug) VALUES ('Одежда', 'apparel')`
        );
    }

    const gridTypes = [
        { name: 'Одежда (EU, 2XS–3XL)', slug: 'eu_clothing' },
        { name: 'Обувь (EU, 35–47)', slug: 'eu_footwear' },
        { name: 'Аксессуары (EU, 2XS–3XL)', slug: 'eu_accessories' },
        { name: 'Универсальный размер', slug: 'universal' }
    ];
    for (const g of gridTypes) {
        await pool.query(
            `INSERT INTO size_types (name, slug)
             SELECT $1::text, $2::text
             WHERE NOT EXISTS (SELECT 1 FROM size_types WHERE lower(btrim(slug::text)) = lower(btrim($2::text)))`,
            [g.name, g.slug]
        );
    }
    await pool.query(`
        UPDATE size_types st
        SET name = d.name
        FROM (
            VALUES
                ('eu_clothing', 'Одежда (EU, 2XS–3XL)'),
                ('eu_footwear', 'Обувь (EU, 35–47)'),
                ('eu_accessories', 'Аксессуары (EU, 2XS–3XL)'),
                ('universal', 'Универсальный размер')
        ) AS d(slug, name)
        WHERE lower(btrim(st.slug::text)) = lower(btrim(d.slug::text))
    `);

    await reconcileCanonicalSizeTypeSlugs();

    await pool.query(`
        CREATE TABLE IF NOT EXISTS category_size_types (
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            size_type_id INTEGER NOT NULL REFERENCES size_types(id) ON DELETE CASCADE,
            PRIMARY KEY (category_id, size_type_id)
        )
    `);

    await pool.query('DELETE FROM category_size_types');

    const slugRows = await pool.query(
        `SELECT id, lower(btrim(slug::text)) AS slug FROM size_types WHERE slug IS NOT NULL AND btrim(slug::text) <> ''`
    );
    const bySlug = {};
    slugRows.rows.forEach(r => {
        bySlug[r.slug] = Number(r.id);
    });

    /* Только корневые категории: потомки получают типы через предков в getSizes (меньше строк, одна политика на ветку). */
    const cats = await pool.query(
        'SELECT id, name, slug FROM categories WHERE parent_id IS NULL ORDER BY id'
    );
    for (const c of cats.rows) {
        const slugs = classifyCategorySizeTypeSlugs(c.name, c.slug);
        for (const sg of slugs) {
            const tid = bySlug[sg];
            if (tid) {
                await pool.query(
                    `INSERT INTO category_size_types (category_id, size_type_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [c.id, tid]
                );
            }
        }
    }
}

/**
 * =============================================================================
 * ГРУППЫ РАЗМЕРОВ (эквиваленты между строками справочника, напр. EU ↔ буквы)
 * =============================================================================
 * Таблицы в БД: size_equiv_groups, size_group_members (имена колонок исторические).
 *
 * 1) В группе несколько строк sizes.id; в product_variants.size_id хранится РОВНО ОДИН
 *    id на группу — canonical_size_id (главный для хранения; любой член группы при сохранении варианта нормализуется сюда).
 * 2) При сохранении варианта любой id из группы подменяется на этот главный (см. storedSizeIdForVariant).
 * 3) Фильтры по размеру: getProducts и expandSizeIdsForEquivalence учитывают всех членов группы (не только canonical).
 * 4) Подсказка в каталоге: size_equivalent_hint; в справочнике размеров для админки: equivalent_hint.
 * 5) Админ API (см. server.js): GET/POST/DELETE /api/admin/size-groups
 *    (старый путь …/size-equivalent-groups — то же самое).
 * 6) Создание группы: POST JSON { "size_ids": [..], "stored_as_size_id": N [, "label": "…"] }.
 *    Устаревший формат: canonical_size_id + member_size_ids — всё ещё принимается.
 * =============================================================================
 */
async function ensureSizeGroupsSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS size_equiv_groups (
            id SERIAL PRIMARY KEY,
            label TEXT,
            canonical_size_id INTEGER NOT NULL REFERENCES sizes(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS size_group_members (
            group_id INTEGER NOT NULL REFERENCES size_equiv_groups(id) ON DELETE CASCADE,
            size_id INTEGER NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
            PRIMARY KEY (group_id, size_id),
            CONSTRAINT size_group_members_size_id_key UNIQUE (size_id)
        );
        CREATE INDEX IF NOT EXISTS size_group_members_gid_idx ON size_group_members (group_id);
    `);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const oldTab = await client.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'size_equivalents'
            ) AS e
        `);
        if (oldTab.rows[0].e) {
            const gcount = await client.query('SELECT COUNT(*)::int AS c FROM size_equiv_groups');
            if (Number(gcount.rows[0].c) === 0) {
                const edges = await client.query('SELECT size_a, size_b FROM size_equivalents');
                const parent = new Map();
                function find(x) {
                    if (!parent.has(x)) parent.set(x, x);
                    const p = parent.get(x);
                    if (p !== x) {
                        const r = find(p);
                        parent.set(x, r);
                        return r;
                    }
                    return x;
                }
                function union(a, b) {
                    let ra = find(a);
                    let rb = find(b);
                    if (ra === rb) return;
                    if (ra > rb) [ra, rb] = [rb, ra];
                    parent.set(rb, ra);
                }
                const nodes = new Set();
                for (const row of edges.rows) {
                    const a = Number(row.size_a);
                    const b = Number(row.size_b);
                    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
                    nodes.add(a);
                    nodes.add(b);
                    union(a, b);
                }
                const comps = new Map();
                for (const id of nodes) {
                    const r = find(id);
                    if (!comps.has(r)) comps.set(r, []);
                    comps.get(r).push(id);
                }
                for (const members of comps.values()) {
                    members.sort((x, y) => x - y);
                    const canonical = members[0];
                    const ins = await client.query(
                        `INSERT INTO size_equiv_groups (label, canonical_size_id) VALUES ($1, $2) RETURNING id`,
                        [`Эквиваленты (миграция) ${canonical}`, canonical]
                    );
                    const gid = ins.rows[0].id;
                    for (const sid of members) {
                        await client.query(
                            `INSERT INTO size_group_members (group_id, size_id) VALUES ($1, $2)`,
                            [gid, sid]
                        );
                    }
                }
            }
            await client.query('DROP TABLE IF EXISTS size_equivalents CASCADE');
        }
        await client.query(`
            UPDATE product_variants pv
            SET size_id = g.canonical_size_id
            FROM size_group_members m
            JOIN size_equiv_groups g ON g.id = m.group_id
            WHERE pv.size_id = m.size_id
              AND pv.size_id IS DISTINCT FROM g.canonical_size_id
        `);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

async function listSizeGroups() {
    const r = await pool.query(`
        SELECT g.id, g.label, g.canonical_size_id AS stored_size_id,
            json_agg(json_build_object(
                'size_id', s.id,
                'value', s.value,
                'size_type', st.name,
                'size_type_id', s.size_type_id
            ) ORDER BY st.name, s.value) AS members
        FROM size_equiv_groups g
        JOIN size_group_members m ON m.group_id = g.id
        JOIN sizes s ON s.id = m.size_id
        JOIN size_types st ON st.id = s.size_type_id
        GROUP BY g.id, g.label, g.canonical_size_id
        ORDER BY g.id
    `);
    return r.rows;
}

async function createSizeGroup(data) {
    const raw = data || {};
    const label =
        raw.label != null && String(raw.label).trim() ? String(raw.label).trim() : null;

    let stored;
    let all;

    if (Array.isArray(raw.size_ids) && raw.size_ids.length) {
        all = [...new Set(raw.size_ids.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))];
        if (all.length < 2) {
            throw new Error('В size_ids нужно минимум два разных id');
        }
        stored = Number(raw.stored_as_size_id);
        if (!Number.isFinite(stored) || stored <= 0) {
            throw new Error('Укажите stored_as_size_id — один из size_ids, он попадёт в варианты товара');
        }
        if (!all.includes(stored)) {
            throw new Error('stored_as_size_id должен быть в списке size_ids');
        }
    } else {
        const canonical = Number(raw.canonical_size_id);
        const mem = Array.isArray(raw.member_size_ids) ? raw.member_size_ids : [];
        const extra = mem.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0);
        const allSet = new Set(extra);
        if (Number.isFinite(canonical) && canonical > 0) allSet.add(canonical);
        all = [...allSet];
        if (all.length < 2) {
            throw new Error(
                'Задайте { size_ids, stored_as_size_id } или устаревший вариант { canonical_size_id, member_size_ids }'
            );
        }
        if (!Number.isFinite(canonical) || canonical <= 0 || !allSet.has(canonical)) {
            throw new Error('Укажите корректный canonical_size_id из списка членов группы');
        }
        stored = canonical;
    }

    const ex = await pool.query('SELECT COUNT(*)::int AS c FROM sizes WHERE id = ANY($1::int[])', [all]);
    if (Number(ex.rows[0].c) !== all.length) throw new Error('Один из размеров не найден');
    const conflict = await pool.query(
        'SELECT 1 FROM size_group_members WHERE size_id = ANY($1::int[]) LIMIT 1',
        [all]
    );
    if (conflict.rows.length) throw new Error('Один из размеров уже в другой группе');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const ins = await client.query(
            `INSERT INTO size_equiv_groups (label, canonical_size_id) VALUES ($1, $2) RETURNING id`,
            [label, stored]
        );
        const gid = ins.rows[0].id;
        for (const sid of all) {
            await client.query(
                `INSERT INTO size_group_members (group_id, size_id) VALUES ($1, $2)`,
                [gid, sid]
            );
        }
        await client.query(
            `
            UPDATE product_variants pv
            SET size_id = $1
            FROM size_group_members m
            WHERE m.group_id = $2
              AND pv.size_id = m.size_id
              AND pv.size_id IS DISTINCT FROM $1
            `,
            [stored, gid]
        );
        await client.query('COMMIT');
        return { id: gid, label, stored_size_id: stored, size_ids: all };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

async function deleteSizeGroup(groupId) {
    const gid = Number(groupId);
    if (!Number.isFinite(gid) || gid <= 0) throw new Error('Укажите id группы');
    const r = await pool.query('DELETE FROM size_equiv_groups WHERE id = $1 RETURNING id', [gid]);
    if (!r.rows.length) throw new Error('Группа не найдена');
    return { ok: true, id: gid };
}

/**
 * Группы эквивалентных размеров (для клиента: расширение фильтра по любому id из группы).
 * Только группы из ≥2 размеров.
 */
async function listSizeEquivalenceBuckets() {
    const r = await pool.query(`
        SELECT COALESCE(json_agg(m.size_id ORDER BY m.size_id) FILTER (WHERE m.size_id IS NOT NULL), '[]'::json) AS size_ids
        FROM size_group_members m
        GROUP BY m.group_id
        HAVING COUNT(*) >= 2
    `);
    return r.rows.map(function(row) {
        return { size_ids: row.size_ids };
    });
}

/** Разворачивает список id размеров в полный набор членов тех же групп эквивалентности (+ id без группы). */
async function expandSizeIdsForEquivalence(sizeIds, db = pool) {
    const ids = [...new Set((sizeIds || []).map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))];
    if (!ids.length) return [];
    const r = await db.query(
        `
        SELECT DISTINCT x.eid AS id
        FROM (
            SELECT m2.size_id AS eid
            FROM unnest($1::int[]) AS u(id)
            INNER JOIN size_group_members m1 ON m1.size_id = u.id
            INNER JOIN size_group_members m2 ON m2.group_id = m1.group_id
            UNION
            SELECT u.id AS eid
            FROM unnest($1::int[]) AS u(id)
            WHERE NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = u.id)
        ) x
        `,
        [ids]
    );
    return r.rows.map(row => Number(row.id)).filter(n => Number.isFinite(n) && n > 0);
}

/** Любой id из группы → id, который хранится в product_variants (одна точка хранения на группу). */
async function storedSizeIdForVariant(sizeId, db = pool) {
    const sid = Number(sizeId);
    if (!Number.isFinite(sid) || sid <= 0) return null;
    const r = await db.query(
        `
        SELECT g.canonical_size_id
        FROM size_group_members m
        JOIN size_equiv_groups g ON g.id = m.group_id
        WHERE m.size_id = $1
        LIMIT 1
        `,
        [sid]
    );
    if (r.rows.length) return Number(r.rows[0].canonical_size_id);
    return sid;
}

async function ensureSizesUniqueValueIndex() {
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS sizes_type_value_lower_uq
            ON sizes (size_type_id, lower(btrim(value)))
        `);
    } catch (e) {
        console.warn('[schema] sizes_type_value_lower_uq:', e && e.message);
    }
}

/**
 * Справочные размеры: EU одежда и аксессуары — буквы 2XS–3XL (как одежда); обувь 35–47; универсальный тип.
 * Удаляет неиспользуемые строки вне белого списка (без ссылок из вариантов и групп эквивалентов).
 */
async function ensureReferenceSizesSeed() {
    await ensureSizesUniqueValueIndex();
    const allSlugs = ['eu_clothing', 'eu_footwear', 'eu_accessories', 'universal'];
    const types = await pool.query(
        `SELECT id, lower(btrim(slug::text)) AS slug FROM size_types
         WHERE lower(btrim(slug::text)) = ANY(SELECT lower(btrim(x)) FROM unnest($1::text[]) AS t(x))`,
        [allSlugs]
    );
    const bySlug = {};
    types.rows.forEach(function(row) {
        bySlug[row.slug] = Number(row.id);
    });
    const missing = allSlugs.filter(function(s) {
        return !bySlug[s];
    });
    if (missing.length) {
        console.warn('[seed] reference sizes: нет типов по slug:', missing.join(', '));
    }

    async function insertValues(typeId, values) {
        if (!typeId || !Number.isFinite(typeId) || typeId <= 0) return;
        for (let i = 0; i < values.length; i++) {
            const val = String(values[i] != null ? values[i] : '').trim();
            if (!val) continue;
            await pool.query(
                `INSERT INTO sizes (size_type_id, value)
                 SELECT $1::int, $2::text
                 WHERE NOT EXISTS (
                   SELECT 1 FROM sizes s
                   WHERE s.size_type_id = $1::int AND lower(btrim(s.value::text)) = lower(btrim($2::text))
                 )`,
                [typeId, val]
            );
        }
    }

    async function deleteOrphanSizesNotInWhitelist(typeId, allowedLowers) {
        if (!typeId || !Number.isFinite(typeId) || typeId <= 0 || !allowedLowers.length) return;
        await pool.query(
            `DELETE FROM sizes s
             WHERE s.size_type_id = $1::int
               AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.size_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM size_group_members m WHERE m.size_id = s.id)
               AND lower(btrim(s.value::text)) <> ALL($2::text[])`,
            [typeId, allowedLowers]
        );
    }

    const EU_LETTERS_2XS_3XL = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    const lettersLower = EU_LETTERS_2XS_3XL.map(function(v) {
        return String(v).trim().toLowerCase();
    });

    await insertValues(bySlug.eu_clothing, EU_LETTERS_2XS_3XL);
    await deleteOrphanSizesNotInWhitelist(bySlug.eu_clothing, lettersLower);

    const shoeEu = [];
    const footLower = [];
    for (let e = 35; e <= 47; e++) {
        shoeEu.push(String(e));
        footLower.push(String(e));
    }
    await insertValues(bySlug.eu_footwear, shoeEu);
    await deleteOrphanSizesNotInWhitelist(bySlug.eu_footwear, footLower);

    await insertValues(bySlug.eu_accessories, EU_LETTERS_2XS_3XL);
    await deleteOrphanSizesNotInWhitelist(bySlug.eu_accessories, lettersLower);

    /** Один «универсальный» размер: без дублей OS / One size / «Универсальный размер». */
    const uni = [
        'Универсальный',
        'OSFM',
        'Без размера',
        'XXS/XS',
        'XS/S',
        'S/M',
        'M/L',
        'L/XL',
        'XL/XXL'
    ];
    await insertValues(bySlug.universal, uni);
    const uniLower = uni.map(function(v) {
        return String(v).trim().toLowerCase();
    });
    await deleteOrphanSizesNotInWhitelist(bySlug.universal, uniLower);
}

async function createSize(data) {
    const value = String(data.value || '').trim();
    if (!value) throw new Error('Укажите обозначение размера (например 2XL или 42 для обуви)');
    let typeId = Number(data.size_type_id);
    if (!Number.isFinite(typeId) || typeId <= 0) {
        const t = await pool.query('SELECT id FROM size_types ORDER BY id LIMIT 1');
        if (!t.rows.length) throw new Error('В базе нет типов размеров');
        typeId = Number(t.rows[0].id);
    }
    const ex = await pool.query(
        'SELECT id, value FROM sizes WHERE size_type_id = $1 AND lower(btrim(value)) = lower(btrim($2))',
        [typeId, value]
    );
    if (ex.rows.length) return ex.rows[0];
    try {
        const ins = await pool.query(
            'INSERT INTO sizes (size_type_id, value) VALUES ($1, $2) RETURNING id, value',
            [typeId, value]
        );
        return ins.rows[0];
    } catch (e) {
        if (String(e.code) === '23505') {
            const again = await pool.query(
                'SELECT id, value FROM sizes WHERE size_type_id = $1 AND lower(btrim(value)) = lower(btrim($2))',
                [typeId, value]
            );
            if (again.rows.length) return again.rows[0];
        }
        throw e;
    }
}

async function getColors() {
    const result = await pool.query('SELECT id, name, hex_code FROM colors ORDER BY name');
    return result.rows;
}

async function migrateTagsToCollectionsIfNeeded() {
    const r = await pool.query(`
        SELECT
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tags') AS has_tags,
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'collections') AS has_coll
    `);
    const row = r.rows[0];
    if (row.has_tags && !row.has_coll) {
        await pool.query('ALTER TABLE tags RENAME TO collections');
        await pool.query('ALTER TABLE product_tags RENAME TO product_collections');
        await pool.query('ALTER TABLE product_collections RENAME COLUMN tag_id TO collection_id');
        try {
            await pool.query('ALTER INDEX tags_slug_uq RENAME TO collections_slug_uq');
        } catch (e) {
            try {
                await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)');
            } catch (e2) {
                console.warn('[schema] collections_slug_uq:', e2 && e2.message);
            }
        }
    } else if (!row.has_coll) {
        await pool.query(`
            CREATE TABLE collections (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                icon TEXT,
                section TEXT NOT NULL DEFAULT 'all',
                sort_order INT NOT NULL DEFAULT 0
            )
        `);
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)');
        await pool.query(`
            CREATE TABLE product_collections (
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                PRIMARY KEY (product_id, collection_id)
            )
        `);
    }
}

/**
 * Заполняет collections.icon в БД (пустые значения).
 */
async function backfillCollectionIcons() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            UPDATE collections AS t SET icon = m.icon
            FROM (
                VALUES
                    ('popular', '🔥'),
                    ('populyarnoe', '🔥'),
                    ('new', '✨'),
                    ('novinki', '✨'),
                    ('novinka', '✨'),
                    ('sale', '🏷'),
                    ('skidka', '💸'),
                    ('aktsiya', '💸'),
                    ('akciya', '💸'),
                    ('akcia', '💸'),
                    ('action', '💸'),
                    ('discount', '💸'),
                    ('promo', '💸'),
                    ('recommend', '⭐'),
                    ('recommended', '⭐'),
                    ('rekomenduem', '⭐'),
                    ('hit', '🏆'),
                    ('bestseller', '🏆'),
                    ('hit-prodazh', '🏆'),
                    ('hit_prodazh', '🏆'),
                    ('khit-prodazh', '🏆'),
                    ('khit_prodazh', '🏆')
            ) AS m(slug, icon)
            WHERE lower(btrim(t.slug)) = m.slug
              AND (t.icon IS NULL OR btrim(coalesce(t.icon::text, '')) = '')
        `);

        await client.query(`
            UPDATE collections SET icon = v.icon
            FROM (VALUES
                ('акция', '💸'),
                ('новинки', '✨'),
                ('новинка', '✨'),
                ('популярное', '🔥'),
                ('рекомендуем', '⭐'),
                ('рекомендовано', '⭐'),
                ('хит продаж', '🏆'),
                ('хит', '🏆'),
                ('выгодно', '🏷'),
                ('скидка', '💸'),
                ('распродажа', '💸')
            ) AS v(tag_name, icon)
            WHERE lower(btrim(collections.name)) = v.tag_name
              AND (collections.icon IS NULL OR btrim(coalesce(collections.icon::text, '')) = '')
        `);

        await client.query(`
            UPDATE collections SET icon = '🏷'
            WHERE icon IS NULL OR btrim(coalesce(icon::text, '')) = ''
        `);

        await client.query('COMMIT');
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        console.warn('[schema] backfillCollectionIcons:', e && e.message);
    } finally {
        client.release();
    }
}

async function ensureProductsEditorColumn() {
    await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
}

async function ensureCollectionsSchema() {
    await migrateTagsToCollectionsIfNeeded();
    await pool.query('ALTER TABLE collections ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT \'all\'');
    await pool.query('ALTER TABLE collections ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE collections ADD COLUMN IF NOT EXISTS icon TEXT');
    try {
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections (slug)');
    } catch (e) {
        console.warn('[schema] collections_slug_uq:', e && e.message);
    }
    await pool.query(`
        INSERT INTO collections (name, slug, icon, section, sort_order)
        SELECT v.name, v.slug, v.icon, v.section, v.sort_order
        FROM (
            VALUES
                ('Популярное'::text, 'popular'::text, '🔥'::text, 'all'::text, 0::int),
                ('Новинки'::text, 'new'::text, '✨'::text, 'all'::text, 1::int),
                ('Выгодно'::text, 'sale'::text, '🏷'::text, 'all'::text, 2::int),
                ('Акция'::text, 'aktsiya'::text, '💸'::text, 'all'::text, 3::int),
                ('Рекомендуем'::text, 'rekomenduem'::text, '⭐'::text, 'all'::text, 4::int),
                ('Хит продаж'::text, 'hit-prodazh'::text, '🏆'::text, 'all'::text, 5::int)
        ) AS v(name, slug, icon, section, sort_order)
        WHERE NOT EXISTS (
            SELECT 1 FROM collections c
            WHERE c.slug = v.slug OR lower(btrim(c.name::text)) = lower(btrim(v.name::text))
        )
    `);
    try {
        await mergeDuplicateCollectionsByName();
    } catch (e) {
        console.warn('[schema] mergeDuplicateCollectionsByName:', e && e.message);
    }
    await ensureCollectionUniqueIndexes();
    await backfillCollectionIcons();
}

async function getCollections() {
    const result = await pool.query(
        'SELECT id, name, slug, icon, section, sort_order FROM collections ORDER BY sort_order ASC, name ASC'
    );
    return result.rows;
}

async function getCollectionsAdmin() {
    const result = await pool.query(
        `SELECT c.id, c.name, c.slug, c.icon, c.section, c.sort_order,
            (SELECT COUNT(*)::int FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
         FROM collections c
         ORDER BY c.sort_order ASC, c.name ASC`
    );
    return result.rows;
}

/** Схлопывает подборки с одинаковым именем без учёта регистра (оставляет минимальный id). */
async function mergeDuplicateCollectionsByName() {
    const groups = await pool.query(`
        SELECT lower(btrim(name)) AS nk, min(id) AS keep_id
        FROM collections
        GROUP BY lower(btrim(name))
        HAVING count(*) > 1
    `);
    for (const g of groups.rows) {
        const keepId = Number(g.keep_id);
        const losers = await pool.query(
            'SELECT id FROM collections WHERE lower(btrim(name)) = $1 AND id <> $2 ORDER BY id',
            [g.nk, keepId]
        );
        for (const row of losers.rows) {
            const loserId = Number(row.id);
            await pool.query(
                `INSERT INTO product_collections (product_id, collection_id)
                 SELECT pc.product_id, $1::int FROM product_collections pc WHERE pc.collection_id = $2::int
                 ON CONFLICT (product_id, collection_id) DO NOTHING`,
                [keepId, loserId]
            );
            await pool.query('DELETE FROM product_collections WHERE collection_id = $1', [loserId]);
            await pool.query('DELETE FROM collections WHERE id = $1', [loserId]);
        }
    }
}

async function ensureCollectionUniqueIndexes() {
    try {
        await pool.query(
            'CREATE UNIQUE INDEX IF NOT EXISTS collections_name_lower_uq ON collections (lower(btrim(name)))'
        );
    } catch (e) {
        console.warn('[schema] collections_name_lower_uq:', e && e.message);
    }
}

async function createCollection(data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Укажите название подборки');
    let slug = String(data.slug || '').trim();
    if (!slug) slug = slugify(name);
    if (!slug) throw new Error('Укажите slug или более говорящее название для автоматического slug');
    const icon = data.icon != null && String(data.icon).trim() !== '' ? String(data.icon).trim() : null;
    const sec = String(data.section || 'all').toLowerCase();
    const section = sec === 'mens' || sec === 'womens' || sec === 'all' ? sec : 'all';
    const sort_order = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;
    try {
        const r = await pool.query(
            `INSERT INTO collections (name, slug, icon, section, sort_order)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, slug, icon, section, sort_order`,
            [name, slug, icon, section, sort_order]
        );
        return r.rows[0];
    } catch (e) {
        if (String(e.code) === '23505') throw new Error('Подборка с таким названием или slug уже существует');
        throw e;
    }
}

async function updateCollection(id, data) {
    const existing = await pool.query('SELECT id FROM collections WHERE id = $1', [id]);
    if (!existing.rows.length) return null;
    const name = data.name !== undefined ? String(data.name || '').trim() : null;
    if (name !== null && !name) throw new Error('Название не может быть пустым');
    let slug = data.slug !== undefined ? String(data.slug || '').trim() : null;
    if (slug !== null && !slug) {
        const nm = name !== null ? name : (await pool.query('SELECT name FROM collections WHERE id = $1', [id])).rows[0]?.name;
        slug = slugify(String(nm || '').trim()) || null;
    }
    if (slug !== null && !slug) throw new Error('Slug не может быть пустым');
    const icon = data.icon !== undefined
        ? (data.icon != null && String(data.icon).trim() !== '' ? String(data.icon).trim() : null)
        : undefined;
    const sectionRaw = data.section !== undefined ? String(data.section || 'all').toLowerCase() : null;
    const section = sectionRaw === null ? null
        : (sectionRaw === 'mens' || sectionRaw === 'womens' || sectionRaw === 'all' ? sectionRaw : 'all');
    const sort_order = data.sort_order !== undefined && Number.isFinite(Number(data.sort_order))
        ? Number(data.sort_order)
        : null;

    const fields = [];
    const vals = [];
    let idx = 1;
    if (name !== null) {
        fields.push('name = $' + idx++);
        vals.push(name);
    }
    if (slug !== null) {
        fields.push('slug = $' + idx++);
        vals.push(slug);
    }
    if (icon !== undefined) {
        fields.push('icon = $' + idx++);
        vals.push(icon);
    }
    if (section !== null) {
        fields.push('section = $' + idx++);
        vals.push(section);
    }
    if (sort_order !== null) {
        fields.push('sort_order = $' + idx++);
        vals.push(sort_order);
    }
    if (!fields.length) {
        const r = await pool.query(
            'SELECT id, name, slug, icon, section, sort_order FROM collections WHERE id = $1',
            [id]
        );
        return r.rows[0] || null;
    }
    vals.push(id);
    try {
        const r = await pool.query(
            `UPDATE collections SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, slug, icon, section, sort_order`,
            vals
        );
        return r.rows[0] || null;
    } catch (e) {
        if (String(e.code) === '23505') throw new Error('Подборка с таким названием или slug уже существует');
        throw e;
    }
}

async function deleteCollection(id) {
    const r = await pool.query('DELETE FROM collections WHERE id = $1 RETURNING id', [id]);
    return r.rowCount > 0;
}

/** Подборки для страницы раздела: по одной строке на запись в БД (без слияния похожих slug). */
async function getSectionCollectionsWithProducts(pageGender) {
    const g = String(pageGender || 'mens').toLowerCase();
    let sectionSql;
    if (g === 'all') sectionSql = "(c.section = 'all' OR c.section IN ('mens','womens'))";
    else if (g === 'mens' || g === 'male') sectionSql = "(c.section = 'all' OR c.section = 'mens')";
    else if (g === 'womens' || g === 'female') sectionSql = "(c.section = 'all' OR c.section = 'womens')";
    else sectionSql = "(c.section = 'all')";

    let genderSql;
    if (g === 'all') genderSql = "(p.gender IN ('mens','male','womens','female','unisex'))";
    else if (g === 'mens' || g === 'male') genderSql = "(p.gender IN ('mens','male','unisex'))";
    else if (g === 'womens' || g === 'female') genderSql = "(p.gender IN ('womens','female','unisex'))";
    else genderSql = 'TRUE';

    const colRes = await pool.query(
        `SELECT c.id, c.name, c.slug, c.icon, c.sort_order
         FROM collections c
         WHERE ${sectionSql}
         ORDER BY c.sort_order ASC, c.name ASC`
    );

    const out = [];
    for (const c of colRes.rows) {
        const pr = await pool.query(
            `SELECT p.id FROM products p
             INNER JOIN product_collections pc ON pc.product_id = p.id AND pc.collection_id = $1
             WHERE p.is_active = TRUE AND ${genderSql}
             ORDER BY p.name ASC
             LIMIT 60`,
            [c.id]
        );
        const product_ids = pr.rows.map(r => r.id);
        if (!product_ids.length) continue;
        out.push({
            id: c.id,
            name: c.name,
            slug: c.slug,
            icon: c.icon,
            sort_order: c.sort_order,
            product_ids
        });
    }
    return out;
}

async function getProducts(genderParam, options = {}) {
    const {
        category,
        q,
        brand,
        season,
        color,
        size,
        size_id,
        color_id,
        collection_id,
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
            /* Один набор плейсхолдеров — PostgreSQL допускает повтор $n в одном запросе */
            conditions.push(`(
                p.category_id IN (
                    SELECT id FROM categories WHERE slug IN (${placeholders})
                )
                OR p.category_id IN (
                    SELECT c.id FROM categories c
                    JOIN categories parent ON c.parent_id = parent.id
                    WHERE parent.slug IN (${placeholders})
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

    if (color) {
        values.push(color);
        conditions.push(`EXISTS(
            SELECT 1 FROM product_variants pv
            JOIN colors col ON pv.color_id = col.id
            WHERE pv.product_id = p.id AND pv.is_active = TRUE AND col.name = $${idx++}
        )`);
    }

    if (size) {
        const sizeText = String(size).trim();
        if (sizeText) {
            values.push(sizeText);
            conditions.push(`EXISTS(
                SELECT 1 FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = TRUE
                  AND pv.size_id IN (
                    SELECT DISTINCT x.eid
                    FROM (
                      SELECT m2.size_id AS eid
                      FROM sizes s_filter
                      INNER JOIN size_group_members m1 ON m1.size_id = s_filter.id
                      INNER JOIN size_group_members m2 ON m2.group_id = m1.group_id
                      WHERE lower(btrim(s_filter.value::text)) = lower(btrim($${idx}::text))
                      UNION
                      SELECT s_filter.id AS eid
                      FROM sizes s_filter
                      WHERE lower(btrim(s_filter.value::text)) = lower(btrim($${idx}::text))
                        AND NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = s_filter.id)
                    ) x
                  )
            )`);
            idx++;
        }
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
                WHERE pv.product_id = p.id AND pv.is_active = TRUE
                  AND pv.size_id IN (
                    SELECT DISTINCT x.eid
                    FROM (
                      SELECT m2.size_id AS eid
                      FROM unnest($${idx}::int[]) AS u(id)
                      INNER JOIN size_group_members m1 ON m1.size_id = u.id
                      INNER JOIN size_group_members m2 ON m2.group_id = m1.group_id
                      UNION
                      SELECT u.id AS eid
                      FROM unnest($${idx}::int[]) AS u(id)
                      WHERE NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = u.id)
                    ) x
                  )
            )`);
            idx++;
        }
    }

    if (collection_id) {
        const ids = Array.isArray(collection_id) ? collection_id : String(collection_id).split(',').map((s) => s.trim()).filter(Boolean);
        const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
        if (nums.length) {
            values.push(nums);
            conditions.push(`EXISTS(
                SELECT 1 FROM product_collections pcx
                WHERE pcx.product_id = p.id AND pcx.collection_id = ANY($${idx++})
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
                SELECT json_agg(json_build_object(
                    'id', pv.id, 'art', pv.art,
                    'size_id', pv.size_id, 'size_value', s.value, 'size_type', st.name,
                    'size_equivalent_hint', ${otherScalesHintSubquery},
                    'color_id', pv.color_id, 'color_name', col.name, 'color_hex', col.hex_code,
                    'is_active', pv.is_active
                ) ORDER BY s.value, col.name)
                FROM product_variants pv
                LEFT JOIN sizes s ON pv.size_id = s.id
                LEFT JOIN size_types st ON s.size_type_id = st.id
                LEFT JOIN colors col ON pv.color_id = col.id
                WHERE pv.product_id = p.id AND pv.is_active = TRUE
            ) AS variants,
            (
                SELECT COALESCE(
                    json_agg(json_build_object('id', col.id, 'name', col.name, 'slug', col.slug) ORDER BY col.name)
                    FILTER (WHERE col.id IS NOT NULL),
                    '[]'::json
                )
                FROM product_collections pc2
                JOIN collections col ON pc2.collection_id = col.id
                WHERE pc2.product_id = p.id
            ) AS collections
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE ${conditions.length ? conditions.join(' AND ') : 'TRUE'}
        ORDER BY ${sortField} ${direction}
        LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const result = await pool.query(query, values);
    return result.rows.map(mapProductRowMedia);
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
            p.updated_by_user_id,
            uu.username AS updated_by_username,
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
                SELECT json_agg(json_build_object('id', col.id, 'name', col.name, 'slug', col.slug, 'icon', col.icon) ORDER BY col.name)
                FROM product_collections pc JOIN collections col ON pc.collection_id = col.id
                WHERE pc.product_id = p.id
            ) AS collections,
            (
                SELECT json_agg(json_build_object(
                    'id', pv.id, 'art', pv.art,
                    'size_id', pv.size_id, 'size_value', s.value, 'size_type', st.name,
                    'size_equivalent_hint', ${otherScalesHintSubquery},
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
        LEFT JOIN users uu ON p.updated_by_user_id = uu.id
        WHERE ${whereClause}
        LIMIT 1
    `;

    const result = await pool.query(query, values);
    const row = result.rows[0] || null;
    return row ? mapProductRowMedia(row) : null;
}

async function createProduct(data, ctx = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const slug = (data.slug && data.slug.trim()) || slugify(data.name);
        const art = data.art && data.art.trim() ? data.art.trim().toUpperCase() : null;
        const editorId = ctx.editorUserId != null && Number.isFinite(Number(ctx.editorUserId)) ? Number(ctx.editorUserId) : null;

        if (art) {
            const existing = await client.query('SELECT id FROM products WHERE art = $1', [art]);
            if (existing.rows.length > 0) {
                throw new Error('Артикул уже существует');
            }
        }

        const res = await client.query(`
            INSERT INTO products (art, name, slug, description, category_id, brand_id, materials, season, gender, is_active, updated_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
            editorId
        ]);

        const productId = res.rows[0].id;

        if (Array.isArray(data.images) && data.images.length) {
            await replaceProductImages(client, productId, data.images);
        }
        if (Array.isArray(data.collections)) {
            await replaceProductCollections(client, productId, data.collections);
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

async function updateProduct(id, data, ctx = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const slug = (data.slug && data.slug.trim()) || slugify(data.name);
        const art = data.art && data.art.trim() ? data.art.trim().toUpperCase() : null;
        const editorId = ctx.editorUserId != null && Number.isFinite(Number(ctx.editorUserId)) ? Number(ctx.editorUserId) : null;

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
                season = $8, gender = $9, is_active = $10,
                updated_at = NOW(), updated_by_user_id = $11
            WHERE id = $12
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
            editorId,
            id
        ]);

        if (!res.rows.length) {
            await client.query('ROLLBACK');
            return null;
        }

        if (Array.isArray(data.images)) {
            await replaceProductImages(client, id, data.images);
        }
        if (Array.isArray(data.collections)) {
            await replaceProductCollections(client, id, data.collections);
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

async function replaceProductCollections(client, productId, collections) {
    await client.query('DELETE FROM product_collections WHERE product_id = $1', [productId]);
    if (!Array.isArray(collections) || !collections.length) return;

    for (const col of collections) {
        const collectionId = Number(col && col.id);
        if (!Number.isFinite(collectionId) || collectionId <= 0) continue;
        await client.query(
            'INSERT INTO product_collections (product_id, collection_id) VALUES ($1,$2)',
            [productId, collectionId]
        );
    }
}

/** Порядок вариантов при сохранении: размер слева направо от меньшего к большему (как на витрине). */
function variantSizeSortKeyFromDbValue(val) {
    if (val == null || String(val).trim() === '') return [9, 0, ''];
    const v = String(val)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    const rank = { '2xs': 1, xxs: 1, xs: 2, s: 3, m: 4, l: 5, xl: 6, xxl: 7, '2xl': 7, '3xl': 8 };
    if (rank[v] != null) return [0, rank[v], String(val)];
    const num = parseFloat(String(val).replace(',', '.'));
    if (Number.isFinite(num)) return [1, num, String(val)];
    return [2, 0, String(val)];
}

function compareProductVariantsForSaveOrder(a, b, idToValue) {
    const va = a.size_id != null && Number.isFinite(Number(a.size_id)) ? idToValue.get(Number(a.size_id)) : '';
    const vb = b.size_id != null && Number.isFinite(Number(b.size_id)) ? idToValue.get(Number(b.size_id)) : '';
    const ka = variantSizeSortKeyFromDbValue(va);
    const kb = variantSizeSortKeyFromDbValue(vb);
    for (let i = 0; i < 3; i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    const ca = a.color_id != null && Number.isFinite(Number(a.color_id)) ? Number(a.color_id) : 0;
    const cb = b.color_id != null && Number.isFinite(Number(b.color_id)) ? Number(b.color_id) : 0;
    if (ca !== cb) return ca - cb;
    return String(a.art || '').localeCompare(String(b.art || ''), 'ru');
}

async function replaceProductVariants(client, productId, variants) {
    await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);
    if (!Array.isArray(variants) || !variants.length) return;

    const prepared = [];
    for (const v of variants) {
        const art = v.art && String(v.art).trim() ? String(v.art).trim().toUpperCase() : null;
        if (!art) continue;
        prepared.push(v);
    }
    if (!prepared.length) return;

    const sizeIds = Array.from(
        new Set(
            prepared
                .map(function(v) {
                    return v.size_id != null && Number.isFinite(Number(v.size_id)) ? Number(v.size_id) : null;
                })
                .filter(function(id) {
                    return id != null && id > 0;
                })
        )
    );
    const idToValue = new Map();
    if (sizeIds.length) {
        const res = await client.query('SELECT id, value FROM sizes WHERE id = ANY($1::int[])', [sizeIds]);
        res.rows.forEach(function(row) {
            idToValue.set(Number(row.id), row.value);
        });
    }

    prepared.sort(function(a, b) {
        return compareProductVariantsForSaveOrder(a, b, idToValue);
    });

    for (const v of prepared) {
        const art = v.art && String(v.art).trim() ? String(v.art).trim().toUpperCase() : null;
        if (!art) continue;
        const rawSid = v.size_id != null && Number.isFinite(Number(v.size_id)) ? Number(v.size_id) : null;
        const storeSid = rawSid != null ? await storedSizeIdForVariant(rawSid, client) : null;
        await client.query(
            `INSERT INTO product_variants (product_id, size_id, color_id, art, is_active)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (art) DO UPDATE SET size_id=$2, color_id=$3, is_active=$5`,
            [productId, storeSid, v.color_id || null, art, v.is_active !== false]
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

async function findUserByUsername(username, db = pool) {
    const login = String(username || '').trim();
    if (!login) return null;
    const result = await db.query(
        'SELECT id, username, password_hash, role, is_active FROM users WHERE lower(username) = lower($1) LIMIT 1',
        [login]
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

async function findUserByEmail(email, db = pool) {
    const e = String(email || '').trim();
    if (!e) return null;
    const result = await db.query(
        `SELECT id, username, password_hash, role, is_active, email, email_verified, oauth_provider, oauth_id, password_set
         FROM users
         WHERE email IS NOT NULL AND trim(email::text) <> ''
           AND lower(trim(email::text)) = lower($1)
         LIMIT 1`,
        [e]
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
    const login = String(username || '').trim();
    if (!login) return null;
    const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active FROM users WHERE lower(username) = lower($1) LIMIT 1',
        [login]
    );
    const user = result.rows[0] || null;
    if (!user || !user.is_active) return null;
    const ok = await bcrypt.compare(String(password || ''), user.password_hash);
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
    const db = options._txClient || pool;
    assertValidUsername(username);
    const uname = String(username || '').trim();
    const taken = await findUserByUsername(uname, db);
    if (taken) throw new Error('Логин уже занят');
    const email = options.email ? String(options.email).trim().toLowerCase() : null;
    const email_verified = typeof options.email_verified === 'boolean' ? options.email_verified : null;
    const oauth_provider = options.oauth_provider ? String(options.oauth_provider) : null;
    const oauth_id = options.oauth_id ? String(options.oauth_id) : null;
    const password_set = typeof options.password_set === 'boolean' ? options.password_set : true;
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
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

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const byOauthRes = await client.query(
            'SELECT id, username, password_hash, role, is_active, email, oauth_provider, oauth_id FROM users WHERE oauth_provider = $1 AND oauth_id = $2 LIMIT 1',
            [provider, oauthId]
        );
        const byOauth = byOauthRes.rows[0] || null;

        // If an OAuth-linked account exists but is deactivated, do NOT allow "re-creating" it via OAuth login.
        if (byOauth && !byOauth.is_active) {
            await client.query('ROLLBACK');
            return null;
        }
        if (byOauth && byOauth.is_active) {
            if (email) {
                const r = await client.query(
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
                    await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [byOauth.id]);
                    console.warn('[oauth] skip email update: already used by another user', { userId: byOauth.id });
                }
            } else {
                await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [byOauth.id]);
            }
            await client.query('COMMIT');
            return { id: byOauth.id, username: byOauth.username, role: byOauth.role };
        }

        if (email) {
            const byEmail = await findUserByEmail(email, client);
            if (byEmail && !byEmail.is_active) {
                await client.query('ROLLBACK');
                return null;
            }
            if (byEmail && byEmail.is_active) {
                await client.query(
                    'UPDATE users SET oauth_provider = $1, oauth_id = $2, last_login = NOW(), email = $4::text, email_verified = TRUE WHERE id = $3',
                    [provider, oauthId, byEmail.id, email]
                );
                await client.query('COMMIT');
                return { id: byEmail.id, username: byEmail.username, role: byEmail.role };
            }
        }

        if (!email) {
            await client.query('ROLLBACK');
            return null;
        }

        const uname = provider + '_' + oauthId;
        const password = oauthId + ':' + Date.now();
        const created = await createUser(uname, password, 'user', {
            email: email,
            email_verified: email ? true : null,
            oauth_provider: provider,
            oauth_id: oauthId,
            password_set: false,
            _txClient: client
        });
        await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [created.id]);
        await client.query('COMMIT');
        return { id: created.id, username: created.username, role: created.role };
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
    } finally {
        client.release();
    }
}

async function ensureDefaultUsers() {
    if (isProduction) {
        return;
    }
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

function firstScalarQueryValue(val) {
    if (val == null) return undefined;
    if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
            const x = val[i];
            if (x != null && String(x).trim() !== '') return x;
        }
        return val.length ? val[0] : undefined;
    }
    return val;
}

function normalizeUserListRoleInput(role) {
    if (role == null) return [];
    const raw = Array.isArray(role) ? role.flat(Infinity) : String(role).split(',');
    return raw.map((r) => String(r).trim()).filter(Boolean);
}

function normalizeUserListActiveInput(active) {
    const v = firstScalarQueryValue(active);
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'active' : 'inactive';
    const s = String(v).trim().toLowerCase();
    if (s === '' || s === 'all' || s === 'any') return '';
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on' || s === 'active') return 'active';
    if (s === 'false' || s === '0' || s === 'no' || s === 'off' || s === 'inactive') return 'inactive';
    return '';
}

async function listUsers(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const qScalar = firstScalarQueryValue(opts.q);
    const qRaw = qScalar != null ? String(qScalar).trim() : '';
    const needle = qRaw.toLowerCase();

    const values = [];
    const where = [];

    if (needle) {
        values.push(needle);
        if (/^\d+$/.test(qRaw)) {
            values.push(Number(qRaw));
            where.push(
                '(strpos(lower(username::text), $1) > 0 OR strpos(lower(coalesce(email::text, \'\')), $1) > 0 OR strpos(lower(coalesce(role::text, \'\')), $1) > 0 OR id = $2)'
            );
        } else {
            where.push(
                '(strpos(lower(username::text), $1) > 0 OR strpos(lower(coalesce(email::text, \'\')), $1) > 0 OR strpos(lower(coalesce(role::text, \'\')), $1) > 0)'
            );
        }
    }

    let roleList = normalizeUserListRoleInput(opts.role);
    const allowedRoles = new Set(['user', 'admin', 'superadmin']);
    roleList = roleList.filter((r) => allowedRoles.has(r));
    if (roleList.length) {
        values.push(roleList);
        where.push('role = ANY($' + values.length + '::text[])');
    }

    const act = normalizeUserListActiveInput(opts.active);
    if (act === 'active') where.push('is_active IS TRUE');
    else if (act === 'inactive') where.push('is_active IS NOT TRUE');

    const sortByScalar = firstScalarQueryValue(opts.sort_by);
    let sortByRaw = String(sortByScalar != null && sortByScalar !== '' ? sortByScalar : opts.sort_by != null ? opts.sort_by : 'id')
        .trim()
        .toLowerCase();
    if (sortByRaw === 'created') sortByRaw = 'created_at';
    const sortDirScalar = firstScalarQueryValue(opts.sort_direction);
    const sortDirRaw =
        String(sortDirScalar != null && sortDirScalar !== '' ? sortDirScalar : opts.sort_direction != null ? opts.sort_direction : 'asc')
            .trim()
            .toLowerCase() === 'desc'
            ? 'DESC'
            : 'ASC';
    const sortMap = {
        id: 'id',
        username: 'username',
        role: 'role',
        created_at: 'created_at',
        created: 'created_at',
        last_login: 'last_login'
    };
    const sortCol = sortMap[sortByRaw] || 'id';
    const nullsLast = sortCol === 'last_login' || sortCol === 'created_at' ? ' NULLS LAST' : '';

    const whereSql = where.length ? where.join(' AND ') : 'TRUE';
    const result = await pool.query(
        `SELECT id, username, email, role, is_active, created_at, last_login
         FROM users
         WHERE ${whereSql}
         ORDER BY ${sortCol} ${sortDirRaw}${nullsLast}`,
        values
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
    publicMediaUrl,
    connectDB,
    ensureUserAuthSchema,
    ensureProductsEditorColumn,
    ensureCollectionsSchema,
    ensureCategorySizeTypesSchema,
    ensureSizeGroupsSchema,
    getCategories,
    getBrands,
    createBrand,
    getSizes,
    getSizeTypes,
    listSizeGroups,
    createSizeGroup,
    deleteSizeGroup,
    listSizeEquivalenceBuckets,
    expandSizeIdsForEquivalence,
    getCategorySizeTypeLinks,
    createSize,
    ensureSizesUniqueValueIndex,
    ensureReferenceSizesSeed,
    getColors,
    getCollections,
    getCollectionsAdmin,
    getSectionCollectionsWithProducts,
    createCollection,
    updateCollection,
    deleteCollection,
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
