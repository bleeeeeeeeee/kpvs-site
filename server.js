const express = require('express');
const cors = require('cors');
const { initDB, getProducts, getProduct } = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('.'));

// Redirect root to welcome
app.get('/', (req, res) => {
    res.redirect('/welcome');
});

// Serve HTML files without extension
app.get('/:file', (req, res) => {
    res.sendFile(__dirname + '/' + req.params.file + '.html');
});

initDB();

// Logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

app.get('/api/products/:gender', async (req, res) => {
    try {
        console.log(`Fetching products for gender: ${req.params.gender}`);
        const products = await getProducts(req.params.gender);
        console.log(`Returning ${products.length} products`);
        res.json(products);
    } catch (error) {
        console.error(`Error fetching products:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/product/:id', async (req, res) => {
    try {
        console.log(`Fetching product ID: ${req.params.id}`);
        const product = await getProduct(req.params.id);
        if (!product) {
            console.log(`Product ${req.params.id} not found`);
            return res.status(404).json({ error: 'Not found' });
        }
        console.log(`Returning product: ${product.name}`);
        res.json(product);
    } catch (error) {
        console.error(`Error fetching product:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`✓ Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
