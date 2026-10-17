# CrimsonSentry — evidencia en testnet

- Fecha: 2026-09-23 07:25 UTC
- Vault: [`CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG`](https://stellar.expert/explorer/testnet/contract/CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG)
- Agente: `GCJYDHTA7IJ3MTFTKFOWIJL7JT72ITLOEWFXNLJIRWZR4YDMJLM3DFLV` · Dueño: `GBJ6ET45Z564CPAGJF6FHATLNW335YNYFDI3MWZK45CP5HH44G3I73AS` · Comercio permitido: `GBJ3X4V6XOHZFMQNT7UR4DYBYSRWVQNVSPC6K7AYXILPREZDF5LGFPSK`
- Política: 10 XLM por pago, 25 XLM por 24h móviles, máx. 5 pagos por 24h

| # | Escenario | Resultado | Transacción |
|---|---|---|---|
| 1 | Pago válido de 10 XLM | ✅ SUCCESS | [`353b05e366f9…`](https://stellar.expert/explorer/testnet/tx/353b05e366f9e4491b87747bfea9e5e624a33307c413470df5926d6cdc990671) |
| 2a | Pago de 15 XLM (límite por pago 10) | 🛑 bloqueado en simulación: `Error(Contract, #2)` | — (nunca llega a la red) |
| 2b | Pago a dirección fuera de la allowlist | 🛑 bloqueado en simulación: `Error(Contract, #1)` | — (nunca llega a la red) |
| 3a | Ataque: pago paralelo A de 10 XLM (acumulado 20) | ✅ SUCCESS | [`c1fa5ea6a2d2…`](https://stellar.expert/explorer/testnet/tx/c1fa5ea6a2d240a82fe25a39b98a1f8355921b76564b1d55696f4260b467971d) |
| 3b | Ataque: pago paralelo B de 10 XLM (acumulado 30 > 25) | ⛔ FAILED (revertida) | [`89f54fceaeb9…`](https://stellar.expert/explorer/testnet/tx/89f54fceaeb9907fd1c8bbe63663a4b4cfd3fc9b0bbe94ed5d6481832add745b) |
| 4 | Pago de 1 XLM con el vault en pausa | 🛑 bloqueado en simulación: `Error(Contract, #7)` | — (nunca llega a la red) |

## Estado final del vault

```json
{"agent":"GCJYDHTA7IJ3MTFTKFOWIJL7JT72ITLOEWFXNLJIRWZR4YDMJLM3DFLV","balance":"800000000","owner":"GBJ6ET45Z564CPAGJF6FHATLNW335YNYFDI3MWZK45CP5HH44G3I73AS","paused":false,"payments_last_24h":2,"policy":{"allowlist":["GBJ3X4V6XOHZFMQNT7UR4DYBYSRWVQNVSPC6K7AYXILPREZDF5LGFPSK"],"daily_limit":"250000000","max_payments_per_day":5,"tx_limit":"100000000"},"remaining_last_24h":"50000000","spent_last_24h":"200000000","token":"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"}
```
