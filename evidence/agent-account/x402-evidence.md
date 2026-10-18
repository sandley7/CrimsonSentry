# x402 en testnet: pago desde una cuenta-contrato

- Fecha: 2026-10-18 07:33 UTC
- Cuenta pagadora (contrato): [`CB2NFQYXG3IG2VLLDT6LOLR5WSOALMN2WKQPDA42BS26OCYJESJJ3AZE`](https://stellar.expert/explorer/testnet/contract/CB2NFQYXG3IG2VLLDT6LOLR5WSOALMN2WKQPDA42BS26OCYJESJJ3AZE)
- Comercio (`payTo`): `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Facilitador: GBB4T6ZN…SAYNIO (el relayer)
- **Cliente:** `tools/agent-account/x402/client.mjs`, una copia del cliente oficial de `@x402/stellar` que firma para una cuenta-contrato.
- **Facilitador:** `ExactStellarScheme` de `@x402/stellar/exact/facilitator` 2.20, **sin modificar**, ejecutado en local con el relayer como firmante.
- No se usó el servicio de facilitador alojado ni un servidor HTTP de recursos.

| Paso | Resultado |
|---|---|
| El cliente **oficial** con una dirección de contrato | Falla: `invalid version byte. expected 48, got 16` |
| Pago de 8 XLM, facilitador con su tope de comisión por defecto (50 000 stroops) | `verify`: **inválido** (`invalid_exact_stellar_payload_fee_exceeds_maximum`: simulation-derived fee 286131 stroops exceeds ceiling 50000 stroops) |
| El mismo pago, tope subido a 2 000 000 de stroops | `verify`: **válido** (pagador: la cuenta-contrato) |
| `settle` | ✅ [`80cc4c7a…`](https://stellar.expert/explorer/testnet/tx/80cc4c7ae7e88796405e0578dfb5ce4ca1858cf38b4623f3c2713961ce44f368) |
| 15 XLM, above the per-payment limit of 10 XLM | refused by the account (#2) |
| the owner key paying the shop instead of the recovery address | refused by the account (#17) |

## Costo

| Pago | Comisión de recursos (simulación) |
|---|---|
| Transferencia clásica desde una cuenta G | 11,717 stroops |
| Desde la cuenta-contrato, régimen normal | 286,031 stroops (1.6 M de instrucciones) |

La primera vez que una cuenta paga, además crea su registro de gastos persistente: en la primera ejecución de esta prueba se midieron **646 843 stroops**.

El tope por defecto del facilitador (50 000 stroops, 0,005 XLM) rechaza el pago desde la cuenta-contrato. Es una configuración del facilitador, pero implica que **quien opere el facilitador tiene que aceptar comisiones mucho mayores**, y en pagos pequeños la comisión puede superar el monto.

## Lo que esta prueba no demuestra

- Que funcione con el facilitador alojado (OpenZeppelin Channels u otro), que puede imponer otras reglas.
- Un flujo HTTP completo (402, reintento con cabecera, 200): aquí se prueba la parte específica de Stellar, el pago, su verificación y su liquidación.
- Pagos en USDC: se usó el XLM nativo (un token SEP-41) para no depender de la trustline del comercio.
- Que las wallets sepan firmar para esta cuenta.
