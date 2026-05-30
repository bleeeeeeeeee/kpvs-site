const { otherScalesHintSqlColumn, sizeIsEuReferenceRowSql, sizeRowDisplayOrderSql } = require("../lib/sql-constants");
const SIZE_GRID_SLUGS_CLOTHING = Object.freeze(["eu_clothing"]);
const SIZE_GRID_SLUGS_FOOTWEAR = Object.freeze(["eu_footwear"]);
const SIZE_GRID_SLUGS_ACCESSORIES = Object.freeze(["eu_accessories", "universal"]);
const SIZE_GRID_SLUGS_PPE = Object.freeze(["eu_clothing", "eu_accessories", "universal"]);
const SIZE_GRID_DEFAULT = Object.freeze(["eu_clothing", "universal"]);
function classifyCategorySizeTypeSlugs(name, slug) {
  const raw = `${String(name || "")} ${String(slug || "")}`.toLowerCase().replace(/[_-]+/g, " ");
  const tokens = raw.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
  const hay = ` ${tokens.join(" ")} `;
  const gloveRe = /(?:^|\s)(?:перчат|рукавиц|gloves?)(?:[a-zа-яё]*)?(?:\s|$)/i;
  const footRe = /(?:^|\s)(?:обувь|обуви|обувью|обувей|ботинк|сапог|кроссовк|тапочк|босоножк|валенк|мокасин|лофер|слипон|туфл|сабо|угг|эспадриль)(?:[a-zа-яё]*)?(?:\s|$)/i;
  const appRe = /(?:^|\s)(?:спецодежд|одежд|костюм|куртк|брюк|рубашк|жилет|фартук|комбинезон|платье|юбк|свитер|поло|футболк|халат|трикотаж|пальто|пиджак|сорочк|шорт|трус|лифчик|пижам|худи|свитшот|кардиган|пончо|носк|колгот|легинс|манишк|торгов|вещев|одежн|форм)(?:[a-zа-яё]*)?(?:\s|$)/i;
  const accRe = /(?:^|\s)(?:аксесс|сумк|рюкзак|кошел|клатч|портфел|портмон|ремен|галстук|шарф|шапк|кепк|бейсбол|панам|нарук|очк|зонт|платок|косынк|подтяжк|украшен|бижутер|часы|заколк|бусы|кольцо|браслет|серьг|цепочк|чехол|ремен|коврик|ременн|ремень|ремени|ременя)/i.test(
    hay
  ) || /(?:^|\s)(?:аксесс|сумк|рюкзак|ремен|шарф|шапк|кепк|зонт)/i.test(` ${String(slug || "").toLowerCase().replace(/[_-]+/g, " ")} `);
  const slugStr = String(slug || "").toLowerCase();
  const slugSegs = slugStr.split(/[/_.-]+/).filter(Boolean);
  const slugSegFoot = slugSegs.some(function(s) {
    return /^(obuv|footwear|shoe|boots?|sneakers?|tapoch|tapocek)$/i.test(s);
  });
  const slugSegApp = slugSegs.some(function(s) {
    return /^(odezhda|odezda|cloth(?:ing)?|shirt|pants|jacket|apparel|specodezhd|trikotazh|rubashka|coat|vest)$/i.test(s) || /^kurtk/i.test(s) || /^raboch/i.test(s) || /^specodezhd/i.test(s);
  });
  const slugSegAcc = slugSegs.some(function(s) {
    return /^(aksess|accessories|bags|belt|scarf|hat|gloves|jewelry|sumki|ryukzak)$/i.test(s);
  });
  const slugSegUnisex = slugSegs.some(function(s) {
    return /^(unisex|univ|universal)$/i.test(s);
  });
  const haySlug = ` ${raw.replace(/\s+/g, " ").trim()} `;
  const specFootwearCompound = /спецобув|specobuv|spec-?obuv|spec.?footwear/i.test(raw);
  const slugSegPpe = slugSegs.some(function(s) {
    return /^(siz|ppe|epi|epi\-|respirator|kaska|kasok|zashchit|zashit|sredstva|kragi|schitok|schit|protivogaz|mask|safety)$/i.test(
      s
    );
  });
  const ppeRe = /(?:^|\s)(?:сиз\b|ср\.?\s*сз|средств\w*\s+защит|индивидуал\w*\s+защит|средств\w*\s+индивидуал|респиратор|противогаз|антишум|каска|наушник\w*\s+против|защитн\w*\s+очк|щиток|краг|нарукавник|напальчник|капюшон\w*\s+к\s+каск|подшлемник|визор|наплечник|наколенник|налокотник|страховочн\w*\s+пояс)/i.test(
    hay
  ) || /(?:^|\s)(?:сиз\b|средств\w*\s+защит|индивидуал\w*\s+защит|респиратор|противогаз|каска)/i.test(haySlug) || slugSegPpe;
  const unisexHay = /(?:^|\s)(?:унисекс|unisex|универсал|для\s+всех|для\s+люб)/i.test(hay) || /(?:^|\s)(?:унисекс|unisex|универсал)/i.test(haySlug) || slugSegUnisex;
  if (gloveRe.test(hay) || gloveRe.test(haySlug)) return Array.from(SIZE_GRID_SLUGS_ACCESSORIES);
  const hasFt = footRe.test(hay) || footRe.test(haySlug) || slugSegFoot || specFootwearCompound;
  if (hasFt) return Array.from(SIZE_GRID_SLUGS_FOOTWEAR);
  if (ppeRe) return Array.from(SIZE_GRID_SLUGS_PPE);
  if (accRe || slugSegAcc) return Array.from(SIZE_GRID_SLUGS_ACCESSORIES);
  const hasApp = appRe.test(hay) || slugSegApp || /(?:^|\s)рабоч(?:[a-zа-яё]*)?(?:\s|$)/i.test(hay);
  if (hasApp) {
    return unisexHay ? Array.from(SIZE_GRID_DEFAULT) : Array.from(SIZE_GRID_SLUGS_CLOTHING);
  }
  if (unisexHay) return Array.from(SIZE_GRID_DEFAULT);
  return Array.from(SIZE_GRID_DEFAULT);
}
async function getSizes(pool, categoryId, options = {}) {
  const cid = Number(categoryId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return [];
  }
  const euEtalonOnly = options.euEtalonOnly === true;
  const etalonClause = euEtalonOnly ? `AND ${sizeIsEuReferenceRowSql}` : "";
  const result = await pool.query(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM categories WHERE id = $1::int
      UNION ALL
      SELECT p.id, p.parent_id
      FROM categories p
      INNER JOIN ancestors a ON p.id = a.parent_id
    )
    SELECT s.id, s.value, s.size_type_id, st.name AS size_type,
      COALESCE(NULLIF(btrim(st.slug::text), ''), '') AS size_type_slug,
      ${otherScalesHintSqlColumn}
    FROM sizes s
    JOIN size_types st ON s.size_type_id = st.id
    WHERE s.size_type_id IN (
      SELECT cst.size_type_id
      FROM category_size_types cst
      WHERE cst.category_id IN (SELECT id FROM ancestors)
    )
      ${etalonClause}
    ORDER BY ${sizeRowDisplayOrderSql}, s.id
    `,
    [cid]
  );
  return result.rows;
}
async function getSizeTypes(pool) {
  const r = await pool.query(`
    SELECT id, name, COALESCE(NULLIF(btrim(slug::text), ''), '') AS slug
    FROM size_types
    ORDER BY id
`);
  return r.rows;
}
async function getCategorySizeTypeLinks(pool) {
  const r = await pool.query(
    "SELECT category_id, size_type_id FROM category_size_types ORDER BY category_id, size_type_id"
  );
  return r.rows.map((row) => ({
    category_id: Number(row.category_id),
    size_type_id: Number(row.size_type_id)
  }));
}
async function reconcileCanonicalSizeTypeSlugs(pool) {
  const { rows } = await pool.query("SELECT id, name, slug FROM size_types ORDER BY id");
  if (!rows.length) return;

  const ln = (s) => String(s || "").toLowerCase();
  const slugOf = (id) => {
    const row = rows.find((r) => Number(r.id) === id);
    return row ? ln(row.slug).trim() : "";
  };
  const byExactName = (exact) => {
    const e = exact.toLowerCase();
    for (const r of rows) {
      if (ln(r.name) === e) return Number(r.id);
    }
    return null;
  };
  const byNameStarts = (prefix) => {
    const p = prefix.toLowerCase();
    for (const r of rows) {
      const n = ln(r.name);
      if (n === p || n.startsWith(p + " ") || n.startsWith(p + "(")) return Number(r.id);
    }
    return null;
  };
  const pickId = (pred) => {
    for (const r of rows) {
      if (pred(ln(r.name))) return Number(r.id);
    }
    return null;
  };
  const gloveId = byExactName("\u043F\u0435\u0440\u0447\u0430\u0442\u043A\u0438") || byNameStarts("\u043F\u0435\u0440\u0447\u0430\u0442\u043A\u0438") || pickId(
    (n) => /^(перчат|рукавиц)/.test(n) || /\bперчат/.test(n) || /\bрукавиц/.test(n) || /\bgloves?\b/.test(n)
  );
  const footId = byExactName("\u043E\u0431\u0443\u0432\u044C") || byNameStarts("\u043E\u0431\u0443\u0432\u044C") || pickId(
    (n) => /обув|ботин|сапог|кроссов|тапоч|босонож|валенк|мокасин|лофер|слипон|туфл|сабо|угг/.test(n) && !/одежд|спецодежд|трикотаж|костюм|бель|брюк|куртк|рубашк|свитер|футболк|поло|халат|пальто|пиджак|сорочк|шорт|платье|юбк|жилет|комбинезон|фартук|манишк|худи|свитшот|кардиган|пончо|носк|колгот|легинс|трус|лифчик|пижам|манжет|воротник/.test(
      n
    )
  );
  const appId = byExactName("\u043E\u0434\u0435\u0436\u0434\u0430") || byNameStarts("\u043E\u0434\u0435\u0436\u0434\u0430") || pickId(
    (n) => /одежд|спецодежд|трикотаж|костюм|бель|брюк|куртк|рубашк|свитер|футболк|поло|халат|пальто|пиджак|сорочк|шорт|платье|юбк|жилет|комбинезон|фартук|манишк|худи|свитшот|кардиган|пончо|носк|колгот|легинс|трус|лифчик|пижам|манжет|воротник|размер/.test(
      n
    ) && !/обув|ботин|сапог|кроссов|тапоч|босонож|валенк|мокасин|лофер|туфл|сабо|угг/.test(n)
  );

  const assigns = [
    [gloveId, "gloves"],
    [footId, "footwear"],
    [appId, "apparel"]
  ].filter(([id]) => id != null && Number.isFinite(id) && id > 0);

  if (!assigns.length) return;

  let needsWork = false;
  for (const [id, slug] of assigns) {
    if (slugOf(id) !== slug) {
      needsWork = true;
      break;
    }
  }
  if (!needsWork) return;

  for (const [id, slug] of assigns) {
    if (slugOf(id) === slug) continue;
    const conflict = rows.find((r) => ln(r.slug).trim() === slug && Number(r.id) !== id);
    if (conflict) {
      await pool.query(
        "UPDATE size_types SET slug = 'stype-' || id::text WHERE id = $1 AND lower(btrim(COALESCE(slug, ''))) = $2",
        [conflict.id, slug]
      );
    }
    await pool.query(
      "UPDATE size_types SET slug = $1 WHERE id = $2 AND lower(btrim(COALESCE(slug, ''))) <> $1",
      [slug, id]
    );
  }
}
async function ensureCategorySizeTypesSchema(pool) {
  await pool.query("ALTER TABLE size_types ADD COLUMN IF NOT EXISTS slug TEXT");
  try {
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS size_types_slug_lower_uq
        ON size_types (lower(btrim(slug)))
        WHERE slug IS NOT NULL AND btrim(slug::text) <> ''
    `);
  } catch (e) {
    console.warn("[schema] size_types_slug_lower_uq:", e && e.message);
  }
  const types = await pool.query(`
    SELECT id, name FROM size_types
    WHERE slug IS NULL OR btrim(slug::text) = ''
    ORDER BY id
  `);
  for (const t of types.rows) {
    const base = slugify(String(t.name || "type")) || "type";
    await pool.query("UPDATE size_types SET slug = $1 WHERE id = $2", [`${base}-${t.id}`, t.id]);
  }
  await reconcileCanonicalSizeTypeSlugs(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_size_types (
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        size_type_id INTEGER NOT NULL REFERENCES size_types(id) ON DELETE CASCADE,
        PRIMARY KEY (category_id, size_type_id)
    )
`);
}
async function ensureSizeGroupsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS size_equiv_groups (
        id SERIAL PRIMARY KEY,
        label TEXT,
        canonical_size_id INTEGER NOT NULL REFERENCES sizes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS size_group_members (
        group_id INTEGER NOT NULL REFERENCES size_equiv_groups(id) ON DELETE CASCADE,
        size_id INTEGER NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, size_id),
        CONSTRAINT size_group_members_size_id_key UNIQUE (size_id)
    );
    CREATE INDEX IF NOT EXISTS size_group_members_gid_idx ON size_group_members (group_id);
`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const oldTab = await client.query(`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'size_equivalents'
        ) AS e
    `);
    if (oldTab.rows[0].e) {
      const gcount = await client.query("SELECT COUNT(*)::int AS c FROM size_equiv_groups");
      if (Number(gcount.rows[0].c) === 0) {
        let find2 = function(x) {
          if (!parent.has(x)) parent.set(x, x);
          const p = parent.get(x);
          if (p !== x) {
            const r = find2(p);
            parent.set(x, r);
            return r;
          }
          return x;
        }, union2 = function(a, b) {
          let ra = find2(a);
          let rb = find2(b);
          if (ra === rb) return;
          if (ra > rb) [ra, rb] = [rb, ra];
          parent.set(rb, ra);
        };
        var find = find2, union = union2;
        const edges = await client.query("SELECT size_a, size_b FROM size_equivalents");
        const parent = new Map();
        const nodes = new Set();
        for (const row of edges.rows) {
          const a = Number(row.size_a);
          const b = Number(row.size_b);
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          nodes.add(a);
          nodes.add(b);
          union2(a, b);
        }
        const comps = new Map();
        for (const id of nodes) {
          const r = find2(id);
          if (!comps.has(r)) comps.set(r, []);
          comps.get(r).push(id);
        }
        for (const members of comps.values()) {
          members.sort((x, y) => x - y);
          const canonical = members[0];
          const ins = await client.query(
            `INSERT INTO size_equiv_groups (label, canonical_size_id) VALUES ($1, $2) RETURNING id`,
            [`\u042D\u043A\u0432\u0438\u0432\u0430\u043B\u0435\u043D\u0442\u044B (\u043C\u0438\u0433\u0440\u0430\u0446\u0438\u044F) ${canonical}`, canonical]
          );
          const gid = ins.rows[0].id;
          for (const sid of members) {
            await client.query(
              `INSERT INTO size_group_members (group_id, size_id) VALUES ($1, $2)`,
              [gid, sid]
            );
          }
        }
      }
      await client.query("DROP TABLE IF EXISTS size_equivalents CASCADE");
    }
    await client.query(`
        UPDATE product_variants pv
        SET size_id = g.canonical_size_id
        FROM size_group_members m
        JOIN size_equiv_groups g ON g.id = m.group_id
        WHERE pv.size_id = m.size_id
          AND pv.size_id IS DISTINCT FROM g.canonical_size_id
    `);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw e;
  } finally {
    client.release();
  }
}
async function listSizeGroups(pool) {
  const r = await pool.query(`
    SELECT g.id, g.label, g.canonical_size_id AS stored_size_id,
        json_agg(json_build_object(
            'size_id', s.id,
            'value', s.value,
            'size_type', st.name,
            'size_type_id', s.size_type_id
        ) ORDER BY st.name, s.value) AS members
    FROM size_equiv_groups g
    JOIN size_group_members m ON m.group_id = g.id
    JOIN sizes s ON s.id = m.size_id
    JOIN size_types st ON st.id = s.size_type_id
    GROUP BY g.id, g.label, g.canonical_size_id
    ORDER BY g.id
`);
  return r.rows;
}
async function createSizeGroup(pool, data) {
  const raw = data || {};
  const label = raw.label != null && String(raw.label).trim() ? String(raw.label).trim() : null;
  let stored;
  let all;
  if (Array.isArray(raw.size_ids) && raw.size_ids.length) {
    all = [...new Set(raw.size_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (all.length < 2) {
      throw new Error("\u0412 size_ids \u043D\u0443\u0436\u043D\u043E \u043C\u0438\u043D\u0438\u043C\u0443\u043C \u0434\u0432\u0430 \u0440\u0430\u0437\u043D\u044B\u0445 id");
    }
    stored = Number(raw.stored_as_size_id);
    if (!Number.isFinite(stored) || stored <= 0) {
      throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 stored_as_size_id \u2014 \u043E\u0434\u0438\u043D \u0438\u0437 size_ids, \u043E\u043D \u043F\u043E\u043F\u0430\u0434\u0451\u0442 \u0432 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u044B \u0442\u043E\u0432\u0430\u0440\u0430");
    }
    if (!all.includes(stored)) {
      throw new Error("stored_as_size_id \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0432 \u0441\u043F\u0438\u0441\u043A\u0435 size_ids");
    }
  } else {
    const canonical = Number(raw.canonical_size_id);
    const mem = Array.isArray(raw.member_size_ids) ? raw.member_size_ids : [];
    const extra = mem.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const allSet = new Set(extra);
    if (Number.isFinite(canonical) && canonical > 0) allSet.add(canonical);
    all = [...allSet];
    if (all.length < 2) {
      throw new Error(
        "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 { size_ids, stored_as_size_id } \u0438\u043B\u0438 \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442 { canonical_size_id, member_size_ids }"
      );
    }
    if (!Number.isFinite(canonical) || canonical <= 0 || !allSet.has(canonical)) {
      throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 canonical_size_id \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 \u0447\u043B\u0435\u043D\u043E\u0432 \u0433\u0440\u0443\u043F\u043F\u044B");
    }
    stored = canonical;
  }
  const ex = await pool.query("SELECT COUNT(*)::int AS c FROM sizes WHERE id = ANY($1::int[])", [all]);
  if (Number(ex.rows[0].c) !== all.length) throw new Error("\u041E\u0434\u0438\u043D \u0438\u0437 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  const conflict = await pool.query(
    "SELECT 1 FROM size_group_members WHERE size_id = ANY($1::int[]) LIMIT 1",
    [all]
  );
  if (conflict.rows.length) throw new Error("\u041E\u0434\u0438\u043D \u0438\u0437 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432 \u0443\u0436\u0435 \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u0435");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO size_equiv_groups (label, canonical_size_id) VALUES ($1, $2) RETURNING id`,
      [label, stored]
    );
    const gid = ins.rows[0].id;
    for (const sid of all) {
      await client.query(
        `INSERT INTO size_group_members (group_id, size_id) VALUES ($1, $2)`,
        [gid, sid]
      );
    }
    await client.query(
      `
        UPDATE product_variants pv
        SET size_id = $1
        FROM size_group_members m
        WHERE m.group_id = $2
          AND pv.size_id = m.size_id
          AND pv.size_id IS DISTINCT FROM $1
        `,
      [stored, gid]
    );
    await client.query("COMMIT");
    return { id: gid, label, stored_size_id: stored, size_ids: all };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw e;
  } finally {
    client.release();
  }
}
async function deleteSizeGroup(pool, groupId) {
  const gid = Number(groupId);
  if (!Number.isFinite(gid) || gid <= 0) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 id \u0433\u0440\u0443\u043F\u043F\u044B");
  const r = await pool.query("DELETE FROM size_equiv_groups WHERE id = $1 RETURNING id", [gid]);
  if (!r.rows.length) throw new Error("\u0413\u0440\u0443\u043F\u043F\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
  return { ok: true, id: gid };
}
async function listSizeEquivalenceBuckets(pool) {
  const r = await pool.query(`
    SELECT COALESCE(json_agg(m.size_id ORDER BY m.size_id) FILTER (WHERE m.size_id IS NOT NULL), '[]'::json) AS size_ids
    FROM size_group_members m
    GROUP BY m.group_id
    HAVING COUNT(*) >= 2
`);
  return r.rows.map(function(row) {
    return { size_ids: row.size_ids };
  });
}
async function expandSizeIdsForEquivalence(pool, sizeIds, db) {
  const q = db !== void 0 && db !== null ? db : pool;
  const ids = [...new Set((sizeIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const r = await q.query(
    `
    SELECT DISTINCT x.eid AS id
    FROM (
        SELECT m2.size_id AS eid
        FROM unnest($1::int[]) AS u(id)
        INNER JOIN size_group_members m1 ON m1.size_id = u.id
        INNER JOIN size_group_members m2 ON m2.group_id = m1.group_id
        UNION
        SELECT u.id AS eid
        FROM unnest($1::int[]) AS u(id)
        WHERE NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = u.id)
    ) x
    `,
    [ids]
  );
  return r.rows.map((row) => Number(row.id)).filter((n) => Number.isFinite(n) && n > 0);
}
async function storedSizeIdForVariant(pool, sizeId, db) {
  const q = db !== void 0 && db !== null ? db : pool;
  const sid = Number(sizeId);
  if (!Number.isFinite(sid) || sid <= 0) return null;
  const r = await q.query(
    `
    SELECT g.canonical_size_id
    FROM size_group_members m
    JOIN size_equiv_groups g ON g.id = m.group_id
    WHERE m.size_id = $1
    LIMIT 1
    `,
    [sid]
  );
  if (r.rows.length) return Number(r.rows[0].canonical_size_id);
  return sid;
}
async function ensureSizesUniqueValueIndex(pool) {
  try {
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS sizes_type_value_lower_uq
        ON sizes (size_type_id, lower(btrim(value)))
    `);
  } catch (e) {
    console.warn("[schema] sizes_type_value_lower_uq:", e && e.message);
  }
}
async function createSize(pool, data) {
  const value = String(data.value || "").trim();
  if (!value) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0431\u043E\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0440\u0430\u0437\u043C\u0435\u0440\u0430 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 2XL \u0438\u043B\u0438 42 \u0434\u043B\u044F \u043E\u0431\u0443\u0432\u0438)");
  let typeId = Number(data.size_type_id);
  if (!Number.isFinite(typeId) || typeId <= 0) {
    const t = await pool.query("SELECT id FROM size_types ORDER BY id LIMIT 1");
    if (!t.rows.length) throw new Error("\u0412 \u0431\u0430\u0437\u0435 \u043D\u0435\u0442 \u0442\u0438\u043F\u043E\u0432 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432");
    typeId = Number(t.rows[0].id);
  }
  const ex = await pool.query(
    "SELECT id, value FROM sizes WHERE size_type_id = $1 AND lower(btrim(value)) = lower(btrim($2))",
    [typeId, value]
  );
  if (ex.rows.length) return ex.rows[0];
  try {
    const ins = await pool.query(
      "INSERT INTO sizes (size_type_id, value) VALUES ($1, $2) RETURNING id, value",
      [typeId, value]
    );
    return ins.rows[0];
  } catch (e) {
    if (String(e.code) === "23505") {
      const again = await pool.query(
        "SELECT id, value FROM sizes WHERE size_type_id = $1 AND lower(btrim(value)) = lower(btrim($2))",
        [typeId, value]
      );
      if (again.rows.length) return again.rows[0];
    }
    throw e;
  }
}
module.exports.getSizes = getSizes;
module.exports.getSizeTypes = getSizeTypes;
module.exports.getCategorySizeTypeLinks = getCategorySizeTypeLinks;
module.exports.reconcileCanonicalSizeTypeSlugs = reconcileCanonicalSizeTypeSlugs;
module.exports.ensureCategorySizeTypesSchema = ensureCategorySizeTypesSchema;
module.exports.syncCategorySizeTypes = ensureCategorySizeTypesSchema;
module.exports.ensureSizeGroupsSchema = ensureSizeGroupsSchema;
module.exports.listSizeGroups = listSizeGroups;
module.exports.getSizeGroups = listSizeGroups;
module.exports.createSizeGroup = createSizeGroup;
module.exports.deleteSizeGroup = deleteSizeGroup;
module.exports.listSizeEquivalenceBuckets = listSizeEquivalenceBuckets;
module.exports.getEquivalentGroups = listSizeEquivalenceBuckets;
module.exports.expandSizeIdsForEquivalence = expandSizeIdsForEquivalence;
module.exports.storedSizeIdForVariant = storedSizeIdForVariant;
module.exports.ensureSizesUniqueValueIndex = ensureSizesUniqueValueIndex;
module.exports.createSize = createSize;
