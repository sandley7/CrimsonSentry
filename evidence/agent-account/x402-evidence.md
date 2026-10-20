# x402 en testnet: pago desde una cuenta-contrato

- Fecha: 2026-10-18 07:49 UTC
- Cuenta pagadora (contrato): [`CCZZLL4CPKBO3K6EMQ5KMVLSI5JI46HT756UAUCI75ZN4KIU5M27F3JC`](https://stellar.expert/explorer/testnet/contract/CCZZLL4CPKBO3K6EMQ5KMVLSI5JI46HT756UAUCI75ZN4KIU5M27F3JC)
- Comercio (`payTo`): `GC6DTO6SAXUOGW3BTURZQ3TXP523GANDBSLTZ33EUNTDVSCW25JZ5QOS` · Facilitador: GBB4T6ZN…SAYNIO (el relayer)
- **Cliente:** `tools/agent-account/x402/client.mjs`, una copia del cliente oficial de `@x402/stellar` que firma para una cuenta-contrato.
- **Facilitador:** `ExactStellarScheme` de `@x402/stellar/exact/facilitator` 2.28, **sin modificar**, ejecutado en local con el relayer como firmante.
- No se usó el servicio de facilitador alojado ni un servidor HTTP de recursos.

| Paso | Resultado |
|---|---|
| El cliente **oficial** con una dirección de contrato | Falla: `invalid version byte. expected 48, got 16` |
| Pago de 8 XLM, facilitador con su tope de comisión por defecto (50 000 stroops) | `verify`: **inválido** (`invalid_exact_stellar_payload_fee_exceeds_maximum`: simulation-derived fee 286180 stroops exceeds ceiling 50000 stroops) |
| El mismo pago, tope subido a 2 000 000 de stroops | `verify`: **válido** (pagador: la cuenta-contrato) |
| `settle` | ✅ [`95b89d38…`](https://stellar.expert/explorer/testnet/tx/95b89d385e34a3bd9c15ff4c3e93c5b2a4351872e5d17e8f01888293337c0559) |
| 15 XLM, above the per-payment limit of 10 XLM | refused by the account (#2) |
| the owner key paying the shop instead of the recovery address | refused by the account (#17) |

## Costo

| Pago | Comisión de recursos (simulación) |
|---|---|
| Transferencia clásica desde una cuenta G | 11,717 stroops |
| Desde la cuenta-contrato, régimen normal | 286,080 stroops (1.5 M de instrucciones) |

La primera vez que una cuenta paga, además crea su registro de gastos persistente: en la primera ejecución de esta prueba se midieron **646 843 stroops**.

El tope por defecto del facilitador (50 000 stroops, 0,005 XLM) rechaza el pago desde la cuenta-contrato. Es una configuración del facilitador, pero implica que **quien opere el facilitador tiene que aceptar comisiones mucho mayores**, y en pagos pequeños la comisión puede superar el monto.

## Lo que esta prueba no demuestra

- Que funcione con el facilitador alojado (OpenZeppelin Channels u otro), que puede imponer otras reglas.
- Un flujo HTTP completo (402, reintento con cabecera, 200): aquí se prueba la parte específica de Stellar, el pago, su verificación y su liquidación.
- Pagos en USDC: se usó el XLM nativo (un token SEP-41) para no depender de la trustline del comercio.
- Que las wallets sepan firmar para esta cuenta.
