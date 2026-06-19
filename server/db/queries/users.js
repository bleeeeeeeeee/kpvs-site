const bcrypt = require("bcryptjs");
async function findUserByUsername(db, username) {
  const login = String(username || "").trim();
  if (!login) return null;
  const result = await db.query(
    "SELECT id, username, password_hash, role, is_active FROM users WHERE lower(username) = lower($1) LIMIT 1",
    [login]
  );
  return result.rows[0] || null;
}
async function findUserById(db, id) {
  const result = await db.query(
    "SELECT id, username, password_hash, role, is_active, email, oauth_provider, oauth_id, password_set FROM users WHERE id = $1 LIMIT 1",
    [id]
  );
  return result.rows[0] || null;
}
async function findUserByEmail(db, email) {
  const e = String(email || "").trim();
  if (!e) return null;
  const result = await db.query(
    `SELECT id, username, password_hash, role, is_active, email, email_verified, oauth_provider, oauth_id, password_set
         FROM users
         WHERE email IS NOT NULL AND trim(email::text) <> ''
           AND lower(trim(email::text)) = lower($1)
         LIMIT 1`,
    [e]
  );
  return result.rows[0] || null;
}
async function findUserByOAuth(db, provider, oauthId) {
  const result = await db.query(
    "SELECT id, username, password_hash, role, is_active, email, oauth_provider, oauth_id FROM users WHERE oauth_provider = $1 AND oauth_id = $2 LIMIT 1",
    [provider, oauthId]
  );
  return result.rows[0] || null;
}
async function verifyUser(db, username, password) {
  const login = String(username || "").trim();
  if (!login) return null;
  const result = await db.query(
    "SELECT id, username, password_hash, role, is_active FROM users WHERE lower(username) = lower($1) LIMIT 1",
    [login]
  );
  const user = result.rows[0] || null;
  if (!user || !user.is_active) return null;
  if (!user.password_hash) return null;
  const ok = await bcrypt.compare(String(password || ""), user.password_hash);
  if (!ok) return null;
  await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
  return { id: user.id, username: user.username, role: user.role };
}
function loginInputLooksLikeEmail(login) {
  const e = String(login || "").trim().toLowerCase();
  return !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}
