let
    Source = Table.Distinct(Table.SelectColumns(FactMonthlyCountryProduct, {"stock_code", "description"})),
    Sorted = Table.Sort(Source, {{"stock_code", Order.Ascending}})
in
    Sorted
