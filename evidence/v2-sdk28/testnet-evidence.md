# CrimsonSentry — evidencia en testnet

- Fecha: 2026-10-17 22:13 UTC
- Vault: [`CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ`](https://stellar.expert/explorer/testnet/contract/CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ)
- Agente: `GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L` · Dueño: `GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH` · Comercio permitido: `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS`
- Política: 1 a 10 XLM por pago, 25 XLM por 24h móviles, máx. 5 pagos por 24h

| # | Escenario | Resultado | Transacción |
|---|---|---|---|
| 1 | Pago válido de 10 XLM | ✅ SUCCESS | [`e3cd1527d1a6…`](https://stellar.expert/explorer/testnet/tx/e3cd1527d1a63cb6e8ccac3b7aaa089528536be3532b995b430b7b33eb488658) |
| 2a | Pago de 15 XLM (límite por pago 10) | 🛑 bloqueado en simulación: `Error(Contract, #2)` | — (nunca llega a la red) |
| 2b | Pago a dirección fuera de la allowlist | 🛑 bloqueado en simulación: `Error(Contract, #1)` | — (nunca llega a la red) |
| 3a | Ataque: pago paralelo A de 10 XLM (acumulado 20) | ✅ SUCCESS | [`58ff376cf874…`](https://stellar.expert/explorer/testnet/tx/58ff376cf8743781d67ea3a00642183c2453424088b818ee89994eb955e5b9ba) |
| 3b | Ataque: pago paralelo B de 10 XLM (acumulado 30 > 25) | ⛔ FAILED (revertida) | [`e7a809bc23d5…`](https://stellar.expert/explorer/testnet/tx/e7a809bc23d560e03916066bace425dd10cc861337a805ee979198c3b5fa8867) |
| 4 | Pago de 1 XLM con el vault en pausa | 🛑 bloqueado en simulación: `Error(Contract, #7)` | — (nunca llega a la red) |

## Estado final del vault

```json
{"agent":"GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L","balance":"670000000","ceilings":{"max_daily_limit":"500000000","max_tx_limit":"200000000"},"owner":"GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH","paused":false,"payments_last_24h":2,"policy":{"allowlist":["GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS"],"daily_limit":"250000000","max_payments_per_day":5,"min_amount":"10000000","tx_limit":"100000000"},"recovery":"GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4","remaining_last_24h":"50000000","spent_last_24h":"200000000","token":"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"}
```
