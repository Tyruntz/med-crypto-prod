from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()


def init_db(app):
    db.init_app(app)
    migrate.init_app(app, db)

    with app.app_context():
        db.create_all()
        _seed_demo_data()


def _seed_demo_data():
    """Seed user & konsultasi demo — skip kalau sudah ada."""
    from models import User, Consultation
    from encryption_utils import hash_password, wrap_dek, generate_dek

    if User.query.first():
        return

    dokter = User(username="dr_andi", password=hash_password("dokter123"), role="dokter")
    pasien = User(username="budi",    password=hash_password("pasien123"), role="pasien")
    db.session.add_all([dokter, pasien])
    db.session.flush()

    dek     = generate_dek()
    enc_dek = wrap_dek(dek)
    konsul  = Consultation(
        patient_id=pasien.id,
        doctor_id=dokter.id,
        encrypted_room_key=enc_dek,
    )
    db.session.add(konsul)
    db.session.commit()
    print("[DB] Seeded: dr_andi/dokter123 | budi/pasien123")
