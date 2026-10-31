let
    Source = fnLoadCsv("cohort_retention.csv", {
        {"cohort_month", type text}, {"period_index", Int64.Type}, {"activity_month", type text},
        {"customers", Int64.Type}, {"cohort_size", Int64.Type},
        {"retention_rate", type number}, {"observed", type logical}
    })
in
    Source
