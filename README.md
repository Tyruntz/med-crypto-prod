# MedCrypto — Sistem Konsultasi Medis Terenkripsi AES-256

Implementasi skripsi: **"Implementasi Algoritma AES-256 dalam Pengamanan Pesan pada Aplikasi Web Konsultasi Medis"**

## Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Python 3.11 + Flask |
| Database | PostgreSQL 16 |
| Kriptografi | PyCryptodome (server) + CryptoJS (client) |
| Server | Gunicorn (WSGI) |
| Proxy | Nginx |
| Container | Docker + Docker Compose |

## Arsitektur Keamanan

```
Browser (Client)
   │  encryptMessage(plaintext, DEK)  ← AES-256 CBC
   │  decryptMessage(ciphertext, DEK, IV)
   │
   ├─ POST /api/unwrap-key ──────────► Flask (KMS)
   │   {consultation_id}                  │  unwrap_dek(encrypted_DEK, KEK)
   │   ◄── {dek: hex} via HTTPS ──────────┘
   │
   ├─ POST /api/messages/{id} ───────► Flask → PostgreSQL
   │   {ciphertext, iv}                   Store: ciphertext + iv (no plaintext!)
   │
   └─ GET  /api/messages/{id} ───────► Flask → PostgreSQL
       ◄── {messages: [{ciphertext, iv}]}  Client decrypt in-browser
```

## Quick Start (Dev)

```bash
# Clone / extract project
cd med-crypto-prod

# Install dependencies
pip install -r requirements.txt

# Setup .env
cp .env.example .env
# Edit .env: isi DATABASE_URL, SECRET_KEY, MASTER_KEK

# Jalankan (SQLite fallback kalau postgres belum ada)
python app.py
# → http://localhost:5000
```

**Demo credentials:**
- Pasien: `budi` / `pasien123`
- Dokter: `dr_andi` / `dokter123`

---

## Deploy ke VPS / GCP (Production)

### Prerequisites di VPS

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Clone / upload project ke VPS
git clone <repo-url> med-crypto-prod
# ATAU: scp -r med-crypto-prod/ user@VPS_IP:~/
cd med-crypto-prod
```

### Deploy Otomatis

```bash
chmod +x deploy.sh
./deploy.sh
```

Script ini akan:
1. Generate `SECRET_KEY`, `MASTER_KEK`, dan `POSTGRES_PASSWORD` secara otomatis
2. Build Docker image
3. Start PostgreSQL + App + Nginx
4. Jalankan migrasi database
5. Verifikasi health check

### Update App (tanpa downtime)

```bash
git pull origin main   # kalau pakai git
./deploy.sh --update
```

### Setup SSL (HTTPS) — Opsional tapi Recommended

```bash
# Install Certbot
sudo apt install -y certbot

# Generate certificate (ganti dengan domain lo)
sudo certbot certonly --standalone -d yourdomain.com

# Copy ke folder nginx/ssl
mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   nginx/ssl/key.pem
sudo chown -R $USER:$USER nginx/ssl

# Restart nginx
docker compose restart nginx
```

---

## Struktur File

```
med-crypto-prod/
│
├── app.py                # Flask routes + config production
├── wsgi.py               # Gunicorn entry point
├── database.py           # SQLAlchemy + Flask-Migrate init
├── models.py             # User, Consultation, Message
├── encryption_utils.py   # KEK/DEK wrap/unwrap (server-side)
├── migrate.py            # Script setup DB
├── gunicorn.conf.py      # Gunicorn workers, timeout, logging
├── deploy.sh             # Auto-deploy script
│
├── Dockerfile            # Multi-stage build
├── docker-compose.yml    # App + PostgreSQL + Nginx
│
├── nginx/
│   └── nginx.conf        # Reverse proxy + rate limiting + SSL
│
├── static/
│   ├── css/style.css
│   └── js/
│       ├── crypto-logic.js   # AES-256 CBC encrypt/decrypt
│       └── chat.js           # KMS handshake + UI chat
│
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── dashboard.html
│   ├── chat_room.html
│   └── error.html
│
├── .env.example          # Template env (aman di-commit)
├── .gitignore
└── requirements.txt
```

---

## Perintah Berguna

```bash
# Lihat logs real-time
docker compose logs -f app
docker compose logs -f nginx

# Masuk ke container app
docker compose exec app bash

# Masuk ke PostgreSQL
docker compose exec db psql -U medcrypto_user -d medcrypto_db

# Lihat data pesan terenkripsi di DB (demo sidang!)
docker compose exec db psql -U medcrypto_user -d medcrypto_db \
  -c "SELECT id, sender_id, LEFT(ciphertext,40)||'...' AS ciphertext_sample, iv FROM messages;"

# Backup database
docker compose exec db pg_dump -U medcrypto_user medcrypto_db > backup.sql

# Matikan semua
docker compose down

# Matikan + hapus data (HATI-HATI!)
docker compose down -v
```

---

## Demo Sidang Checklist

- [ ] Buka SQLite/PostgreSQL Browser → tunjukkan kolom `ciphertext` berisi data acak
- [ ] Network Tab DevTools → POST `/api/messages` → payload sudah `{ciphertext, iv}`, bukan plaintext
- [ ] Ketik "Halo" dua kali → ciphertext BEDA (karena IV random per pesan)
- [ ] Hover 🔒 di bubble pesan → tampil ciphertext + IV
- [ ] Tunjukkan `/api/unwrap-key` → DEK hanya dikirim via HTTPS, tidak disimpan di localStorage
