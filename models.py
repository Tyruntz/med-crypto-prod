from database import db
from datetime import datetime


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)  # Hashed via SHA-256
    role = db.Column(db.String(20), nullable=False)       # 'dokter' | 'pasien'

    sent_messages = db.relationship("Message", foreign_keys="Message.sender_id", backref="sender", lazy=True)

    def to_dict(self):
        return {"id": self.id, "username": self.username, "role": self.role}


class Consultation(db.Model):
    __tablename__ = "consultations"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    doctor_id  = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    # DEK yang sudah dienkripsi dengan Master Key (KEK)
    encrypted_room_key = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    patient  = db.relationship("User", foreign_keys=[patient_id])
    doctor   = db.relationship("User", foreign_keys=[doctor_id])
    messages = db.relationship("Message", backref="consultation", lazy=True,
                                order_by="Message.created_at")


class Message(db.Model):
    __tablename__ = "messages"

    id              = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=False)
    sender_id       = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    ciphertext      = db.Column(db.Text, nullable=False)        # AES-256 encrypted
    iv              = db.Column(db.String(32), nullable=False)  # Hex IV unik per pesan
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":              self.id,
            "consultation_id": self.consultation_id,
            "sender_id":       self.sender_id,
            "sender_username": self.sender.username if self.sender else "?",
            "ciphertext":      self.ciphertext,
            "iv":              self.iv,
            "created_at":      self.created_at.strftime("%H:%M"),
        }
