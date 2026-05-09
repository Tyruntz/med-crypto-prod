# MedCrypto

> Platform konsultasi medis dengan enkripsi end-to-end. Pesan dienkripsi di sisi klien menggunakan AES-256-CBC sebelum dikirim ke server — plaintext tidak pernah menyentuh database.

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat&logo=flask)](https://flask.palletsprojects.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com)

---

## Tentang

MedCrypto adalah platform konsultasi berbasis web yang menyediakan komunikasi terenkripsi antara dokter dan pasien. Sistem mengimplementasikan hierarki kunci dua lapis (DEK + KEK) dengan seluruh operasi kriptografi dilakukan di browser, sehingga server tidak memiliki akses terhadap isi pesan.

**Demo:** [https://medcrypto.duckdns.org](https://medcrypto.duckdns.org)

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Klien)                        │
│                                                             │
│  encryptMessage(plaintext, DEK)  →  AES-256-CBC + PKCS7     │
│  decryptMessage(ciphertext, DEK, IV)  →  plaintext          │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS / TLS 1.3
┌──────────────▼──────────────────────────────────────────────┐
│                   Nginx (Reverse Proxy)                     │
│            Rate limiting · Terminasi SSL                    │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                Flask + Gunicorn (Backend)                   │
│                                                             │
│  POST /api/unwrap-key   →  Dekripsi DEK menggunakan KEK     │
│  POST /api/messages/:id →  Simpan {ciphertext, iv}          │
│  GET  /api/messages/:id →  Kembalikan {ciphertext, iv}      │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  PostgreSQL (Basis Data)                    │
│                                                             │
│  messages      →  ciphertext (Base64) + iv (Hex)            │
│  consultations →  encrypted_room_key (wrapped DEK)          │
└─────────────────────────────────────────────────────────────┘
```

### Manajemen Kunci

```
KEK (Master Key)  ──────►  wrap_dek()  ──────►  Wrapped DEK  →  Database
                                                      │
                                                      ▼
                           unwrap_dek()  ◄──────  /api/unwrap-key
                                │
                                ▼
                        DEK (plaintext)  →  Memory browser (volatile)
                                │
                                ▼
                      AES-256-CBC enkripsi/dekripsi
```

---

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Backend | Python 3.11 + Flask 3.0 |
| WSGI Server | Gunicorn 22 |
| Basis Data | PostgreSQL 16 |
| Reverse Proxy | Nginx Alpine |
| Kriptografi (server) | PyCryptodome 3.20 |
| Kriptografi (klien) | CryptoJS 4.2 |
| Kontainerisasi | Docker + Docker Compose |
| SSL | Let's Encrypt via Certbot |

---

## Memulai

### Prasyarat

- Python 3.11+
- Docker & Docker Compose
- PostgreSQL (atau gunakan setup Docker yang sudah disertakan)

### Pengembangan Lokal

```bash
git clone https://github.com/Tyruntz/med-crypto-prod.git
cd med-crypto-prod

pip install -r requirements.txt

cp .env.example .env
# Edit .env sesuai konfigurasi
# Untuk dev lokal, gunakan DATABASE_URL=sqlite:///medcrypto.db

python app.py
# → http://localhost:5000
```

**Kredensial demo:**

| Peran | Username | Password |
|---|---|---|
| Pasien | `budi` | `pasien123` |
| Dokter | `dr_andi` | `dokter123` |

### Deploy ke Produksi

#### 1. Persiapan Server (Ubuntu 22.04)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
sudo apt install -y docker-compose-plugin
```

#### 2. Deploy

```bash
git clone https://github.com/Tyruntz/med-crypto-prod.git
cd med-crypto-prod
chmod +x deploy.sh
./deploy.sh
```

Script deploy otomatis akan:
- Membuat `SECRET_KEY`, `MASTER_KEK`, dan `POSTGRES_PASSWORD` secara acak
- Build dan menjalankan semua container (App + PostgreSQL + Nginx)
- Menjalankan migrasi database dan seed data awal
- Memverifikasi health check

#### 3. Setup SSL

```bash
sudo apt install -y python3-venv
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install certbot certbot-dns-duckdns

mkdir -p ~/.secrets
echo "dns_duckdns_token=TOKEN_ANDA" > ~/.secrets/duckdns.ini
chmod 600 ~/.secrets/duckdns.ini

sudo /opt/certbot/bin/certbot certonly \
  --authenticator dns-duckdns \
  --dns-duckdns-credentials ~/.secrets/duckdns.ini \
  -d domain.duckdns.org

mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/domain.duckdns.org/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/domain.duckdns.org/privkey.pem nginx/ssl/key.pem
sudo chown -R $USER:$USER nginx/ssl
docker compose restart nginx
```

#### 4. Pembaruan Aplikasi

```bash
git pull origin main
./deploy.sh --update
```

---

## Struktur Proyek

```
med-crypto-prod/
├── app.py                 # Aplikasi Flask & routes
├── wsgi.py                # Entry point Gunicorn
├── database.py            # SQLAlchemy + Flask-Migrate
├── models.py              # Model User, Consultation, Message
├── encryption_utils.py    # Operasi KEK/DEK sisi server
├── migrate.py             # Skrip migrasi database
├── gunicorn.conf.py       # Konfigurasi Gunicorn
├── deploy.sh              # Skrip deployment otomatis
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Orkestrasi multi-service
├── nginx/
│   └── nginx.conf         # Reverse proxy + SSL + rate limiting
├── static/
│   ├── css/style.css
│   └── js/
│       ├── crypto-logic.js    # Kriptografi AES-256-CBC sisi klien
│       └── chat.js            # UI chat + KMS handshake
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── dashboard.html
│   ├── chat_room.html
│   └── error.html
├── .env.example
├── .gitignore
└── requirements.txt
```

---

## Keamanan

| Ancaman | Mitigasi |
|---|---|
| Kebocoran database | Enkripsi sisi klien — hanya ciphertext yang tersimpan |
| Intersepsi jaringan | TLS 1.3 + enkripsi AES-256 berlapis |
| Brute force login | Rate limiting Nginx (5 req/menit per IP) |
| Kebocoran kunci | Hierarki kunci dua lapis (DEK + KEK) |
| Pencurian sesi | Flask signed session + `SECRET_KEY` |
| Akses API tidak sah | Autentikasi berbasis sesi di semua endpoint |
| Serangan IV reuse | IV acak kriptografis per pesan |

---

## Referensi API

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/unwrap-key` | Wajib | Dekripsi dan kembalikan DEK untuk sesi konsultasi |
| `GET` | `/api/messages/:id` | Wajib | Ambil pesan terenkripsi |
| `POST` | `/api/messages/:id` | Wajib | Simpan pesan terenkripsi |
| `GET` | `/health` | Publik | Health check |

---

## Perintah Berguna

```bash
# Lihat log real-time
docker compose logs -f app
docker compose logs -f nginx

# Akses PostgreSQL
docker compose exec db psql -U medcrypto_user -d medcrypto_db

# Lihat pesan terenkripsi di database
docker compose exec db psql -U medcrypto_user -d medcrypto_db \
  -c "SELECT id, sender_id, LEFT(ciphertext,40)||'...' AS ciphertext, iv, created_at FROM messages;"

# Backup database
docker compose exec db pg_dump -U medcrypto_user medcrypto_db > backup_$(date +%Y%m%d).sql

# Matikan semua service
docker compose down

# Matikan dan hapus semua data
docker compose down -v
```

---

## Lisensi

MIT License — lihat [LICENSE](LICENSE) untuk detail lengkap.