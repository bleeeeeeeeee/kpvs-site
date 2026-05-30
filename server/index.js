require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { validateProductionEnv } = require("./config");
validateProductionEnv();
const { startServer } = require("./app");
startServer();
