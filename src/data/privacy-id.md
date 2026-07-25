# Pemberitahuan Privasi

**Terakhir diperbarui: 25 Juli 2026**

Milk Tracker ("aplikasi", "kami") membantu Anda mencatat sesi memerah ASI dan memantau produksi ASI Anda. Pemberitahuan ini menjelaskan informasi apa yang dikumpulkan aplikasi, bagaimana informasi itu digunakan, dengan siapa dibagikan, dan pilihan apa saja yang Anda miliki. Kami berusaha membuatnya sederhana dan jujur — tanpa taktik yang menyesatkan.

Milk Tracker adalah proyek pribadi yang dikelola oleh seorang pengembang individu. Jika Anda memiliki pertanyaan, Anda dapat menghubungi kami di **me@arkaes.dev**.

## Ringkasan singkat

- Anda dapat menggunakan Milk Tracker sebagai **tamu** tanpa memberikan data pribadi apa pun, atau masuk dengan Google untuk menyimpan data Anda secara permanen.
- Kami menyimpan data memerah yang Anda masukkan — beserta profil Google dasar Anda, jika Anda masuk dengan Google — agar dapat tersinkronisasi di berbagai perangkat.
- **Data tamu bersifat sementara** dan akan dihapus setelah 30 hari tidak ada aktivitas. Menautkan akun Google akan menyimpannya.
- Data Anda disimpan di Google Firebase (server di Singapura). Kami tidak menjualnya, dan kami tidak menggunakan iklan maupun pelacak analitik.
- Fitur Ringkasan AI yang bersifat opsional mengirim data memerah yang **tidak berisi identitas** ke OpenAI untuk membuat ringkasan mingguan Anda — hanya jika Anda mengaktifkannya. Nama dan email Anda tidak pernah dikirim.
- Anda dapat melihat, mengubah, dan menghapus data Anda, menonaktifkan AI, atau meminta kami menghapus seluruh akun Anda.

## 1. Informasi yang kami kumpulkan

**Akun tamu.** Jika Anda memilih "Continue without sign in", kami membuat akun anonim untuk Anda melalui Firebase Authentication. Kami **tidak** mengumpulkan nama, alamat email, atau foto profil Anda — akun tersebut hanya dikenali melalui ID akun acak yang tersimpan di perangkat Anda. Kami juga mencatat kapan akun dibuat dan kapan terakhir aktif, agar data tamu yang tidak aktif dapat dibersihkan (lihat Bagian 3).

**Akun Google.** Jika Anda masuk dengan Google — atau menautkan akun Google ke akun tamu yang sudah ada — proses masuk ditangani oleh Firebase Authentication. Kami menerima dan menggunakan nama, alamat email, foto profil, dan ID akun unik Anda. Kami menggunakannya untuk mengidentifikasi akun Anda dan menampilkannya di aplikasi; kami tidak menerima kata sandi Google Anda.

**Data memerah yang Anda masukkan.** Untuk setiap sesi yang Anda catat: volume ASI (ml), durasi (menit), serta tanggal dan waktu dimulainya. Ini adalah inti dari aplikasi.

**Pengaturan Anda.** Target dan preferensi Anda: target volume, target durasi, dan berapa jam jeda antar pengingat memerah.

**Konteks AI opsional (hanya jika Anda memberikannya).** Untuk mempersonalisasi ringkasan AI, Anda dapat secara opsional menambahkan tanggal lahir bayi Anda, metode pemberian ASI (memerah eksklusif atau sebagai pelengkap), dan tujuan memerah Anda. Semua kolom ini bersifat opsional.

**Data perangkat & notifikasi.** Jika Anda mengizinkan notifikasi, kami menyimpan token notifikasi push untuk perangkat Anda agar kami dapat mengirim pengingat memerah. Aplikasi juga menyimpan salinan data Anda di perangkat Anda (cache luring dan pengatur waktu yang berjalan) agar tetap berfungsi tanpa koneksi.

**Sinyal anti-penyalahgunaan.** Untuk melindungi layanan dari bot dan penyalahgunaan, kami menggunakan Google reCAPTCHA, yang mengumpulkan sinyal perangkat dan penggunaan. Penggunaannya diatur oleh kebijakan privasi Google.

Kami **tidak** mengumpulkan analitik, pengenal iklan, lokasi, atau kontak Anda, dan tidak ada SDK pelacak pihak ketiga yang tertanam di dalam aplikasi.

## 2. Bagaimana kami menggunakan informasi Anda

