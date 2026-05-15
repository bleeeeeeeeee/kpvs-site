const otherScalesHintSubquery = `
    (
        SELECT string_agg(partner_label, ' \xB7 ' ORDER BY partner_label)
        FROM (
            SELECT DISTINCT ste.name || ': ' || sp.value AS partner_label
            FROM size_group_members m_self
            JOIN size_group_members m_other
              ON m_other.group_id = m_self.group_id AND m_other.size_id <> m_self.size_id
            JOIN sizes sp ON sp.id = m_other.size_id
            JOIN size_types ste ON ste.id = sp.size_type_id
            WHERE m_self.size_id = s.id
        ) eqs
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
