const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
    connectDB,
    getProducts,
    getProduct,
    getCategories,
    searchProducts,
    createProduct,
    updateProduct,
    deleteProduct
} = require('./db');

const { Pool } = require('pg');
const dbPool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || 'kpvs_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '12345678',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});

app.get('/', (req, res) => {
    res.redirect('/welcome.html');
});

app.get('/api/products/:gender', async (req, res) => {
    try {
        const { category, material, size, tag, q, limit = 20, offset = 0 } = req.query;
        const products = await getProducts(req.params.gender, {
            category,
            material,
            size,
            tag,
            q,
            limit: Number(limit) || 20,
            offset: Number(offset) || 0
        });
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

app.get('/api/product/:identifier', async (req, res) => {
    try {
        const product = await getProduct(req.params.identifier);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to load product' });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await getCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to load categories' });
    }
});

const uploadsDir = path.join(__dirname, 'img', 'uploads');
try {
    fs.mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
    console.error('Failed to create uploads directory:', e);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
        const safeExt = ext.replace(/[^a-z0-9.]/g, '') || '.bin';
        const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        cb(null, `${unique}${safeExt}`);
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

app.post('/api/admin/uploads', upload.array('images', 12), (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        const paths = files.map((f) => `/img/uploads/${f.filename}`);
        res.status(201).json({ files: paths });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

app.get('/api/admin/products', async (req, res) => {
    try {
        const {
            q,
            gender,
            category,
            price_min,
            price_max,
            sort_by,
            sort_direction,
            limit = 100,
            offset = 0
        } = req.query;
        const products = await getProducts(null, {
            q,
            gender,
            category,
            price_min: price_min ? Number(price_min) : null,
            price_max: price_max ? Number(price_max) : null,
            sort_by,
            sort_direction,
            limit: Number(limit) || 100,
            offset: Number(offset) || 0
        });
        res.json(products);
    } catch (error) {
        console.error('Error fetching admin products:', error);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

function validateProductPayload(payload) {
    const errors = [];
    if (!payload || typeof payload !== 'object') {
        return ['Некорректное тело запроса'];
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const slug = typeof payload.slug === 'string' ? payload.slug.trim() : '';
    const gender = typeof payload.gender_code === 'string' ? payload.gender_code.trim() : '';
    const category = typeof payload.category_code === 'string' ? payload.category_code.trim() : '';
    const price = payload.price;
    const images = payload.images;

    if (!name) errors.push('Поле name обязательно');
    if (!gender) errors.push('Поле gender_code обязательно');
    if (!category) errors.push('Поле category_code обязательно');

    if (price !== null && price !== undefined && price !== '') {
        const numberPrice = Number(price);
        if (!Number.isFinite(numberPrice)) errors.push('Поле price должно быть числом');
        if (Number.isFinite(numberPrice) && numberPrice < 0) errors.push('Поле price не может быть отрицательным');
    }

    if (images !== undefined) {
        if (!Array.isArray(images)) {
            errors.push('Поле images должно быть массивом');
        } else if (images.length > 30) {
            errors.push('Слишком много изображений');
        } else {
            images.forEach((img) => {
                if (!img || typeof img !== 'object') {
                    errors.push('Некорректный элемент images');
                    return;
                }
                if (!img.path || typeof img.path !== 'string') {
                    errors.push('В images.path должна быть строка');
                }
            });
        }
    }

    return errors;
}

app.post('/api/admin/products', async (req, res) => {
    try {
        const errors = validateProductPayload(req.body);
        if (errors.length) {
            return res.status(400).json({ error: errors.join('. ') });
        }
        const product = await createProduct(req.body);
        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(400).json({ error: error.message || 'Failed to create product' });
    }
});

app.put('/api/admin/products/:id', async (req, res) => {
    try {
        const errors = validateProductPayload(req.body);
        if (errors.length) {
            return res.status(400).json({ error: errors.join('. ') });
        }
        const updatedProduct = await updateProduct(Number(req.params.id), req.body);
        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(updatedProduct);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(400).json({ error: error.message || 'Failed to update product' });
    }
});

app.delete('/api/admin/products/:id', async (req, res) => {
    try {
        const deleted = await deleteProduct(Number(req.params.id));
        if (!deleted) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const { q, gender, category, limit = 20, offset = 0 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        const products = await searchProducts(q, gender, category, Number(limit) || 20, Number(offset) || 0);
        res.json(products);
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/sizes', async (req, res) => {
    try {
        const result = await dbPool.query(`
            SELECT name FROM sizes 
            ORDER BY 
                CASE name 
                    WHEN 'XS' THEN 1
                    WHEN 'S' THEN 2
                    WHEN 'M' THEN 3
                    WHEN 'L' THEN 4
                    WHEN 'XL' THEN 5
                    WHEN 'XXL' THEN 6
                    ELSE 7
                END, name
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sizes:', error);
        res.status(500).json({ error: 'Failed to load sizes' });
    }
});

app.get('/api/tags', async (req, res) => {
    try {
        const result = await dbPool.query('SELECT code, name FROM tags ORDER BY sort_order');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: 'Failed to load tags' });
    }
});

app.get('/api/materials', async (req, res) => {
    try {
        const result = await dbPool.query('SELECT name, name as code FROM materials ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching materials:', error);
        res.status(500).json({ error: 'Failed to load materials' });
    }
});

app.get('/:file', (req, res) => {
    res.sendFile(path.join(__dirname, `${req.params.file}.html`));
});

connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`  - Server running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to PostgreSQL:', err);
        process.exit(1);
    });
