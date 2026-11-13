import hashlib
import json
import os
import random
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("ALURANEE_DATA", ROOT / ".local"))


@contextmanager
def database():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / "bank.sqlite3", timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=15000")
    try:
        yield db
    finally:
        if db.in_transaction:
            db.rollback()
        db.close()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"{salt}:{digest}"


def verify_password(password, stored):
    return secrets.compare_digest(password_hash(password, stored.split(":")[0]), stored)


def settings():
    with database() as db:
        return {r["key"]: r["value"] for r in db.execute("SELECT * FROM settings")}


def event(db, team, action, detail=""):
    db.execute("INSERT INTO events(team_id,action,detail,created_at) VALUES(?,?,?,?)", (team, action, detail[:300], int(time.time())))


def create_customer(db, name, email, password, synthetic=False):
    user_id, team = str(uuid.uuid4()), str(uuid.uuid4())
    db.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)", (user_id, team, name, email, password_hash(password), int(synthetic), int(time.time())))
    accounts = []
    for kind, balance in [("Cuenta Patrimonial", 14865075), ("Reserva Aluranee", 32500000)]:
        account = str(uuid.uuid4())
        clabe = "990" + "".join(str(secrets.randbelow(10)) for _ in range(15))
        db.execute("INSERT INTO accounts VALUES(?,?,?,?,?,?,?)", (account, user_id, team, kind, clabe, balance, "customer"))
        accounts.append(account)
    treasury = str(uuid.uuid4())
    db.execute("INSERT INTO accounts VALUES(?,?,?,?,?,?,?)", (treasury, None, team, "Cuenta concentradora", "990" + "".join(str(secrets.randbelow(10)) for _ in range(15)), 95000000, "treasury"))
    batch = str(uuid.uuid4())
    db.execute("INSERT INTO batches VALUES(?,?,?,?,?,?)", (batch, team, treasury, 95000000, "pending", secrets.token_hex(16)))
    db.execute("INSERT INTO cards VALUES(?,?,?,?,?)", (str(uuid.uuid4()), user_id, accounts[0], str(secrets.randbelow(9000) + 1000), 0))
    ticket = str(uuid.uuid4())
    document = str(uuid.uuid4())
    db.execute("INSERT INTO tickets VALUES(?,?,?,?,?,?,?)", (ticket, user_id, "Consulta de movimiento", "Solicitud de comprobante de la migración AR-6100.", "Resuelto", document, int(time.time()) - 86400))
    db.execute("INSERT INTO documents VALUES(?,?,?)", (document, user_id, json.dumps({"reference": "AR-6101", "status": "applied", "migration": "AR-6100", "channel": "mobile-2019", "delivery": "/api/support/export"})))
    rng = random.Random(user_id)
    merchants = ["Galería del Parque", "Casa Origen", "Librería Central", "Restaurante Olmo", "Servicios del Valle", "Abono patrimonial", "Transferencia recibida"]
    for i in range(26):
        amount = rng.randint(8500, 485000) * (1 if i % 5 == 0 else -1)
        db.execute("INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), team, accounts[0], amount, merchants[i % len(merchants)], "AB" + secrets.token_hex(6).upper(), int(time.time()) - i * 39150, "posted"))
    event(db, team, "customer.created", "synthetic" if synthetic else "participant")
    return {"id": user_id, "team_id": team, "email": email, "password": password, "accounts": accounts}


def initialize():
    with database() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,team_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,synthetic INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),team_id TEXT NOT NULL,name TEXT NOT NULL,clabe TEXT NOT NULL UNIQUE,balance INTEGER NOT NULL CHECK(balance>=0),kind TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS beneficiaries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),account_id TEXT NOT NULL REFERENCES accounts(id),alias TEXT NOT NULL,UNIQUE(user_id,account_id));
CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,team_id TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES accounts(id),amount INTEGER NOT NULL,description TEXT NOT NULL,reference TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS transactions_account ON transactions(account_id,created_at);
CREATE TABLE IF NOT EXISTS transfers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,idempotency_key));
CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,account_id TEXT NOT NULL,last_four TEXT NOT NULL,frozen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,document_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,user_id TEXT,content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,team_id TEXT NOT NULL,treasury_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,nonce TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,canonical TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,team_id TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(bucket TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_bucket ON attempts(bucket,created_at);
""")
        db.execute("BEGIN IMMEDIATE")
        if not db.execute("SELECT 1 FROM settings LIMIT 1").fetchone():
            values = {"session_secret": secrets.token_hex(32), "bridge_secret": secrets.token_hex(32), "quote_secret": secrets.token_hex(32), "host_key": secrets.token_urlsafe(36), "release_fingerprint": secrets.token_hex(32), "incident_document": str(uuid.uuid4()), "ctf_enabled": os.environ.get("ALURANEE_CTF", "1")}
            values["flag"] = os.environ.get("ALURANEE_FLAG", "")
            if not values["flag"]:
                raise RuntimeError("Define ALURANEE_FLAG antes de inicializar la instancia")
            db.executemany("INSERT INTO settings VALUES(?,?)", values.items())
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
            key = hashlib.pbkdf2_hmac("sha256", values["release_fingerprint"].encode(), salt, 210000)
            payload = json.dumps({"kid": "mobile-2019", "key_hex": values["bridge_secret"], "issuer": "aluranee-archive", "audience": "aluranee-mobile", "scope": "reconciliation:read", "exchange": "/api/bridge/reconciliation", "transport": "JWT HS256; Authorization: Bearer; sub = current customer id; exp = Unix seconds"}).encode()
            import base64
            envelope = {"format": "AB-ESCROW/1", "cipher": "AES-256-GCM", "kdf": "PBKDF2-HMAC-SHA256", "iterations": 210000, "password_source": "mobile release certificate fingerprint, lowercase hexadecimal UTF-8", "salt": salt.hex(), "nonce": nonce.hex(), "aad": "AR-6100", "ciphertext": base64.b64encode(AESGCM(key).encrypt(nonce, payload, b"AR-6100")).decode()}
            db.execute("INSERT INTO documents VALUES(?,NULL,?)", (values["incident_document"], json.dumps(envelope)))
            for i in range(120):
                names = ["Elena", "Mateo", "Valeria", "Tomás", "Lucía", "Emilio", "Renata", "Nicolás"]
                surnames = ["Albor", "Monteazul", "Valdeluz", "Robledal", "Lunaclara", "Ríoseco", "Piedralba", "Solverde"]
                create_customer(db, f"{names[i % 8]} {surnames[(i // 8) % 8]} {i + 1:03}", f"cliente.{i + 1:03}@aluranee.invalid", secrets.token_urlsafe(30), True)
        db.commit()
