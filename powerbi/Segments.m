let
    Source = fnLoadCsv("customer_segments.csv", {
        {"segment", type text}, {"customers", Int64.Type}, {"monetary", Currency.Type},
        {"avg_recency_days", type number}, {"avg_frequency", type number}
    })
in
    Source
