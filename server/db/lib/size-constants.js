const { otherScalesHintSubquery, otherScalesHintSqlColumn } = require("./sql-constants");
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
        WHEN '\u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439' THEN 1
        WHEN '\u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440' THEN 1
        WHEN 'os' THEN 1
        WHEN 'one size' THEN 1
        WHEN 'osfm' THEN 2
        WHEN '\u0431\u0435\u0437 \u0440\u0430\u0437\u043C\u0435\u0440\u0430' THEN 3
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
module.exports = { otherScalesHintSubquery, otherScalesHintSqlColumn, sizeRowDisplayOrderSql };
