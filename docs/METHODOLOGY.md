# Metodologi analisis

## Cakupan dan sumber

Proyek ini menganalisis transaksi historis Online Retail milik UCI, dari 1 Desember 2010 sampai 9 Desember 2011. Harga memakai pound sterling (GBP). Negara adalah negara tempat tinggal pelanggan, sehingga pengelompokan negara bukan lokasi gudang atau rute pengiriman. Sumber dan atribusi: [Chen, D. (2015), Online Retail, UCI Machine Learning Repository](https://doi.org/10.24432/C5BW33), [halaman dataset](https://archive.ics.uci.edu/dataset/352/online+retail), lisensi [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Analisis memisahkan dua populasi. Ringkasan penjualan memakai baris merchandise yang lolos aturan, termasuk pembeli tanpa CustomerID. RFM dan cohort hanya memakai penjualan positif dengan CustomerID. Karena itu angka pelanggan tidak mewakili semua pembeli yang menghasilkan revenue.

## Unit analisis

Satu baris sumber adalah satu item pada invoice, bukan satu pesanan. Satu invoice dapat berisi banyak SKU. Kolom InvoiceNo dan StockCode diperlakukan sebagai teks agar prefiks dan akhiran tidak hilang. CustomerID hanya dipakai dalam pemrosesan lokal. Ekspor publik tidak memuat CustomerID, daftar invoice, atau catatan transaksi per pelanggan.

File sumber dan basis data lokal tidak termasuk artefak publik. CSV publik berisi agregat bulan-negara, bulan-negara-produk, segmen pelanggan, cohort, dan alasan eksklusi. Agregasi mengurangi paparan identitas sumber, tetapi bukan jaminan anonimitas formal; ukuran sel kecil tetap perlu ditinjau jika memakai data perusahaan sungguhan.

## Pembersihan yang dapat diaudit

1. Baca delapan kolom sumber. Hapus salinan baris yang identik pada seluruh delapan kolom sebelum membentuk tabel analisis. Duplikasi identik dianggap salinan pencatatan untuk proyek ini. Tanpa kunci baris sumber, kita tidak dapat membuktikan apakah setiap pengulangan adalah kesalahan.
2. Normalisasi teks dan tipe tanggal, kuantitas, serta harga. CustomerID kosong tetap kosong; proyek tidak mengisi ID pelanggan dengan tebakan.
3. Tetapkan satu alasan eksklusi per baris menurut urutan CASE di [01_clean.sql](../sql/01_clean.sql). Hitungan alasan bersifat eksklusif, sehingga satu baris bermasalah tidak dihitung beberapa kali.
4. Terima format invoice enam digit dengan prefiks C opsional. Keluarkan invoice tidak valid, tanggal tidak valid, kuantitas nol/tidak valid, serta harga nol, negatif, atau tidak valid.
5. Batasi merchandise ke StockCode berpola `^[0-9]{5}[A-Z]{0,2}$`. Kode lain, termasuk sebagian biaya dan penyesuaian administratif, dikeluarkan. Ini keputusan ruang lingkup proyek, bukan klaim bahwa semua kode lain salah.
6. Keluarkan invoice berprefiks C dengan kuantitas positif sebagai anomali yang perlu ditinjau. Baris yang lolos dengan kuantitas negatif masuk kredit, termasuk invoice tanpa prefiks C.

Audit sumber yang benar-benar terbaca menjadi acuan missing value. Label metadata situs sumber tidak menggantikan pemeriksaan file.

Pada JSON, `quality.reasons` hanya berisi alasan eksklusi dan jumlahnya harus sama dengan excluded_rows. `quality.status_counts` mencakup seluruh status setelah deduplikasi, termasuk included_sale dan included_credit, sehingga jumlahnya sama dengan rows_after_dedup. CSV quality_reasons mengikuti daftar seluruh status tersebut. Nama file CSV bukan petunjuk bahwa semua barisnya merupakan eksklusi.

## Uang dan KPI

Pipeline membaca harga sebagai `Decimal(str(value))`, membulatkan harga satuan ke empat desimal dengan `ROUND_HALF_UP`, lalu mengalikannya dengan kuantitas integer. Harga dan nilai baris disimpan sebagai `DECIMAL(18,4)`. Urutan ini eksplisit: harga 1.23455 dengan kuantitas 3 menghasilkan 3.7038 setelah normalisasi harga. Tampilan dashboard membulatkan GBP ke dua desimal; CSV mempertahankan empat desimal. Jangan menghitung ulang revenue dengan bilangan pecahan biner jika perlu rekonsiliasi sampai digit terakhir. Detail konversi dapat diperiksa pada [pipeline.py](../src/retail_insights/pipeline.py).

| KPI | Definisi | Batas interpretasi |
| --- | --- | --- |
| Gross sales | Jumlah nilai baris penjualan positif yang lolos | Nilai merchandise tercatat sebelum kredit |
| Credits | Nilai absolut total baris berkuantitas negatif yang lolos | Kredit tercatat; tidak selalu pengembalian barang yang cocok ke pesanan asal |
| Net sales | Gross sales dikurangi credits | Bukan laba atau arus kas |
| Orders | Jumlah invoice berbeda dengan setidaknya satu baris penjualan positif | Invoice kredit tidak menambah pesanan |
| Gross AOV | Gross sales dibagi orders | Rata-rata nilai pesanan positif; hitung dari total, bukan rata-rata AOV kelompok |
| Credit value rate | Credits dibagi gross sales | Rasio nilai kredit; bukan tingkat retur unit atau probabilitas pesanan diretur |
| Units sold | Total kuantitas pada penjualan positif | Tidak mencakup kuantitas kredit |
| Units credited | Nilai absolut kuantitas kredit | Tidak menunjukkan pasangan penjualan asal |
| Identified buyers | CustomerID berbeda pada penjualan positif | Global, tidak mencakup pembeli tanpa ID |
| Repeat buyer rate | Pembeli teridentifikasi dengan sedikitnya dua invoice positif dibagi seluruh pembeli teridentifikasi | Pengulangan hanya di jendela observasi |

Setiap penjumlahan uang harus memenuhi `gross_sales - credits = net_sales`. Jumlah pesanan per produk tidak boleh dijumlahkan lintas SKU karena satu invoice dapat berisi beberapa produk. Jumlah pelanggan berbeda juga tidak boleh dijumlahkan lintas bulan atau negara. Panduan Power BI menjelaskan pemisahan agregat yang dapat dijumlahkan dan metrik global di [POWER-BI.md](POWER-BI.md).

Dataset tidak menyertakan biaya barang, biaya pemasaran, pajak yang terurai, atau status pembayaran. Proyek tidak menghitung profit, margin, ROI, lifetime value, atau dampak kausal tindakan bisnis.

## Perbandingan waktu

Desember 2010 adalah bulan kalender penuh. Desember 2011 hanya teramati sampai tanggal 9, sehingga penurunannya terhadap November tidak dapat dipakai sebagai bukti perlambatan bisnis. Perbandingan bulan penuh memakai Desember 2010 sampai November 2011. Desember 2011 tetap muncul di grafik dengan penanda bulan parsial.

Perbandingan antarbulan bersifat deskriptif. Satu musim liburan dan satu tahun observasi belum cukup untuk menyimpulkan pola musiman yang stabil atau membuat proyeksi operasional.

## RFM yang dipakai

RFM memakai penjualan positif dengan CustomerID sepanjang periode, dengan tanggal acuan 10 Desember 2011:

| Komponen | Perhitungan |
| --- | --- |
| Recency | Selisih hari antara tanggal pembelian positif terakhir dan tanggal acuan |
| Frequency | Jumlah invoice positif berbeda per pelanggan |
| Monetary | Gross sales pelanggan pada penjualan positif, bukan net setelah kredit |

Proyek menghitung R, F, dan M, tetapi kelompok pelanggan memakai aturan R/F saja. Monetary tetap menjadi ringkasan gross spend per kelompok dan tidak menentukan keanggotaan. Proyek tidak memberi skor kuintil 1 sampai 5 atau skor gabungan tiga dimensi. [03_customers.sql](../sql/03_customers.sql) mengevaluasi aturan berurutan:

1. `Recent frequent buyers`: recency paling lama 30 hari dan frequency minimal 5.
2. `Lapsed repeat buyers`: recency lebih dari 90 hari dan frequency minimal 2.
3. `Other frequent buyers`: frequency minimal 5 yang belum masuk dua kelompok sebelumnya.
4. `Other repeat buyers`: frequency minimal 2 yang belum masuk kelompok sebelumnya.
5. `One-time buyers`: frequency 1.

Urutan berpengaruh: pembeli dengan frequency tinggi tetapi sudah lama tidak membeli masuk lapsed, sehingga tidak dihitung ganda. Ambang 30/90 hari dan 2/5 invoice adalah aturan analisis proyek, belum hasil optimasi kampanye. Uji sensitivitas ambang dan konfirmasi dengan tim bisnis sebelum dipakai untuk tindakan pelanggan.

## Cohort dan retention

Cohort adalah bulan pembelian positif pertama yang terlihat untuk setiap CustomerID. Istilah yang tepat adalah *first observed purchase*, karena pelanggan mungkin sudah membeli sebelum Desember 2010. Proyek tidak mengklaim bulan tersebut sebagai akuisisi pelanggan yang sesungguhnya.

Satu pelanggan dihitung aktif paling banyak satu kali per bulan. `period_index = 0` adalah bulan cohort sendiri dan bernilai 100%. Untuk bulan berikutnya, retention adalah pelanggan cohort yang membeli pada bulan itu dibagi ukuran cohort awal. Pelanggan boleh tidak aktif pada suatu bulan lalu kembali di bulan lain; ini retention aktivitas bulanan, bukan survival yang harus turun terus.

Sel setelah akhir jendela data bernilai kosong dengan `observed = false`, bukan 0%. Bulan teramati tanpa pembeli bernilai 0%. Kolom yang jatuh pada Desember 2011 tetap bulan parsial; gunakan bulan penuh untuk perbandingan cohort yang lebih setara. Cohort akhir punya waktu observasi lebih pendek, sehingga membandingkan lifetime retention mereka secara langsung akan menyesatkan.

Ukuran cohort berulang pada setiap period_index. Jangan menjumlahkannya lintas periode. Untuk ringkasan satu periode, jumlahkan pelanggan aktif dibagi jumlah ukuran cohort yang benar-benar teramati pada periode yang sama. Jangan merata-ratakan persentase sel dengan ukuran cohort berbeda tanpa menyebut pembobotannya.

## Mengubah temuan menjadi keputusan

Temuan pada [kpis.json](../reports/kpis.json) berasal dari hasil pipeline, bukan angka contoh. Mulai dengan pertanyaan yang bisa diperiksa: negara mana mendominasi net sales, produk mana tinggi nilai kreditnya, bulan penuh mana yang paling besar, dan berapa porsi pembeli yang kembali.

Setelah mendapat pola, pisahkan bukti dan tindakan. Misalnya, dominasi satu negara mendukung peninjauan konsentrasi revenue; hasil itu sendiri belum membuktikan negara lain pantas menerima anggaran iklan. Segmen lapsed mendukung daftar hipotesis win-back, tetapi efektivitas kampanye harus diuji dengan kelompok pembanding dan biaya yang belum tersedia di dataset ini.
