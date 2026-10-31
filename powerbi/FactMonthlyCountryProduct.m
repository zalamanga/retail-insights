let
    Source = fnLoadCsv("monthly_country_product.csv", {
        {"month", type text}, {"country", type text}, {"stock_code", type text}, {"description", type text},
        {"gross_sales", Currency.Type}, {"credits", Currency.Type}, {"net_sales", Currency.Type},
        {"orders", Int64.Type}, {"units_sold", Int64.Type}, {"units_credited", Int64.Type}
    })
in
    Source
