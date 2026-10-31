# Bukti verifikasi

Pada 31 Oktober 2026, build data resmi, rekonsiliasi independen, notebook dan pemeriksaan browser lokal sudah lulus. Run CI Linux dan deployment publik belum diklaim sebelum hasil hosted tersedia.

## Sumber dan hasil build resmi

[Metadata sumber](../data/source.json) merekam dataset [Chen (2015), UCI Online Retail](https://doi.org/10.24432/C5BW33), berlisensi [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Workbook berukuran 23.715.344 byte dan memiliki SHA-256:

```text
43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d
```

Build resmi membaca 541.909 baris dari 1 Desember 2010 sampai 9 Desember 2011. Setelah 5.268 duplikasi identik dihapus, 536.641 baris tersisa: 520.562 penjualan positif, 8.668 kredit, dan 7.411 eksklusi. Sebanyak 135.080 baris sumber tidak mempunyai CustomerID; 129.412 baris penjualan positif yang lolos tetap dipertahankan tanpa ID. Hitungan missing ID bersifat tumpang tindih, bukan tambahan eksklusi.

Rekonsiliasi independen memakai pustaka standar Python dan `Decimal`, tanpa memanggil fungsi pipeline. Hasil [KPI](../reports/kpis.json), [snapshot dashboard](../dashboard/data/analysis.json), dan [ekspor CSV](../reports/exports/) cocok:

| Metrik seluruh periode | Nilai |
| --- | ---: |
| Gross merchandise sales | GBP 10.216.121,2700 |
| Merchandise credits | GBP 475.901,1600 |
| Net merchandise sales | GBP 9.740.220,1100 |
| Invoice penjualan berbeda | 19.771 |
| Units sold | 5.556.332 |
| Units credited | 270.017 |
| Identified buyers | 4.334 |
| Repeat buyers | 2.829 |

Gross dikurangi credits sama dengan net secara tepat pada empat desimal. Seluruh 311 agregat bulan-negara dan 66.375 agregat bulan-negara-produk menghasilkan total uang yang sama. Jumlah pesanan produk tidak dijumlahkan lintas SKU.

Kelima skema CSV publik dan struktur JSON diperiksa: tidak ada kolom CustomerID atau identifier invoice. Ekspor tetap berupa agregat, bukan jaminan anonimitas formal untuk semua ukuran sel.

Seluruh 169 sel cohort diperiksa. Sebanyak 78 sel masa depan berisi null; ukuran cohort pada bulan nol berjumlah 4.334, dan setiap bulan nol bernilai 100%. Rasio teramati cocok dengan pembeli aktif dibagi ukuran cohort dalam toleransi pembulatan enam desimal. Kalender memuat 12 bulan penuh; Desember 2011 parsial. RFM memakai tanggal acuan 10 Desember 2011.

## Pemeriksaan lokal

| Pemeriksaan | Status awal |
| --- | --- |
| [Tes Python](../tests/test_pipeline.py) | 31 tes lulus pada fixture sintetis; termasuk stabilitas urutan ekspor, dengan hasil build resmi diperiksa terpisah |
| [Tes model JavaScript](../dashboard/tests/model.test.mjs) | 9 tes lokal lulus |
| Rekonsiliasi lintas JSON dan CSV resmi | Lulus melalui perhitungan independen |
| Fixture offline | Gross GBP 31,7038; credits GBP 3,0000; net GBP 28,7038; 7 invoice |
| [Notebook](../notebooks/01_retail_analysis.ipynb) | 10 sel Python dieksekusi pada ekspor resmi; output tersimpan, tanpa error, dengan penanda akhir PASS |
| Browser nyata dan screenshot | Microsoft Edge: 15 pemeriksaan alur, 18 layout, empat screenshot; tanpa error halaman/console/HTTP tak terduga |
| GitHub Actions dan Pages | Belum ada run atau deployment hosted yang dicatat |

Tes mencakup deduplikasi delapan kolom, penjualan tanpa ID, harga dan kuantitas tidak valid, kredit tanpa prefiks C, pembulatan harga sebelum perkalian, invoice yang melintasi grain, pesanan produk yang tidak aditif, RFM, serta cohort dengan nol teramati dan sel masa depan kosong. Fixture berisi data sintetis; hasilnya tidak dipakai sebagai temuan bisnis.

## Pemeriksaan otomatis yang disiapkan

[Workflow verifikasi](../.github/workflows/verify.yml) berjalan pada push ke main, pull request ke main, dan pemicu manual. Push yang hanya mengubah README atau docs tidak mengulang build data maupun publikasi dashboard. Job memakai Ubuntu, Python 3.13, Node 22, dependensi Python dari versi yang dipatok pada requirements, dan `npm ci` dari lockfile. Pemeriksaan menjalankan `pip check`, pytest, serta tes JavaScript.

Workflow memverifikasi hash ZIP dan workbook sumber resmi, membangun ulang hasil ke direktori terpisah, lalu membandingkan snapshot JSON, laporan temuan, dan seluruh CSV secara byte-for-byte dengan versi yang dikomit. Aturan line ending repositori memakai LF untuk file tersebut. Cache sumber resmi memakai hash metadata sumber sebagai kunci; cache tidak menggantikan pemeriksaan hash dan tidak masuk artefak Pages.

Setelah rekonsiliasi snapshot, CI menjalankan pemeriksaan data, mengeksekusi sel Python notebook, memasang Chromium, dan menguji dashboard melalui server HTTP nyata. Laporan pemeriksaan disimpan sebagai artefak CI. Screenshot hanya diunggah dari langkah browser yang berhasil agar gambar lama tidak dianggap bukti run baru.

Job deploy baru berjalan setelah verifikasi berhasil pada main di luar pull request. Artefak Pages hanya mengambil folder dashboard. Workbook sumber, cache, database DuckDB, dan direktori pemrosesan lokal tidak menjadi bagian dari situs. Konfigurasi job mengikuti [panduan deployment GitHub Pages](https://github.com/actions/deploy-pages) dan [format artefak Pages](https://github.com/actions/upload-pages-artifact).

Ekspor CSV memakai ORDER BY eksplisit; tes mengacak urutan penyimpanan tabel dan memastikan byte hasil ekspor tetap sama dengan line ending LF. Perbandingan lintas Windows dan Linux belum dinyatakan berhasil sebelum run hosted pertama selesai. Perbedaan nilai hasil rebuild harus diperiksa sebagai kegagalan nyata, bukan dilewati agar deployment tetap berjalan.

## Batas verifikasi Power BI

[Paket Power BI](../powerbi/) berisi CSV agregat, query Power Query M, measure DAX, dan panduan relasi. Power BI Desktop tidak tersedia pada lingkungan ini. Tidak ada klaim bahwa PBIX/PBIP sudah dibangun atau bahwa ekspresi dan visual sudah diuji secara native. Pemeriksaan impor native tetap mengikuti [panduan Power BI](POWER-BI.md).
