const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('./kpvs.db');

function initDB() {
    return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            name TEXT,
            image TEXT,
            description TEXT,
            materials TEXT,
            price TEXT,
            category TEXT,
            gender TEXT
        )`, (err) => {
            if (err) {
                reject(err);
                return;
            }
            db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (row.count === 0) {
                    try {
                        const data = JSON.parse(fs.readFileSync('./products.json'));
                        let inserted = 0;
                        let total = 0;
                        Object.keys(data.mens).forEach(cat => {
                            data.mens[cat].forEach(p => {
                                total++;
                                db.run('INSERT INTO products VALUES (?,?,?,?,?,?,?,?)',
                                    [p.id, p.name, p.image, p.description, p.materials, p.price, cat, 'mens'],
                                    function(err) {
                                        inserted++;
                                        if (inserted === total) {
                                            console.log('✓ DB initialized with ' + total + ' products');
                                            resolve();
                                        }
                                    });
                            });
                        });
                        Object.keys(data.womens).forEach(cat => {
                            data.womens[cat].forEach(p => {
                                total++;
                                db.run('INSERT INTO products VALUES (?,?,?,?,?,?,?,?)',
                                    [p.id, p.name, p.image, p.description, p.materials, p.price, cat, 'womens'],
                                    function(err) {
                                        inserted++;
                                        if (inserted === total) {
                                            console.log('✓ DB initialized with ' + total + ' products');
                                            resolve();
                                        }
                                    });
                            });
                        });
                    } catch(err) {
                        reject(err);
                    }
                } else {
                    console.log('✓ DB already initialized');
                    resolve();
                }
            });
        });
    });
}

function getProducts(gender) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM products WHERE gender = ?', [gender], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getProduct(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

module.exports = { initDB, getProducts, getProduct };
