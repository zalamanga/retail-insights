let
    Months = Table.Distinct(Table.SelectColumns(FactMonthlyCountry, {"month"})),
    MonthStart = Table.AddColumn(Months, "month_start", each
        #date(Number.FromText(Text.Start([month], 4)), Number.FromText(Text.End([month], 2)), 1), type date),
    Complete = Table.AddColumn(MonthStart, "complete_month", each [month] >= "2010-12" and [month] <= "2011-11", type logical),
    Coverage = Table.AddColumn(Complete, "coverage_label", each
        if [complete_month] then "Complete month" else "Partial month: 1-9 Dec 2011", type text),
    Sorted = Table.Sort(Coverage, {{"month", Order.Ascending}})
in
    Sorted
