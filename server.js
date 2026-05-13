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
const https = require('https');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const {
    pool,
    publicMediaUrl,
    connectDB,
    getCategories,
    getBrands,
    createBrand,
    getSizes,
    getSizeTypes,
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
    verifyUser,
    verifyUserByLogin,
    createUser,
    findUserByUsername,
    findUserByEmail,
    findUserById,
    ensureUserAuthSchema,
    ensureProductsEditorColumn,
    ensureCollectionsSchema,
    ensureCategorySizeTypesSchema,
    ensureSizeGroupsSchema,
    listSizeGroups,
    createSizeGroup,
    deleteSizeGroup,
    listSizeEquivalenceBuckets,
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
} = require('./db');

const isProduction = process.env.NODE_ENV === 'production';
const allowDebugNdjsonRoute = !isProduction;
const app = express();
if (String(process.env.TRUST_PROXY || '').trim() === '1') {
    app.set('trust proxy', 1);
}
const PORT = Number(process.env.PORT || 3000);
if (isProduction && (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).length < 24)) {
    console.error('FATAL: In production set SESSION_SECRET (at least 24 characters).');
    process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'kpvs-dev-session-secret';
const JWT_SECRET = process.env.JWT_SECRET || SESSION_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/api/user/oauth/google/callback`;

function sanitizeOAuthNextPath(raw) {
    const s = String(raw || '').trim();
    if (!s.startsWith('/') || s.startsWith('//')) return '/welcome.html';
    if (s.includes('\0') || s.includes('\\')) return '/welcome.html';
    if (s.length > 512) return '/welcome.html';
    const pathOnly = s.split('?')[0];
    if (/[\s<>"'`]/.test(pathOnly)) return '/welcome.html';
    return s;
}

function isSafeProductImageUrl(url) {
    const s = String(url || '').trim();
    if (!s || s.length > 2048) return false;
    const head = s.slice(0, 16).toLowerCase();
    if (head.startsWith('javascript:') || head.startsWith('data:') || head.startsWith('vbscript:')) return false;
    if (s.startsWith('/')) return !s.startsWith('//');
    if (/^https?:\/\//i.test(s)) {
        try {
            const u = new URL(s);
            if (u.username || u.password) return false;
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }
    return false;
}

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
        sameSite: 'lax',
        secure: String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true'
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        userProfileURL: 'https://openidconnect.googleapis.com/v1/userinfo'
    }, (accessToken, refreshToken, params, profile, done) => {
        if (!profile || !profile.id) return done(new Error('google_profile_incomplete'));
        done(null, {
            profile,
            accessToken: accessToken || '',
            tokenParams: params && typeof params === 'object' ? params : {}
        });
    }));
}

app.use(passport.initialize());

