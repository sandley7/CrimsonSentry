# x402 en testnet con el facilitador alojado

- Fecha: 2026-10-20 06:11 UTC
- Facilitador: `https://channels.openzeppelin.com/x402/testnet` (público, gratuito en testnet; clave de API sin registro)
- Cuenta pagadora (contrato): [`CB5BHCD6QM3YOXPVBEHEFYSDX4S7IB46J3KBMD3FYUCQTRGJYFKVTWSS`](https://stellar.expert/explorer/testnet/contract/CB5BHCD6QM3YOXPVBEHEFYSDX4S7IB46J3KBMD3FYUCQTRGJYFKVTWSS) · Comercio: `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Monto: 8 XLM
- Cliente: `tools/agent-account/x402/client.mjs` (adaptado, firma para cuentas-contrato)

| Paso | Resultado |
|---|---|
| `GET /supported` | HTTP 200: `[{"extra":{"areFeesSponsored":true},"network":"stellar:testnet","scheme":"exact","x402Version":2}]` |
| `POST /verify` | HTTP 200: **válido** |
| `POST /settle` | HTTP 200: ✅ [`f88a4ab6…`](https://stellar.expert/explorer/testnet/tx/f88a4ab62df544237b368e71469b4e6499f85487b13968fad83e3645e199190a) |

Comisión de recursos que calculó la simulación para este pago: 298,649 stroops.
