#!/bin/bash
# ============================================================
# deploy.sh — MedCrypto Auto Deploy Script
# Target: Ubuntu 22.04 VPS / GCP Compute Engine
#
# Usage pertama kali:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Update app (re-deploy):
#   ./deploy.sh --update
# ============================================================

set -e  # exit on error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[→]${NC} $1"; }

UPDATE_MODE=false
[[ "$1" == "--update" ]] && UPDATE_MODE=true

echo ""
echo "========================================"
echo "   MedCrypto — Production Deploy"
echo "========================================"
echo ""

# --------------------------------------------------------
# 1. Cek prerequisites
# --------------------------------------------------------
info "Mengecek prerequisites..."

command -v docker        &>/dev/null || err "Docker belum terinstall. Install dulu: https://docs.docker.com/engine/install/ubuntu/"
command -v docker-compose &>/dev/null || \
  docker compose version  &>/dev/null || err "Docker Compose belum terinstall."
log "Docker & Docker Compose tersedia"

# --------------------------------------------------------
# 2. Cek .env
# --------------------------------------------------------
info "Mengecek konfigurasi .env..."

if [ ! -f ".env" ]; then
    warn ".env tidak ditemukan, membuat dari .env.example..."
    cp .env.example .env

    # Generate random keys
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    MASTER_KEK=$(python3 -c "import secrets; print(secrets.token_urlsafe(32)[:32])")
    PG_PASS=$(python3 -c "import secrets; print(secrets.token_hex(16))")

    sed -i "s|ganti-dengan-random-string-panjang-minimal-32-char|${SECRET_KEY}|g" .env
    sed -i "s|ganti-dengan-master-key-yang-sangat-rahasia-32c|${MASTER_KEK}|g" .env
    sed -i "s|password|${PG_PASS}|g" .env

    echo "POSTGRES_PASSWORD=${PG_PASS}" >> .env

    warn "File .env telah dibuat dengan keys yang ter-generate otomatis."
    warn "Simpan backup .env ini di tempat yang aman!"
    echo ""
    cat .env
    echo ""
fi

# Validasi variabel wajib
source .env
[ -z "$SECRET_KEY" ]  && err "SECRET_KEY kosong di .env"
[ -z "$MASTER_KEK" ]  && err "MASTER_KEK kosong di .env"
log ".env valid"

# --------------------------------------------------------
# 3. Build & Deploy
# --------------------------------------------------------
if [ "$UPDATE_MODE" = true ]; then
    info "Update mode — rebuild app tanpa downtime..."
    docker compose build app
    docker compose up -d --no-deps app
    log "App di-update!"
else
    info "Fresh deploy — menjalankan semua service..."
    docker compose pull db nginx
    docker compose build
    docker compose up -d
    log "Semua container berjalan"
fi

# --------------------------------------------------------
# 4. Tunggu DB siap lalu migrate
# --------------------------------------------------------
info "Menunggu PostgreSQL siap..."
MAX_WAIT=30
COUNT=0
until docker compose exec -T db pg_isready -U medcrypto_user -d medcrypto_db &>/dev/null; do
    COUNT=$((COUNT+1))
    [ $COUNT -ge $MAX_WAIT ] && err "PostgreSQL timeout setelah ${MAX_WAIT}s"
    echo -n "."
    sleep 1
done
echo ""
log "PostgreSQL siap"

info "Menjalankan migrasi database..."
docker compose exec -T app python migrate.py
log "Migrasi selesai"

# --------------------------------------------------------
# 5. Verifikasi health check
# --------------------------------------------------------
info "Verifikasi health check..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log "Health check OK (HTTP 200)"
else
    warn "Health check response: ${HTTP_CODE} — cek logs dengan: docker compose logs app"
fi

# --------------------------------------------------------
# 6. Status
# --------------------------------------------------------
echo ""
echo "========================================"
echo "   Deploy Selesai!"
echo "========================================"
docker compose ps
echo ""
echo "Akses aplikasi:"
echo "  HTTP  → http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo "  Local → http://localhost"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f app     # lihat logs real-time"
echo "  docker compose logs -f nginx   # lihat nginx logs"
echo "  docker compose ps              # cek status container"
echo "  docker compose down            # matikan semua"
echo "  ./deploy.sh --update           # update app"
echo ""
