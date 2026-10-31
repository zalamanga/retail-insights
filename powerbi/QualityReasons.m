let
    Source = fnLoadCsv("quality_reasons.csv", {{"reason", type text}, {"rows", Int64.Type}})
in
    Source
