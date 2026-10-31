CREATE OR REPLACE TABLE customer_rfm_private AS
WITH rfm AS (
    SELECT customer_id, date_diff('day', max(invoice_date)::DATE, $as_of::DATE) AS recency_days,
        count(DISTINCT invoice) AS frequency,
        sum(signed_amount)::DECIMAL(18,4) AS monetary
    FROM sales_lines WHERE customer_id IS NOT NULL GROUP BY customer_id
)
SELECT *, CASE
    WHEN recency_days <= 30 AND frequency >= 5 THEN 'Recent frequent buyers'
    WHEN recency_days > 90 AND frequency >= 2 THEN 'Lapsed repeat buyers'
    WHEN frequency >= 5 THEN 'Other frequent buyers'
    WHEN frequency >= 2 THEN 'Other repeat buyers'
    ELSE 'One-time buyers'
END AS segment FROM rfm;

CREATE OR REPLACE TABLE customer_segments AS
SELECT segment, count(*) AS customers, sum(monetary)::DECIMAL(18,4) AS monetary,
    round(avg(recency_days), 4) AS avg_recency_days, round(avg(frequency), 4) AS avg_frequency
FROM customer_rfm_private GROUP BY segment ORDER BY customers DESC, segment;

CREATE OR REPLACE TABLE cohort_retention AS
WITH activity AS (
    SELECT DISTINCT customer_id, date_trunc('month', invoice_date)::DATE AS activity_month
    FROM sales_lines WHERE customer_id IS NOT NULL
), cohorts AS (
    SELECT customer_id, min(activity_month) AS cohort_month FROM activity GROUP BY customer_id
), sizes AS (
    SELECT cohort_month, count(*) AS cohort_size FROM cohorts GROUP BY cohort_month
), active_counts AS (
    SELECT c.cohort_month, a.activity_month, count(*) AS customers
    FROM cohorts c JOIN activity a USING (customer_id) GROUP BY c.cohort_month, a.activity_month
)
SELECT strftime(s.cohort_month, '%Y-%m') AS cohort_month, p.period_index,
    strftime(s.cohort_month + p.period_index * INTERVAL '1 month', '%Y-%m') AS activity_month,
    CASE WHEN s.cohort_month + p.period_index * INTERVAL '1 month' <= date_trunc('month', $last_day::DATE)
        THEN coalesce(a.customers, 0) ELSE NULL END AS customers,
    s.cohort_size,
    CASE WHEN s.cohort_month + p.period_index * INTERVAL '1 month' <= date_trunc('month', $last_day::DATE)
        THEN round(coalesce(a.customers, 0)::DOUBLE / s.cohort_size, 6) ELSE NULL END AS retention_rate,
    s.cohort_month + p.period_index * INTERVAL '1 month' <= date_trunc('month', $last_day::DATE) AS observed
FROM sizes s CROSS JOIN range(0, $month_count) p(period_index)
LEFT JOIN active_counts a ON a.cohort_month = s.cohort_month
    AND a.activity_month = s.cohort_month + p.period_index * INTERVAL '1 month'
ORDER BY cohort_month, period_index;
