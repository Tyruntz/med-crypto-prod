"""
gunicorn.conf.py
================
Konfigurasi Gunicorn untuk production deployment di VPS/GCP.
Jalankan: gunicorn -c gunicorn.conf.py wsgi:application
"""
import os
import multiprocessing

# -----------------------------------------------------------
# Server socket
# -----------------------------------------------------------
bind    = f"0.0.0.0:{os.getenv('GUNICORN_PORT', '8000')}"
backlog = 2048

# -----------------------------------------------------------
# Workers
# Formula standar: (2 × CPU cores) + 1
# -----------------------------------------------------------
workers     = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "sync"
threads     = 2
timeout     = 120
keepalive   = 5

# -----------------------------------------------------------
# Logging
# -----------------------------------------------------------
accesslog = "-"   # stdout → ditangkap systemd journal
errorlog  = "-"
loglevel  = "info"
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sµs'

# -----------------------------------------------------------
# Process naming
# -----------------------------------------------------------
proc_name = "medcrypto"

# -----------------------------------------------------------
# Security
# -----------------------------------------------------------
limit_request_line   = 4096
limit_request_fields = 100
