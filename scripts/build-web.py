#!/usr/bin/env python3
"""Assembles the public demo site into _site/ (what GitHub Pages publishes).

The page reuses the scanner's own modules, so the site is built from three places:

    web/                      the page itself (index.html, app.js, style.css)
    tools/lib, tools/scanner  the same code the CLI scanner runs (checks.js, owasp.js, stellar.js)
    evidence/                 the WASM hash the scanner compares against and the archived transactions

It also regenerates web/data/evidence.json from the evidence tables.

    python scripts/build-web.py
    python -m http.server 8080 --directory _site     # preview at http://localhost:8080
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "_site"
TX = re.compile(r"https://stellar\.expert/explorer/testnet/tx/([0-9a-f]{64})")


def rows(path, group, with_step=False):
    """Rows of a Markdown evidence table whose last cell links a transaction.

    Tables with 4 columns start with a step or number (testnet-evidence.md, the agent demo);
    tables with 3 do not (testnet-v2-features.md)."""
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        m = TX.search(line)
        if not m or len(cells) < 3 or cells[0].startswith("---"):
            continue
        result = cells[-2]
        if len(cells) >= 4:
            label = f"{cells[0]} · {cells[1]}" if with_step else cells[1]
        else:
            label = cells[0]
        clean = lambda t: re.sub(r"[*`]", "", t)
        out.append({
            "group": group,
            "label": clean(label),
            "result": clean(result),
            "ok": result.lstrip().startswith("✅"),
            "hash": m.group(1),
        })
    return out


def build_evidence():
    ev = ROOT / "evidence"
    items = []
    items += rows(ev / "testnet-evidence.md", "Pagos paralelos y kill switch")
    items += rows(ev / "testnet-v2-features.md", "Lo que añade la v2")
    for demo in sorted(ev.glob("agent-demo-*.md")):
        items += rows(demo, "Demo del agente (cliente comprometido)", with_step=True)
    # Architecture B: the agent account (a contract) enforcing the policy in __check_auth
    acct = ev / "agent-account"
    if (acct / "testnet-evidence.md").exists():
        items += rows(acct / "testnet-evidence.md", "Arquitectura B: pagar desde una cuenta-contrato")
    for name, label in (("x402-evidence.md", "x402: pago liquidado por el código oficial del facilitador (en local)"),
                        ("x402-hosted-evidence.md", "x402: pago liquidado por el facilitador alojado de testnet"),
                        ("x402-http-evidence.md", "x402 por HTTP: GET /premium devuelve 402, el agente paga desde su cuenta-contrato y recibe 200")):
        f = acct / name
        if f.exists():
            m = re.search(r"(?:settle|liquidado)[^\n]*" + TX.pattern, f.read_text(encoding="utf-8"))
            if m:
                items.append({"group": "Arquitectura B: pagar desde una cuenta-contrato", "label": label,
                              "result": "✅ SUCCESS", "ok": True, "hash": m.group(1)})
    data = ROOT / "web" / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "evidence.json").write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(items)


def copy(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def main():
    n = build_evidence()
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(ROOT / "web", SITE)
    for name in ("stellar.js",):
        copy(ROOT / "tools" / "lib" / name, SITE / "tools" / "lib" / name)
    for name in ("checks.js", "owasp.js"):
        copy(ROOT / "tools" / "scanner" / name, SITE / "tools" / "scanner" / name)
    copy(ROOT / "evidence" / "wasm-sha256.txt", SITE / "evidence" / "wasm-sha256.txt")
    shutil.copytree(ROOT / "evidence" / "archive" / "txs", SITE / "evidence" / "archive" / "txs")
    copy(ROOT / "docs" / "logo.jpg", SITE / "logo.jpg")
    print(f"Sitio armado en {SITE} ({n} transacciones en evidence.json)")


if __name__ == "__main__":
    main()
