#!/usr/bin/env python3
"""Archives every testnet transaction cited in the docs, so the evidence survives
a testnet reset (it happens 2-4 times a year).

It reads the Markdown files, finds each Stellar Expert transaction link, asks
Horizon for the transaction (envelope, result and result meta XDR included) and
saves it as evidence/archive/txs/<hash>.json. It also writes
evidence/archive/INDEX.md with one row per transaction.

Only public chain data is stored: no keys, no secrets.

    python scripts/archive-evidence.py            # fetch what is missing
    python scripts/archive-evidence.py --refresh  # fetch everything again
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HORIZON = "https://horizon-testnet.stellar.org"
EXPERT = "https://stellar.expert/explorer/testnet/tx/"
ARCHIVE = ROOT / "evidence" / "archive"
TXS = ARCHIVE / "txs"
SOURCES = [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md")), *sorted((ROOT / "evidence").rglob("*.md"))]
LINK = re.compile(re.escape(EXPERT) + r"([0-9a-f]{64})")
KEEP = (
    "hash", "ledger", "created_at", "successful", "source_account", "fee_charged",
    "operation_count", "memo_type", "envelope_xdr", "result_xdr", "result_meta_xdr",
)


def cited_hashes():
    found = {}
    for path in SOURCES:
        if not path.exists() or ARCHIVE in path.parents:
            continue
        for h in LINK.findall(path.read_text(encoding="utf-8", errors="replace")):
            found.setdefault(h, set()).add(str(path.relative_to(ROOT)).replace("\\", "/"))
    return found


def fetch(tx_hash):
    req = urllib.request.Request(f"{HORIZON}/transactions/{tx_hash}", headers={"User-Agent": "crimsonsentry-archive"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    refresh = "--refresh" in sys.argv
    TXS.mkdir(parents=True, exist_ok=True)
    cites = cited_hashes()
    rows, missing = [], []
    for tx_hash in sorted(cites):
        target = TXS / f"{tx_hash}.json"
        if target.exists() and not refresh:
            data = json.loads(target.read_text(encoding="utf-8"))
        else:
            try:
                raw = fetch(tx_hash)
            except urllib.error.HTTPError as e:
                print(f"  {tx_hash[:12]}... HTTP {e.code}: no disponible en Horizon")
                missing.append(tx_hash)
                continue
            data = {k: raw.get(k) for k in KEEP}
            target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"  {tx_hash[:12]}... archivada (ledger {data['ledger']})")
            time.sleep(0.2)
        rows.append((data["created_at"] or "", tx_hash, data["ledger"], data["successful"], sorted(cites[tx_hash])))

    rows.sort()
    lines = [
        "# Archivo de transacciones de testnet",
        "",
        "Copia de cada transacción citada en los documentos, tomada de Horizon, para que la evidencia no dependa de que testnet siga con el mismo historial. Generado por [`scripts/archive-evidence.py`](../../scripts/archive-evidence.py); cada archivo de `txs/` trae el sobre, el resultado y la metadata en XDR.",
        "",
        "| Fecha (UTC) | Transacción | Ledger | Resultado | Citada en |",
        "|---|---|---|---|---|",
    ]
    for created, tx_hash, ledger, ok, where in rows:
        refs = ", ".join(f"`{w}`" for w in where)
        lines.append(f"| {created[:19].replace('T', ' ')} | [`{tx_hash[:16]}…`](txs/{tx_hash}.json) | {ledger} | {'✅ éxito' if ok else '⛔ falló (revertida)'} | {refs} |")
    if missing:
        lines += ["", "No disponibles en Horizon al archivar:", ""] + [f"- `{h}`" for h in missing]
    (ARCHIVE / "INDEX.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n{len(rows)} transacciones archivadas, {len(missing)} no disponibles. Índice: {ARCHIVE / 'INDEX.md'}")


if __name__ == "__main__":
    main()
