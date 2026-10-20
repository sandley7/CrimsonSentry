# Arquitectura B en testnet: pagar desde una cuenta-contrato

- Fecha: 2026-10-20 06:08 UTC
- Cuenta del agente: [`CC3ZG5MN6MDUQDCTOZ5IFEPH7P5FEJGYZ2G3SOILGJDLRW32TNSUDTZ5`](https://stellar.expert/explorer/testnet/contract/CC3ZG5MN6MDUQDCTOZ5IFEPH7P5FEJGYZ2G3SOILGJDLRW32TNSUDTZ5)
- Dueño `GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH` · Comercio `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Recuperación `GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4` · Relayer (paga las comisiones) `GBB4T6ZNRRQXQS3UH7ALC57CGLPJHYGBG2HARFBCV32N7GHNBWSAYNIO`
- Política: 1 a 10 XLM por pago, 25 XLM por 24 h, máx. 5 pagos · Techos: 20 XLM por pago y 50 XLM por 24 h
- El agente solo firma la autorización de un `transfer` del token; no llama a ningún vault.

| Escenario | Resultado | Transacción |
|---|---|---|
| Pago válido de 8 XLM al comercio | ✅ SUCCESS | [`60e01f5f…`](https://stellar.expert/explorer/testnet/tx/60e01f5fbb4542845930744072259fc4bc6cda8bf4954488e5270732d21c4416) |
| 50 XLM a una dirección fuera de la allowlist | 🛑 rechazado en simulación: `#1` | — (nunca llega a la red) |
| Pago de 0,5 XLM, por debajo del mínimo | 🛑 rechazado en simulación: `#12` | — (nunca llega a la red) |
| Pago de 15 XLM, por encima del límite por pago | 🛑 rechazado en simulación: `#2` | — (nunca llega a la red) |
| El dueño intenta mover fondos al comercio (solo puede ir a la recuperación) | 🛑 rechazado en simulación: `#17` | — (nunca llega a la red) |
| 8 XLM a una dirección fuera de la allowlist, enviado aunque la política ya no lo permite | ⛔ **FAILED**: `Error(Contract, #1)` | [`03ebbf24…`](https://stellar.expert/explorer/testnet/tx/03ebbf249deb13b887c00f4f1c9fbaa96cef7535a66c4c8fa934d88c36bb4d75) |
| Ataque: pago paralelo A de 10 XLM (acumulado 18) | ✅ SUCCESS | [`361b9717…`](https://stellar.expert/explorer/testnet/tx/361b97174bfd0d89b6847c7b13ee9a20f277bfc16a6064a66ca2d2371d8dae1c) |
| Ataque: pago paralelo B de 10 XLM (acumulado 28 > 25) | ⛔ **FAILED**: `Error(Contract, #3)` | [`4b778ead…`](https://stellar.expert/explorer/testnet/tx/4b778eadf7ba93246edc014803624c4b839363841a0c50938336f9cbc2330af9) |
| El dueño mueve 10 XLM a la dirección de recuperación | ✅ SUCCESS | [`424e1477…`](https://stellar.expert/explorer/testnet/tx/424e147704411bbfd6769aead1e25584df6a152e1437f40a1e87691b9fdf791c) |
| Pago de 1 XLM con la cuenta en pausa | 🛑 rechazado en simulación: `#7` | — (nunca llega a la red) |

## Estado final de la cuenta

```json
{"balance":"720000000","ceilings":{"max_daily_limit":"500000000","max_tx_limit":"200000000"},"owner":"GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH","paused":false,"payments_last_24h":2,"policy":{"allowlist":["GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS"],"daily_limit":"250000000","max_payments_per_day":5,"min_amount":"10000000","tx_limit":"100000000"},"recovery":"GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4","remaining_last_24h":"70000000","spent_last_24h":"180000000","token":"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"}
```

## Lo que esta evidencia no prueba

- Que la cuenta funcione con un facilitador x402 real: aquí el relayer es un script propio. Ver [`docs/ARQUITECTURA-B.md`](../../docs/ARQUITECTURA-B.md).
- Que esté auditada: es un prototipo de testnet.
