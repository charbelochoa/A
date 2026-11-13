import argparse
import tarfile
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description="Empaquetar aplicación y utilidades de Aluranee")
    parser.add_argument("--release", default=datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"))
    args = parser.parse_args()
    if not args.release or any(character not in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-" for character in args.release):
        parser.error("Identificador de versión no válido")
    output = ROOT / ".local"
    output.mkdir(exist_ok=True)
    archive = output / "aluranee-release.tar.gz"
    files = ["requirements.txt", "channel.json", "server/__init__.py", "server/app.py", "server/db.py", "scripts/manage.py", "scripts/traffic.py", "scripts/seed_bank.py", "deploy/aluranee.service", "deploy/Caddyfile", "deploy/install.sh"]
    files += [str(path.relative_to(ROOT)) for path in (ROOT / "web").rglob("*") if path.is_file()]
    with tarfile.open(archive, "w:gz") as package:
        for name in files:
            package.add(ROOT / name, arcname=Path(name).as_posix())
    (output / "release-id.txt").write_text(args.release, encoding="utf-8")
    print(f"Versión {args.release}: {archive}")


if __name__ == "__main__":
    main()
