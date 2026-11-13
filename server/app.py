import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.db import ROOT, create_customer, database, event, initialize, settings, verify_password


@asynccontextmanager
async def lifespan(app):
    initialize()
    app.state.config = settings()
    yield


app = FastAPI(title="Aluranee Bank", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
COOKIE = "aluranee_session"
SECURE = os.environ.get("ALURANEE_SECURE_COOKIE", "0") == "1"
ORIGINS = tuple(filter(None, (value.strip() for value in os.environ.get("ALURANEE_ORIGINS", "").split(","))))


def session_token(request: Request):
    return request.headers.get("x-session-token") or request.cookies.get(COOKIE, "")


def fail(status, message):
    raise HTTPException(status_code=status, detail=message)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def sign(value, secret):
    return hmac.new(bytes.fromhex(secret), value.encode(), hashlib.sha256).hexdigest()


def rows(cursor):
    return [dict(r) for r in cursor]


def limited(bucket, maximum, seconds):
    now = int(time.time())
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM attempts WHERE created_at<?", (now - 3600,))
        count = db.execute("SELECT COUNT(*) FROM attempts WHERE bucket=? AND created_at>?", (bucket, now - seconds)).fetchone()[0]
        if count >= maximum:
            fail(429, "Demasiados intentos. Intenta más tarde.")
        db.execute("INSERT INTO attempts VALUES(?,?)", (bucket, now))
        db.commit()


def customer(request: Request):
    token = session_token(request)
    if len(token) != 64:
        fail(401, "Inicia sesión para continuar.")
    with database() as db:
        user = db.execute("SELECT u.id,u.team_id,u.name,u.email,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?", (digest(token), int(time.time()))).fetchone()
    if not user:
        fail(401, "Tu sesión terminó. Vuelve a ingresar.")
    if request.method not in ("GET", "HEAD", "OPTIONS") and not secrets.compare_digest(request.headers.get("x-csrf-token", ""), user["csrf"]):
        fail(403, "No se pudo validar la solicitud.")
    return dict(user)


def challenge(request: Request):
    if request.app.state.config["ctf_enabled"] != "1":
        fail(404, "No encontrado.")
    with database() as db:
        deadline = db.execute("SELECT value FROM settings WHERE key='match_end'").fetchone()
    if deadline and int(time.time()) >= int(deadline["value"]):
        fail(403, "La ventana de conciliación terminó.")


def bridge(request: Request, user=Depends(customer)):
    challenge(request)
    try:
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        a, b, c = token.split(".")
        decode = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
        header, claims = json.loads(decode(a)), json.loads(decode(b))
        expected = hmac.new(bytes.fromhex(request.app.state.config["bridge_secret"]), f"{a}.{b}".encode(), hashlib.sha256).digest()
        if not secrets.compare_digest(expected, decode(c)) or header != {"alg": "HS256", "kid": "mobile-2019", "typ": "JWT"}:
            raise ValueError()
        now = int(time.time())
        if claims.get("iss") != "aluranee-archive" or claims.get("aud") != "aluranee-mobile" or claims.get("sub") != user["id"] or claims.get("scope") != "reconciliation:read" or type(claims.get("exp")) is not int or not now < claims["exp"] <= now + 900:
            raise ValueError()
    except (ValueError, TypeError, KeyError, UnicodeError):
        fail(403, "Credencial de canal no válida.")
    return user


@app.middleware("http")
async def security(request: Request, call_next):
    start = time.monotonic()
    try:
        length = int(request.headers.get("content-length", "0") or "0")
    except ValueError:
        return JSONResponse({"detail": "Longitud no válida."}, status_code=400)
    if length > 32768:
        return JSONResponse({"detail": "Solicitud demasiado grande."}, status_code=413)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if len(await request.body()) > 32768:
            return JSONResponse({"detail": "Solicitud demasiado grande."}, status_code=413)
        origin = request.headers.get("origin")
        allowed = {str(request.base_url).rstrip("/")} | set(ORIGINS)
        if origin and origin not in allowed:
            return JSONResponse({"detail": "Origen no autorizado."}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site" and origin not in ORIGINS:
            return JSONResponse({"detail": "Origen no autorizado."}, status_code=403)
    response = await call_next(request)
    response.headers.update({"X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'", "X-Frame-Options": "SAMEORIGIN"})
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Server-Timing"] = f"app;dur={(time.monotonic() - start) * 1000:.1f}"
    if SECURE:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


app.add_middleware(CORSMiddleware, allow_origins=list(ORIGINS), allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token", "X-Session-Token", "Idempotency-Key", "Authorization", "X-Quote-Id", "X-Quote-Signature"], max_age=600)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=1, max_length=128)


class Register(Login):
    name: str = Field(min_length=3, max_length=70)


def session_response(user_id):
    token, csrf = secrets.token_hex(32), secrets.token_hex(32)
    with database() as db:
        db.execute("DELETE FROM sessions WHERE expires<?", (int(time.time()),))
        db.execute("INSERT INTO sessions VALUES(?,?,?,?)", (digest(token), user_id, csrf, int(time.time()) + 28800))
    response = JSONResponse({"ok": True, "csrf": csrf, "session_token": token})
    response.set_cookie(COOKIE, token, httponly=True, secure=SECURE, samesite="strict", max_age=28800, path="/")
    return response


@app.get("/api/health")
def health():
    with database() as db:
        db.execute("SELECT 1").fetchone()
    return {"status": "ok"}


@app.post("/api/auth/register", status_code=201)
def register(data: Register, request: Request):
    limited("register:" + request.client.host, 20, 3600)
    email = data.email.lower()
    if not re.fullmatch(r"[a-z0-9._+-]+@aluranee\.invalid", email):
        fail(422, "Usa un identificador con dominio @aluranee.invalid.")
    if len(data.password) < 15:
        fail(422, "La contraseña debe tener al menos 15 caracteres.")
    try:
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            user = create_customer(db, data.name, email, data.password)
            db.commit()
    except sqlite3.IntegrityError:
        fail(409, "No se puede registrar ese identificador.")
    return session_response(user["id"])


@app.post("/api/auth/login")
def login(data: Login, request: Request):
    limited("login:" + request.client.host + ":" + digest(data.email.lower()), 12, 900)
    limited("login-ip:" + request.client.host, 180, 900)
    with database() as db:
        user = db.execute("SELECT * FROM users WHERE email=? AND synthetic=0", (data.email.lower(),)).fetchone()
        stored = user["password"] if user else "00" * 16 + ":" + "00" * 64
        valid = verify_password(data.password, stored)
        if not user or not valid:
            fail(401, "Identificador o contraseña incorrectos.")
        event(db, user["team_id"], "session.created")
    return session_response(user["id"])


@app.post("/api/auth/logout")
def logout(request: Request, user=Depends(customer)):
    with database() as db:
        db.execute("DELETE FROM sessions WHERE id=?", (digest(session_token(request)),))
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE, path="/", secure=SECURE, httponly=True, samesite="strict")
    return response


@app.get("/api/me")
def me(user=Depends(customer)):
    return user


@app.get("/api/overview")
def overview(user=Depends(customer)):
    with database() as db:
        accounts = rows(db.execute("SELECT id,name,clabe,balance FROM accounts WHERE user_id=?", (user["id"],)))
        movements = rows(db.execute("SELECT t.* FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE a.user_id=? ORDER BY t.created_at DESC LIMIT 8", (user["id"],)))
        cards = rows(db.execute("SELECT id,account_id,last_four,frozen FROM cards WHERE user_id=?", (user["id"],)))
    return {"accounts": accounts, "transactions": movements, "cards": cards}


@app.get("/api/transactions")
def transactions(account: str = "", q: str = "", page: int = 1, user=Depends(customer)):
    if page < 1 or page > 10000 or len(q) > 80:
        fail(422, "Filtro no válido.")
    with database() as db:
        params = (user["id"], account, account, "%" + q + "%")
        query = "FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE a.user_id=? AND (?='' OR a.id=?) AND t.description LIKE ?"
        count = db.execute("SELECT COUNT(*) " + query, params).fetchone()[0]
        items = rows(db.execute("SELECT t.* " + query + " ORDER BY t.created_at DESC,t.id LIMIT 15 OFFSET ?", params + ((page - 1) * 15,)))
    return {"items": items, "total": count, "page": page}


@app.get("/api/beneficiaries")
def beneficiaries(user=Depends(customer)):
    with database() as db:
        saved = rows(db.execute("SELECT b.id,b.alias,a.clabe,b.account_id FROM beneficiaries b JOIN accounts a ON a.id=b.account_id WHERE b.user_id=?", (user["id"],)))
        directory = rows(db.execute("SELECT a.clabe,u.name FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.synthetic=1 AND a.name='Cuenta Patrimonial' LIMIT 8"))
    return {"items": saved, "directory": directory}


class Beneficiary(Input):
    clabe: str = Field(pattern=r"^990\d{15}$")
    alias: str = Field(min_length=2, max_length=60)


@app.post("/api/beneficiaries", status_code=201)
def save_beneficiary(data: Beneficiary, user=Depends(customer)):
    with database() as db:
        target = db.execute("SELECT a.id FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.clabe=? AND (u.synthetic=1 OR u.id=?)", (data.clabe, user["id"])).fetchone()
        if not target:
            fail(422, "Cuenta no disponible en el directorio del laboratorio.")
        try:
            db.execute("INSERT INTO beneficiaries VALUES(?,?,?,?)", (str(uuid.uuid4()), user["id"], target["id"], data.alias))
        except sqlite3.IntegrityError:
            fail(409, "El beneficiario ya está registrado.")
    return {"ok": True}


@app.delete("/api/beneficiaries/{beneficiary_id}")
def delete_beneficiary(beneficiary_id: str, user=Depends(customer)):
    with database() as db:
        result = db.execute("DELETE FROM beneficiaries WHERE id=? AND user_id=?", (beneficiary_id, user["id"]))
        if not result.rowcount:
            fail(404, "Beneficiario no encontrado.")
    return {"ok": True}


class Transfer(Input):
    from_account: str = Field(max_length=36)
    to_account: str = Field(max_length=36)
    amount: StrictInt = Field(gt=0, le=50000000)
    concept: str = Field(min_length=2, max_length=80)


def move(db, team, source, target, amount, description):
    if amount <= 0 or source == target:
        fail(422, "Operación no válida.")
    debit = db.execute("UPDATE accounts SET balance=balance-? WHERE id=? AND balance>=?", (amount, source, amount))
    if debit.rowcount != 1:
        fail(409, "Saldo insuficiente.")
    credit = db.execute("UPDATE accounts SET balance=balance+? WHERE id=?", (amount, target))
    if credit.rowcount != 1:
        fail(422, "Cuenta de destino no disponible.")
    reference = "AB" + secrets.token_hex(8).upper()
    for account_id, value in [(source, -amount), (target, amount)]:
        db.execute("INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), team, account_id, value, description, reference, int(time.time()), "posted"))
    return reference


@app.post("/api/transfers")
def transfer(data: Transfer, request: Request, user=Depends(customer)):
    key = request.headers.get("idempotency-key", "")
    if not re.fullmatch(r"[a-zA-Z0-9-]{16,80}", key):
        fail(422, "Falta el identificador de operación.")
    fingerprint = digest(data.model_dump_json())
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT * FROM transfers WHERE user_id=? AND idempotency_key=?", (user["id"], key)).fetchone()
        if existing:
            if existing["request_hash"] != fingerprint:
                fail(409, "El identificador corresponde a otra operación.")
            return json.loads(existing["payload"])
        source = db.execute("SELECT id FROM accounts WHERE id=? AND user_id=?", (data.from_account, user["id"])).fetchone()
        target = db.execute("SELECT a.id,a.clabe FROM accounts a WHERE a.id=? AND (a.user_id=? OR EXISTS(SELECT 1 FROM beneficiaries b WHERE b.user_id=? AND b.account_id=a.id)) AND a.kind='customer'", (data.to_account, user["id"], user["id"])).fetchone()
        if not source or not target:
            fail(403, "Cuenta no autorizada.")
        reference = move(db, user["team_id"], data.from_account, data.to_account, data.amount, data.concept)
        receipt = {"id": str(uuid.uuid4()), "reference": reference, "amount": data.amount, "concept": data.concept, "destination": target["clabe"], "created_at": int(time.time()), "status": "Aplicada"}
        db.execute("INSERT INTO transfers VALUES(?,?,?,?,?)", (receipt["id"], user["id"], key, fingerprint, json.dumps(receipt)))
        event(db, user["team_id"], "transfer.posted", reference)
        db.commit()
    return receipt


@app.get("/api/transfers/{transfer_id}/receipt")
def receipt(transfer_id: str, user=Depends(customer)):
    with database() as db:
        transfer = db.execute("SELECT payload FROM transfers WHERE id=? AND user_id=?", (transfer_id, user["id"])).fetchone()
    if not transfer:
        fail(404, "Comprobante no encontrado.")
    data = json.loads(transfer["payload"])
    return PlainTextResponse("ALURANEE BANK\nCOMPROBANTE DE OPERACIÓN SIMULADA\n\n" + "\n".join(f"{k}: {v}" for k, v in data.items()), headers={"Content-Disposition": 'attachment; filename="comprobante-aluranee.txt"'})


class CardState(Input):
    frozen: bool


@app.patch("/api/cards/{card_id}")
def card(card_id: str, data: CardState, user=Depends(customer)):
    with database() as db:
        result = db.execute("UPDATE cards SET frozen=? WHERE id=? AND user_id=?", (int(data.frozen), card_id, user["id"]))
        if not result.rowcount:
            fail(404, "Tarjeta no encontrada.")
    return {"ok": True}


@app.get("/api/support/tickets")
def tickets(user=Depends(customer)):
    with database() as db:
        return {"items": rows(db.execute("SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC", (user["id"],)))}


class Ticket(Input):
    subject: str = Field(min_length=3, max_length=80)
    message: str = Field(min_length=10, max_length=1500)


@app.post("/api/support/tickets", status_code=201)
def create_ticket(data: Ticket, user=Depends(customer)):
    limited("support:" + user["id"], 15, 3600)
    ticket_id, document_id = str(uuid.uuid4()), str(uuid.uuid4())
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO tickets VALUES(?,?,?,?,?,?,?)", (ticket_id, user["id"], data.subject, data.message, "En revisión", document_id, int(time.time())))
        db.execute("INSERT INTO documents VALUES(?,?,?)", (document_id, user["id"], json.dumps({"ticket": ticket_id, "subject": data.subject, "status": "En revisión"})))
        db.commit()
    return {"id": ticket_id}


@app.get("/api/documents/{document_id}")
def document(document_id: str, user=Depends(customer)):
    with database() as db:
        item = db.execute("SELECT content FROM documents WHERE id=? AND user_id=?", (document_id, user["id"])).fetchone()
    if not item:
        fail(404, "Documento no encontrado.")
    return json.loads(item["content"])


class Export(Input):
    ticket_id: str = Field(max_length=36)
    document_id: str = Field(max_length=36)


@app.post("/api/support/export")
def export_document(data: Export, request: Request, user=Depends(customer)):
    with database() as db:
        if not db.execute("SELECT 1 FROM tickets WHERE id=? AND user_id=?", (data.ticket_id, user["id"])).fetchone():
            fail(404, "Solicitud no encontrada.")
        if request.app.state.config["ctf_enabled"] == "1":
            item = db.execute("SELECT * FROM documents WHERE id=? AND (user_id=? OR user_id IS NULL)", (data.document_id, user["id"])).fetchone()
        else:
            item = db.execute("SELECT * FROM documents WHERE id=? AND user_id=?", (data.document_id, user["id"])).fetchone()
        if not item:
            fail(404, "Documento no encontrado.")
        if item["user_id"] is None:
            event(db, user["team_id"], "challenge.archive")
    return JSONResponse(json.loads(item["content"]), headers={"Content-Disposition": 'attachment; filename="expediente-aluranee.json"'})


@app.get("/robots.txt")
def robots():
    return PlainTextResponse("User-agent: *\nDisallow: /archivo/\nDisallow: /api/bridge/\nDisallow: /banca\n")


@app.get("/archivo/")
def archive(request: Request):
    challenge(request)
    return {"collection": "Migración documental", "index": "/archivo/AR-6100.json", "retention": "2019"}


@app.get("/archivo/AR-6100.json")
def archive_manifest(request: Request):
    challenge(request)
    return {"incident": "AR-6100", "subject": "Migración del canal móvil", "attachment": request.app.state.config["incident_document"], "status": "custodia cifrada", "client_release": "/mobile/releases/2019.4.json", "delivery": "Exportación por mesa de atención; requiere expediente vigente"}


@app.get("/mobile/releases/2019.4.json")
def release_manifest(request: Request):
    challenge(request)
    return {"release": "2019.4", "certificate": {"sha256": request.app.state.config["release_fingerprint"]}, "adapter": "query-v1", "bridge": "/api/bridge/", "contract": "/mobile/releases/query-v1.txt"}


@app.get("/mobile/releases/query-v1.txt")
def bridge_contract(request: Request):
    challenge(request)
    return PlainTextResponse("ALURANEE MOBILE / QUERY-V1\n\nGET reconciliation: resumen de lote.\nPOST preview: from_account, to_account, amount (centavos), batch.\nPOST commit: cuerpo application/x-www-form-urlencoded; X-Quote-Id y X-Quote-Signature.\nEl gateway firma pares únicos ordenados por nombre, codificación URL UTF-8.\nLos terminales previos a 2020 conservan todas las ocurrencias en el transporte.\nGET attestation: certificación del lote conciliado.\nLas credenciales del canal requieren sesión de cliente y caducan en 15 minutos.\n")


@app.get("/api/bridge/reconciliation")
def reconciliation(user=Depends(bridge)):
    with database() as db:
        batch = dict(db.execute("SELECT * FROM batches WHERE team_id=?", (user["team_id"],)).fetchone())
        event(db, user["team_id"], "challenge.bridge")
    return {"batch": batch, "policy": "Conciliar el importe completo de la concentradora contra la cuenta patrimonial del cliente.", "preview": "/api/bridge/preview", "commit": "/api/bridge/commit"}


class Preview(Input):
    from_account: str = Field(max_length=36)
    to_account: str = Field(max_length=36)
    amount: StrictInt = Field(gt=0, le=100000)
    batch: str = Field(max_length=36)


@app.post("/api/bridge/preview")
def preview(data: Preview, request: Request, user=Depends(bridge)):
    with database() as db:
        own = {r["id"] for r in db.execute("SELECT id FROM accounts WHERE user_id=?", (user["id"],))}
        if data.from_account not in own or data.to_account not in own or data.from_account == data.to_account:
            fail(403, "La preautorización sólo admite cuentas propias.")
        if not db.execute("SELECT 1 FROM batches WHERE id=? AND team_id=? AND status='pending'", (data.batch, user["team_id"])).fetchone():
            fail(404, "Lote no disponible.")
        canonical = urlencode(sorted((k, str(v)) for k, v in data.model_dump().items()))
        quote_id = str(uuid.uuid4())
        expires = int(time.time()) + 120
        db.execute("INSERT INTO quotes(id,user_id,canonical,expires) VALUES(?,?,?,?)", (quote_id, user["id"], canonical, expires))
    signature = sign(quote_id + ":" + canonical, request.app.state.config["quote_secret"])
    return {"quote_id": quote_id, "signature": signature, "body": canonical, "expires": expires}


@app.post("/api/bridge/commit")
async def commit(request: Request, user=Depends(bridge)):
    if request.headers.get("content-type", "").split(";")[0] != "application/x-www-form-urlencoded":
        fail(415, "Formato de canal no válido.")
    try:
        raw = await request.body()
        if len(raw) > 4096:
            fail(413, "Solicitud demasiado grande.")
        pairs = parse_qsl(raw.decode("ascii"), keep_blank_values=True, strict_parsing=True, max_num_fields=12)
        first = {}
        for key, value in pairs:
            first.setdefault(key, value)
        if set(first) != {"from_account", "to_account", "amount", "batch"}:
            raise ValueError()
        canonical = urlencode(sorted(first.items()))
        execution = dict(pairs) if request.app.state.config["ctf_enabled"] == "1" else first
        if request.app.state.config["ctf_enabled"] != "1" and len(pairs) != len(first):
            fail(422, "Parámetros repetidos.")
        amount = int(execution["amount"])
        if not 0 < amount <= 95000000:
            raise ValueError()
    except (ValueError, UnicodeError, KeyError):
        fail(422, "Mensaje de canal no válido.")
    quote_id = request.headers.get("x-quote-id", "")
    signature = request.headers.get("x-quote-signature", "")
    expected = sign(quote_id + ":" + canonical, request.app.state.config["quote_secret"])
    if not secrets.compare_digest(signature, expected):
        fail(403, "Firma de preautorización no válida.")
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        quote = db.execute("SELECT * FROM quotes WHERE id=? AND user_id=? AND used=0 AND expires>?", (quote_id, user["id"], int(time.time()))).fetchone()
        if not quote or quote["canonical"] != canonical:
            fail(409, "Preautorización vencida o utilizada.")
        if first["batch"] != execution["batch"]:
            fail(403, "El lote no coincide.")
        batch = db.execute("SELECT * FROM batches WHERE id=? AND team_id=? AND status='pending'", (execution["batch"], user["team_id"])).fetchone()
        if not batch:
            fail(404, "Lote no disponible.")
        source = db.execute("SELECT * FROM accounts WHERE id=? AND team_id=?", (execution["from_account"], user["team_id"])).fetchone()
        target = db.execute("SELECT * FROM accounts WHERE id=? AND user_id=?", (execution["to_account"], user["id"])).fetchone()
        if not source or not target:
            fail(403, "Cuenta fuera del perímetro del cliente.")
        reference = move(db, user["team_id"], source["id"], target["id"], amount, "Conciliación de canal móvil")
        db.execute("UPDATE quotes SET used=1 WHERE id=?", (quote_id,))
        if source["id"] == batch["treasury_id"] and amount == batch["amount"] and target["name"] == "Cuenta Patrimonial":
            db.execute("UPDATE batches SET status='reconciled' WHERE id=?", (batch["id"],))
            event(db, user["team_id"], "challenge.reconciled", reference)
        db.commit()
    return {"reference": reference, "status": "applied"}


@app.get("/api/bridge/attestation")
def attestation(request: Request, user=Depends(bridge)):
    with database() as db:
        batch = db.execute("SELECT * FROM batches WHERE team_id=?", (user["team_id"],)).fetchone()
        if batch["status"] != "reconciled":
            fail(409, "El lote aún no está conciliado.")
        event(db, user["team_id"], "challenge.flag")
    return {"attestation": request.app.state.config["flag"], "algorithm": "SHA-256", "batch": batch["id"]}


@app.get("/api/host/progress")
def host_progress(request: Request):
    if not secrets.compare_digest(request.headers.get("x-host-key", ""), request.app.state.config["host_key"]):
        fail(404, "No encontrado.")
    with database() as db:
        progress = rows(db.execute("SELECT u.name,u.email,u.team_id,b.status,MAX(CASE WHEN e.action='challenge.archive' THEN e.created_at END) archive_at,MAX(CASE WHEN e.action='challenge.bridge' THEN e.created_at END) bridge_at,MAX(CASE WHEN e.action='challenge.flag' THEN e.created_at END) flag_at FROM users u JOIN batches b ON b.team_id=u.team_id LEFT JOIN events e ON e.team_id=u.team_id WHERE u.synthetic=0 GROUP BY u.id"))
    return {"teams": progress}


app.mount("/assets", StaticFiles(directory=ROOT / "web" / "assets"), name="assets")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(ROOT / "web" / "assets" / "seal.webp", media_type="image/webp")


@app.get("/manifest.webmanifest")
def manifest():
    return JSONResponse({"name": "Aluranee Bank", "short_name": "Aluranee", "start_url": "/app", "display": "standalone", "background_color": "#f3f1eb", "theme_color": "#102c43", "icons": [{"src": "/assets/app-icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/assets/app-icon-512.png", "sizes": "512x512", "type": "image/png"}]}, media_type="application/manifest+json")


@app.get("/{path:path}")
def frontend(path: str):
    files = {"app.js": "app.js", "information.js": "information.js", "style.css": "style.css", "config.js": "config.js"}
    if path in files:
        return FileResponse(ROOT / "web" / files[path])
    if not path and json.loads((ROOT / "channel.json").read_text())["default"] == "mobile":
        return RedirectResponse("/app")
    if path in ("", "banca", "acceso", "registro", "app", "movil", "personas", "patrimonio", "nosotros", "seguridad", "ayuda", "terminos", "privacidad") or path.startswith(("banca/", "app/")):
        return FileResponse(ROOT / "web" / "index.html", headers={"Cache-Control": "no-cache"})
    fail(404, "No encontrado.")
