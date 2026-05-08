"""
wsgi.py
=======
Entry point untuk Gunicorn production server.
Gunicorn command: gunicorn wsgi:application
"""
from app import app as application

if __name__ == "__main__":
    application.run()
