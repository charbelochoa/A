import argparse
import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.db import DATA, create_customer, database, initialize, settings


def main():
    parser = argparse.ArgumentParser(description="Operación del laboratorio Aluranee")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    teams = sub.add_parser("teams")
    teams.add_argument("--count", type=int, default=12)
    start = sub.add_parser("start")
    start.add_argument("--hours", type=float, default=6)
    sub.add_parser("progress")
    sub.add_parser("host-key")
    reset = sub.add_parser("reset-team")
    reset.add_argument("email")
    reset.add_argument("--confirm", required=True, choices=["RESET"])
    args = parser.parse_args()
    initialize()
    if args.command == "init":
        print(f"Instancia preparada: {DATA}")
    elif args.command == "teams":
        if not 1 <= args.count <= 100:
            parser.error("El número de equipos debe estar entre 1 y 100")
        credentials = []
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT COUNT(*) FROM users WHERE synthetic=0").fetchone()[0]
            for i in range(existing + 1, existing + args.count + 1):
                user = create_customer(db, f"Equipo {i:02}", f"equipo.{i:02}@aluranee.invalid", secrets.token_urlsafe(20))
                credentials.append({k: user[k] for k in ("email", "password", "team_id")})
            filename = DATA / f"equipos-{int(time.time())}-{secrets.token_hex(3)}.json"
            filename.write_text(json.dumps(credentials, ensure_ascii=False, indent=2), encoding="utf-8")
            if os.name != "nt":
                filename.chmod(0o600)
            db.commit()
        print(f"{len(credentials)} equipos creados. Credenciales: {filename}")
    elif args.command == "start":
        if not 0 < args.hours <= 24:
            parser.error("Duración válida: más de 0 y hasta 24 horas")
        now = int(time.time())
        with database() as db:
            db.execute("INSERT OR REPLACE INTO settings VALUES('match_end',?)", (str(now + int(args.hours * 3600)),))
        print(f"Cierre Unix: {now + int(args.hours * 3600)}. El banco sigue disponible al cerrar el reto.")
    elif args.command == "progress":
        with database() as db:
            items = [dict(r) for r in db.execute("SELECT u.email,b.status,group_concat(DISTINCT e.action) stages FROM users u JOIN batches b ON b.team_id=u.team_id LEFT JOIN events e ON e.team_id=u.team_id AND e.action LIKE 'challenge.%' WHERE u.synthetic=0 GROUP BY u.id")]
        print(json.dumps(items, ensure_ascii=False, indent=2))
    elif args.command == "host-key":
        print(settings()["host_key"])
    elif args.command == "reset-team":
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            user = db.execute("SELECT * FROM users WHERE email=? AND synthetic=0", (args.email,)).fetchone()
            if not user:
                parser.error("Equipo no encontrado")
            batch = db.execute("SELECT * FROM batches WHERE team_id=?", (user["team_id"],)).fetchone()
            if batch["status"] == "reconciled":
                db.execute("UPDATE accounts SET balance=MAX(0,balance-?) WHERE user_id=? AND name='Cuenta Patrimonial'", (batch["amount"], user["id"]))
            db.execute("UPDATE accounts SET balance=95000000 WHERE id=?", (batch["treasury_id"],))
            db.execute("UPDATE batches SET status='pending' WHERE team_id=?", (user["team_id"],))
            db.execute("DELETE FROM quotes WHERE user_id=?", (user["id"],))
            db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            db.execute("DELETE FROM events WHERE team_id=? AND action LIKE 'challenge.%'", (user["team_id"],))
            db.commit()
        print("Progreso del reto reiniciado. Sesiones y preautorizaciones invalidadas; movimientos conservados.")


if __name__ == "__main__":
    main()
