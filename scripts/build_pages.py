import argparse
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description="Preparar frontend estático de Aluranee")
    parser.add_argument("--base", default="/A")
    parser.add_argument("--api", default="https://aluranee-api.136-118-8-128.sslip.io")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    api = urlsplit(args.api)
    if not re.fullmatch(r"(?:/[A-Za-z0-9_-]+)*", base):
        parser.error("Ruta base no válida")
    if api.scheme != "https" or not api.hostname or api.username or api.password or api.path not in ("", "/") or api.query or api.fragment:
        parser.error("La API debe ser un origen HTTPS")
    output = ROOT / ".local" / "pages"
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "web" / "assets", output / "assets", dirs_exist_ok=True)
    for filename in ("index.html", "app.js", "information.js", "style.css"):
        source = (ROOT / "web" / filename).read_text(encoding="utf-8")
        source = source.replace('href="/', f'href="{base}/').replace('src="/', f'src="{base}/')
        source = source.replace("url('/", f"url('{base}/")
        if filename == "app.js":
            source = source.replace('href="${mobile ?', 'href="' + base + '${mobile ?')
        if filename == "index.html":
            policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' " + args.api.rstrip("/") + "; frame-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'"
            source = source.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n<meta name="referrer" content="same-origin">')
        (output / filename).write_text(source, encoding="utf-8")
    (output / "config.js").write_text("window.ALURANEE_CONFIG = " + json.dumps({"basePath": base, "apiOrigin": args.api.rstrip("/")}) + ";\n", encoding="utf-8")
    manifest = {"name": "Aluranee Bank", "short_name": "Aluranee", "start_url": base + "/app/", "scope": base + "/", "display": "standalone", "background_color": "#f3f1eb", "theme_color": "#102c43", "icons": [{"src": base + f"/assets/app-icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png"} for size in (192, 512)]}
    (output / "manifest.webmanifest").write_text(json.dumps(manifest), encoding="utf-8")
    (output / ".nojekyll").touch()
    (output / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    entry = (output / "index.html").read_text(encoding="utf-8")
    routes = ["acceso", "registro", "movil", "banca", "app", "app/registro", "personas", "patrimonio", "nosotros", "seguridad", "ayuda", "terminos", "privacidad"]
    routes += [f"{channel}/{page}" for channel in ("banca", "app") for page in ("cuentas", "transferir", "movimientos", "tarjetas", "beneficiarios", "atencion", "perfil", "mas")]
    for route in routes:
        target = output / route
        target.mkdir(parents=True, exist_ok=True)
        (target / "index.html").write_text(entry, encoding="utf-8")
    (output / "404.html").write_text(entry, encoding="utf-8")
    print(f"Frontend preparado: {output}")


if __name__ == "__main__":
    main()
