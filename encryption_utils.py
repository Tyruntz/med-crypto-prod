"""
encryption_utils.py
===================
Server-side crypto helpers untuk KEK (Key Encryption Key) dan DEK (Data Encryption Key).

Bab Skripsi yang relevan:
  - DEK  : kunci 256-bit yang dipakai langsung enkripsi pesan
  - KEK  : master key dari .env yang "membungkus" (wrap) DEK sebelum disimpan ke DB
  - Wrap : enkripsi DEK dengan KEK → hasilnya disimpan di tabel consultations
  - Unwrap: dekripsi wrapped DEK dengan KEK → dikirim ke frontend via HTTPS
"""

import os
import hashlib
import base64

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
from dotenv import load_dotenv

load_dotenv()

_MASTER_KEK_STR = os.getenv("MASTER_KEK", "DefaultFallbackKeyForDev_32Bytes!")


def _get_kek() -> bytes:
    """Normalise KEK ke 32 bytes (AES-256)."""
    raw = _MASTER_KEK_STR.encode("utf-8")
    return hashlib.sha256(raw).digest()  # selalu 32 bytes


# ---------------------------------------------------------------------------
# DEK helpers
# ---------------------------------------------------------------------------

def generate_dek() -> bytes:
    """Generate DEK baru (32 bytes / 256-bit)."""
    return get_random_bytes(32)


def wrap_dek(plaintext_dek: bytes) -> str:
    """
    Enkripsi DEK menggunakan KEK (AES-256 CBC).
    Return: base64-encoded string → aman disimpan di kolom TEXT database.
    Format output: base64(IV || ciphertext)
    """
    kek = _get_kek()
    iv  = get_random_bytes(16)
    cipher = AES.new(kek, AES.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(plaintext_dek, AES.block_size))
    return base64.b64encode(iv + ciphertext).decode("utf-8")


def unwrap_dek(wrapped_dek_b64: str) -> bytes:
    """
    Dekripsi wrapped DEK menggunakan KEK.
    Return: plaintext DEK (bytes) → dikirim ke frontend via HTTPS.
    """
    kek  = _get_kek()
    raw  = base64.b64decode(wrapped_dek_b64)
    iv   = raw[:16]
    ciphertext = raw[16:]
    cipher = AES.new(kek, AES.MODE_CBC, iv)
    return unpad(cipher.decrypt(ciphertext), AES.block_size)


# ---------------------------------------------------------------------------
# Password hashing (simple SHA-256 untuk scope skripsi)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed
