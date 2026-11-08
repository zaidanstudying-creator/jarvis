# Memasang J.A.R.V.I.S. di macOS

Pemasang pengembangan tersedia sebagai `Install JARVIS.command` di akar proyek. Cloud tidak dapat menaruh file langsung di Mac: seluruh folder sumber harus dipindahkan ke Mac terlebih dahulu. Tautan file internal cloud bukan tautan unduhan publik. Kode ini belum otomatis diunggah ke GitHub.

Setelah menerima dan mengekstrak **seluruh** proyek, klik dua kali `Install JARVIS.command`. Alternatif dari Terminal, di folder proyek:

```sh
bash 'Install JARVIS.command'
```

Pemasang mengenali Apple Silicon (`arm64`) atau Intel (`x64`), mengunduh runtime Node 24.22.1 sementara dari nodejs.org dengan TLS dan memverifikasi SHA-256 terhadap daftar checksum resmi, menjalankan `npm ci`, tes mock, build, lalu Electron Packager pada Mac. Tidak perlu memasang Node secara global atau menggunakan `sudo`. Runtime sementara dibersihkan setelah selesai; aplikasi membawa runtime Electron sendiri.

Hasilnya adalah `~/Applications/JARVIS.app`, lalu pemasang membuka aplikasi tersebut. Pemasang menolak menimpa aplikasi yang sudah ada. Jika memperbarui versi, tutup dan pindahkan aplikasi lama secara manual terlebih dahulu. Pengaturan dan keychain disimpan terpisah dari bundel aplikasi. Folder cache unduhan berada di `~/Library/Caches/JARVIS`.

Build memakai tanda tangan lokal **ad hoc**, bukan sertifikat Apple Developer ID, dan belum dinotariskan. Pemeriksaan tanda tangan harus berhasil sebelum aplikasi disalin. Tidak ada perintah untuk menonaktifkan Gatekeeper atau membuang atribut karantina. Jika macOS memblokir pembukaan, periksa informasi di Privacy & Security dan kebijakan perangkat kamu. Izin mikrofon diminta ketika push-to-talk diaktifkan; deskripsi penggunaan mikrofon disertakan dalam Info.plist.

Tampilan masih berupa konsol pengembangan. Masukkan Groq dan Fish API key melalui pengaturan aplikasi; nilainya disimpan melalui keychain. Pilih model yang benar-benar tersedia, lalu lakukan connection test secara opt-in. File `.env`, Git metadata, dan dependensi lama tidak disalin oleh pemasang. Tes installer tidak mengirim request provider AI.

## Pengembang

Dengan Node dan dependensi proyek sudah tersedia di Mac:

```sh
npm ci
npm run package:mac
```

Bundel ada di `release/JARVIS-darwin-arm64/JARVIS.app` atau `release/JARVIS-darwin-x64/JARVIS.app`. Pengemasan sengaja dibatasi pada host macOS karena tanda tangan lokal memerlukan `codesign` bawaan macOS.

Validasi di cloud Linux mencakup sintaks shell, konfigurasi paket kedua arsitektur, pengecualian file rahasia dari paket, penolakan host yang tidak sesuai, tes aplikasi, dan build TypeScript. Pemasangan, penandatanganan, mikrofon, playback, serta keychain pada Mac sungguhan belum diverifikasi. Tidak ada klaim bahwa aplikasi sudah terpasang di komputer pengguna.
