CREATE OR REPLACE TABLE monthly_country AS
SELECT month, country,
    CAST(sum(CASE WHEN line_type = 'sale' THEN signed_amount ELSE 0 END) AS DECIMAL(18,4)) AS gross_sales,
    CAST(sum(CASE WHEN line_type = 'credit' THEN -signed_amount ELSE 0 END) AS DECIMAL(18,4)) AS credits,
    CAST(sum(signed_amount) AS DECIMAL(18,4)) AS net_sales,
    count(DISTINCT invoice) FILTER (WHERE line_type = 'sale') AS orders,
    sum(CASE WHEN line_type = 'sale' THEN quantity ELSE 0 END)::BIGINT AS units_sold,
    sum(CASE WHEN line_type = 'credit' THEN -quantity ELSE 0 END)::BIGINT AS units_credited
FROM included_lines GROUP BY month, country ORDER BY month, country;

CREATE OR REPLACE TABLE monthly_country_product AS
WITH labels AS (
    SELECT stock_code, description,
        row_number() OVER (PARTITION BY stock_code ORDER BY count(*) DESC, description) AS position
    FROM included_lines GROUP BY stock_code, description
)
SELECT t.month, t.country, t.stock_code, l.description,
    CAST(sum(CASE WHEN t.line_type = 'sale' THEN signed_amount ELSE 0 END) AS DECIMAL(18,4)) AS gross_sales,
    CAST(sum(CASE WHEN t.line_type = 'credit' THEN -signed_amount ELSE 0 END) AS DECIMAL(18,4)) AS credits,
    CAST(sum(signed_amount) AS DECIMAL(18,4)) AS net_sales,
    count(DISTINCT invoice) FILTER (WHERE line_type = 'sale') AS orders,
    sum(CASE WHEN line_type = 'sale' THEN quantity ELSE 0 END)::BIGINT AS units_sold,
    sum(CASE WHEN line_type = 'credit' THEN -quantity ELSE 0 END)::BIGINT AS units_credited
FROM included_lines t JOIN labels l ON t.stock_code = l.stock_code AND l.position = 1
GROUP BY t.month, t.country, t.stock_code, l.description
ORDER BY t.month, t.country, t.stock_code;
