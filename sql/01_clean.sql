CREATE OR REPLACE TABLE transaction_lines AS
SELECT *,
    CASE
        WHEN invoice IS NULL OR NOT regexp_full_match(invoice, 'C?[0-9]{6}') THEN 'invalid_invoice'
        WHEN invoice_date IS NULL THEN 'invalid_date'
        WHEN quantity IS NULL OR quantity = 0 THEN 'invalid_quantity'
        WHEN unit_price IS NULL OR unit_price <= 0 THEN 'nonpositive_or_invalid_price'
        WHEN stock_code IS NULL OR NOT regexp_full_match(stock_code, '[0-9]{5}[A-Z]{0,2}') THEN 'non_merchandise_code'
        WHEN starts_with(invoice, 'C') AND quantity > 0 THEN 'cancel_invoice_positive_quantity'
        ELSE NULL
    END AS exclusion_reason,
    CAST(quantity * unit_price AS DECIMAL(18,4)) AS signed_amount,
    strftime(invoice_date, '%Y-%m') AS month
FROM normalized_lines;

CREATE OR REPLACE VIEW included_lines AS
SELECT *, CASE WHEN quantity > 0 THEN 'sale' ELSE 'credit' END AS line_type
FROM transaction_lines WHERE exclusion_reason IS NULL;

CREATE OR REPLACE VIEW sales_lines AS
SELECT * FROM included_lines WHERE line_type = 'sale';
