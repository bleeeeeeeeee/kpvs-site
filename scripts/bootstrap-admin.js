#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const db = require("../server/db/index.js");
async function main() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const username = String(process.env.ADMIN_USERNAME || "admin").trim();
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env file.");
    process.exit(1);
  }
  try {
    await db.ensureUserAuthSchema();
    const existing = await db.findUserByUsername(username);
    if (existing) {
      console.log("Administrator user already exists.");
      process.exit(0);
    }
    await db.createUser(username, password, "admin", { email, email_verified: true });
    console.log("Administrator user created.");
    process.exit(0);
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
}
main();