async function verifyUserByLogin(db, login, password) {
  const s = String(login || "").trim();
  if (!s) return null;
  const eLower = s.toLowerCase();
  let user = null;
  if (loginInputLooksLikeEmail(s)) {
    user = await findUserByEmail(db, eLower);
  }
  if (!user) {
    user = await findUserByUsername(db, s);
  }
  if (!user && !loginInputLooksLikeEmail(s)) {
    user = await findUserByEmail(db, eLower);
  }
  if (!user || !user.is_active) return null;
  if (!user.password_hash) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
  return { id: user.id, username: user.username, role: user.role };
}
function assertValidUsername(username) {
  const u = String(username || "").trim();
  if (!u) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D");
  if (u.includes("@")) throw new Error("\u041B\u043E\u0433\u0438\u043D \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0441\u0438\u043C\u0432\u043E\u043B @");
  if (u.length < 3) throw new Error("\u041B\u043E\u0433\u0438\u043D \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043A\u043E\u0440\u043E\u0447\u0435 3 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
  if (u.length > 48) throw new Error("\u041B\u043E\u0433\u0438\u043D \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439");
  if (!/^[\p{L}\p{N}._-]+$/u.test(u)) throw new Error("\u041B\u043E\u0433\u0438\u043D \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0431\u0443\u043A\u0432\u044B, \u0446\u0438\u0444\u0440\u044B, \u0442\u043E\u0447\u043A\u0443, \u0434\u0435\u0444\u0438\u0441 \u0438 \u043F\u043E\u0434\u0447\u0451\u0440\u043A\u0438\u0432\u0430\u043D\u0438\u0435");
}
async function createUser(db, username, password, role, options) {
  role = role || "admin";
  options = options || {};
  const tx = options._txClient || db;
  assertValidUsername(username);
  const uname = String(username || "").trim();
  const taken = await findUserByUsername(tx, uname);
  if (taken) throw new Error("\u041B\u043E\u0433\u0438\u043D \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442");
  const email = options.email ? String(options.email).trim().toLowerCase() : null;
  const email_verified = typeof options.email_verified === "boolean" ? options.email_verified : null;
  const oauth_provider = options.oauth_provider ? String(options.oauth_provider) : null;
  const oauth_id = options.oauth_id ? String(options.oauth_id) : null;
  const password_set = typeof options.password_set === "boolean" ? options.password_set : true;
  const hash = await bcrypt.hash(password, 12);
  const result = await tx.query(
    `INSERT INTO users (username, password_hash, role, email, email_verified, oauth_provider, oauth_id, password_set)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, username, role, is_active, created_at, email, email_verified, oauth_provider, oauth_id, password_set`,
    [uname, hash, role, email, email_verified, oauth_provider, oauth_id, password_set]
  );
  return result.rows[0];
}
async function insertEmailVerificationCode(db, email, purpose, codeHash, expiresAt) {
  await db.query(
    "INSERT INTO email_verifications (email, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [String(email).trim().toLowerCase(), String(purpose).trim(), String(codeHash), expiresAt]
  );
}
async function getLatestEmailVerification(db, email, purpose) {
  const r = await db.query(
    `SELECT id, email, purpose, code_hash, expires_at, used_at, created_at
         FROM email_verifications
         WHERE email = $1 AND purpose = $2
         ORDER BY id DESC
         LIMIT 1`,
    [String(email).trim().toLowerCase(), String(purpose).trim()]
  );
  return r.rows[0] || null;
}
async function consumeEmailVerificationCode(db, email, purpose, codeHash) {
  const r = await db.query(
    `SELECT id, expires_at, used_at
         FROM email_verifications
         WHERE email = $1 AND purpose = $2 AND code_hash = $3
         ORDER BY id DESC
         LIMIT 1`,
    [String(email).trim().toLowerCase(), String(purpose).trim(), String(codeHash)]
  );
  const row = r.rows[0] || null;
  if (!row) return { ok: false, error: "invalid" };
  if (row.used_at) return { ok: false, error: "used" };
  const exp = new Date(row.expires_at);
  if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) return { ok: false, error: "expired" };
  await db.query("UPDATE email_verifications SET used_at = NOW() WHERE id = $1", [row.id]);
  return { ok: true };
}
async function upsertOAuthUser(db, provider, oauthId, email) {
  provider = String(provider || "").trim();
  oauthId = String(oauthId || "").trim();
  email = email ? String(email).trim().toLowerCase() : null;
  if (!provider || !oauthId) return null;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const byOauthRes = await client.query(
      "SELECT id, username, password_hash, role, is_active, email, oauth_provider, oauth_id FROM users WHERE oauth_provider = $1 AND oauth_id = $2 LIMIT 1",
      [provider, oauthId]
    );
    const byOauth = byOauthRes.rows[0] || null;
    if (byOauth && !byOauth.is_active) {
      await client.query("ROLLBACK");
      return null;
    }
    if (byOauth && byOauth.is_active) {
      if (email) {
        const r = await client.query(
          `UPDATE users
                     SET last_login = NOW(), email = $1::text, email_verified = TRUE
                     WHERE id = $2
                       AND NOT EXISTS (
                         SELECT 1 FROM users u2
                         WHERE u2.email IS NOT NULL
                           AND LOWER(TRIM(u2.email::text)) = LOWER(TRIM($1::text))
                           AND u2.id <> $2
                       )`,
          [email, byOauth.id]
        );
        if (!r.rowCount) {
          await client.query("UPDATE users SET last_login = NOW() WHERE id = $1", [byOauth.id]);
          console.warn("[oauth] skip email update: already used by another user", { userId: byOauth.id });
        }
      } else {
        await client.query("UPDATE users SET last_login = NOW() WHERE id = $1", [byOauth.id]);
      }
      await client.query("COMMIT");
      return { id: byOauth.id, username: byOauth.username, role: byOauth.role };
    }
    if (email) {
      const byEmail = await findUserByEmail(client, email);
      if (byEmail && !byEmail.is_active) {
        await client.query("ROLLBACK");
        return null;
      }
      if (byEmail && byEmail.is_active) {
        await client.query(
          "UPDATE users SET oauth_provider = $1, oauth_id = $2, last_login = NOW(), email = $4::text, email_verified = TRUE WHERE id = $3",
          [provider, oauthId, byEmail.id, email]
        );
        await client.query("COMMIT");
        return { id: byEmail.id, username: byEmail.username, role: byEmail.role };
      }
    }
    if (!email) {
      await client.query("ROLLBACK");
      return null;
    }
    const uname = provider + "_" + oauthId;
    const password = oauthId + ":" + Date.now();
    const created = await createUser(db, uname, password, "user", {
      email,
      email_verified: email ? true : null,
      oauth_provider: provider,
      oauth_id: oauthId,
      password_set: false,
      _txClient: client
    });
    await client.query("UPDATE users SET last_login = NOW() WHERE id = $1", [created.id]);
    await client.query("COMMIT");
    return { id: created.id, username: created.username, role: created.role };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
    }
    throw err;
  } finally {
    client.release();
  }
}
function firstScalarQueryValue(val) {
  if (val == null) return void 0;
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const x = val[i];
      if (x != null && String(x).trim() !== "") return x;
    }
    return val.length ? val[0] : void 0;
  }
  return val;
}
function normalizeUserListRoleInput(role) {
  if (role == null) return [];
  const raw = Array.isArray(role) ? role.flat(Infinity) : String(role).split(",");
  return raw.map((r) => String(r).trim()).filter(Boolean);
}
function normalizeUserListActiveInput(active) {
  const v = firstScalarQueryValue(active);
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "active" : "inactive";
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "all" || s === "any") return "";
  if (s === "true" || s === "1" || s === "yes" || s === "on" || s === "active") return "active";
  if (s === "false" || s === "0" || s === "no" || s === "off" || s === "inactive") return "inactive";
  return "";
}
async function listUsers(db, options) {
  const opts = options && typeof options === "object" ? options : {};
  const qScalar = firstScalarQueryValue(opts.q);
  const qRaw = qScalar != null ? String(qScalar).trim() : "";
  const needle = qRaw.toLowerCase();
  const values = [];
  const where = [];
  if (needle) {
    values.push(needle);
    if (/^\d+$/.test(qRaw)) {
      values.push(Number(qRaw));
      where.push(
        "(strpos(lower(username::text), $1) > 0 OR strpos(lower(coalesce(email::text, '')), $1) > 0 OR strpos(lower(coalesce(role::text, '')), $1) > 0 OR id = $2)"
      );
    } else {
      where.push(
        "(strpos(lower(username::text), $1) > 0 OR strpos(lower(coalesce(email::text, '')), $1) > 0 OR strpos(lower(coalesce(role::text, '')), $1) > 0)"
      );
    }
  }
  let roleList = normalizeUserListRoleInput(opts.role);
  const allowedRoles = new Set(["user", "admin", "superadmin"]);
  roleList = roleList.filter((r) => allowedRoles.has(r));
  if (roleList.length) {
    values.push(roleList);
    where.push("role = ANY($" + values.length + "::text[])");
  }
  const act = normalizeUserListActiveInput(opts.active);
  if (act === "active") where.push("is_active IS TRUE");
  else if (act === "inactive") where.push("is_active IS NOT TRUE");
  const sortByScalar = firstScalarQueryValue(opts.sort_by);
  let sortByRaw = String(
    sortByScalar != null && sortByScalar !== "" ? sortByScalar : opts.sort_by != null ? opts.sort_by : "id"
  ).trim().toLowerCase();
  if (sortByRaw === "created") sortByRaw = "created_at";
  const sortDirScalar = firstScalarQueryValue(opts.sort_direction);
  const sortDirRaw = String(
    sortDirScalar != null && sortDirScalar !== "" ? sortDirScalar : opts.sort_direction != null ? opts.sort_direction : "asc"
  ).trim().toLowerCase() === "desc" ? "DESC" : "ASC";
  const sortMap = {
    id: "id",
    username: "username",
    role: "role",
    created_at: "created_at",
    created: "created_at",
    last_login: "last_login"
  };
  const sortCol = sortMap[sortByRaw] || "id";
  const nullsLast = sortCol === "last_login" || sortCol === "created_at" ? " NULLS LAST" : "";
  const whereSql = where.length ? where.join(" AND ") : "TRUE";
  const result = await db.query(
    `SELECT id, username, email, role, is_active, created_at, last_login
         FROM users
         WHERE ${whereSql}
         ORDER BY ${sortCol} ${sortDirRaw}${nullsLast}`,
    values
  );
  return result.rows;
}
async function setUserActive(db, id, isActive) {
  const result = await db.query("UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, role, is_active", [
    isActive,
    id
  ]);
  return result.rows[0] || null;
}
async function changeUserPassword(db, id, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  const r = await db.query("UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2", [hash, id]);
  return r && typeof r.rowCount === "number" ? r.rowCount : 0;
}
async function changeUserPasswordWithOld(db, id, oldPassword, newPassword) {
  const user = await findUserById(db, id);
  if (!user || !user.is_active) return { ok: false, error: "not_found" };
  if (!user.password_hash) return { ok: false, error: "wrong_old" };
  const okOld = await bcrypt.compare(String(oldPassword || ""), user.password_hash);
  if (!okOld) return { ok: false, error: "wrong_old" };
  const hash = await bcrypt.hash(String(newPassword || ""), 12);
  await db.query("UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2", [hash, id]);
  return { ok: true };
}
async function setInitialPasswordForOAuthUser(db, id, newPassword) {
  const user = await findUserById(db, id);
  if (!user || !user.is_active) return { ok: false, error: "not_found" };
  if (String(user.role || "") !== "user") return { ok: false, error: "forbidden" };
  if (user.password_set) return { ok: false, error: "already_set" };
  const hash = await bcrypt.hash(String(newPassword || ""), 12);
  await db.query("UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2", [hash, id]);
  return { ok: true };
}
async function insertPasswordResetToken(db, userId, tokenHash, expiresAt) {
  await db.query("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    tokenHash,
    expiresAt
  ]);
}
async function consumePasswordResetToken(db, tokenHash, newPassword) {
  const r = await db.query(
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.is_active, u.role
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
         WHERE pr.token_hash = $1
         ORDER BY pr.id DESC
         LIMIT 1`,
    [tokenHash]
  );
  const row = r.rows[0] || null;
  if (!row) return { ok: false, error: "invalid" };
  if (row.used_at) return { ok: false, error: "used" };
  if (!row.is_active) return { ok: false, error: "inactive" };
  if (String(row.role || "") !== "user") return { ok: false, error: "forbidden" };
  const exp = new Date(row.expires_at);
  if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) return { ok: false, error: "expired" };
  const hash = await bcrypt.hash(String(newPassword || ""), 12);
  await db.query("UPDATE users SET password_hash = $1, password_set = TRUE WHERE id = $2", [hash, row.user_id]);
  await db.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [row.id]);
  return { ok: true, user_id: row.user_id };
}
async function setUserRole(db, id, role) {
  role = String(role || "").trim();
  if (!["admin", "superadmin", "user"].includes(role)) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0440\u043E\u043B\u044C");
  const result = await db.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role, is_active, created_at, last_login, email, oauth_provider, oauth_id",
    [role, id]
  );
  return result.rows[0] || null;
}
async function changeUsername(db, id, newUsername) {
  assertValidUsername(newUsername);
  const u = String(newUsername || "").trim();
  const other = await findUserByUsername(db, u);
  if (other && Number(other.id) !== Number(id)) throw new Error("\u041B\u043E\u0433\u0438\u043D \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442");
  const result = await db.query(
    "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, role, is_active, created_at, last_login, email, oauth_provider, oauth_id, password_set",
    [u, id]
  );
  return result.rows[0] || null;
}
async function deleteUserById(db, id) {
  const uid = Number(id);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const userRes = await client.query("SELECT id, email FROM users WHERE id = $1", [uid]);
    const user = userRes.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `DELETE FROM session
       WHERE (sess::jsonb->'user'->>'id')::bigint = $1`,
      [uid]
    );
    if (user.email) {
      await client.query(
        `DELETE FROM email_verifications
         WHERE lower(trim(email::text)) = lower(trim($1::text))`,
        [String(user.email)]
      );
    }
    const result = await client.query("DELETE FROM users WHERE id = $1 RETURNING id, username, role", [uid]);
    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
    }
    throw err;
  } finally {
    client.release();
  }
}
function sanitizeListItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    let id = NaN;
    let source = "";
    if (typeof item === "number" || typeof item === "string") {
      id = Number(item);
    } else if (item && typeof item === "object") {
      id = Number(item.id);
      source = item.source != null ? String(item.source).trim().slice(0, 32) : "";
    }
    if (!Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, source });
    if (out.length >= 500) break;
  }
  return out;
}
const CATALOG_STATE_GENDERS = ["mens", "womens", "all"];
function sanitizeCatalogFilters(raw) {
  if (!raw || typeof raw !== "object") {
    return { categories: [], brands: [], seasons: [], sizes: [], sizeLabels: {}, colors: [], collections: [] };
  }
  const arr = (v, max) => (Array.isArray(v) ? v.map(String).slice(0, max) : []);
  const sizeLabels = raw.sizeLabels && typeof raw.sizeLabels === "object" ? raw.sizeLabels : {};
  const labelsOut = {};
  for (const k of Object.keys(sizeLabels).slice(0, 80)) {
    const v = sizeLabels[k];
    if (v != null) labelsOut[String(k).slice(0, 32)] = String(v).slice(0, 64);
  }
  return {
    categories: arr(raw.categories, 80),
    brands: arr(raw.brands, 80),
    seasons: arr(raw.seasons, 12),
    sizes: arr(raw.sizes, 120),
    sizeLabels: labelsOut,
    colors: arr(raw.colors, 80),
    collections: arr(raw.collections, 40)
  };
}
function sanitizePreferences(raw) {
  const out = { theme: "light", catalogPersist: true, catalogState: {} };
  if (!raw || typeof raw !== "object") return out;
  out.theme = raw.theme === "dark" ? "dark" : "light";
  out.catalogPersist = raw.catalogPersist !== false;
  const src = raw.catalogState && typeof raw.catalogState === "object" ? raw.catalogState : {};
  for (const g of CATALOG_STATE_GENDERS) {
    const block = src[g];
    if (!block || typeof block !== "object") continue;
    out.catalogState[g] = {
      v: 1,
      gender: g,
      sort: typeof block.sort === "string" ? block.sort.slice(0, 64) : "name_asc",
      search: typeof block.search === "string" ? block.search.slice(0, 200) : "",
      filters: sanitizeCatalogFilters(block.filters)
    };
  }
  return out;
}
function isEmptyPreferences(prefs) {
  const p = sanitizePreferences(prefs);
  if (p.theme === "dark") return false;
  if (p.catalogPersist === false) return false;
  return Object.keys(p.catalogState).length === 0;
}
async function filterActiveProductIds(db, ids) {
  const nums = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0)
  )].slice(0, 500);
  if (!nums.length) return new Set();
  const r = await db.query(
    "SELECT id FROM products WHERE id = ANY($1::int[]) AND is_active = TRUE",
    [nums]
  );
  return new Set(r.rows.map((row) => Number(row.id)));
}
async function pruneListItemsAgainstProducts(db, items) {
  const safe = sanitizeListItems(items);
  if (!safe.length) return safe;
  const active = await filterActiveProductIds(
    db,
    safe.map((i) => i.id)
  );
  return safe.filter((i) => active.has(i.id));
}
function listsPayloadEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function removeProductIdFromAllUserLists(db, productId) {
  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) return 0;
  const r = await db.query(
    `UPDATE users u SET
      cart_json = COALESCE((
        SELECT jsonb_agg(e ORDER BY (e->>'id'))
        FROM jsonb_array_elements(COALESCE(u.cart_json, '[]'::jsonb)) AS e
        WHERE (e->>'id')::bigint <> $1
      ), '[]'::jsonb),
      favorites_json = COALESCE((
        SELECT jsonb_agg(e ORDER BY (e->>'id'))
        FROM jsonb_array_elements(COALESCE(u.favorites_json, '[]'::jsonb)) AS e
        WHERE (e->>'id')::bigint <> $1
      ), '[]'::jsonb)
    WHERE (
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(u.cart_json, '[]'::jsonb)) e
          WHERE (e->>'id')::bigint = $1
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(u.favorites_json, '[]'::jsonb)) e
          WHERE (e->>'id')::bigint = $1
        )
      )`,
    [pid]
  );
  return r.rowCount || 0;
}
const CATALOG_FILTER_KEYS = ["categories", "brands", "colors", "collections", "sizes"];
function collectCatalogFilterIdsFromPreferences(prefs) {
  const out = { categories: new Set(), brands: new Set(), colors: new Set(), collections: new Set(), sizes: new Set() };
  const p = sanitizePreferences(prefs);
  for (const g of CATALOG_STATE_GENDERS) {
    const filters = p.catalogState[g] && p.catalogState[g].filters;
    if (!filters) continue;
    for (const key of CATALOG_FILTER_KEYS) {
      const arr = filters[key];
      if (!Array.isArray(arr)) continue;
      for (const id of arr) out[key].add(String(id));
    }
    const labels = filters.sizeLabels;
    if (labels && typeof labels === "object") {
      for (const k of Object.keys(labels)) out.sizes.add(String(k));
    }
  }
  return out;
}
function removeIdsFromPreferences(prefs, removals) {
  const idSets = {};
  for (const key of CATALOG_FILTER_KEYS) {
    idSets[key] = new Set((removals[key] || []).map(String));
  }
  const p = sanitizePreferences(prefs);
  let changed = false;
  for (const g of CATALOG_STATE_GENDERS) {
    const block = p.catalogState[g];
    if (!block || !block.filters) continue;
    for (const key of CATALOG_FILTER_KEYS) {
      const arr = block.filters[key];
      if (!Array.isArray(arr) || !arr.length || !idSets[key].size) continue;
      const next = arr.filter((id) => !idSets[key].has(String(id)));
      if (next.length !== arr.length) {
        block.filters[key] = next;
        changed = true;
      }
    }
    if (idSets.sizes.size && block.filters.sizeLabels && typeof block.filters.sizeLabels === "object") {
      for (const k of Object.keys(block.filters.sizeLabels)) {
        if (idSets.sizes.has(String(k))) {
          delete block.filters.sizeLabels[k];
          changed = true;
        }
      }
    }
  }
  return { prefs: p, changed };
}
async function loadValidCatalogFilterIdSets(db, collected) {
  const valid = {
    categories: new Set(),
    brands: new Set(),
    colors: new Set(),
    collections: new Set(),
    sizes: new Set()
  };
  const toNums = (set) => [...set].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const categoryIds = toNums(collected.categories);
  if (categoryIds.length) {
    const r = await db.query("SELECT id::text FROM categories WHERE id = ANY($1::int[])", [categoryIds]);
    r.rows.forEach((row) => valid.categories.add(String(row.id)));
  }
  const brandIds = toNums(collected.brands);
  if (brandIds.length) {
    const r = await db.query("SELECT id::text FROM brands WHERE id = ANY($1::int[])", [brandIds]);
    r.rows.forEach((row) => valid.brands.add(String(row.id)));
  }
  const colorIds = toNums(collected.colors);
  if (colorIds.length) {
    const r = await db.query("SELECT id::text FROM colors WHERE id = ANY($1::int[])", [colorIds]);
    r.rows.forEach((row) => valid.colors.add(String(row.id)));
  }
  const collectionIds = toNums(collected.collections);
  if (collectionIds.length) {
    const r = await db.query("SELECT id::text FROM collections WHERE id = ANY($1::int[])", [collectionIds]);
    r.rows.forEach((row) => valid.collections.add(String(row.id)));
  }
  const sizeIds = toNums(collected.sizes);
  if (sizeIds.length) {
    const r = await db.query("SELECT id::text FROM sizes WHERE id = ANY($1::int[])", [sizeIds]);
    r.rows.forEach((row) => valid.sizes.add(String(row.id)));
  }
  return valid;
}
function prunePreferencesAgainstValidIds(prefs, valid) {
  const p = sanitizePreferences(prefs);
  let changed = false;
  for (const g of CATALOG_STATE_GENDERS) {
    const block = p.catalogState[g];
    if (!block || !block.filters) continue;
    for (const key of CATALOG_FILTER_KEYS) {
      const arr = block.filters[key];
      if (!Array.isArray(arr) || !arr.length) continue;
      const next = arr.filter((id) => valid[key].has(String(id)));
      if (next.length !== arr.length) {
        block.filters[key] = next;
        changed = true;
      }
    }
    const labels = block.filters.sizeLabels;
    if (labels && typeof labels === "object") {
      for (const k of Object.keys(labels)) {
        if (!valid.sizes.has(String(k))) {
          delete labels[k];
          changed = true;
        }
      }
    }
  }
  return { prefs: p, changed };
}
async function pruneCatalogFiltersAgainstDb(db, prefs) {
  const collected = collectCatalogFilterIdsFromPreferences(prefs);
  const hasAny = CATALOG_FILTER_KEYS.some((k) => collected[k].size > 0);
  if (!hasAny) return { prefs: sanitizePreferences(prefs), changed: false };
  const valid = await loadValidCatalogFilterIdSets(db, collected);
  return prunePreferencesAgainstValidIds(prefs, valid);
}
async function removeCatalogFilterIdsFromAllUsers(db, filterKey, ids) {
  const key = String(filterKey || "").trim();
  if (!CATALOG_FILTER_KEYS.includes(key)) return 0;
  const idList = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean))];
  if (!idList.length) return 0;
  const removals = { categories: [], brands: [], colors: [], collections: [], sizes: [] };
  removals[key] = idList;
  const r = await db.query(
    `SELECT id, preferences_json FROM users
     WHERE preferences_json IS NOT NULL
       AND preferences_json->'catalogState' IS NOT NULL
       AND preferences_json->'catalogState' <> '{}'::jsonb`
  );
  let updated = 0;
  for (const row of r.rows) {
    const { prefs, changed } = removeIdsFromPreferences(row.preferences_json, removals);
    if (!changed) continue;
    await db.query("UPDATE users SET preferences_json = $2::jsonb WHERE id = $1", [row.id, JSON.stringify(prefs)]);
    updated += 1;
  }
  return updated;
}
async function purgeExpiredEmailVerifications(db) {
  const r = await db.query("DELETE FROM email_verifications WHERE expires_at < NOW()");
  return r.rowCount || 0;
}
async function purgeExpiredSessions(db) {
  const r = await db.query('DELETE FROM session WHERE expire < NOW()');
  return r.rowCount || 0;
}
async function getUserLists(db, userId) {
  const r = await db.query(
    "SELECT cart_json, favorites_json, preferences_json FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const cartRaw = sanitizeListItems(row.cart_json);
  const favRaw = sanitizeListItems(row.favorites_json);
  const cart = await pruneListItemsAgainstProducts(db, cartRaw);
  const favorites = await pruneListItemsAgainstProducts(db, favRaw);
  let preferences = sanitizePreferences(row.preferences_json);
  const prunedPrefs = await pruneCatalogFiltersAgainstDb(db, preferences);
  preferences = prunedPrefs.prefs;
  const prefsChanged = prunedPrefs.changed;
  if (!listsPayloadEqual(cart, cartRaw) || !listsPayloadEqual(favorites, favRaw) || prefsChanged) {
    await db.query(
      "UPDATE users SET cart_json = $2::jsonb, favorites_json = $3::jsonb, preferences_json = $4::jsonb WHERE id = $1",
      [userId, JSON.stringify(cart), JSON.stringify(favorites), JSON.stringify(preferences)]
    );
  }
  return { cart, favorites, preferences };
}
async function setUserLists(db, userId, cart, favorites, preferences) {
  const cartSafe = await pruneListItemsAgainstProducts(db, sanitizeListItems(cart));
  const favSafe = await pruneListItemsAgainstProducts(db, sanitizeListItems(favorites));
  const prunedPrefs = await pruneCatalogFiltersAgainstDb(db, preferences);
  const prefsSafe = prunedPrefs.prefs;
  await db.query(
    "UPDATE users SET cart_json = $2::jsonb, favorites_json = $3::jsonb, preferences_json = $4::jsonb WHERE id = $1",
    [userId, JSON.stringify(cartSafe), JSON.stringify(favSafe), JSON.stringify(prefsSafe)]
  );
  return { cart: cartSafe, favorites: favSafe, preferences: prefsSafe };
}
async function ensureUserAuthSchema(db) {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        last_login TIMESTAMPTZ,
        email TEXT,
        email_verified BOOLEAN,
        oauth_provider TEXT,
        oauth_id TEXT,
        password_set BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await client.query(`UPDATE users SET is_active = TRUE WHERE is_active IS NULL`);
    try {
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
                 ON users (lower(trim(email::text)))
                 WHERE email IS NOT NULL AND trim(email::text) <> ''`
      );
    } catch (e) {
      console.warn("[schema] users_email_lower_uq \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D (\u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442\u044B email):", e && e.message);
      await client.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email) WHERE email IS NOT NULL"
      );
    }
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_uq ON users (oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL`
    );
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username)`);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_role'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT chk_user_role
            CHECK ((role)::text = ANY (
              (ARRAY['admin'::character varying, 'superadmin'::character varying, 'user'::character varying])::text[]
            ));
        END IF;
      END $$
    `);
    await client.query(`
      UPDATE users
      SET password_set = CASE WHEN oauth_provider IS NOT NULL THEN FALSE ELSE TRUE END
      WHERE password_set IS NULL
    `);
    await client.query(`
      UPDATE users SET email_verified = TRUE
      WHERE email_verified IS NULL AND email IS NOT NULL
    `);
    await client.query(
      `CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token_hash)`);
    await client.query(`CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS email_verifications (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                purpose TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS email_verifications_lookup_idx ON email_verifications (email, purpose, created_at DESC)`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS email_verifications_code_idx ON email_verifications (code_hash)`);
    await ensureUserListsColumns(client);
  } finally {
    client.release();
  }
}
async function ensureUserListsColumns(db) {
  await db.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS cart_json JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  await db.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS favorites_json JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  await db.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences_json JSONB NOT NULL DEFAULT '{"theme":"light","catalogPersist":true,"catalogState":{}}'::jsonb`
  );
}
module.exports.findUserByUsername = findUserByUsername;
module.exports.findUserById = findUserById;
module.exports.findUserByEmail = findUserByEmail;
module.exports.findUserByOAuth = findUserByOAuth;
module.exports.verifyUser = verifyUser;
module.exports.verifyUserByLogin = verifyUserByLogin;
module.exports.createUser = createUser;
module.exports.upsertOAuthUser = upsertOAuthUser;
module.exports.listUsers = listUsers;
module.exports.setUserActive = setUserActive;
module.exports.changeUserPassword = changeUserPassword;
module.exports.changeUserPasswordWithOld = changeUserPasswordWithOld;
module.exports.setInitialPasswordForOAuthUser = setInitialPasswordForOAuthUser;
module.exports.insertPasswordResetToken = insertPasswordResetToken;
module.exports.consumePasswordResetToken = consumePasswordResetToken;
module.exports.changeUsername = changeUsername;
module.exports.setUserRole = setUserRole;
module.exports.deleteUserById = deleteUserById;
module.exports.insertEmailVerificationCode = insertEmailVerificationCode;
module.exports.getLatestEmailVerification = getLatestEmailVerification;
module.exports.consumeEmailVerificationCode = consumeEmailVerificationCode;
module.exports.getUserLists = getUserLists;
module.exports.setUserLists = setUserLists;
module.exports.removeProductIdFromAllUserLists = removeProductIdFromAllUserLists;
module.exports.removeCatalogFilterIdsFromAllUsers = removeCatalogFilterIdsFromAllUsers;
module.exports.pruneCatalogFiltersAgainstDb = pruneCatalogFiltersAgainstDb;
module.exports.purgeExpiredEmailVerifications = purgeExpiredEmailVerifications;
module.exports.purgeExpiredSessions = purgeExpiredSessions;
module.exports.ensureUserAuthSchema = ensureUserAuthSchema;
module.exports.ensureUserListsColumns = ensureUserListsColumns;