if (!isProduction) {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.originalUrl}`);
        next();
    });
}

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

if (allowDebugNdjsonRoute) {
    const KPVS_DEBUG_LOG_FILE = path.join(__dirname, '.cursor', 'debug-575784.log');
    app.post('/api/__debug_ndjson', (req, res) => {
        try {
            const body = req.body;
            if (body && typeof body === 'object') {
                fs.mkdirSync(path.dirname(KPVS_DEBUG_LOG_FILE), { recursive: true });
                fs.appendFileSync(KPVS_DEBUG_LOG_FILE, JSON.stringify(body) + '\n', 'utf8');
            }
        } catch (_) {}
        res.status(204).end();
    });
}

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const u = String(username || '').trim();
        const p = String(password || '').trim();
        if (!u || !p) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const user = await verifyUser(u, p);
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
        const { username, email, password, email_code } = req.body || {};
        const u = String(username || '').trim();
        const e = normalizeEmail(email);
        const p = String(password || '');
        if (!u) return res.status(400).json({ error: 'Укажите логин' });
        if (!isValidEmail(e)) return res.status(400).json({ error: 'Укажите корректный email' });
        if (!p || p.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        const code = String(email_code || '').trim();
        if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Подтвердите email: введите 6-значный код из письма' });
        const codeHash = emailCodeHash(e, 'register', code);
        const v = await consumeEmailVerificationCode(e, 'register', codeHash);
        if (!v.ok) return res.status(400).json({ error: 'Код недействителен или истёк. Запросите новый.' });

        const user = await createUser(u, p, 'user', { email: e, email_verified: true });
        res.status(201).json({ id: user.id, username: user.username, role: 'user' });
    } catch (err) {
        if (err && err.code === '23505') return res.status(409).json({ error: 'Логин или email уже занят' });
        res.status(400).json({ error: err.message || 'Не удалось зарегистрироваться' });
    }
});

app.post('/api/user/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const u = String(username || '').trim();
        const p = String(password || '');
        if (!u || !p) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const user = await verifyUserByLogin(u, p);
        if (!user) {
            const asEmail = normalizeEmail(u);
            if (isValidEmail(asEmail)) {
                const [byEmail, byUsername] = await Promise.all([
                    findUserByEmail(asEmail),
                    findUserByUsername(u)
                ]);
                if (byEmail && byEmail.is_active && String(byEmail.role || '') === 'user') {
                    const hasOauth = !!(byEmail.oauth_provider && String(byEmail.oauth_provider).trim());
                    const pwdSet = byEmail.password_set === true || byEmail.password_set === 1;
                    if (hasOauth && !pwdSet) {
                        res.set('X-Login-Code', 'oauth_password_not_set');
                        return res.status(401).json({
                            error: 'Этот email привязан к входу через Google. Войдите через Google или задайте пароль в разделе «Аккаунт» после входа.',
                            code: 'oauth_password_not_set'
                        });
                    }
                }
                if (!byEmail && !byUsername) {
                    res.set('X-Login-Code', 'email_not_registered');
                    return res.status(401).json({
                        error: 'Такого пользователя в системе нет. Нажмите «Зарегистрироваться» на странице входа.',
                        code: 'email_not_registered'
                    });
                }
            } else {
                const byUsernameOnly = await findUserByUsername(u);
                if (!byUsernameOnly) {
                    res.set('X-Login-Code', 'username_not_registered');
                    return res.status(401).json({
                        error: 'Такого пользователя в системе нет. Нажмите «Зарегистрироваться» на странице входа.',
                        code: 'username_not_registered'
                    });
                }
            }
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
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
            email: emailForProfile(row),
            oauth_provider: row.oauth_provider || null,
            password_set: !!row.password_set
        });
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

app.patch('/api/user/auth/username', requireUserJwt, async (req, res) => {
    try {
        const id = Number(req.userJwt.sub);
        if (!id) return res.status(400).json({ error: 'Некорректный запрос' });
        const row = await findUserById(id);
        if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
        if (!row.is_active) return res.status(403).json({ error: 'Аккаунт отключён' });
        if (String(row.role || '') !== 'user') {
            return res.status(403).json({ error: 'Смена логина доступна только для клиентского аккаунта' });
        }
        const { username } = req.body || {};
        const user = await changeUsername(id, String(username || ''));
        if (!user) return res.status(404).json({ error: 'User not found' });
        const token = createJwtToken({ id: user.id, username: user.username, role: user.role });
        res.json({
            ok: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                email: emailForProfile(user),
                password_set: !!user.password_set
            }
        });
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

function normalizeEmail(s) {
    if (s == null || s === undefined) return '';
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(s)) {
        try { s = s.toString('utf8'); } catch { return ''; }
    }
    return String(s).trim().toLowerCase();
}

function isValidEmail(e) {
    return !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function extractEmailFromGoogleIdToken(idToken, clientId) {
    if (!idToken || typeof idToken !== 'string') return null;
    const cid = String(clientId || '').trim();
    if (!cid) return null;
    try {
        const decoded = jwt.decode(idToken, { complete: true });
        const payload = decoded && decoded.payload && typeof decoded.payload === 'object' ? decoded.payload : null;
        if (!payload) return null;
        const iss = String(payload.iss || '');
        const okIss = iss === 'https://accounts.google.com' || iss === 'accounts.google.com';
        if (!okIss) return null;
        const aud = payload.aud;
        const okAud = aud === cid || (Array.isArray(aud) && aud.indexOf(cid) !== -1);
        if (!okAud) return null;
        if (payload.email_verified === false || payload.email_verified === 'false') return null;
        const e = normalizeEmail(payload.email);
        return isValidEmail(e) ? e : null;
    } catch {
        return null;
    }
}

function extractGoogleProfileEmail(profile) {
    if (!profile) return null;
    const seen = new Set();
    const push = (raw) => {
        if (raw == null) return null;
        const s = String(raw).trim().toLowerCase();
        if (!s || !isValidEmail(s) || seen.has(s)) return null;
        seen.add(s);
        return s;
    };
    const ordered = [];
    const add = (raw) => {
        const v = push(raw);
        if (v) ordered.push(v);
    };
    if (profile.emails && Array.isArray(profile.emails)) {
        const arr = profile.emails.slice();
        arr.sort((a, b) => {
            const av = a && typeof a === 'object' && a.verified ? 1 : 0;
            const bv = b && typeof b === 'object' && b.verified ? 1 : 0;
            return bv - av;
        });
        for (let i = 0; i < arr.length; i++) {
            const e = arr[i];
            if (e && typeof e === 'object' && e.value) add(e.value);
            else if (typeof e === 'string') add(e);
        }
    }
    if (typeof profile.email === 'string') add(profile.email);
    const j = profile._json || {};
    add(j.email);
    add(j.email_address);
    if (typeof profile._raw === 'string') {
        try {
            const raw = JSON.parse(profile._raw);
            if (raw && typeof raw === 'object') {
                add(raw.email);
                if (Array.isArray(raw.emails)) {
                    for (let i = 0; i < raw.emails.length; i++) {
                        const ex = raw.emails[i];
                        if (ex && typeof ex === 'object' && ex.value) add(ex.value);
                    }
                }
            }
        } catch {}
    }
    return ordered.length ? ordered[0] : null;
}

function fetchGoogleUserinfoEmail(accessToken) {
    return new Promise((resolve) => {
        const tok = String(accessToken || '').trim();
        if (!tok) return resolve(null);
        const attempts = [
            { hostname: 'openidconnect.googleapis.com', path: '/v1/userinfo' },
            { hostname: 'www.googleapis.com', path: '/oauth2/v2/userinfo' },
            { hostname: 'www.googleapis.com', path: '/oauth2/v3/userinfo' }
        ];
        let i = 0;
        const next = () => {
            if (i >= attempts.length) return resolve(null);
            const { hostname, path } = attempts[i++];
            const req = https.request(
                {
                    hostname,
                    path,
                    method: 'GET',
                    headers: {
                        Authorization: 'Bearer ' + tok,
                        Accept: 'application/json',
                        'User-Agent': 'kpvs-site-oauth/1.0'
                    },
                    timeout: 15000
                },
                (res) => {
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { body += chunk; });
                    res.on('end', () => {
                        if (res.statusCode !== 200) {
                            console.error('[oauth-google] userinfo HTTP', hostname + path, res.statusCode, body.slice(0, 200));
                            return next();
                        }
                        try {
                            const j = JSON.parse(body);
                            const e = j && j.email != null ? normalizeEmail(j.email) : '';
                            if (isValidEmail(e)) return resolve(e);
                        } catch (ex) {
                            console.error('[oauth-google] userinfo JSON parse', ex && ex.message);
                        }
                        next();
                    });
                }
            );
            req.on('error', (e) => {
                console.error('[oauth-google] userinfo request error', e && e.message);
                next();
            });
            req.on('timeout', () => {
                try { req.destroy(); } catch {}
                next();
            });
            req.end();
        };
        next();
    });
}

async function resolveGoogleLoginEmail(ctx) {
    const profile = ctx && ctx.profile;
    const accessToken = ctx && ctx.accessToken;
    const tokenParams = ctx && ctx.tokenParams && typeof ctx.tokenParams === 'object' ? ctx.tokenParams : {};
    const idTok = tokenParams.id_token || tokenParams.idToken;
    let email = extractEmailFromGoogleIdToken(idTok, GOOGLE_CLIENT_ID);
    if (email) return email;
    email = extractGoogleProfileEmail(profile);
    if (email) return email;
    if (accessToken) email = await fetchGoogleUserinfoEmail(accessToken);
    return email || null;
}

function emailForProfile(row) {
    if (!row) return null;
    const stored = row.email != null ? normalizeEmail(row.email) : '';
    if (isValidEmail(stored)) return stored;
    const fromLogin = row.username != null ? normalizeEmail(row.username) : '';
    if (isValidEmail(fromLogin)) return fromLogin;
    return null;
}

function emailForAdminUserList(row) {
    if (!row) return null;
    const p = emailForProfile(row);
    if (p) return p;
    const rawNorm = row.email != null ? normalizeEmail(row.email) : '';
    return rawNorm || null;
}

function makeSixDigitCode() {
    const n = crypto.randomInt(0, 1000000);
    return String(n).padStart(6, '0');
}

function emailCodeHash(email, purpose, code) {
    const pepper = process.env.EMAIL_CODE_PEPPER || JWT_SECRET;
    return sha256Hex([normalizeEmail(email), String(purpose || ''), String(code || ''), pepper].join('|'));
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

async function trySendEmailVerificationCode(toEmail, code) {
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
        subject: 'Код подтверждения email · КПВС',
        text: `Ваш код подтверждения: ${code}\n\nКод действует 10 минут.\nЕсли вы не запрашивали подтверждение — просто игнорируйте это письмо.`,
    });
    return true;
}

app.post('/api/user/auth/email-code', async (req, res) => {
    try {
        const { email, purpose } = req.body || {};
        const e = normalizeEmail(email);
        const p = String(purpose || '').trim() || 'register';
        if (!isValidEmail(e)) return res.status(400).json({ error: 'Укажите корректный email' });
        if (!['register'].includes(p)) return res.status(400).json({ error: 'Некорректный запрос' });

        const already = await findUserByEmail(e);
        if (already) {
            return res.status(409).json({
                error: 'Этот email уже занят (в том числе если входили через Google). Войдите через Google или задайте пароль в аккаунте.'
            });
        }

        const latest = await getLatestEmailVerification(e, p);
        if (latest && latest.created_at) {
            const created = new Date(latest.created_at);
            if (!isNaN(created.getTime()) && created.getTime() > Date.now() - 60 * 1000) {
                return res.status(429).json({ error: 'Слишком часто. Попробуйте через минуту' });
            }
        }

        const code = makeSixDigitCode();
        const codeHash = emailCodeHash(e, p, code);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await insertEmailVerificationCode(e, p, codeHash, expiresAt);

        try {
            const sent = await trySendEmailVerificationCode(e, code);
            if (!sent) console.warn('[email-verify] SMTP not configured; code was not sent by email');
        } catch (mailErr) {
            console.error('[email-verify] send failed:', mailErr && mailErr.message ? mailErr.message : mailErr);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/user/auth/email-code:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/user/auth/recover', async (req, res) => {
    try {
        const { email } = req.body || {};
        const e = normalizeEmail(String(email || ''));
        if (!isValidEmail(e)) {
            return res.status(400).json({ error: 'Укажите корректный email', code: 'recover_invalid_email' });
        }
        const row = await findUserByEmail(e);
        if (!row) {
            return res.status(404).json({
                error: 'Пользователя с таким email в системе нет.',
                code: 'recover_email_unknown'
            });
        }
        if (!row.is_active) {
            return res.status(403).json({
                error: 'Этот аккаунт отключён. Восстановление пароля по почте недоступно.',
                code: 'recover_inactive'
            });
        }
        if (String(row.role || '') !== 'user') {
            return res.status(400).json({
                error: 'Для этого типа учётной записи восстановление через сайт недоступно.',
                code: 'recover_role'
            });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = sha256Hex(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await insertPasswordResetToken(Number(row.id), tokenHash, expiresAt);

        const base = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
        const link = base.replace(/\/+$/, '') + '/login.html?mode=user&reset=' + encodeURIComponent(rawToken);

        try {
            const sent = await trySendResetEmail(e, link);
            if (!sent) {
                return res.status(503).json({
                    error: 'Отправка письма сейчас недоступна (не настроена почта на сервере). Обратитесь к администратору.',
                    code: 'recover_mail_disabled'
                });
            }
        } catch (mailErr) {
            console.error('[password-recover] send failed:', mailErr && mailErr.message ? mailErr.message : mailErr);
            return res.status(500).json({
                error: 'Не удалось отправить письмо. Попробуйте позже.',
                code: 'recover_send_failed'
            });
        }
        res.json({
            ok: true,
            message: 'На указанный email отправлено письмо со ссылкой для сброса пароля.'
        });
    } catch (err) {
        console.error('POST /api/user/auth/recover:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
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
    req.session.oauth_next = sanitizeOAuthNextPath(nextUrl);
    req.session.save(() => {
        passport.authenticate('google', {
            scope: [
                'openid',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile'
            ],
            session: false
        })(req, res, next);
    });
});

app.get('/api/user/oauth/google/callback', (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.redirect('/login.html?mode=user&oauth_error=not_configured');
    passport.authenticate('google', { session: false }, async (err, oauthCtx) => {
        try {
            if (err) {
                console.error('OAuth Google callback error:', err);
                return res.redirect('/login.html?mode=user&oauth_error=callback');
            }
            const profile = oauthCtx && oauthCtx.profile;
            const accessToken = oauthCtx && oauthCtx.accessToken;
            const tokenParams = oauthCtx && oauthCtx.tokenParams;
            if (!profile || !profile.id) {
                console.error('OAuth Google callback missing profile');
                return res.redirect('/login.html?mode=user&oauth_error=profile');
            }
            const email = await resolveGoogleLoginEmail({ profile, accessToken, tokenParams });
            if (!email) {
                console.error('OAuth Google callback: no verified email', { sub: profile.id });
                return res.redirect('/login.html?mode=user&oauth_error=no_email');
            }
            const user = await upsertOAuthUser('google', String(profile.id), email);
            if (!user) {
                console.error('OAuth Google upsertOAuthUser returned null');
                return res.redirect('/login.html?mode=user&oauth_error=user');
            }
            const token = createJwtToken(user);
            const dest = sanitizeOAuthNextPath(req.session.oauth_next);
            try { delete req.session.oauth_next; } catch {}
            const row = await findUserById(user.id);
            const suggestPassword = row && String(row.role || '') === 'user' && !row.password_set;
            let loginQs = 'mode=user&next=' + encodeURIComponent(dest) + '&token=' + encodeURIComponent(token);
            if (suggestPassword) loginQs += '&oauth_set_password=1';
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
        const rows = await listUsers({
            q: req.query.q,
            role: req.query.role,
            active: req.query.active,
            sort_by: req.query.sort_by,
            sort_direction: req.query.sort_direction
        });
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        const payload = rows.map((u) => ({
            id: u.id != null ? Number(u.id) : u.id,
            username: u.username != null ? String(u.username) : '',
            email: emailForAdminUserList(u),
            role: u.role != null ? String(u.role) : '',
            is_active: Boolean(u.is_active),
            created_at: u.created_at,
            last_login: u.last_login
        }));
        res.json(payload);
    } catch (err) {
        console.error('GET /api/admin/users:', err);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

app.post('/api/admin/users', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
        const { username, password, role, email } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Укажите логин и пароль' });
        const r = String(role || 'admin').trim();
        if (r === 'user') {
            const e = normalizeEmail(String(email || ''));
            if (!isValidEmail(e)) return res.status(400).json({ error: 'Для роли «user» укажите корректный email' });
            const dupE = await findUserByEmail(e);
            if (dupE) return res.status(409).json({ error: 'Email уже занят' });
            const user = await createUser(String(username).trim(), String(password), r, { email: e, email_verified: true });
            return res.status(201).json(user);
        }
        const user = await createUser(String(username).trim(), String(password), r);
        res.status(201).json(user);
    } catch (err) {
        if (err && err.code === '23505') return res.status(409).json({ error: 'Логин или email уже занят' });
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
        const users = await listUsers({});
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
    try {
        const raw = req.query.category_id;
        const cid = raw != null && String(raw).trim() !== '' ? Number(raw) : NaN;
        const categoryId = Number.isFinite(cid) && cid > 0 ? cid : null;
        res.json(await getSizes(categoryId));
    } catch (err) { console.error('GET /api/sizes:', err); res.status(500).json({ error: 'Failed to load sizes' }); }
});

app.get('/api/size-equivalence-buckets', async (req, res) => {
    try {
        res.json(await listSizeEquivalenceBuckets());
    } catch (err) {
        console.error('GET /api/size-equivalence-buckets:', err);
        res.status(500).json({ error: 'Failed to load size equivalence' });
    }
});

app.get('/api/colors', async (req, res) => {
    try { res.json(await getColors()); }
    catch (err) { console.error('GET /api/colors:', err); res.status(500).json({ error: 'Failed to load colors' }); }
});

app.get('/api/collections', async (req, res) => {
    try { res.json(await getCollections()); }
    catch (err) { console.error('GET /api/collections:', err); res.status(500).json({ error: 'Failed to load collections' }); }
});

app.get('/api/section-collections/:gender', async (req, res) => {
    try {
        res.json(await getSectionCollectionsWithProducts(req.params.gender));
    } catch (err) {
        console.error('GET /api/section-collections/:gender:', err);
        res.status(500).json({ error: 'Failed to load section collections' });
    }
});

app.get('/api/products/:gender', async (req, res) => {
    try {
        const { category, q, brand, season, color, size, size_id, color_id, collection_id, limit = 20, offset = 0 } = req.query;
        res.json(await getProducts(req.params.gender, {
            category, q, brand, season, color, size, size_id, color_id, collection_id,
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
        res.status(201).json({ files: files.map(f => publicMediaUrl(`/img/uploads/${f.filename}`)) });
    } catch (err) {
        console.error('POST /api/admin/uploads:', err);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

app.get('/api/admin/collections', requireAuth, async (req, res) => {
    try { res.json(await getCollectionsAdmin()); }
    catch (err) { console.error('GET /api/admin/collections:', err); res.status(500).json({ error: 'Не удалось загрузить подборки' }); }
});

app.post('/api/admin/collections', requireAuth, async (req, res) => {
    try {
        res.status(201).json(await createCollection(req.body));
    } catch (err) {
        console.error('POST /api/admin/collections:', err);
        res.status(400).json({ error: err.message || 'Не удалось создать подборку' });
    }
});

app.put('/api/admin/collections/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });
        const row = await updateCollection(id, req.body);
        if (!row) return res.status(404).json({ error: 'Подборка не найдена' });
        res.json(row);
    } catch (err) {
        console.error('PUT /api/admin/collections/:id:', err);
        res.status(400).json({ error: err.message || 'Не удалось обновить подборку' });
    }
});

app.delete('/api/admin/collections/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });
        const ok = await deleteCollection(id);
        if (!ok) return res.status(404).json({ error: 'Подборка не найдена' });
        res.status(204).send();
    } catch (err) {
        console.error('DELETE /api/admin/collections/:id:', err);
        res.status(500).json({ error: 'Не удалось удалить подборку' });
    }
});

app.get('/api/admin/size-types', requireAuth, async (req, res) => {
    try { res.json(await getSizeTypes()); }
    catch (err) { console.error('GET /api/admin/size-types:', err); res.status(500).json({ error: 'Не удалось загрузить типы размеров' }); }
});

app.get('/api/admin/category-size-types', requireAuth, async (req, res) => {
    try { res.json(await getCategorySizeTypeLinks()); }
    catch (err) {
        console.error('GET /api/admin/category-size-types:', err);
        res.status(500).json({ error: 'Не удалось загрузить связи категорий с типами размеров' });
    }
});

app.post('/api/admin/brands', requireAuth, async (req, res) => {
    try {
        res.status(201).json(await createBrand(req.body));
    } catch (err) {
        console.error('POST /api/admin/brands:', err);
        res.status(400).json({ error: err.message || 'Не удалось создать бренд' });
    }
});

app.post('/api/admin/sizes', requireAuth, async (req, res) => {
    try {
        res.status(201).json(await createSize(req.body));
    } catch (err) {
        console.error('POST /api/admin/sizes:', err);
        res.status(400).json({ error: err.message || 'Не удалось создать размер' });
    }
});

async function handleListSizeGroups(req, res) {
    try {
        res.json(await listSizeGroups());
    } catch (err) {
        console.error('GET /api/admin/size-groups:', err);
        res.status(500).json({ error: 'Не удалось загрузить группы размеров' });
    }
}

async function handleCreateSizeGroup(req, res) {
    try {
        res.status(201).json(await createSizeGroup(req.body || {}));
    } catch (err) {
        console.error('POST /api/admin/size-groups:', err);
        res.status(400).json({ error: err.message || 'Не удалось создать группу' });
    }
}

async function handleDeleteSizeGroup(req, res) {
    try {
        const id = req.query.id ?? req.query.group_id;
        await deleteSizeGroup(id);
        res.status(204).send();
    } catch (err) {
        console.error('DELETE /api/admin/size-groups:', err);
        res.status(400).json({ error: err.message || 'Не удалось удалить группу' });
    }
}

['/api/admin/size-groups', '/api/admin/size-equivalent-groups'].forEach(path => {
    app.get(path, requireAuth, handleListSizeGroups);
    app.post(path, requireAuth, handleCreateSizeGroup);
    app.delete(path, requireAuth, handleDeleteSizeGroup);
});

app.get('/api/admin/products', requireAuth, async (req, res) => {
    try {
        const { q, gender, category, brand, season, size_id, color_id, collection_id, active, sort_by, sort_direction, limit = 100, offset = 0 } = req.query;
        res.json(await getProducts(null, {
            q, gender, category, brand, season, size_id, color_id, collection_id, active, sort_by, sort_direction,
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
            } else if (!isSafeProductImageUrl(img.url)) {
                errors.push('Поле images.url: допустимы только относительные пути (/...) или http(s) URL');
            }
        });
    }
    if (payload.variants !== undefined && !Array.isArray(payload.variants)) errors.push('Поле variants должно быть массивом');
    if (payload.attributes !== undefined && !Array.isArray(payload.attributes)) errors.push('Поле attributes должно быть массивом');
    if (payload.collections !== undefined) {
        if (!Array.isArray(payload.collections)) errors.push('Поле collections должно быть массивом');
        else payload.collections.forEach(c => {
            if (!c || typeof c !== 'object' || !Number.isFinite(Number(c.id))) {
                errors.push('Каждый элемент collections должен содержать id (число)');
            }
        });
    }
    return errors;
}

app.post('/api/admin/products', requireAuth, async (req, res) => {
    try {
        const errors = validateProductPayload(req.body);
        if (errors.length) return res.status(400).json({ error: errors.join('. ') });
        const editorId = req.session.user && req.session.user.id != null ? Number(req.session.user.id) : null;
        res.status(201).json(await createProduct(req.body, { editorUserId: editorId }));
    } catch (err) {
        console.error('POST /api/admin/products:', err);
        res.status(400).json({ error: err.message || 'Failed to create product' });
    }
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
    try {
        const errors = validateProductPayload(req.body);
        if (errors.length) return res.status(400).json({ error: errors.join('. ') });
        const editorId = req.session.user && req.session.user.id != null ? Number(req.session.user.id) : null;
        const updated = await updateProduct(Number(req.params.id), req.body, { editorUserId: editorId });
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
    .then(() => ensureProductsEditorColumn())
    .then(() => ensureCollectionsSchema())
    .then(() => ensureCategorySizeTypesSchema())
    .then(() => ensureSizeGroupsSchema())
    .then(() => ensureSizesUniqueValueIndex())
    .then(() => ensureReferenceSizesSeed())
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
