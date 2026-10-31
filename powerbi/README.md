# Paket impor Power BI

Paket ini berisi query Power Query M dan definisi measure DAX untuk CSV agregat yang dihasilkan pipeline. Paket ini tidak berisi PBIX/PBIP, dan belum diuji di Power BI Desktop pada lingkungan pengerjaan ini. Dashboard web adalah laporan yang langsung bisa dijalankan.

Ikuti [panduan impor, relasi, dan visual](../docs/POWER-BI.md). Buat query dengan nama yang sama persis dengan nama file M, tanpa ekstensi. Masukkan isi file melalui Advanced Editor. Buat parameter [BaseFolder](BaseFolder.m) dan fungsi [fnLoadCsv](fnLoadCsv.m) sebelum query tabel. Ubah nilai BaseFolder ke folder ekspor pada komputer Anda.

| CSV sumber | Query | Grain dan aturan agregasi |
| --- | --- | --- |
| [monthly_country.csv](../reports/exports/monthly_country.csv) | [FactMonthlyCountry](FactMonthlyCountry.m) | Satu bulan-negara. Uang, unit, dan orders dapat dijumlahkan karena pipeline memvalidasi invoice tidak melintasi bulan/negara |
| [monthly_country_product.csv](../reports/exports/monthly_country_product.csv) | [FactMonthlyCountryProduct](FactMonthlyCountryProduct.m) | Satu bulan-negara-SKU. Uang dan unit dapat dijumlahkan; orders tidak dapat dijumlahkan lintas SKU |
| [customer_segments.csv](../reports/exports/customer_segments.csv) | [Segments](Segments.m) | Satu kelompok R/F, seluruh periode; monetary adalah gross spend |
| [cohort_retention.csv](../reports/exports/cohort_retention.csv) | [Cohorts](Cohorts.m) | Satu cohort-period_index; cohort_size berulang, future customers dan retention_rate kosong |
| [quality_reasons.csv](../reports/exports/quality_reasons.csv) | [QualityReasons](QualityReasons.m) | Satu alasan/status setelah deduplikasi; included_sale dan included_credit bukan eksklusi |

[DimMonth](DimMonth.m), [DimCountry](DimCountry.m), dan [DimProduct](DimProduct.m) dibentuk dari fact. Tipe uang memakai `Currency.Type` agar empat desimal tetap tersedia. Kolom bulan dan SKU tetap teks. Future cohort kosong diubah menjadi null sebelum konversi numerik.

[measures.dax](measures.dax) berisi definisi terpisah: buat satu measure untuk setiap blok `Nama = ekspresi`. File ini bukan skrip yang bisa dijalankan sekaligus pada formula bar. Format uang sebagai GBP dan rasio sebagai persentase. Jangan mengganti blank future retention dengan nol.
