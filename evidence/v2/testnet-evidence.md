# Evidencia en Stellar testnet: contrato v2

Registrada el 06/10/2026 desde la rama `v2-contract`. Todo son cuentas y fondos de prueba. **Esta evidencia es de la v2; la del README principal es de la v1.**

## Datos del despliegue

| Dato | Valor |
|---|---|
| Vault v2 | [`CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ`](https://stellar.expert/explorer/testnet/contract/CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ) |
| WASM sha256 | `3d016235d3512a6ebb49ce30946637bd0e049d40f49552415970080d5bacd9c4` ([`wasm-sha256.txt`](wasm-sha256.txt)). Coincide con el build local y con el hash que el escáner (C13) comprueba on-chain |
| Dueño | `GB5UUMWAFCPATYAIVWXKJ4QJSUESEFIT6KIQD6JTOTXPP7YWWQAYWNIH` |
| Agente | `GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L` |
| Dirección de recuperación (fija) | `GATNLW53CFJ6KBCJXROP5RWVRJO77Y4563KQ7QPTI5OYIGS6P7SGS5I4` |
| Comercio permitido (única dirección de la allowlist) | `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` |
| Política | 1 a 10 XLM por pago · 25 XLM por 24 h móviles · máx. 5 pagos en 24 h |
| Techos inmutables | 20 XLM por pago · 50 XLM por 24 h |
| Fondos del vault | 100 XLM |

## Qué se comprobó on-chain

| Escenario | Resultado | Transacción |
|---|---|---|
| Subida del WASM | ✅ | [`96c0213b…`](https://stellar.expert/explorer/testnet/tx/96c0213b54993eb51f23c5e9d8bc889e1194edb8539a42dc11c5b89f986dc313) |
| Despliegue del vault (constructor con recuperación y techos) | ✅ | [`2d958a8b…`](https://stellar.expert/explorer/testnet/tx/2d958a8ba0048d2fd8481b2f2295b4a788efdb559077350a70ab2d1454a9a341) |
| Fondeo del vault con 100 XLM | ✅ | [`fdfffe52…`](https://stellar.expert/explorer/testnet/tx/fdfffe5239c14e2729808774071c662ac5b3e203d1d0ab6a711fd9e4358b4cd8) |
| Pago de 0,5 XLM, por debajo del mínimo de 1 XLM, enviado aunque la simulación lo rechaza | ⛔ **FAILED `Error(Contract, #12)` UnderMinAmount** | [`6f7600d7…`](https://stellar.expert/explorer/testnet/tx/6f7600d7c09b0aca176c931a3adc8ab2d0227bccfd6169aece4d0ee5169b3191) |
| Pago legítimo de 3 XLM al comercio | ✅ SUCCESS | [`87d6ec78…`](https://stellar.expert/explorer/testnet/tx/87d6ec782a036cf9f01abd819727827e48a86aa45cb159356a84058e544bd49b) |
| El dueño retira 10 XLM: el dinero va **solo** a la dirección de recuperación (evento `withdrawn`) | ✅ | [`edaf0df0…`](https://stellar.expert/explorer/testnet/tx/edaf0df0a3c493fbd406013cb9d052090b3e6dce55171392e4b95233963e8488) |
| El dueño intenta subir el límite por pago a 30 XLM (techo: 20 XLM) | 🛑 rechazado en simulación: `#14` PolicyOverCeiling | — |
| El dueño fija la política exactamente en el techo (20 / 50 XLM) | ✅ | [`3daf671c…`](https://stellar.expert/explorer/testnet/tx/3daf671c85c9f42df2b47a55f9739be1b8f14928a076e9e20db39b4c56ae03a8) |
| El dueño restaura la política original (10 / 25 XLM) | ✅ | [`9dd966ac…`](https://stellar.expert/explorer/testnet/tx/9dd966ac80370ec589645976802b7ed4279fab52c88f6c053d06ce72cd399a8c) |
| El agente devuelve 9 997 XLM de su saldo propio al dueño | ✅ | [`877aafc5…`](https://stellar.expert/explorer/testnet/tx/877aafc524adc8837b2a457c2da483a31797a89925080240ec6633bef7887e24) |

Registro generado por el agente: [`agent-v2-limits.md`](agent-v2-limits.md).

### Escáner sobre este vault, después de devolver el excedente

Veredicto: 🟡 revisar (🔴 0 · 🟡 2 · 🟢 14).

- **C1 🟢**: el agente solo puede mover 1,96 XLM fuera del vault. Antes de devolver el excedente salía 🔴 con 9 999 XLM.
- **C13 🟢**: el WASM on-chain es el build de esta rama.
- **C9 🟡**: hay 1 intento rechazado en 24 h (el de `#12`).
- **C12 🟡**: una sola clave controla el vault.

## Demo completa del agente sobre otro vault v2

Vault [`CCIUPWTI62VHOUZGZ5QOFA2L7TB6LQLOYDKEWMFBP4RR52GVKO3NIA7T`](https://stellar.expert/explorer/testnet/contract/CCIUPWTI62VHOUZGZ5QOFA2L7TB6LQLOYDKEWMFBP4RR52GVKO3NIA7T), creado por `scripts/demo-agente.sh` con un agente nuevo. Pagos aprobados al comercio y rechazos on-chain `#1`, `#8` y `#7`. Registro completo: [`agent-demo-20261006-152126.md`](agent-demo-20261006-152126.md).

El comercio permitido es una wallet de pruebas de Freighter, que pasó de 10 000 a **10 015 XLM** al recibir los pagos de las dos demos (8 + 4 + 3).

## Lo que esta evidencia no prueba

- Que la v2 esté auditada: es un prototipo de testnet.
- Que un dueño comprometido no pueda perder fondos: los techos acotan lo que sale por el camino de pagos del agente en cada ventana de 24 h, pero no lo eliminan. Ver [`docs/V2.md`](../../docs/V2.md).
- Que proteja el saldo propio del agente ni los pagos x402/MPP: la arquitectura sigue siendo la A.
