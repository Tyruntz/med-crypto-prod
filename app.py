"""
app.py — MedCrypto Production Entry Point
"""
import os
from flask import (Flask, render_template, request, redirect,
                   url_for, session, jsonify, abort)
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-fallback-secret")

# PostgreSQL via DATABASE_URL
database_url = os.getenv("DATABASE_URL", "sqlite:///medcrypto.db")
# Fix untuk Railway/Render yang kadang masih pakai postgres:// (deprecated)
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"]        = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"]      = {
    "pool_pre_ping": True,          # auto-reconnect kalau koneksi putus
    "pool_recycle":  300,           # recycle koneksi tiap 5 menit
}

from database import db, init_db
from models import User, Consultation, Message
from encryption_utils import verify_password, unwrap_dek

init_db(app)


# ---------------------------------------------------------------------------
# Context processor — inject current_user ke semua template
# ---------------------------------------------------------------------------
@app.context_processor
def inject_user():
    uid  = session.get("user_id")
    user = User.query.get(uid) if uid else None
    return {"current_user": user}


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def get_current_user():
    uid = session.get("user_id")
    return User.query.get(uid) if uid else None


def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_current_user():
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(403)
def forbidden(e):
    return render_template("error.html", code=403, msg="Akses ditolak."), 403

@app.errorhandler(404)
def not_found(e):
    return render_template("error.html", code=404, msg="Halaman tidak ditemukan."), 404

@app.errorhandler(500)
def server_error(e):
    return render_template("error.html", code=500, msg="Server error. Coba lagi."), 500


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if get_current_user():
        return redirect(url_for("dashboard"))
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = User.query.filter_by(username=username).first()
        if user and verify_password(password, user.password):
            session["user_id"] = user.id
            return redirect(url_for("dashboard"))
        error = "Username atau password salah."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    user = get_current_user()
    if user.role == "pasien":
        consultations = Consultation.query.filter_by(patient_id=user.id).all()
    else:
        consultations = Consultation.query.filter_by(doctor_id=user.id).all()
    return render_template("dashboard.html", user=user, consultations=consultations)


@app.route("/chat/<int:consultation_id>")
@login_required
def chat_room(consultation_id):
    user = get_current_user()
    c    = Consultation.query.get_or_404(consultation_id)
    if user.id not in (c.patient_id, c.doctor_id):
        abort(403)
    other = c.doctor if user.id == c.patient_id else c.patient
    return render_template("chat_room.html", user=user, consultation=c, other=other)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
@app.route("/api/unwrap-key", methods=["POST"])
@login_required
def api_unwrap_key():
    data            = request.get_json(force=True)
    consultation_id = data.get("consultation_id")
    c = Consultation.query.get(consultation_id)
    if not c:
        return jsonify({"error": "Konsultasi tidak ditemukan"}), 404
    user = get_current_user()
    if user.id not in (c.patient_id, c.doctor_id):
        return jsonify({"error": "Akses ditolak"}), 403
    try:
        dek_hex = unwrap_dek(c.encrypted_room_key).hex()
        return jsonify({"dek": dek_hex})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/messages/<int:consultation_id>", methods=["GET"])
@login_required
def api_get_messages(consultation_id):
    c    = Consultation.query.get_or_404(consultation_id)
    user = get_current_user()
    if user.id not in (c.patient_id, c.doctor_id):
        return jsonify({"error": "Akses ditolak"}), 403
    return jsonify({"messages": [m.to_dict() for m in c.messages]})


@app.route("/api/messages/<int:consultation_id>", methods=["POST"])
@login_required
def api_post_message(consultation_id):
    c    = Consultation.query.get_or_404(consultation_id)
    user = get_current_user()
    if user.id not in (c.patient_id, c.doctor_id):
        return jsonify({"error": "Akses ditolak"}), 403
    data       = request.get_json(force=True)
    ciphertext = data.get("ciphertext")
    iv         = data.get("iv")
    if not ciphertext or not iv:
        return jsonify({"error": "ciphertext dan iv wajib diisi"}), 400
    msg = Message(
        consultation_id=consultation_id,
        sender_id=user.id,
        ciphertext=ciphertext,
        iv=iv,
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({"status": "ok", "message": msg.to_dict()}), 201


# ---------------------------------------------------------------------------
# Healthcheck endpoint (buat monitoring / uptime check)
# ---------------------------------------------------------------------------
@app.route("/health")
def health():
    return jsonify({"status": "ok", "app": "MedCrypto"}), 200


if __name__ == "__main__":
    # Dev mode only — production pakai gunicorn
    app.run(debug=False, host="0.0.0.0", port=5000)
