const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const {
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
    verifyUser,
    createUser,
    ensureDefaultUsers,
    listUsers,
    setUserActive,
    changeUserPassword
} = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'kpvs-secret-change-in-production';

app.use(cors({ origin: false }));
app.use(express.json());

app.use(session({
    store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 8 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

app.get('/', (req, res) => res.redirect('/welcome.html'));

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const user = await verifyUser(String(username).trim(), String(password));
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
        req.session.user = user;
        res.json({ id: user.id, username: user.username, role: user.role });
    } catch (err) {
        console.error('POST /api/auth/login:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Session destroy error:', err);
        res.clearCookie('connect.sid');
        res.json({ ok: true });
    });
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json(req.session.user);
    }
    res.status(401).json({ error: 'Not authenticated' });
});

app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        res.json(await listUsers());
    } catch (err) {
        console.error('GET /api/admin/users:', err);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

app.post('/api/admin/users', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        const { username, password, role } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const user = await createUser(String(username).trim(), String(password), role || 'admin');
        res.status(201).json(user);
    } catch (err) {
        console.error('POST /api/admin/users:', err);
        res.status(400).json({ error: err.message || 'Failed to create user' });
    }
});

app.patch('/api/admin/users/:id/active', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        const user = await setUserActive(Number(req.params.id), Boolean(req.body.is_active));
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error('PATCH /api/admin/users/:id/active:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.patch('/api/admin/users/:id/password', requireAuth, async (req, res) => {
    try {
        const isSelf = req.session.user.id === Number(req.params.id);
        const isSuperadmin = req.session.user.role === 'superadmin';
        if (!isSelf && !isSuperadmin) return res.status(403).json({ error: 'Forbidden' });
        const { password } = req.body || {};
        if (!password || String(password).length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        await changeUserPassword(Number(req.params.id), String(password));
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/admin/users/:id/password:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

app.get('/api/categories', async (req, res) => {
    try { res.json(await getCategories()); }
    catch (err) { console.error('GET /api/categories:', err); res.status(500).json({ error: 'Failed to load categories' }); }
});

app.get('/api/brands', async (req, res) => {
    try { res.json(await getBrands()); }
    catch (err) { console.error('GET /api/brands:', err); res.status(500).json({ error: 'Failed to load brands' }); }
});

app.get('/api/sizes', async (req, res) => {
    try { res.json(await getSizes()); }
    catch (err) { console.error('GET /api/sizes:', err); res.status(500).json({ error: 'Failed to load sizes' }); }
});

app.get('/api/colors', async (req, res) => {
    try { res.json(await getColors()); }
    catch (err) { console.error('GET /api/colors:', err); res.status(500).json({ error: 'Failed to load colors' }); }
});

app.get('/api/tags', async (req, res) => {
    try { res.json(await getTags()); }
    catch (err) { console.error('GET /api/tags:', err); res.status(500).json({ error: 'Failed to load tags' }); }
});

app.get('/api/products/:gender', async (req, res) => {
    try {
        const { category, tag, q, brand, season, color, size, limit = 20, offset = 0 } = req.query;
        res.json(await getProducts(req.params.gender, {
            category, tag, q, brand, season, color, size,
            limit: Number(limit) || 20,
            offset: Number(offset) || 0
        }));
    } catch (err) {
        console.error('GET /api/products/:gender:', err);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

app.get('/api/product/:identifier', async (req, res) => {
    try {
        const product = await getProduct(req.params.identifier);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        console.error('GET /api/product/:identifier:', err);
        res.status(500).json({ error: 'Failed to load product' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const { q, gender, category, limit = 20, offset = 0 } = req.query;
        if (!q) return res.status(400).json({ error: 'Search query is required' });
        res.json(await searchProducts(q, gender, category, Number(limit) || 20, Number(offset) || 0));
    } catch (err) {
        console.error('GET /api/search:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

const uploadsDir = path.join(__dirname, 'img', 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname || '').toLowerCase() || '.bin').replace(/[^a-z0-9.]/g, '') || '.bin';
        cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('Only image files are allowed'));
    }
});

app.post('/api/admin/uploads', requireAuth, upload.array('images', 12), (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        res.status(201).json({ files: files.map(f => `/img/uploads/${f.filename}`) });
    } catch (err) {
        console.error('POST /api/admin/uploads:', err);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

app.get('/api/admin/products', requireAuth, async (req, res) => {
    try {
        const { q, gender, category, brand, season, sort_by, sort_direction, limit = 100, offset = 0 } = req.query;
        res.json(await getProducts(null, {
            q, gender, category, brand, season, sort_by, sort_direction,
            include_inactive: true,
            limit: Number(limit) || 100,
            offset: Number(offset) || 0
        }));
    } catch (err) {
        console.error('GET /api/admin/products:', err);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

async function postAdminCatalogVisibility(req, res) {
    try {
        const rawId = req.body?.product_id ?? req.body?.id;
        const id = Number(rawId);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: 'Укажите product_id (число)' });
        }
        let active = req.body?.is_active;
        if (typeof active === 'string') {
            const s = active.trim().toLowerCase();
            if (s === 'true' || s === '1') active = true;
            else if (s === 'false' || s === '0') active = false;
        }
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: 'Укажите is_active (true или false)' });
        }
        const row = await updateProductActiveFlag(id, active);
        if (!row) return res.status(404).json({ error: 'Товар не найден в базе' });
        res.json({ id: row.id, is_active: row.is_active });
    } catch (err) {
        console.error('POST admin catalog visibility:', err);
        res.status(500).json({ error: 'Не удалось обновить видимость товара' });
    }
}

app.post('/api/admin/catalog-visibility', requireAuth, postAdminCatalogVisibility);
app.post('/api/admin/productvisibility', requireAuth, postAdminCatalogVisibility);

const ALLOWED_PRODUCT_GENDERS = ['mens', 'womens', 'unisex'];

/** Приводит пол к канону в самом payload (mutates), чтобы в БД были mens/womens/unisex. */
function normalizeProductGenderInPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    const raw = payload.gender;
    if (raw == null || raw === '') {
        payload.gender = null;
        return;
    }
    const s = String(raw).trim().toLowerCase();
    if (!s) {
        payload.gender = null;
        return;
    }
    const legacy = { male: 'mens', female: 'womens' };
    payload.gender = legacy[s] || s;
}

function validateProductPayload(payload) {
    if (!payload || typeof payload !== 'object') return ['Некорректное тело запроса'];
    normalizeProductGenderInPayload(payload);
    const errors = [];
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const art = typeof payload.art === 'string' ? payload.art.trim().toUpperCase() : '';
    if (!name) errors.push('Поле name обязательно');
    if (!art) errors.push('Поле art обязательно');
    else if (!/^[A-Z0-9-]+$/.test(art)) {
        errors.push('Поле art должно содержать только заглавные буквы, цифры и дефис');
    }
    if (payload.gender && !ALLOWED_PRODUCT_GENDERS.includes(payload.gender)) {
        errors.push('Поле gender: mens, womens или unisex');
    }
    if (payload.season && !['зима', 'лето', 'демисезон', 'всесезонный'].includes(payload.season)) {
        errors.push('Поле season: зима, лето, демисезон или всесезонный');
    }
    if (payload.slug !== undefined && payload.slug && typeof payload.slug === 'string') {
        const slug = payload.slug.trim();
        if (!/^[a-z0-9-]+$/.test(slug)) {
            errors.push('Slug может содержать только строчные латинские буквы, цифры и дефисы');
        }
    }
    if (payload.images !== undefined) {
        if (!Array.isArray(payload.images)) errors.push('Поле images должно быть массивом');
        else if (payload.images.length > 30) errors.push('Слишком много изображений (макс. 30)');
        else payload.images.forEach(img => {
            if (!img || typeof img !== 'object' || !img.url || typeof img.url !== 'string') {
                errors.push('Каждый элемент images должен содержать поле url (строка)');
            }
        });
    }
    if (payload.variants !== undefined && !Array.isArray(payload.variants)) errors.push('Поле variants должно быть массивом');
    if (payload.attributes !== undefined && !Array.isArray(payload.attributes)) errors.push('Поле attributes должно быть массивом');
    return errors;
}

app.post('/api/admin/products', requireAuth, async (req, res) => {
    try {
        const errors = validateProductPayload(req.body);
        if (errors.length) return res.status(400).json({ error: errors.join('. ') });
        res.status(201).json(await createProduct(req.body));
    } catch (err) {
        console.error('POST /api/admin/products:', err);
        res.status(400).json({ error: err.message || 'Failed to create product' });
    }
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
    try {
        const errors = validateProductPayload(req.body);
        if (errors.length) return res.status(400).json({ error: errors.join('. ') });
        const updated = await updateProduct(Number(req.params.id), req.body);
        if (!updated) return res.status(404).json({ error: 'Product not found' });
        res.json(updated);
    } catch (err) {
        console.error('PUT /api/admin/products/:id:', err);
        res.status(400).json({ error: err.message || 'Failed to update product' });
    }
});

async function handleAdminProductActive(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });
        const { is_active } = req.body || {};
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'Укажите is_active (true или false)' });
        }
        const row = await updateProductActiveFlag(id, is_active);
        if (!row) return res.status(404).json({ error: 'Товар не найден' });
        res.json({ id: row.id, is_active: row.is_active });
    } catch (err) {
        console.error(`${req.method} /api/admin/products/:id/active:`, err);
        res.status(500).json({ error: 'Не удалось обновить видимость товара' });
    }
}

app.patch('/api/admin/products/:id/active', requireAuth, handleAdminProductActive);
app.post('/api/admin/products/:id/active', requireAuth, handleAdminProductActive);

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
    try {
        const deleted = await deleteProduct(Number(req.params.id));
        if (!deleted) return res.status(404).json({ error: 'Product not found' });
        res.status(204).send();
    } catch (err) {
        console.error('DELETE /api/admin/products/:id:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

app.use(express.static(path.join(__dirname)));

app.get('/:file', (req, res) => {
    res.sendFile(path.join(__dirname, `${req.params.file}.html`));
});

connectDB()
    .then(() => ensureDefaultUsers())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`  - Server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to connect to PostgreSQL:', err);
        process.exit(1);
    });
