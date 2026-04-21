const express = require('express');
const cors = require('cors');
const path = require('path');
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

app.post('/api/admin/products', async (req, res) => {
    try {
        const product = await createProduct(req.body);
        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(400).json({ error: error.message || 'Failed to create product' });
    }
});

app.put('/api/admin/products/:id', async (req, res) => {
    try {
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
