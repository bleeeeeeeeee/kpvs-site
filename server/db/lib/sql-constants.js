const euReferenceSizeTypeSlugsSql = `(
    'eu_clothing', 'eu_footwear', 'eu_accessories', 'universal',
    'apparel', 'footwear'
)`;
const clothingTypeSlugsSql = `('eu_clothing', 'eu_accessories', 'apparel')`;
const footwearTypeSlugsSql = `('eu_footwear', 'footwear')`;

function sizeValueStrippedSql(col) {
  return `lower(btrim(regexp_replace(${col}::text, '^(eu|uk|us|ru)\\s+', '', 'i')))`;
}

const sValueStripped = sizeValueStrippedSql("s.value");
const euClothingLetterValueSql = `${sValueStripped} ~ '^(2xs|xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)$'`;
const euFootwearValueSql = `(
    ${sValueStripped} ~ '^[0-9]+([.,][0-9]+)?$'
    AND replace(${sValueStripped}, ',', '.')::numeric BETWEEN 35 AND 50
)`;
const sizeNotForeignScalePrefixSql = `NOT (lower(btrim(s.value::text)) ~ '^(ru|uk|us)\\s+')`;
const sizeEuClothingEtalonValueSql = `(
    lower(btrim(s.value::text)) ~ '^eu\\s+'
    OR lower(btrim(s.value::text)) !~ '^(eu|uk|us|ru)\\s+'
)`;

const sizeEuEtalonValueSql = `(
    ${sizeNotForeignScalePrefixSql}
    AND (
        (
            lower(btrim(st.slug::text)) IN ${clothingTypeSlugsSql}
            AND ${euClothingLetterValueSql}
            AND ${sizeEuClothingEtalonValueSql}
        )
        OR (
            lower(btrim(st.slug::text)) IN ${footwearTypeSlugsSql}
            AND ${euFootwearValueSql}
            AND (
                lower(btrim(s.value::text)) ~ '^eu\\s+'
                OR lower(btrim(s.value::text)) !~ '^(eu|uk|us|ru)\\s+'
            )
        )
        OR lower(btrim(st.slug::text)) = 'universal'
    )
)`;

const szValueStripped = sizeValueStrippedSql("sz.value");
const sizeEuEtalonPickInGroupSql = `(
    SELECT sz.id
    FROM size_group_members mxa
    JOIN sizes sz ON sz.id = mxa.size_id
    JOIN size_types stz ON stz.id = sz.size_type_id
    WHERE mxa.group_id = g.id
      AND NOT (lower(btrim(sz.value::text)) ~ '^(ru|uk|us)\\s+')
      AND (
        (
            lower(btrim(stz.slug::text)) IN ${clothingTypeSlugsSql}
            AND ${szValueStripped} ~ '^(2xs|xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)$'
            AND (
                lower(btrim(sz.value::text)) ~ '^eu\\s+'
                OR lower(btrim(sz.value::text)) !~ '^(eu|uk|us|ru)\\s+'
            )
        )
        OR (
            lower(btrim(stz.slug::text)) IN ${footwearTypeSlugsSql}
            AND ${szValueStripped} ~ '^[0-9]+([.,][0-9]+)?$'
            AND replace(${szValueStripped}, ',', '.')::numeric BETWEEN 35 AND 50
            AND (
                lower(btrim(sz.value::text)) ~ '^eu\\s+'
                OR lower(btrim(sz.value::text)) !~ '^(eu|uk|us|ru)\\s+'
            )
        )
        OR lower(btrim(stz.slug::text)) = 'universal'
      )
    ORDER BY
        CASE
            WHEN lower(btrim(sz.value::text)) ~ '^eu\\s+' THEN 0
            WHEN lower(btrim(stz.slug::text)) IN ${clothingTypeSlugsSql} THEN 1
            WHEN lower(btrim(stz.slug::text)) IN ${footwearTypeSlugsSql} THEN 2
            ELSE 3
        END,
        CASE lower(btrim(stz.slug::text))
            WHEN 'eu_clothing' THEN 0
            WHEN 'apparel' THEN 0
            WHEN 'eu_accessories' THEN 1
            WHEN 'eu_footwear' THEN 2
            WHEN 'footwear' THEN 2
            ELSE 3
        END,
        sz.id
    LIMIT 1
)`;

const sizeIsEuReferenceRowSql = `
    lower(btrim(st.slug::text)) IN ${euReferenceSizeTypeSlugsSql}
    AND ${sizeEuEtalonValueSql}
    AND (
        NOT EXISTS (SELECT 1 FROM size_group_members mx WHERE mx.size_id = s.id)
        OR EXISTS (
            SELECT 1
            FROM size_group_members mxg
            JOIN size_equiv_groups g ON g.id = mxg.group_id
            WHERE mxg.size_id = s.id
              AND s.id = ${sizeEuEtalonPickInGroupSql}
        )
    )`;

