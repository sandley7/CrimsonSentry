# x402 en testnet con el facilitador alojado

- Fecha: 2026-10-18 07:49 UTC
- Facilitador: `https://channels.openzeppelin.com/x402/testnet` (público, gratuito en testnet; clave de API sin registro)
- Cuenta pagadora (contrato): [`CCZZLL4CPKBO3K6EMQ5KMVLSI5JI46HT756UAUCI75ZN4KIU5M27F3JC`](https://stellar.expert/explorer/testnet/contract/CCZZLL4CPKBO3K6EMQ5KMVLSI5JI46HT756UAUCI75ZN4KIU5M27F3JC) · Comercio: `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Monto: 8 XLM
- Cliente: `tools/agent-account/x402/client.mjs` (adaptado, firma para cuentas-contrato)

| Paso | Resultado |
|---|---|
| `GET /supported` | HTTP 200: `[{"extra":{"areFeesSponsored":true},"network":"stellar:testnet","scheme":"exact","x402Version":2}]` |
| `POST /verify` | HTTP 200: **válido** |
| `POST /settle` | HTTP 200: ✅ [`576f8b08…`](https://stellar.expert/explorer/testnet/tx/576f8b08d93dd4b11ae40ab55fd3ce77a7998c9752f98430c600edd072a244d9) |

Comisión de recursos que calculó la simulación para este pago: 286,114 stroops.
