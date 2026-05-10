require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

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
    verifyUserByLogin,
    createUser,
    findUserByUsername,
    findUserById,
    ensureUserAuthSchema,
    upsertOAuthUser,
    ensureDefaultUsers,
    listUsers,
    setUserActive,
    changeUserPassword,
    changeUserPasswordWithOld,
    setInitialPasswordForOAuthUser,
    createPasswordResetForEmail,
    insertPasswordResetToken,
    consumePasswordResetToken,
    changeUsername,
    setUserRole
    ,deleteUserById
} = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'kpvs-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || SESSION_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/api/user/oauth/google/callback`;

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

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL
    }, (accessToken, refreshToken, profile, done) => {
        done(null, { provider: 'google', id: profile && profile.id ? String(profile.id) : '' });
    }));
}

app.use(passport.initialize());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

function createJwtToken(user) {
    return jwt.sign(
        { sub: String(user.id), username: user.username || '', role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function getBearerToken(req) {
    const h = req.headers && req.headers.authorization ? String(req.headers.authorization) : '';
    if (!h.toLowerCase().startsWith('bearer ')) return '';
    return h.slice(7).trim();
}

function requireUserJwt(req, res, next) {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.userJwt = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

const ERROR_PAGE_META = {
    403: {
        title: 'Доступ запрещён',
        description: 'У вас нет прав для просмотра этого ресурса.'
    },
    404: {
        title: 'Страница не найдена',
        description: 'Запрошенный адрес отсутствует или был перемещён. Проверьте ссылку или вернитесь на главную.'
    },
    500: {
        title: 'Ошибка сервера',
        description: 'Не удалось обработать запрос. Попробуйте позже или сообщите администратору.'
    }
};

function renderErrorHtml(statusCode) {
    const code = [403, 404, 500].includes(Number(statusCode)) ? Number(statusCode) : 404;
    const meta = ERROR_PAGE_META[code];
    let html = fs.readFileSync(path.join(__dirname, 'error.html'), 'utf8');
    return html
        .replace(/\{\{CODE\}\}/g, String(code))
        .replace(/\{\{TITLE\}\}/g, meta.title)
        .replace(/\{\{DESCRIPTION\}\}/g, meta.description);
}

function sendHtmlError(res, statusCode) {
    const code = [403, 404, 500].includes(Number(statusCode)) ? Number(statusCode) : 404;
    res.status(code).type('html').send(renderErrorHtml(code));
}

app.get('/', (req, res) => res.redirect('/welcome.html'));

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const user = await verifyUser(String(username).trim(), String(password));
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
        if (user.role === 'user') return res.status(403).json({ error: 'Доступ запрещён' });
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

app.post('/api/user/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body || {};
        const u = String(username || '').trim();
        const e = String(email || '').trim().toLowerCase();
        const p = String(password || '');
        if (!u) return res.status(400).json({ error: 'Укажите логин' });
        if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: 'Укажите корректный email' });
        if (!p || p.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        const user = await createUser(u, p, 'user', { email: e });
        res.status(201).json({ id: user.id, username: user.username, role: 'user' });
    } catch (err) {
        res.status(400).json({ error: err.message || 'Не удалось зарегистрироваться' });
    }
});

app.post('/api/user/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const u = String(username || '').trim(); // may be username OR email
        const p = String(password || '');
        if (!u || !p) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const user = await verifyUserByLogin(u, p);
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
        if (user.role !== 'user') return res.status(403).json({ error: 'Используйте режим «Админ»' });
        res.json({ token: createJwtToken(user), user: { id: user.id, username: user.username, role: user.role } });
    } catch {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/user/auth/me', requireUserJwt, async (req, res) => {
    try {
        const id = Number(req.userJwt.sub);
        const row = await findUserById(id);
        if (!row || !row.is_active) return res.status(401).json({ error: 'Unauthorized' });
        res.json({
            id: Number(row.id),
            username: row.username,
            role: row.role,
            email: row.email || null,
            oauth_provider: row.oauth_provider || null,
            password_set: !!row.password_set
        });
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

// Change username for the currently authenticated storefront user.
// Returns a refreshed JWT because username is embedded into the token payload.
app.patch('/api/user/auth/username', requireUserJwt, async (req, res) => {
    try {
        const id = Number(req.userJwt.sub);
        if (!id) return res.status(400).json({ error: 'Некорректный запрос' });
        const row = await findUserById(id);
        if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
        if (!row.is_active) return res.status(403).json({ error: 'Аккаунт отключён' });
        // Storefront self-service rename: only role `user` (not admin sessions / staff accounts).
        if (String(row.role || '') !== 'user') {
            return res.status(403).json({ error: 'Смена логина доступна только для клиентского аккаунта' });
        }
        const { username } = req.body || {};
        const user = await changeUsername(id, String(username || ''));
        if (!user) return res.status(404).json({ error: 'User not found' });
        const token = createJwtToken({ id: user.id, username: user.username, role: user.role });
        res.json({ ok: true, token: token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        if (err && err.code === '23505') return res.status(409).json({ error: 'Логин уже занят' });
        res.status(400).json({ error: (err && err.message) ? err.message : 'Failed to change username' });
    }
});

app.patch('/api/user/auth/password', requireUserJwt, async (req, res) => {
    try {
        const id = Number(req.userJwt.sub);
        if (!id) return res.status(400).json({ error: 'Некорректный запрос' });
        const row = await findUserById(id);
        if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
        if (!row.is_active) return res.status(403).json({ error: 'Аккаунт отключён' });
        if (String(row.role || '') !== 'user') return res.status(403).json({ error: 'Forbidden' });

        const { old_password, password } = req.body || {};
        const next = String(password || '');
        if (!next || next.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });

        if (!row.password_set) {
            const r = await setInitialPasswordForOAuthUser(id, next);
            if (!r.ok) return res.status(400).json({ error: 'Не удалось установить пароль' });
        } else {
            const prev = String(old_password || '');
            if (!prev) return res.status(400).json({ error: 'Укажите текущий пароль' });
            const r = await changeUserPasswordWithOld(id, prev, next);
            if (!r.ok && r.error === 'wrong_old') return res.status(400).json({ error: 'Неверный текущий пароль' });
            if (!r.ok) return res.status(400).json({ error: 'Не удалось сменить пароль' });
        }

        const updated = await findUserById(id);
        const token = updated ? createJwtToken({ id: updated.id, username: updated.username, role: updated.role }) : '';
        res.json({ ok: true, token: token });
    } catch (err) {
        console.error('PATCH /api/user/auth/password:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

function sha256Hex(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
}

async function trySendResetEmail(toEmail, link) {
    const host = process.env.SMTP_HOST || '';
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.SMTP_FROM || user || '';
    const port = Number(process.env.SMTP_PORT || 587);
    if (!nodemailer || !host || !user || !pass || !from) return false;
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });
    await transporter.sendMail({
        from,
        to: toEmail,
        subject: 'Восстановление пароля · КПВС',
        text: `Ссылка для восстановления пароля:\n${link}\n\nЕсли вы не запрашивали восстановление — просто игнорируйте это письмо.`,
    });
    return true;
}

app.post('/api/user/auth/recover', async (req, res) => {
    try {
        const { email } = req.body || {};
        const e = String(email || '').trim().toLowerCase();
        // Always return ok to avoid account enumeration.
        const user = await createPasswordResetForEmail(e);
        if (!user) return res.json({ ok: true });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = sha256Hex(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
        await insertPasswordResetToken(Number(user.id), tokenHash, expiresAt);

        const base = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
        const link = base.replace(/\/+$/,'') + '/login.html?mode=user&reset=' + encodeURIComponent(rawToken);

        try {
            const sent = await trySendResetEmail(e, link);
            if (!sent) console.log('[password-recover] email disabled. link=', link);
        } catch (mailErr) {
            console.error('[password-recover] send failed:', mailErr);
            console.log('[password-recover] fallback link=', link);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/user/auth/recover:', err);
        res.json({ ok: true });
    }
});

app.post('/api/user/auth/reset', async (req, res) => {
    try {
        const { token, password } = req.body || {};
        const t = String(token || '').trim();
        const p = String(password || '');
        if (!t) return res.status(400).json({ error: 'Некорректный токен' });
        if (!p || p.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        const tokenHash = sha256Hex(t);
        const r = await consumePasswordResetToken(tokenHash, p);
        if (!r.ok) return res.status(400).json({ error: 'Ссылка недействительна или истекла' });
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/user/auth/reset:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/user/oauth/google/start', (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.redirect('/login.html?mode=user&oauth_error=not_configured');
    const nextUrl = typeof req.query.next === 'string' ? req.query.next : '';
    req.session.oauth_next = nextUrl;
    // Ensure oauth_next is persisted before redirect to Google.
    req.session.save(() => {
        console.log('OAuth Google start. next=', nextUrl);
        passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
    });
});

app.get('/api/user/oauth/google/callback', (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.redirect('/login.html?mode=user&oauth_error=not_configured');
    passport.authenticate('google', { session: false }, async (err, profile) => {
        try {
            if (err) {
                console.error('OAuth Google callback error:', err);
                return res.redirect('/login.html?mode=user&oauth_error=callback');
            }
            if (!profile || !profile.id) {
                console.error('OAuth Google callback missing profile:', profile);
                return res.redirect('/login.html?mode=user&oauth_error=profile');
            }
            const email = profile.emails && profile.emails[0] && profile.emails[0].value ? String(profile.emails[0].value) : null;
            const user = await upsertOAuthUser('google', String(profile.id), email);
            if (!user) {
                console.error('OAuth Google upsertOAuthUser returned null');
                return res.redirect('/login.html?mode=user&oauth_error=user');
            }
            const token = createJwtToken(user);
            const dest = req.session.oauth_next && String(req.session.oauth_next).startsWith('/') ? String(req.session.oauth_next) : '/welcome.html';
            try { delete req.session.oauth_next; } catch {}
            const row = await findUserById(user.id);
            const suggestPassword = row && String(row.role || '') === 'user' && !row.password_set;
            let loginQs = 'mode=user&next=' + encodeURIComponent(dest) + '&token=' + encodeURIComponent(token);
            if (suggestPassword) loginQs += '&oauth_set_password=1';
            console.log('OAuth Google success. user=', user.id, 'dest=', dest, 'suggestPassword=', !!suggestPassword);
            res.redirect('/login.html?' + loginQs);
        } catch (e) {
            console.error('OAuth Google callback exception:', e);
            res.redirect('/login.html?mode=user&oauth_error=exception');
        }
    })(req, res, next);
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
        const changed = await changeUserPassword(Number(req.params.id), String(password));
        if (!changed) return res.status(404).json({ error: 'User not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/admin/users/:id/password:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

app.patch('/api/admin/users/:id/role', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        const id = Number(req.params.id);
        const { role } = req.body || {};
        const newRole = String(role || '').trim();
        if (!newRole) return res.status(400).json({ error: 'Укажите роль' });
        if (id === Number(req.session.user.id) && req.session.user.role === 'superadmin' && newRole !== 'superadmin') {
            return res.status(400).json({ error: 'Нельзя изменить роль текущего superadmin' });
        }
        const user = await setUserRole(id, newRole);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error('PATCH /api/admin/users/:id/role:', err);
        res.status(400).json({ error: err.message || 'Failed to update role' });
    }
});

app.patch('/api/admin/users/:id/username', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        const id = Number(req.params.id);
        const { username } = req.body || {};
        if (!id) return res.status(400).json({ error: 'Некорректный id' });
        const user = await changeUsername(id, String(username || ''));
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        if (err && err.code === '23505') return res.status(409).json({ error: 'Логин уже занят' });
        console.error('PATCH /api/admin/users/:id/username:', err);
        res.status(400).json({ error: (err && err.message) ? err.message : 'Failed to change username' });
    }
});

app.delete('/api/admin/users/:id', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'Некорректный id' });
        if (id === Number(req.session.user.id)) return res.status(400).json({ error: 'Нельзя удалить текущего пользователя' });
        // Do not allow deleting superadmin accounts.
        const users = await listUsers();
        const target = Array.isArray(users) ? users.find(u => Number(u.id) === id) : null;
        if (target && target.role === 'superadmin') return res.status(400).json({ error: 'Нельзя удалить superadmin' });
        const deleted = await deleteUserById(id);
        if (!deleted) return res.status(404).json({ error: 'User not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/admin/users/:id:', err);
        res.status(500).json({ error: 'Failed to delete user' });
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
        const { q, gender, category, brand, season, tag, size_id, color_id, active, sort_by, sort_direction, limit = 100, offset = 0 } = req.query;
        res.json(await getProducts(null, {
            q, gender, category, brand, season, tag, size_id, color_id, active, sort_by, sort_direction,
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

app.get('/error.html', (req, res) => {
    const q = Number(req.query.code);
    const code = [403, 404, 500].includes(q) ? q : 404;
    res.status(code).type('html').send(renderErrorHtml(code));
});

app.use(express.static(path.join(__dirname)));

app.get('/:file', (req, res, next) => {
    const seg = path.basename(String(req.params.file || ''));
    if (!seg || seg.includes('.')) return next();
    if (seg === 'api') return next();
    const filePath = path.join(__dirname, `${seg}.html`);
    if (!fs.existsSync(filePath)) return next();
    if (seg === 'error') {
        return sendHtmlError(res, 404);
    }
    res.sendFile(filePath);
});

function isApiPath(p) {
    return p === '/api' || (typeof p === 'string' && p.startsWith('/api/'));
}

app.use((req, res) => {
    if (isApiPath(req.path)) {
        return res.status(404).json({ error: 'Не найдено' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(404).json({ error: 'Не найдено' });
    }
    sendHtmlError(res, 404);
});

app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (isApiPath(req.path)) {
        return res.status(500).json({ error: 'Ошибка сервера' });
    }
    sendHtmlError(res, 500);
});

connectDB()
    .then(() => ensureUserAuthSchema())
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
