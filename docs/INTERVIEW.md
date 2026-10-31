# Panduan presentasi dan wawancara

## Cerita proyek dalam satu menit

> Saya mengerjakan analisis transaksi Online Retail UCI dengan Python dan DuckDB SQL. Saya memisahkan penjualan positif, kredit tercatat, dan baris yang dikeluarkan sebelum menghitung KPI. Hasilnya dipakai oleh dashboard web serta ekspor agregat untuk Power BI. Bagian pelanggan mencakup RFM berbasis aturan dan retention cohort dengan bulan yang belum teramati dibiarkan kosong. Saya juga menyertakan audit kualitas dan panduan reproduksi agar reviewer bisa memeriksa asal setiap angka.

Pada build resmi, net merchandise sales seluruh periode mencapai GBP 9,740,220.11 dan 2,829 dari 4,334 pembeli teridentifikasi membeli sedikitnya dua kali (65.27%). November 2011 adalah bulan penuh dengan net sales tertinggi, GBP 1,423,188.80. Angka ini dapat diperiksa pada [kpis.json](../reports/kpis.json). Saat demo, sebutkan bahwa KPI tersebut memakai seluruh periode, sedangkan tampilan awal dashboard memakai bulan penuh; pembeli tanpa CustomerID tetap masuk revenue tetapi tidak masuk denominator pelanggan.

## Pertanyaan bisnis dan bukti yang relevan

| Pertanyaan | Analisis yang dibuka | Keputusan lanjutan yang masuk akal |
| --- | --- | --- |
| Berapa penjualan setelah kredit? | Gross, credits, net sales, rekonsiliasi | Samakan definisi revenue dengan stakeholder |
| Di mana revenue terkonsentrasi? | Agregat negara, share dari total | Tinjau risiko konsentrasi dan kebutuhan konteks pasar |
| Produk mana perlu ditinjau? | Net sales dan credits per SKU | Minta alasan kredit, kualitas, dan ketersediaan stok |
| Apakah revenue meningkat? | Tren bulan penuh | Bandingkan periode setara sebelum menyimpulkan pertumbuhan |
| Berapa pelanggan yang membeli lagi? | Identified buyers, repeat buyer rate | Nilai kelengkapan CustomerID dan basis CRM |
| Siapa yang sudah lama tidak membeli? | Segmen lapsed repeat buyers | Rancang eksperimen win-back dengan biaya dan kontrol |
| Kapan cohort kembali membeli? | Matriks cohort dengan sensor kanan | Bandingkan umur cohort yang setara |

## Pertanyaan teknis yang sering muncul

### Mengapa memakai pandas dan SQL?

pandas membaca Excel dan menormalkan tipe sumber. DuckDB menjalankan aturan seleksi, agregasi, RFM, dan cohort dalam SQL yang bisa diperiksa terpisah dari antarmuka. Dashboard membaca hasil agregat, sehingga tidak perlu memproses Excel setiap halaman dibuka. Jelaskan pembagian ini melalui [CODE-GUIDE.md](CODE-GUIDE.md).

### Mengapa ada gross sales dan net sales?

Gross sales mengukur nilai penjualan positif. Kredit mengurangi nilai bersih, tetapi dapat terjadi di bulan berbeda dari penjualan asal. Menampilkan keduanya membantu membedakan pergerakan penjualan dan penyesuaian. Dataset tidak menyediakan pencocokan kredit ke invoice asal yang dapat diandalkan, sehingga saya menyebutnya kredit tercatat.

### Mengapa CustomerID kosong tetap dipakai untuk revenue?

Harga dan kuantitasnya tetap dapat menghasilkan nilai transaksi yang valid. Menghapus semua baris tanpa CustomerID akan mengurangi revenue hanya karena identitas pembeli tidak lengkap. Untuk RFM dan cohort saya mengecualikannya, karena transaksi tanpa ID tidak dapat dihubungkan dengan aman ke pembeli yang sama.

### Mengapa menghapus duplikasi identik?

Saya menetapkan duplikasi sebagai kesamaan seluruh delapan kolom. Ini aturan eksplisit yang dapat diaudit, bukan pencarian ganda berdasarkan invoice saja. Satu invoice wajar punya banyak item. Jika sumber produksi memiliki event ID, saya akan memakai ID tersebut dan meninjau ulang pengulangan yang sah sebelum deduplikasi.

### Mengapa kode non-merchandise dikeluarkan?

