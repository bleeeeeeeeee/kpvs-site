const path = require("path");
const fs = require("fs");
const storageService = require("../services/storage");
const { normalizeEmail, isValidEmail } = require("../services/auth-helpers");
const { validateProductPayload, validateCategoryPayload } = require("../services/catalog");
const adminService = require("../services/admin");
const MAX_ADMIN_QUERY_LEN = 200;
const MAX_ADMIN_LIST_LIMIT = 500;
const MAX_ADMIN_OFFSET = 1e5;
const ADMIN_GENDER_SET = new Set(["mens", "womens", "male", "female", "all", "unisex", ""]);
function stripCredentials(row) {
  if (!row || typeof row !== "object") return row;
  const o = { ...row };
  delete o.password;
  delete o.password_hash;
  return o;
}
function parsePositiveDbId(raw) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0 || id > 2147483647) return null;
  return id;
}
function clipStr(v, max) {
  if (v == null) return v;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function parseBoolBody(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return null;
}
async function handleListSizeGroups(req, res, db) {
  try {
    res.json(await db.listSizeGroups());
  } catch (err) {
    console.error("GET /api/admin/size-groups:", err);
    res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u044B \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432" });
  }
}
async function handleCreateSizeGroup(req, res, db) {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442 \u0432 \u0442\u0435\u043B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u0430" });
    }
    res.status(201).json(await db.createSizeGroup(req.body || {}));
  } catch (err) {
    console.error("POST /api/admin/size-groups:", err);
    res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443" });
  }
}
async function handleDeleteSizeGroup(req, res, db) {
  try {
    const raw = req.query.id ?? req.query.group_id;
    const gid = parsePositiveDbId(raw);
    if (!gid) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 id \u0433\u0440\u0443\u043F\u043F\u044B (\u0447\u0438\u0441\u043B\u043E)" });
    await db.deleteSizeGroup(gid);
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/admin/size-groups:", err);
    res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443" });
  }
}
async function postAdminCatalogVisibility(req, res, db) {
  try {
    const rawId = req.body?.product_id ?? req.body?.id;
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 product_id (\u0447\u0438\u0441\u043B\u043E)" });
    }
    let active = req.body?.is_active;
    if (typeof active === "string") {
      const s = active.trim().toLowerCase();
      if (s === "true" || s === "1") active = true;
      else if (s === "false" || s === "0") active = false;
    }
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 is_active (true \u0438\u043B\u0438 false)" });
    }
    const row = await db.updateProductActiveFlag(id, active);
    if (!row) return res.status(404).json({ error: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u0431\u0430\u0437\u0435" });
    res.json({ id: row.id, is_active: row.is_active });
  } catch (err) {
    console.error("POST admin catalog visibility:", err);
    res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u0430" });
  }
}
async function handleAdminProductActive(req, res, db) {
  try {
    const id = parsePositiveDbId(req.params.id);
    if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
    const parsed = parseBoolBody((req.body || {}).is_active);
    if (parsed === null) {
      return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 is_active (true \u0438\u043B\u0438 false)" });
    }
    const row = await db.updateProductActiveFlag(id, parsed);
    if (!row) return res.status(404).json({ error: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    res.json({ id: row.id, is_active: row.is_active });
  } catch (err) {
    console.error(`${req.method} /api/admin/products/:id/active:`, err);
    res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u0430" });
  }
}
function mountAdminRoutes(app, ctx) {
  const { requireAuth, db, upload, PUB_ROOT, publicMediaUrl } = ctx;
  app.get("/api/admin/users", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const rows = await db.listUsers({
        q: clipStr(req.query.q, MAX_ADMIN_QUERY_LEN),
        role: clipStr(req.query.role, 80),
        active: clipStr(req.query.active, 32),
        sort_by: clipStr(req.query.sort_by, 40),
        sort_direction: clipStr(req.query.sort_direction, 8)
      });
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.set("Pragma", "no-cache");
      const payload = rows.map((u) => adminService.mapUserListRow(u));
      res.json(payload);
    } catch (err) {
      console.error("GET /api/admin/users:", err);
      res.status(500).json({ error: "Failed to load users" });
    }
  });
  app.post("/api/admin/users", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const { username, password, role, email } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C" });
      const pwd = String(password);
      if (pwd.length > 500) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      const r = String(role || "admin").trim();
      if (!["admin", "user", "superadmin"].includes(r)) {
        return res.status(400).json({ error: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u0440\u043E\u043B\u044C" });
      }
      if (r === "user") {
        const e = normalizeEmail(String(email || ""));
        if (!isValidEmail(e)) return res.status(400).json({ error: "\u0414\u043B\u044F \u0440\u043E\u043B\u0438 \xABuser\xBB \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 email" });
        const dupE = await db.findUserByEmail(e);
        if (dupE) return res.status(409).json({ error: "Email \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442" });
        const user2 = await db.createUser(String(username).trim(), pwd, r, { email: e, email_verified: true });
        return res.status(201).json(stripCredentials(user2));
      }
      const user = await db.createUser(String(username).trim(), pwd, r);
      res.status(201).json(stripCredentials(user));
    } catch (err) {
      if (err && err.code === "23505") return res.status(409).json({ error: "\u041B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 email \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442" });
      console.error("POST /api/admin/users:", err);
      res.status(400).json({ error: err.message || "Failed to create user" });
    }
  });
  app.patch("/api/admin/users/:id/active", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const uid = parsePositiveDbId(req.params.id);
      if (!uid) return res.status(400).json({ error: "Invalid user id" });
      const parsed = parseBoolBody((req.body || {}).is_active);
      if (parsed === null) {
        return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 is_active (true \u0438\u043B\u0438 false)" });
      }
      const user = await db.setUserActive(uid, parsed);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(stripCredentials(user));
    } catch (err) {
      console.error("PATCH /api/admin/users/:id/active:", err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  app.patch("/api/admin/users/:id/password", requireAuth, async (req, res) => {
    try {
      const targetId = parsePositiveDbId(req.params.id);
      if (!targetId) return res.status(400).json({ error: "Invalid user id" });
      const isSelf = req.session.user.id === targetId;
      const isSuperadmin = req.session.user.role === "superadmin";
      if (!isSelf && !isSuperadmin) return res.status(403).json({ error: "Forbidden" });
      const { password } = req.body || {};
      const pwd = String(password || "");
      if (!pwd || pwd.length < 6) {
        return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432" });
      }
      if (pwd.length > 500) return res.status(400).json({ error: "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439" });
      const changed = await db.changeUserPassword(targetId, pwd);
      if (!changed) return res.status(404).json({ error: "User not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("PATCH /api/admin/users/:id/password:", err);
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  app.patch("/api/admin/users/:id/role", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      const { role } = req.body || {};
      const newRole = String(role || "").trim();
      if (!newRole) return res.status(400).json({ error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0440\u043E\u043B\u044C" });
      if (id === Number(req.session.user.id) && req.session.user.role === "superadmin" && newRole !== "superadmin") {
        return res.status(400).json({ error: "\u041D\u0435\u043B\u044C\u0437\u044F \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0440\u043E\u043B\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E superadmin" });
      }
      const user = await db.setUserRole(id, newRole);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(stripCredentials(user));
    } catch (err) {
      console.error("PATCH /api/admin/users/:id/role:", err);
      res.status(400).json({ error: err.message || "Failed to update role" });
    }
  });
  app.patch("/api/admin/users/:id/username", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      const { username } = req.body || {};
      const user = await db.changeUsername(id, String(username || ""));
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(stripCredentials(user));
    } catch (err) {
      if (err && err.code === "23505") return res.status(409).json({ error: "\u041B\u043E\u0433\u0438\u043D \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442" });
      console.error("PATCH /api/admin/users/:id/username:", err);
      res.status(400).json({ error: err && err.message ? err.message : "Failed to change username" });
    }
  });
  app.delete("/api/admin/users/:id", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      if (id === Number(req.session.user.id)) return res.status(400).json({ error: "\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" });
      const users = await db.listUsers({});
      const target = Array.isArray(users) ? users.find((u) => Number(u.id) === id) : null;
      if (target && target.role === "superadmin") return res.status(400).json({ error: "\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C superadmin" });
      const deleted = await db.deleteUserById(id);
      if (!deleted) return res.status(404).json({ error: "User not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/admin/users/:id:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  app.get("/api/admin/collections", requireAuth, async (req, res) => {
    try {
      res.json(await db.getCollectionsAdmin());
    } catch (err) {
      console.error("GET /api/admin/collections:", err);
      res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0438" });
    }
  });
  app.post("/api/admin/collections", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442" });
      }
      res.status(201).json(await db.createCollection(req.body));
    } catch (err) {
      console.error("POST /api/admin/collections:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443" });
    }
  });
  app.put("/api/admin/collections/:id", requireAuth, async (req, res) => {
    try {
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442" });
      }
      const row = await db.updateCollection(id, req.body);
      if (!row) return res.status(404).json({ error: "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
      res.json(row);
    } catch (err) {
      console.error("PUT /api/admin/collections/:id:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443" });
    }
  });
  app.delete("/api/admin/collections/:id", requireAuth, async (req, res) => {
    try {
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      const ok = await db.deleteCollection(id);
      if (!ok) return res.status(404).json({ error: "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
      res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/admin/collections/:id:", err);
      res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443" });
    }
  });
  app.get("/api/admin/size-types", requireAuth, async (req, res) => {
    try {
      res.json(await db.getSizeTypes());
    } catch (err) {
      console.error("GET /api/admin/size-types:", err);
      res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0442\u0438\u043F\u044B \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432" });
    }
  });
  app.get("/api/admin/category-size-types", requireAuth, async (req, res) => {
    try {
      res.json(await db.getCategorySizeTypeLinks());
    } catch (err) {
      console.error("GET /api/admin/category-size-types:", err);
      res.status(500).json({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0432\u044F\u0437\u0438 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439 \u0441 \u0442\u0438\u043F\u0430\u043C\u0438 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432" });
    }
  });
  app.post("/api/admin/categories", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442" });
      }
      const isParent =
        req.body.is_parent_category === true ||
        req.body.is_parent_category === "true" ||
        req.body.is_parent_category === 1;
      if (isParent && req.session.user.role !== "superadmin") {
        return res.status(403).json({ error: "Родительскую категорию раздела может создать только суперадмин" });
      }
      const valErrors = validateCategoryPayload(req.body);
      if (valErrors.length) return res.status(400).json({ error: valErrors.join("; ") });
      res.status(201).json(await db.createCategory(req.body, { role: req.session.user.role }));
    } catch (err) {
      console.error("POST /api/admin/categories:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E" });
    }
  });
  app.put("/api/admin/categories/:id", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442" });
      }
      const row = await db.updateCategory(id, req.body);
      if (!row) return res.status(404).json({ error: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
      res.json(row);
    } catch (err) {
      console.error("PUT /api/admin/categories/:id:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E" });
    }
  });
  app.delete("/api/admin/categories/:id", requireAuth, async (req, res) => {
    try {
      if (req.session.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
      const id = parsePositiveDbId(req.params.id);
      if (!id) return res.status(400).json({ error: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id" });
      const ok = await db.deleteCategory(id);
      if (!ok) return res.status(404).json({ error: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
      res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/admin/categories/:id:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E" });
    }
  });
  app.post("/api/admin/colors", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "Ожидается JSON-объект" });
      }
      res.status(201).json(await db.createColor(req.body));
    } catch (err) {
      console.error("POST /api/admin/colors:", err);
      res.status(400).json({ error: err.message || "Не удалось создать цвет" });
    }
  });
  app.post("/api/admin/brands", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442" });
      }
      res.status(201).json(await db.createBrand(req.body));
    } catch (err) {
      console.error("POST /api/admin/brands:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0431\u0440\u0435\u043D\u0434" });
    }
  });
  app.get("/api/admin/reference-materials", requireAuth, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(await db.listReferenceMaterials());
    } catch (err) {
      console.error("GET /api/admin/reference-materials:", err);
      res.status(500).json({
        error:
          "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432"
      });
    }
  });
  app.post("/api/admin/reference-materials", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({
          error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442 \u0432 \u0442\u0435\u043B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u0430"
        });
      }
      res.status(201).json(await db.createReferenceMaterial(req.body));
    } catch (err) {
      console.error("POST /api/admin/reference-materials:", err);
      res.status(400).json({
        error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B"
      });
    }
  });
  app.post("/api/admin/sizes", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442" });
      }
      res.status(201).json(await db.createSize(req.body));
    } catch (err) {
      console.error("POST /api/admin/sizes:", err);
      res.status(400).json({ error: err.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0440" });
    }
  });
  ["/api/admin/size-groups", "/api/admin/size-equivalent-groups"].forEach((routePath) => {
    app.get(routePath, requireAuth, (req, res) => handleListSizeGroups(req, res, db));
    app.post(routePath, requireAuth, (req, res) => handleCreateSizeGroup(req, res, db));
    app.delete(routePath, requireAuth, (req, res) => handleDeleteSizeGroup(req, res, db));
  });
  app.get("/api/admin/products", requireAuth, async (req, res) => {
    try {
      const { q, gender, category, brand, season, size_id, color_id, collection_id, active, sort_by, sort_direction, limit = 100, offset = 0 } = req.query;
      const lim = Math.min(Math.max(Number(limit) || 100, 1), MAX_ADMIN_LIST_LIMIT);
      const off = Math.min(Math.max(Number(offset) || 0, 0), MAX_ADMIN_OFFSET);
      let genderOpt = gender;
      if (gender != null && String(gender).trim() !== "") {
        const g = String(gender).trim().toLowerCase();
        if (!ADMIN_GENDER_SET.has(g)) {
          return res.status(400).json({ error: "Invalid gender filter" });
        }
        genderOpt = g;
      }
      res.json(
        await db.getProducts(null, {
          q: q != null ? clipStr(q, MAX_ADMIN_QUERY_LEN) : q,
          gender: genderOpt,
          category: category != null ? clipStr(category, 400) : category,
          brand: brand != null ? clipStr(brand, 200) : brand,
          season: season != null ? clipStr(season, 120) : season,
          size_id,
          color_id,
          collection_id,
          active: active != null ? clipStr(active, 32) : active,
          sort_by: sort_by != null ? clipStr(sort_by, 40) : sort_by,
          sort_direction: sort_direction != null ? clipStr(sort_direction, 8) : sort_direction,
          include_inactive: true,
          limit: lim,
          offset: off
        })
      );
    } catch (err) {
      console.error("GET /api/admin/products:", err);
      res.status(500).json({ error: "Failed to load products" });
    }
  });
  app.post("/api/admin/catalog-visibility", requireAuth, (req, res) => postAdminCatalogVisibility(req, res, db));
  app.post("/api/admin/productvisibility", requireAuth, (req, res) => postAdminCatalogVisibility(req, res, db));
  app.post("/api/admin/products", requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442 \u0442\u043E\u0432\u0430\u0440\u0430" });
      }
      const errors = validateProductPayload(req.body);
      if (errors.length) return res.status(400).json({ error: errors.join(". ") });
      const editorId = req.session.user && req.session.user.id != null ? Number(req.session.user.id) : null;
      res.status(201).json(await db.createProduct(req.body, { editorUserId: editorId }));
    } catch (err) {
      console.error("POST /api/admin/products:", err);
      res.status(400).json({ error: err.message || "Failed to create product" });
    }
  });
  app.put("/api/admin/products/:id", requireAuth, async (req, res) => {
    try {
      const pid = parsePositiveDbId(req.params.id);
      if (!pid) return res.status(400).json({ error: "Invalid product id" });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F JSON-\u043E\u0431\u044A\u0435\u043A\u0442 \u0442\u043E\u0432\u0430\u0440\u0430" });
      }
      const errors = validateProductPayload(req.body);
      if (errors.length) return res.status(400).json({ error: errors.join(". ") });
      const editorId = req.session.user && req.session.user.id != null ? Number(req.session.user.id) : null;
      const updated = await db.updateProduct(pid, req.body, { editorUserId: editorId });
      if (!updated) return res.status(404).json({ error: "Product not found" });
      res.json(updated);
    } catch (err) {
      console.error("PUT /api/admin/products/:id:", err);
      res.status(400).json({ error: err.message || "Failed to update product" });
    }
  });
  app.patch("/api/admin/products/:id/active", requireAuth, (req, res) => handleAdminProductActive(req, res, db));
  app.post("/api/admin/products/:id/active", requireAuth, (req, res) => handleAdminProductActive(req, res, db));
  app.delete("/api/admin/products/:id", requireAuth, async (req, res) => {
    try {
      const pid = parsePositiveDbId(req.params.id);
      if (!pid) return res.status(400).json({ error: "Invalid product id" });
      const deleted = await db.deleteProduct(pid);
      if (!deleted) return res.status(404).json({ error: "Product not found" });
      res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/admin/products/:id:", err);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });
  const uploadsDir = path.join(PUB_ROOT, "img", "uploads");
  app.post("/api/admin/uploads", requireAuth, upload.array("images", 12), async (req, res) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const out = [];
      for (const f of files) {
        const buf = f.buffer;
        const detected = storageService.detectImageMime(buf);
        const mime = detected || String(f.mimetype || "");
        if (!storageService.ALLOWED_MIME.has(mime)) {
          return res.status(400).type("application/json").json({ error: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0442\u0438\u043F \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F" });
        }
        if (storageService.isConfigured()) {
          const { url } = await storageService.uploadBuffer(buf, {
            folder: "products",
            originalName: f.originalname,
            mime
          });
          out.push(url);
        } else {
          const ext = path.extname(f.originalname || ".bin").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
          const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
          const dest = path.join(uploadsDir, name);
          await fs.promises.writeFile(dest, buf);
          out.push(publicMediaUrl(`/img/uploads/${name}`));
        }
      }
      res.status(201).type("application/json").json({ files: out });
    } catch (err) {
      console.error("POST /api/admin/uploads:", err);
      res.status(500).type("application/json").json({ error: "Failed to upload images" });
    }
  });
}
module.exports = { mountAdminRoutes };
