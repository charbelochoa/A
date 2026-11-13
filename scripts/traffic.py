import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.app import move
from server.db import database


def main():
    parser = argparse.ArgumentParser(description="Tráfico sintético del banco")
    parser.add_argument("--url", default="http://127.0.0.1:8070")
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--count", type=int, default=0)
    args = parser.parse_args()
    if not 1 <= args.interval <= 300 or args.count < 0:
        parser.error("Intervalo entre 1 y 300 segundos; count >= 0")
    with database() as db:
        accounts = [dict(r) for r in db.execute("SELECT a.id,a.team_id FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.synthetic=1 AND a.name='Cuenta Patrimonial'")]
    count = 0
    while not args.count or count < args.count:
        try:
            with urllib.request.urlopen(args.url.rstrip("/") + random.choice(["/api/health", "/", "/assets/headquarters.webp", "/manifest.webmanifest"]), timeout=5) as response:
                response.read()
            a, b = random.sample(accounts, 2)
            with database() as db:
                db.execute("BEGIN IMMEDIATE")
                reference = move(db, a["team_id"], a["id"], b["id"], random.randint(100, 25000), "Transferencia de red simulada")
                db.commit()
            print(json.dumps({"at": int(time.time()), "reference": reference, "synthetic": True}), flush=True)
        except (urllib.error.URLError, OSError) as error:
            print(json.dumps({"error": str(error)}), flush=True)
        count += 1
        if not args.count or count < args.count:
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
