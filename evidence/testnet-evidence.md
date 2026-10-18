# CrimsonSentry — evidencia en testnet

- Fecha: 2026-10-18 06:38 UTC
- Vault: [`CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC`](https://stellar.expert/explorer/testnet/contract/CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC)
- Agente: `GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L` · Dueño: `GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH` · Comercio permitido: `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS`
- Política: 1 a 10 XLM por pago, 25 XLM por 24h móviles, máx. 5 pagos por 24h

| # | Escenario | Resultado | Transacción |
|---|---|---|---|
| 1 | Pago válido de 10 XLM | ✅ SUCCESS | [`42c5dbb2bc11…`](https://stellar.expert/explorer/testnet/tx/42c5dbb2bc11c9deba7546a8a8c6cf047d8ede2bff917d6112f2e8879819b991) |
| 2a | Pago de 15 XLM (límite por pago 10) | 🛑 bloqueado en simulación: `Error(Contract, #2)` | — (nunca llega a la red) |
| 2b | Pago a dirección fuera de la allowlist | 🛑 bloqueado en simulación: `Error(Contract, #1)` | — (nunca llega a la red) |
| 3a | Ataque: pago paralelo A de 10 XLM (acumulado 20) | ✅ SUCCESS | [`e1823c212027…`](https://stellar.expert/explorer/testnet/tx/e1823c2120275bcf5c5ad4d234d2653e05b70841de775973bdc1f3a28a152e47) |
| 3b | Ataque: pago paralelo B de 10 XLM (acumulado 30 > 25) | ⛔ FAILED (revertida) | [`28e5ef02603a…`](https://stellar.expert/explorer/testnet/tx/28e5ef02603a2246723b5e889b94bb4940e796fb134228bf8281b6f433f02e63) |
| 4 | Pago de 1 XLM con el vault en pausa | 🛑 bloqueado en simulación: `Error(Contract, #7)` | — (nunca llega a la red) |

## Estado final del vault

```json
{"agent":"GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L","balance":"800000000","ceilings":{"max_daily_limit":"500000000","max_tx_limit":"200000000"},"owner":"GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH","paused":false,"payments_last_24h":2,"policy":{"allowlist":["GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS"],"daily_limit":"250000000","max_payments_per_day":5,"min_amount":"10000000","tx_limit":"100000000"},"recovery":"GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4","remaining_last_24h":"50000000","spent_last_24h":"200000000","token":"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"}
```
