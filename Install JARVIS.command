#!/bin/bash
set -euo pipefail

fail() { printf '\nGagal: %s\n' "$*" >&2; exit 1; }
if [[ "$(uname -s)" != Darwin ]]; then
  fail 'Pemasang ini hanya untuk macOS. Jalankan file ini di Mac kamu.'
fi
case "$(uname -m)" in
  arm64) jarvis_arch=arm64 ;;
  x86_64) jarvis_arch=x64 ;;
  *) fail 'Arsitektur Mac ini belum didukung.' ;;
esac

jarvis_source="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
jarvis_destination="$HOME/Applications/JARVIS.app"
[[ ! -e "$jarvis_destination" && ! -L "$jarvis_destination" ]] || fail 'JARVIS.app sudah ada di ~/Applications. Pindahkan aplikasi lama secara manual sebelum memasang versi ini; pemasang tidak menimpanya.'
for jarvis_required in package.json package-lock.json tsconfig.json vite.config.ts index.html src scripts tests; do
  [[ -e "$jarvis_source/$jarvis_required" ]] || fail "File proyek tidak lengkap: $jarvis_required. Ekstrak seluruh ZIP, bukan file pemasang saja."
done
command -v curl >/dev/null || fail 'curl tidak tersedia.'
command -v shasum >/dev/null || fail 'shasum tidak tersedia.'
command -v codesign >/dev/null || fail 'codesign bawaan macOS tidak tersedia.'

jarvis_stage="$(mktemp -d "${TMPDIR:-/tmp}/jarvis-install.XXXXXX")"
trap 'rm -rf -- "$jarvis_stage"' EXIT
jarvis_node_version=24.22.1
jarvis_archive="node-v${jarvis_node_version}-darwin-${jarvis_arch}.tar.gz"
jarvis_download="https://nodejs.org/dist/v${jarvis_node_version}"
printf '\nMenyiapkan J.A.R.V.I.S. untuk macOS (%s).\nTidak meminta API key dan tidak memerlukan sudo.\n' "$jarvis_arch"
printf 'Mengunduh runtime Node.js sementara melalui HTTPS…\n'
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 300 "$jarvis_download/$jarvis_archive" -o "$jarvis_stage/$jarvis_archive"
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 60 "$jarvis_download/SHASUMS256.txt" -o "$jarvis_stage/SHASUMS256.txt"
jarvis_checksum="$(awk -v name="$jarvis_archive" '$2==name {print $1}' "$jarvis_stage/SHASUMS256.txt")"
[[ "$jarvis_checksum" =~ ^[[:xdigit:]]{64}$ ]] || fail 'Checksum resmi runtime tidak ditemukan.'
(cd "$jarvis_stage" && printf '%s  %s\n' "$jarvis_checksum" "$jarvis_archive" | shasum -a 256 -c -) || fail 'Checksum runtime tidak cocok. Instalasi dihentikan.'
tar -xzf "$jarvis_stage/$jarvis_archive" -C "$jarvis_stage"
export PATH="$jarvis_stage/node-v${jarvis_node_version}-darwin-${jarvis_arch}/bin:$PATH"
export npm_config_cache="$HOME/Library/Caches/JARVIS/npm"
export ELECTRON_CACHE="$HOME/Library/Caches/JARVIS/electron"
mkdir -p "$npm_config_cache" "$ELECTRON_CACHE" "$jarvis_stage/project"
# Copy only source/build inputs. No .env, Git metadata, credentials or existing dependencies.
(cd "$jarvis_source" && tar -cf - package.json package-lock.json tsconfig.json vite.config.ts index.html src scripts tests) | (cd "$jarvis_stage/project" && tar -xf -)
cd "$jarvis_stage/project"
printf '\nMemasang dependensi terkunci, menjalankan tes mock, dan membangun aplikasi…\n'
npm ci
node node_modules/electron/install.js
npm test
npm run package:mac
jarvis_application="$jarvis_stage/project/release/JARVIS-darwin-${jarvis_arch}/JARVIS.app"
[[ -d "$jarvis_application" ]] || fail 'Build tidak menghasilkan JARVIS.app.'
codesign --verify --deep --strict "$jarvis_application"
mkdir -p "$HOME/Applications"
# mkdir reserves a new destination atomically; never replace an existing application.
mkdir "$jarvis_destination" || fail 'Lokasi aplikasi sudah digunakan. Aplikasi lama tidak diubah.'
if ! ditto "$jarvis_application" "$jarvis_destination"; then
  fail "Penyalinan gagal. Aplikasi parsial disimpan untuk diperiksa di $jarvis_destination; tidak dibuka."
fi
printf '\nJ.A.R.V.I.S. terpasang di %s\nMasukkan API key Groq/Fish lewat pengaturan aplikasi.\n' "$jarvis_destination"
open "$jarvis_destination"