Kami menggunakan informasi Anda untuk:

- Menyimpan sesi memerah Anda dan menyinkronkannya di seluruh perangkat Anda.
- Menampilkan riwayat, ringkasan, dan progres menuju target Anda.
- Mengirim pengingat memerah yang Anda atur.
- Membuat ringkasan mingguan AI yang bersifat opsional (hanya jika Anda mengaktifkannya — lihat Bagian 4).
- Menjaga keamanan layanan dan mencegah penyalahgunaan.

Kami tidak menjual informasi pribadi Anda, dan kami tidak menggunakannya untuk iklan.

## 3. Akun tamu, penautan, dan data sementara

Anda dapat menggunakan Milk Tracker tanpa akun dengan memilih **"Continue without sign in"**. Mode tamu bekerja seperti akun biasa, dengan beberapa perbedaan penting:

**Data Anda bersifat sementara.** Data tamu dihapus secara otomatis setelah **30 hari tanpa aktivitas**. Sebuah tugas pembersihan terjadwal berjalan setiap minggu dan menghapus akun tamu beserta seluruh sesi memerahnya. Firebase juga dapat menghapus akun anonim yang tidak aktif menurut jadwalnya sendiri. Untuk mengetahui apakah sebuah akun masih digunakan, kami mencatat penanda waktu "terakhir aktif" saat Anda menyimpan sesi memerah.

**Akun tamu hanya ada di satu perangkat.** Karena tidak ada email atau kata sandi yang tertaut padanya, akun tamu tidak dapat dipulihkan. Jika Anda menghapus data peramban, berganti peramban, atau menggunakan perangkat lain, Anda tidak akan dapat mengakses data tamu tersebut lagi, dan data itu pada akhirnya akan dihapus karena tidak aktif.

**Menautkan akun Google akan menyimpan data Anda.** Jika Anda menautkan akun Google, data memerah Anda yang sudah ada tetap dipertahankan — ID akun yang mendasarinya tidak berubah, sehingga tidak ada yang perlu disalin atau dipindahkan. Sejak saat itu, nama, alamat email, dan foto profil Anda akan dikaitkan dengan akun tersebut, sebagaimana dijelaskan di Bagian 1.

**Jika akun Google sudah digunakan.** Jika akun Google yang Anda pilih sudah memiliki profil Milk Tracker sendiri, kami akan memasukkan Anda ke profil yang sudah ada tersebut. Data tamu *tidak* digabungkan ke dalamnya, dan akan dihapus melalui proses pembersihan yang dijelaskan di atas.

**Ringkasan AI tidak tersedia untuk pengguna tamu** — lihat Bagian 4.

## 4. Ringkasan AI (opsional)

Ringkasan AI memerlukan akun Google dan **nonaktif secara bawaan**. Jika Anda mengaktifkan fitur ini, saat Anda meminta ringkasan, aplikasi mengirim data berikut ke penyedia AI kami, **OpenAI**, untuk membuat ringkasan mingguan Anda dan menjawab pertanyaan lanjutan:

- Sesi memerah Anda untuk minggu-minggu terkait — tanggal, waktu, durasi, dan volume.
- **Usia** bayi Anda (dihitung dari tanggal lahir yang Anda masukkan — tanggal lahir persisnya tidak dikirim), metode pemberian ASI, dan tujuan memerah Anda, jika Anda memberikannya.
- Pertanyaan lanjutan yang Anda ketuk, beserta ringkasan mingguan Anda sebelumnya sebagai konteks.

Data ini **tidak berisi identitas**: nama, email, dan ID akun Anda **tidak pernah** dikirim ke OpenAI. Data ini tetap merupakan informasi terkait kesehatan tentang aktivitas memerah Anda, sehingga kami hanya mengirimnya dengan persetujuan tegas dari Anda. OpenAI memproses data ini di server yang berlokasi di Amerika Serikat. Ringkasan yang dihasilkan disimpan di akun Anda dan di-cache di perangkat Anda.

Anda dapat menonaktifkan Ringkasan AI kapan saja di Pengaturan. Menonaktifkannya tidak memengaruhi catatan memerah Anda.

**Bukan nasihat medis.** Ringkasan AI hanya untuk informasi umum dan bukan merupakan nasihat medis. Selalu konsultasikan dengan konsultan laktasi atau tenaga kesehatan untuk mendapatkan panduan.

## 5. Notifikasi push

