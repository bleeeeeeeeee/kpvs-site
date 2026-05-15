const otherScalesHintSubquery = `
    (
        SELECT string_agg(sm2.value, ', ' ORDER BY sm2.value)
        FROM size_group_members sgm2
        JOIN sizes sm2 ON sgm2.size_id = sm2.id
        WHERE sgm2.group_id = (
            SELECT sgm.group_id
            FROM size_group_members sgm
            WHERE sgm.size_id = s.id
            LIMIT 1
        )
        AND sm2.id <> s.id
    )
`;
const otherScalesHintSqlColumn = `${otherScalesHintSubquery} AS equivalent_hint`;
const allProductFields = `
        p.id,
        p.art,
        p.name,
        p.slug,
        p.description,
        p.materials,
        p.season,
        p.gender,
        p.is_active,
        p.created_at,
        p.updated_at,
        c.name AS category_name,
        c.slug AS category_slug,
        c.parent_id AS category_parent_id,
        pc.name AS category_parent_name,
        pc.slug AS category_parent_slug,
        b.name AS brand_name,
        b.slug AS brand_slug
`.trim();
module.exports = { otherScalesHintSubquery, otherScalesHintSqlColumn, allProductFields };
