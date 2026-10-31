(FileName as text, ColumnTypes as list) as table =>
let
    Separator = if Text.EndsWith(BaseFolder, "\") or Text.EndsWith(BaseFolder, "/") then "" else "\",
    Source = Csv.Document(
        File.Contents(BaseFolder & Separator & FileName),
        [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]
    ),
    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    RequiredColumns = List.Transform(ColumnTypes, each _{0}),
    MissingColumns = List.Difference(RequiredColumns, Table.ColumnNames(Headers)),
    Checked = if List.IsEmpty(MissingColumns) then Headers else
        error Error.Record("SchemaMismatch", "Required CSV columns are missing.", [File=FileName, Missing=MissingColumns]),
    Selected = Table.SelectColumns(Checked, RequiredColumns),
    Nulls = Table.ReplaceValue(Selected, "", null, Replacer.ReplaceValue, RequiredColumns),
    Typed = Table.TransformColumnTypes(Nulls, ColumnTypes, "en-US")
in
    Typed
