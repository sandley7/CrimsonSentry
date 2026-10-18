# Evidencia en Stellar testnet: lo que añade la v2

- Fecha: 2026-10-18 06:39 UTC
- Vault: [`CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC`](https://stellar.expert/explorer/testnet/contract/CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC)
- WASM sha256: `96a2ea9ba8350a77e5615341e0d3d7ae7c27dcb9f1aebafae0f4c8732c155810` ([`wasm-sha256.txt`](wasm-sha256.txt))
- Dueño `GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH` · Agente `GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L` · Comercio `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS`
- Recuperación (fija): `GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4`
- Política: 1 a 10 XLM por pago, 25 XLM por 24 h, máx. 5 pagos · Techos: 20 XLM por pago y 50 XLM por 24 h

| Escenario | Resultado on-chain | Transacción |
|---|---|---|
| Pago de 0,5 XLM, por debajo del mínimo de 1 XLM, enviado aunque la simulación lo rechaza | ⛔ **FAILED**: `Error(Contract, #12)` UnderMinAmount | [`e3c8a91d…`](https://stellar.expert/explorer/testnet/tx/e3c8a91d381b437ec1de3a440c8b0f2d48066eb72f42abdddb8bff840e691410) |
| Pago legítimo de 3 XLM al comercio | ✅ SUCCESS | [`9b8d115f…`](https://stellar.expert/explorer/testnet/tx/9b8d115f2dca424610d978b89cd09113aacb81ecdd428bca44888b78db737edd) |
| El dueño retira 10 XLM: el dinero va **solo** a la dirección de recuperación (evento `withdrawn`) | ✅ | [`22ab609b…`](https://stellar.expert/explorer/testnet/tx/22ab609b070547ea3f40794236ac6e3e96d47b1f31c4ced629861f7a14748241) |
| El dueño intenta subir el límite por pago a 30 XLM (techo: 20) | 🛑 rechazado en simulación: `#14` PolicyOverCeiling | — |
| El dueño fija la política exactamente en el techo (20 / 50 XLM) | ✅ | [`cf8b47b6…`](https://stellar.expert/explorer/testnet/tx/cf8b47b614136c8369a1fe203bb52fc94785c0b1624b52658313453e3f4fcf96) |
| El dueño restaura la política original (10 / 25 XLM) | ✅ | [`61dfafb5…`](https://stellar.expert/explorer/testnet/tx/61dfafb5a3547a29e249aa5a024487e9f6b9ea6f6eb14f52e7a74c28cb7879ba) |

Registro del agente: ver el resultado del escenario `tools/agent/scenario-v2.json`.

## Lo que esta evidencia no prueba

- Que la v2 esté auditada: es un prototipo de testnet.
- Que un dueño comprometido no pueda perder fondos: los techos acotan lo que sale por el camino de pagos del agente en cada ventana de 24 h, pero no lo eliminan. Ver [`docs/V2.md`](../docs/V2.md).
- Que proteja el saldo propio del agente ni los pagos x402/MPP: la arquitectura sigue siendo la A.
