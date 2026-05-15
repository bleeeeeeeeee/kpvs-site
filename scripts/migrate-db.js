#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { runAllMigrations } = require("../server/db/migrate.js");

runAllMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
