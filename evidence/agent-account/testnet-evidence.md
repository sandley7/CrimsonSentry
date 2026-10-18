# Arquitectura B en testnet: pagar desde una cuenta-contrato

- Fecha: 2026-10-18 07:18 UTC
- Cuenta del agente: [`CBVCNZYOHMOW3WLUKHEND3FXUOBGTFRZUVGDDB7NLEIYSP37GDEPKWTJ`](https://stellar.expert/explorer/testnet/contract/CBVCNZYOHMOW3WLUKHEND3FXUOBGTFRZUVGDDB7NLEIYSP37GDEPKWTJ)
- Dueño `GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH` · Comercio `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Recuperación `GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4` · Relayer (paga las comisiones) `GBB4T6ZNRRQXQS3UH7ALC57CGLPJHYGBG2HARFBCV32N7GHNBWSAYNIO`
- Política: 1 a 10 XLM por pago, 25 XLM por 24 h, máx. 5 pagos · Techos: 20 XLM por pago y 50 XLM por 24 h
- El agente solo firma la autorización de un `transfer` del token; no llama a ningún vault.

| Escenario | Resultado | Transacción |
|---|---|---|
| Pago válido de 8 XLM al comercio | ✅ SUCCESS | [`36acaa4b…`](https://stellar.expert/explorer/testnet/tx/36acaa4b654dd32a5ad20fac324ef617c798524a1c0dd42c1c047650ee4f86e9) |
| 50 XLM a una dirección fuera de la allowlist | 🛑 rechazado en simulación: `#1` | — (nunca llega a la red) |
| Pago de 0,5 XLM, por debajo del mínimo | 🛑 rechazado en simulación: `#12` | — (nunca llega a la red) |
| Pago de 15 XLM, por encima del límite por pago | 🛑 rechazado en simulación: `#2` | — (nunca llega a la red) |
| El dueño intenta mover fondos al comercio (solo puede ir a la recuperación) | 🛑 rechazado en simulación: `#17` | — (nunca llega a la red) |
| 8 XLM a una dirección fuera de la allowlist, enviado aunque la política ya no lo permite | ⛔ **FAILED**: `Error(Contract, #1)` | [`9da0097e…`](https://stellar.expert/explorer/testnet/tx/9da0097e489929a2e899374e67895ff668b88ec89b9bbe2c2572e18519683a3b) |
| Ataque: pago paralelo A de 10 XLM (acumulado 18) | ✅ SUCCESS | [`67999ca5…`](https://stellar.expert/explorer/testnet/tx/67999ca59e9f82293064c8bd6fcef77908391769c33bff836c7e14872d6fbdab) |
| Ataque: pago paralelo B de 10 XLM (acumulado 28 > 25) | ⛔ **FAILED**: `Error(Contract, #3)` | [`83641902…`](https://stellar.expert/explorer/testnet/tx/836419020e2dbb2f0fe6aaa6e6569c506685c192204446acb4060158c6be529a) |
| El dueño mueve 10 XLM a la dirección de recuperación | ✅ SUCCESS | [`a4952d49…`](https://stellar.expert/explorer/testnet/tx/a4952d49ae25bb474e14474166f35b1b542951c28004bc9691ade432162c02cf) |
| Pago de 1 XLM con la cuenta en pausa | 🛑 rechazado en simulación: `#7` | — (nunca llega a la red) |

## Estado final de la cuenta

```json
{"balance":"720000000","ceilings":{"max_daily_limit":"500000000","max_tx_limit":"200000000"},"owner":"GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH","paused":false,"payments_last_24h":2,"policy":{"allowlist":["GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS"],"daily_limit":"250000000","max_payments_per_day":5,"min_amount":"10000000","tx_limit":"100000000"},"recovery":"GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4","remaining_last_24h":"70000000","spent_last_24h":"180000000","token":"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"}
```

## Lo que esta evidencia no prueba

- Que la cuenta funcione con un facilitador x402 real: aquí el relayer es un script propio. Ver [`docs/ARQUITECTURA-B.md`](../../docs/ARQUITECTURA-B.md).
- Que esté auditada: es un prototipo de testnet.
