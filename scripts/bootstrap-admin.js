#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const db = require("../server/db/index.js");

const resetPassword = process.argv.includes("--reset-password");

async function main() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const username = String(process.env.ADMIN_USERNAME || "admin").trim();

  await db.ensureUserAuthSchema();

  if (resetPassword) {
    if (!password || password.length < 6) {
      console.error("For --reset-password set ADMIN_PASSWORD in .env (at least 6 characters).");
      process.exit(1);
    }
    const existing = await db.findUserByUsername(username);
    if (!existing) {
      console.error(
        `No user with login "${username}". Create one first: set ADMIN_EMAIL and ADMIN_PASSWORD, then run without --reset-password.`
      );
      process.exit(1);
    }
    const role = String(existing.role || "");
    if (role !== "admin" && role !== "superadmin") {
      console.error(
        `User "${username}" has role "${role}". Refusing to change password (only admin/superadmin). Use another ADMIN_USERNAME.`
      );
      process.exit(1);
    }
    const n = await db.changeUserPassword(existing.id, password);
    if (n > 0) {
      console.log("Administrator password updated for", username);
      process.exit(0);
    }
    console.error("Password update had no effect.");
    process.exit(1);
  }

  if (!email || !password) {
    console.error(
      "To create the first administrator, set in .env:\n" +
        "  ADMIN_EMAIL=you@example.com\n" +
        "  ADMIN_PASSWORD=your_secure_password\n" +
        "  ADMIN_USERNAME=admin   (optional)\n" +
        "Then: npm run bootstrap-admin\n" +
        "If the admin user already exists but you forgot the password:\n" +
        "  set ADMIN_PASSWORD and run: npm run bootstrap-admin -- --reset-password"
    );
    process.exit(1);
  }

  const existing = await db.findUserByUsername(username);
  if (existing) {
    const role = String(existing.role || "");
    if (role === "user") {
      console.error(
        `Login "${username}" is already taken by a customer account. Set ADMIN_USERNAME to a different staff login.`
      );
      process.exit(1);
    }
    console.log(
      `Staff user "${username}" already exists. To set a new password, put ADMIN_PASSWORD in .env and run:\n` +
        `  npm run bootstrap-admin -- --reset-password`
    );
    process.exit(0);
  }

  try {
    await db.createUser(username, password, "admin", { email, email_verified: true });
    console.log("Administrator created:", username);
    process.exit(0);
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();
