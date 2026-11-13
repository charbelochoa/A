import argparse
import json
import secrets
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.db import DATA, create_customer, database, initialize


def counts(db):
    return {
        "synthetic_users": db.execute("SELECT COUNT(*) FROM users WHERE synthetic=1").fetchone()[0],
        "synthetic_accounts": db.execute("SELECT COUNT(*) FROM accounts a JOIN users u ON u.team_id=a.team_id WHERE u.synthetic=1").fetchone()[0],
        "interactive_users": db.execute("SELECT COUNT(*) FROM users WHERE synthetic=0").fetchone()[0],
        "accounts_total": db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0],
        "transactions": db.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
    }


def record(status, values, target, started):
    report = {"status": status, "target": target, **values, "elapsed_seconds": round(time.monotonic() - started, 1), "updated_at": int(time.time())}
    temporary = DATA / "seed-progress.tmp"
    temporary.write_text(json.dumps(report, indent=2), encoding="utf-8")
    temporary.replace(DATA / "seed-progress.json")
    print(json.dumps(report), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Preparar volumen bancario exclusivamente ficticio")
    parser.add_argument("--accounts", type=int, default=100000)
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.accounts <= 1000000 or not 1 <= args.batch_size <= 500:
        parser.error("Usa entre 1 y 1000000 cuentas y lotes de 1 a 500 clientes")
    initialize()
    started = time.monotonic()
    given = ["Elena", "Mateo", "Valeria", "Tomás", "Lucía", "Emilio", "Renata", "Nicolás"]
    family = ["Albor", "Monteazul", "Valdeluz", "Robledal", "Lunaclara", "Ríoseco", "Piedralba", "Solverde"]
    with database() as db:
        values = counts(db)
    record("running", values, args.accounts, started)
    while values["synthetic_accounts"] < args.accounts:
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute("SELECT COUNT(*) FROM accounts a JOIN users u ON u.team_id=a.team_id WHERE u.synthetic=1").fetchone()[0]
            remaining = args.accounts - current
            if remaining <= 0:
                db.commit()
                break
            customers = min(args.batch_size, remaining // 3)
            if customers:
                position = db.execute("SELECT COUNT(*) FROM users WHERE synthetic=1").fetchone()[0]
                for offset in range(customers):
                    number = position + offset + 1
                    name = f"{given[number % len(given)]} {family[(number // len(given)) % len(family)]} {number:06d}"
                    create_customer(db, name, f"cliente.bulk.{number:06d}@aluranee.invalid", "", synthetic=True)
            else:
                user = db.execute("SELECT id,team_id FROM users WHERE synthetic=1 ORDER BY id LIMIT 1").fetchone()
                if not user:
                    raise RuntimeError("Se requiere al menos un cliente ficticio para completar el volumen")
                for offset in range(remaining):
                    clabe = "990" + "".join(str(secrets.randbelow(10)) for _ in range(15))
                    db.execute("INSERT INTO accounts VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), user["id"], user["team_id"], "Reserva Complementaria", clabe, 12500000, "customer"))
            db.commit()
            values = counts(db)
        record("running", values, args.accounts, started)
    with database() as db:
        values = counts(db)
    record("complete", values, args.accounts, started)


if __name__ == "__main__":
    main()