const sm2ValueStripped = sizeValueStrippedSql("sm2.value");
const otherScalesHintSubquery = `
    (
        SELECT string_agg(lbl, ', ' ORDER BY ord, mid)
        FROM (
            SELECT
                CASE
                    WHEN lower(btrim(COALESCE(st2.slug::text, ''))) LIKE '%ru%'
                        OR (
                            ${sm2ValueStripped} ~ '^[0-9]+([.,][0-9]+)?$'
                            AND lower(btrim(sm2.value::text)) !~ '^(eu|uk|us)\\s+'
                        ) THEN
                        'RU ' || btrim(regexp_replace(sm2.value::text, '^(ru|eu|uk|us)\\s+', '', 'i'))
                    WHEN lower(btrim(COALESCE(st2.slug::text, ''))) LIKE '%uk%'
                        OR lower(COALESCE(st2.name::text, '')) LIKE '%uk%'
                        OR lower(btrim(sm2.value::text)) ~ '^uk\\s+' THEN
                        'UK ' || btrim(regexp_replace(sm2.value::text, '^(uk|eu|us|ru)\\s+', '', 'i'))
                    WHEN lower(btrim(COALESCE(st2.slug::text, ''))) LIKE '%us%'
                        OR lower(COALESCE(st2.name::text, '')) LIKE '%us%'
                        OR lower(btrim(sm2.value::text)) ~ '^us\\s+' THEN
                        'US ' || btrim(regexp_replace(sm2.value::text, '^(us|eu|uk|ru)\\s+', '', 'i'))
                    ELSE btrim(sm2.value::text)
                END AS lbl,
                st2.id AS ord,
                sm2.id AS mid
            FROM size_group_members sgm2
            JOIN sizes sm2 ON sgm2.size_id = sm2.id
            JOIN size_types st2 ON st2.id = sm2.size_type_id
            WHERE sgm2.group_id = (
                SELECT sgm.group_id
                FROM size_group_members sgm
                WHERE sgm.size_id = s.id
                LIMIT 1
            )
              AND sm2.id <> s.id
              AND NOT (
                (
                    lower(btrim(st2.slug::text)) IN ${clothingTypeSlugsSql}
                    AND ${sm2ValueStripped} ~ '^(2xs|xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)$'
                    AND (
                        lower(btrim(sm2.value::text)) ~ '^eu\\s+'
                        OR lower(btrim(sm2.value::text)) !~ '^(eu|uk|us|ru)\\s+'
                    )
                )
                OR (
                    lower(btrim(st2.slug::text)) IN ${footwearTypeSlugsSql}
                    AND ${sm2ValueStripped} ~ '^[0-9]+([.,][0-9]+)?$'
                    AND replace(${sm2ValueStripped}, ',', '.')::numeric BETWEEN 35 AND 50
                    AND (
                        lower(btrim(sm2.value::text)) ~ '^eu\\s+'
                        OR lower(btrim(sm2.value::text)) !~ '^(eu|uk|us|ru)\\s+'
                    )
                )
                OR lower(btrim(st2.slug::text)) = 'universal'
              )
        ) hint_rows
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
        b.name AS brand_name,
        b.slug AS brand_slug
    `;
const sizeRowDisplayOrderSql = `
  CASE lower(btrim(COALESCE(st.slug::text, '')))
    WHEN 'eu_clothing' THEN (
      CASE lower(btrim(s.value::text))
        WHEN '2xs' THEN 1 WHEN 'xxs' THEN 1
        WHEN 'xs' THEN 2
        WHEN 's' THEN 3
        WHEN 'm' THEN 4
        WHEN 'l' THEN 5
        WHEN 'xl' THEN 6
        WHEN 'xxl' THEN 7 WHEN '2xl' THEN 7
        WHEN '3xl' THEN 8
        ELSE 100
      END
    )
    WHEN 'eu_accessories' THEN (
      CASE lower(btrim(s.value::text))
        WHEN '2xs' THEN 1 WHEN 'xxs' THEN 1
        WHEN 'xs' THEN 2
        WHEN 's' THEN 3
        WHEN 'm' THEN 4
        WHEN 'l' THEN 5
        WHEN 'xl' THEN 6
        WHEN 'xxl' THEN 7 WHEN '2xl' THEN 7
        WHEN '3xl' THEN 8
        ELSE 50
      END
    )
    WHEN 'eu_footwear' THEN (
      LEAST(200, GREATEST(0, COALESCE(NULLIF(regexp_replace(btrim(s.value::text), ',', '.', 'g'), '')::numeric, 999)))
    )
    WHEN 'universal' THEN (
      CASE lower(btrim(s.value::text))
        WHEN 'универсальный' THEN 1
        WHEN 'универсальный размер' THEN 1
        WHEN 'os' THEN 1
        WHEN 'one size' THEN 1
        WHEN 'osfm' THEN 2
        WHEN 'без размера' THEN 3
        WHEN 'xxs/xs' THEN 10
        WHEN 'xs/s' THEN 11
        WHEN 's/m' THEN 12
        WHEN 'm/l' THEN 13
        WHEN 'l/xl' THEN 14
        WHEN 'xl/xxl' THEN 15
        WHEN 'xl/2xl' THEN 15
        ELSE 90
      END
    )
    ELSE 0
  END
`;

module.exports = {
  otherScalesHintSubquery,
  otherScalesHintSqlColumn,
  allProductFields,
  euReferenceSizeTypeSlugsSql,
  sizeIsEuReferenceRowSql,
  sizeEuEtalonValueSql,
  sizeRowDisplayOrderSql
};