Ruang lingkup dashboard adalah merchandise dengan pola SKU yang ditetapkan. Kode penyesuaian administratif, biaya, dan format lain tidak dicampur dengan produk. Ini membuat definisi revenue proyek berbeda dari total mentah. Dalam pekerjaan bisnis, saya akan menyepakati kamus kode bersama finance sebelum menyatakan total tersebut sebagai angka resmi.

### Mengapa menggunakan DECIMAL?

Uang perlu rekonsiliasi yang konsisten. Bilangan floating point dapat menimbulkan perbedaan sangat kecil saat dijumlahkan. Pipeline memakai empat angka desimal dan memisahkan pembulatan tampilan dua desimal dari nilai analisis. Reviewer dapat mengikuti perhitungannya pada [pipeline.py](../src/retail_insights/pipeline.py) dan [01_clean.sql](../sql/01_clean.sql).

### Apakah RFM ini model prediktif?

RFM di sini ringkasan perilaku historis dengan segmentasi aturan. Ambang hari dan jumlah invoice belum dilatih untuk memprediksi churn atau respons kampanye. Saya memilih aturan yang bisa dijelaskan, menyimpan definisinya, lalu menyarankan validasi dengan hasil kampanye jika tujuan berubah menjadi prediksi.

### Mengapa retention bulan nol selalu 100%?

Cohort berisi pembeli yang pertama kali terlihat membeli pada bulan itu. Semua anggota cohort aktif pada bulan pembentuknya. Karena itu bulan nol harus 100%; bila tidak, ada kesalahan denominator, join, atau definisi cohort.

### Mengapa sel masa depan kosong?

Kita belum mengamati periode tersebut. Menulis 0% akan menyatakan tidak ada yang kembali, padahal datanya belum tersedia. Desember 2011 berbeda lagi: sudah teramati sebagian, jadi perlu label parsial.

### Apakah semua filter dashboard berlaku untuk pelanggan?

Filter bulan dan negara berlaku pada overview dan produk. RFM dan cohort memakai periode penuh secara global. Agregat publik tidak menyimpan detail CustomerID untuk menghitung ulang pelanggan unik di setiap kombinasi filter. Label cakupan membantu pembaca memahami batas tersebut.

### Mengapa jumlah pesanan produk tidak boleh dijumlahkan?

Satu invoice dapat membeli beberapa SKU. Jika invoice yang sama muncul pada lima produk, penjumlahan lima hitungan pesanan produk akan menghitung invoice itu lima kali. KPI orders berasal dari tabel bulan-negara, sedangkan orders pada produk hanya menunjukkan jangkauan invoice SKU tersebut.

### Bagaimana membuktikan hasilnya benar?

Jalankan perintah pada [README](../README.md), baca laporan validasi yang dihasilkan, lalu periksa rekonsiliasi gross dikurangi credits sama dengan net. Cocokkan total agregat ke KPI global, pastikan ukuran segmen sama dengan pembeli teridentifikasi, dan verifikasi cohort bulan nol serta sensor masa depan. [Notebook](../notebooks/01_retail_analysis.ipynb) mengulang pemeriksaan pada CSV agregat.

### Apa yang belum bisa dijawab?

Profit dan margin membutuhkan biaya. Keberhasilan iklan membutuhkan exposure, biaya, atribusi, dan rancangan pengukuran. True acquisition membutuhkan riwayat sebelum periode ini. Analisis kausal membutuhkan desain eksperimen atau asumsi tambahan yang tidak didukung file transaksi ini.

## Urutan demo lima menit

1. Nyatakan pertanyaan bisnis, tanggal observasi, dan mata uang.
2. Buka overview, jelaskan hubungan gross, credits, dan net; ubah filter negara dan bulan.
3. Gulir ke Product leaders pada overview dan tunjukkan bahwa ranking mengikuti filter.
4. Buka pelanggan, sebutkan cakupan global, aturan RFM, serta arti sel cohort kosong.
5. Buka audit kualitas dan satu query SQL untuk menunjukkan alasan angka berubah dari sumber mentah.
6. Tutup dengan satu tindakan yang masih berupa hipotesis, data tambahan yang dibutuhkan, dan cara mengujinya.

## Pengembangan berikutnya

Jika waktu bertambah, urutkan pekerjaan dari kebutuhan bukti: sepakati kamus kode dengan finance, dapatkan biaya dan status kredit, perpanjang riwayat pelanggan, lalu ukur tindakan bisnis melalui eksperimen. Jangan menambah model hanya agar daftar teknologi menjadi lebih panjang.
