require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { validateProductionEnv } = require('./env-validate');
validateProductionEnv();
const { startServer } = require('./app');
startServer();