Jika Anda memberi izin, kami mengirim pengingat untuk memerah berdasarkan pengaturan Anda. Untuk melakukannya, kami menyimpan token notifikasi untuk perangkat Anda dan memprosesnya di server kami untuk mengirimkan pengingat. Anda dapat mencabut izin notifikasi kapan saja melalui pengaturan peramban atau perangkat Anda.

## 6. Di mana data Anda disimpan dan siapa yang memprosesnya

Data Anda — termasuk data tamu — disimpan dan diproses oleh **Google Firebase** (Firebase Authentication, Cloud Firestore, Cloud Messaging, Cloud Functions, dan Hosting) pada infrastruktur Google Cloud yang berlokasi di Singapura. Google bertindak sebagai penyedia layanan kami untuk menyimpan dan mengirimkan aplikasi.

Satu-satunya pihak ketiga lain yang menerima data Anda adalah **OpenAI**, dan hanya untuk fitur Ringkasan AI opsional yang dijelaskan di Bagian 4.

Kami membagikan data kepada penyedia ini semata-mata untuk mengoperasikan aplikasi. Kami tidak menjual data Anda atau membagikannya kepada pengiklan maupun broker data.

## 7. Penyimpanan data

**Akun Google.** Kami menyimpan akun dan data memerah Anda selama akun Anda masih ada, agar aplikasi dapat menampilkan riwayat Anda. Anda dapat menghapus sesi satu per satu di aplikasi kapan saja. Jika Anda ingin akun dan seluruh data terkait dihapus, hubungi kami di **me@arkaes.dev** dan kami akan menghapusnya.

**Akun tamu.** Data tamu dihapus secara otomatis setelah 30 hari tidak aktif, sebagaimana dijelaskan di Bagian 3. Anda juga dapat menghapus sesi satu per satu di aplikasi kapan saja, atau cukup berhenti menggunakan akun tamu dan membiarkannya kedaluwarsa.

## 8. Hak dan pilihan Anda

Anda dapat:

- **Mengakses dan mengubah** sesi memerah dan pengaturan Anda langsung di aplikasi.
- **Menghapus** sesi satu per satu di aplikasi.
- **Menyimpan data tamu Anda** dengan menautkan akun Google, atau membiarkannya kedaluwarsa dengan tidak melakukan apa pun.
- **Mengaktifkan atau menonaktifkan Ringkasan AI** kapan saja di Pengaturan.
- **Mengelola notifikasi** melalui pengaturan peramban atau perangkat Anda.
- **Keluar** kapan saja, dan mencabut akses aplikasi ke akun Google Anda melalui pengaturan akun Google Anda.
- **Meminta penghapusan penuh** akun dan data Anda dengan mengirim email ke **me@arkaes.dev**. Perlu dicatat bahwa akun tamu tidak memiliki email yang tertaut, sehingga umumnya kami tidak dapat mengidentifikasi akun tamu dari permintaan melalui email — Anda dapat menghapus sesi Anda di aplikasi, atau membiarkan akun kedaluwarsa setelah 30 hari tidak aktif.

Bergantung pada tempat tinggal Anda, Anda mungkin memiliki hak tambahan atas data pribadi Anda (seperti akses, koreksi, penghapusan, atau penarikan persetujuan). Kami dengan senang hati memenuhinya — cukup hubungi kami.

## 9. Keamanan

Akses ke data Anda dibatasi hanya untuk akun Anda sendiri melalui aturan keamanan Firebase, dan koneksi ke aplikasi dienkripsi saat transit. Tidak ada metode penyimpanan atau transmisi yang 100% aman, tetapi kami mengambil langkah-langkah yang wajar untuk melindungi informasi Anda.

## 10. Privasi anak

Milk Tracker ditujukan untuk orang tua dan pengasuh. Aplikasi ini tidak ditujukan untuk anak-anak, dan kami tidak dengan sengaja mengumpulkan informasi pribadi dari anak-anak. Setiap informasi tentang bayi (seperti tanggal lahir) dimasukkan oleh, dan menjadi milik, pemegang akun dewasa.

## 11. Perubahan pada pemberitahuan ini

Kami dapat memperbarui pemberitahuan ini dari waktu ke waktu. Saat kami melakukannya, kami akan memperbarui tanggal "Terakhir diperbarui" di bagian atas. Perubahan penting akan disorot di dalam aplikasi.

## 12. Kontak

Ada pertanyaan, permintaan, atau kekhawatiran tentang privasi Anda? Kirim email ke **me@arkaes.dev**.
