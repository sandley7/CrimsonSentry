# x402 en testnet con el facilitador alojado

- Fecha: 2026-10-18 07:36 UTC
- Facilitador: `https://channels.openzeppelin.com/x402/testnet` (público, gratuito en testnet; clave de API sin registro)
- Cuenta pagadora (contrato): [`CB2NFQYXG3IG2VLLDT6LOLR5WSOALMN2WKQPDA42BS26OCYJESJJ3AZE`](https://stellar.expert/explorer/testnet/contract/CB2NFQYXG3IG2VLLDT6LOLR5WSOALMN2WKQPDA42BS26OCYJESJJ3AZE) · Comercio: `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Monto: 1 XLM
- Cliente: `tools/agent-account/x402/client.mjs` (adaptado, firma para cuentas-contrato)

| Paso | Resultado |
|---|---|
| `GET /supported` | HTTP 200: `[{"extra":{"areFeesSponsored":true},"network":"stellar:testnet","scheme":"exact","x402Version":2}]` |
| `POST /verify` | HTTP 200: **válido** |
| `POST /settle` | HTTP 200: ✅ [`3f7faedb…`](https://stellar.expert/explorer/testnet/tx/3f7faedbf00b7a7b38bb84e18e7387a11c9c16bb6772d3ea0b69cfcde5ff717e) |

Comisión de recursos que calculó la simulación para este pago: 286,048 stroops.
