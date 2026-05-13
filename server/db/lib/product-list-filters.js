function applyActiveFilters(state, include_inactive, active) {
  if (!include_inactive) state.conditions.push("p.is_active = TRUE");
  if (!include_inactive || !active) return;
  const a = String(active).trim().toLowerCase();
  if (a === "active") state.conditions.push("p.is_active = TRUE");
  else if (a === "inactive") state.conditions.push("p.is_active = FALSE");
}
function applyGender(state, genderFilter) {
  const g = String(genderFilter || "").trim();
  if (!g) return;
  if (g === "mens" || g === "male") {
    state.conditions.push(`(p.gender IN ('mens', 'male'))`);
    return;
  }
  if (g === "womens" || g === "female") {
    state.conditions.push(`(p.gender IN ('womens', 'female'))`);
    return;
  }
  state.values.push(g);
  state.conditions.push(`p.gender = $${state.idx++}`);
}
function applyCategory(state, category) {
  if (!category) return;
  const cats = Array.isArray(category) ? category : String(category).split(",").map((s) => s.trim()).filter(Boolean);
  if (!cats.length) return;
  const placeholders = cats.map(() => `$${state.idx++}`).join(", ");
  cats.forEach((c) => state.values.push(c));
  state.conditions.push(`(
                p.category_id IN (
                    SELECT id FROM categories WHERE slug IN (${placeholders})
                )
                OR p.category_id IN (
                    SELECT c.id FROM categories c
                    JOIN categories parent ON c.parent_id = parent.id
                    WHERE parent.slug IN (${placeholders})
                )
            )`);
}
function applyBrand(state, brand) {
  if (!brand) return;
  const brands = Array.isArray(brand) ? brand : String(brand).split(",").map((s) => s.trim()).filter(Boolean);
  if (brands.length === 1) {
    state.values.push(brands[0]);
    state.conditions.push(`p.brand_id = (SELECT id FROM brands WHERE slug = $${state.idx++})`);
  } else if (brands.length > 1) {
    state.values.push(brands);
    state.conditions.push(`p.brand_id IN (SELECT id FROM brands WHERE slug = ANY($${state.idx++}))`);
  }
}
function applySeason(state, season) {
  if (!season) return;
  const seasons = Array.isArray(season) ? season : String(season).split(",").map((s) => s.trim()).filter(Boolean);
  if (seasons.length === 1) {
    state.values.push(seasons[0]);
    state.conditions.push(`p.season = $${state.idx++}`);
  } else if (seasons.length > 1) {
    state.values.push(seasons);
    state.conditions.push(`p.season = ANY($${state.idx++})`);
  }
}
function applyColorName(state, color) {
  if (!color) return;
  state.values.push(color);
  state.conditions.push(`EXISTS(
            SELECT 1 FROM product_variants pv
            JOIN colors col ON pv.color_id = col.id
            WHERE pv.product_id = p.id AND pv.is_active = TRUE AND col.name = $${state.idx++}
        )`);
}
function applySizeText(state, size) {
  const sizeText = String(size || "").trim();
  if (!sizeText) return;
  state.values.push(sizeText);
  state.conditions.push(`EXISTS(
                SELECT 1 FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = TRUE
                  AND pv.size_id IN (
                    SELECT DISTINCT x.eid
                    FROM (
                      SELECT m2.size_id AS eid
                      FROM sizes s_filter
                      INNER JOIN size_group_members m1 ON m1.size_id = s_filter.id
                      INNER JOIN size_group_members m2 ON m2.group_id = m1.group_id
                      WHERE lower(btrim(s_filter.value::text)) = lower(btrim($${state.idx}::text))
                      UNION
                      SELECT s_filter.id AS eid
                      FROM sizes s_filter
                      WHERE lower(btrim(s_filter.value::text)) = lower(btrim($${state.idx}::text))
                        AND NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = s_filter.id)
                    ) x
                  )
            )`);
  state.idx++;
}
function applyColorIds(state, color_id) {
  if (!color_id) return;
  const ids = Array.isArray(color_id) ? color_id : String(color_id).split(",").map((s) => s.trim()).filter(Boolean);
  const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (!nums.length) return;
  state.values.push(nums);
  state.conditions.push(`EXISTS(
                SELECT 1 FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.color_id = ANY($${state.idx++})
            )`);
}
function applySizeIds(state, size_id) {
  if (!size_id) return;
  const ids = Array.isArray(size_id) ? size_id : String(size_id).split(",").map((s) => s.trim()).filter(Boolean);
  const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (!nums.length) return;
  state.values.push(nums);
  state.conditions.push(`EXISTS(
                SELECT 1 FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = TRUE
                  AND pv.size_id IN (
                    SELECT DISTINCT x.eid
                    FROM (
                      SELECT m2.size_id AS eid
                      FROM unnest($${state.idx}::int[]) AS u(id)
                      INNER JOIN size_group_members m1 ON m1.size_id = u.id
                      INNER JOIN size_group_members m2 ON m2.group_id = m1.group_id
                      UNION
                      SELECT u.id AS eid
                      FROM unnest($${state.idx}::int[]) AS u(id)
                      WHERE NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = u.id)
                    ) x
                  )
            )`);
  state.idx++;
}
function applyCollectionIds(state, collection_id) {
  if (!collection_id) return;
  const ids = Array.isArray(collection_id) ? collection_id : String(collection_id).split(",").map((s) => s.trim()).filter(Boolean);
  const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return;
  state.values.push(nums);
  state.conditions.push(`EXISTS(
                SELECT 1 FROM product_collections pcx
                WHERE pcx.product_id = p.id AND pcx.collection_id = ANY($${state.idx++})
            )`);
}
function applySearch(state, q) {
  if (!q) return;
  const qText = String(q).trim();
  state.values.push(qText);
  state.conditions.push(`(
            to_tsvector('russian', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.materials,''))
            @@ plainto_tsquery('russian', $${state.idx++})
            OR p.name ILIKE '%' || $${state.idx - 1} || '%'
            OR p.art ILIKE '%' || $${state.idx - 1} || '%'
        )`);
}
function buildProductListWhere(genderParam, options) {
  const {
    category,
    q,
    brand,
    season,
    color,
    size,
    size_id,
    color_id,
    collection_id,
    active,
    sort_by,
    sort_direction,
    include_inactive,
    gender: genderOpt,
    limit = 20,
    offset = 0
  } = options || {};
  const genderFilter = (genderParam || genderOpt || "").trim();
  const state = { conditions: [], values: [], idx: 1 };
  applyActiveFilters(state, include_inactive, active);
  applyGender(state, genderFilter);
  applyCategory(state, category);
  applyBrand(state, brand);
  applySeason(state, season);
  applyColorName(state, color);
  applySizeText(state, size);
  applyColorIds(state, color_id);
  applySizeIds(state, size_id);
  applyCollectionIds(state, collection_id);
  applySearch(state, q);
  const allowedSort = { id: "p.id", name: "p.name", created_at: "p.created_at" };
  const sortField = allowedSort[sort_by] || "p.id";
  const direction = sort_direction === "asc" ? "ASC" : "DESC";
  return {
    conditions: state.conditions,
    values: state.values,
    idx: state.idx,
    sortField,
    direction,
    limit: Number(limit) || 20,
    offset: Number(offset) || 0
  };
}
module.exports = { buildProductListWhere };
