let
    Source = Table.Distinct(Table.SelectColumns(FactMonthlyCountry, {"country"})),
    Sorted = Table.Sort(Source, {{"country", Order.Ascending}})
in
    Sorted
