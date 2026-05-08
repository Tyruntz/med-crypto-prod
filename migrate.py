#!/usr/bin/env python3
"""
migrate.py
==========
Script setup & migrasi database production.
Jalankan sekali setelah deploy pertama kali:
  python migrate.py

Aman dijalankan berulang (idempotent).
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Pastikan DATABASE_URL ada
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("[ERROR] DATABASE_URL tidak ditemukan di .env")
    sys.exit(1)

print(f"[migrate] Target DB: {db_url.split('@')[-1]}")  # print host/db saja, tanpa password

from app import app
from database import db

with app.app_context():
    print("[migrate] Membuat tabel...")
    db.create_all()
    print("[migrate] Tabel berhasil dibuat.")

    # Seed demo data
    from database import _seed_demo_data
    _seed_demo_data()

    # Verifikasi
    from models import User, Consultation, Message
    user_count   = User.query.count()
    consult_count = Consultation.query.count()
    msg_count    = Message.query.count()

    print(f"\n[migrate] Status database:")
    print(f"  Users        : {user_count}")
    print(f"  Consultations: {consult_count}")
    print(f"  Messages     : {msg_count}")
    print("\n[migrate] ✓ Selesai!")
