# x402 de punta a punta por HTTP: un agente paga una API desde su cuenta-contrato

- Fecha: 2026-10-20 06:12 UTC
- Cuenta del agente (contrato): [`CB5BHCD6QM3YOXPVBEHEFYSDX4S7IB46J3KBMD3FYUCQTRGJYFKVTWSS`](https://stellar.expert/explorer/testnet/contract/CB5BHCD6QM3YOXPVBEHEFYSDX4S7IB46J3KBMD3FYUCQTRGJYFKVTWSS)
- **Servidor de recursos:** Express con `@x402/express` (oficial) y el esquema de servidor `@x402/stellar` 2.28, cobrando en XLM nativo (un token SEP-41).
- **Cliente:** `fetch` envuelto con `@x402/fetch` (oficial) y `AgentAccountScheme` (`client.mjs`), que firma para una cuenta-contrato.
- **Facilitador:** el alojado de testnet, `https://channels.openzeppelin.com/x402/testnet`, que verifica, liquida y paga las comisiones.

| Petición | Resultado |
|---|---|
| `GET /premium` sin pagar | HTTP **402** Payment Required (pide 1 XLM a `GC6DTO6S…` en `stellar:testnet`) |
| `GET /premium` pagando desde la cuenta-contrato | HTTP **200**, cuerpo `{"message":"contenido de pago entregado","price":"1 XLM"}`, liquidado en [`fa01effc…`](https://stellar.expert/explorer/testnet/tx/fa01effcf2e15b2a4b2e8460de8f626c9b2630f5b539739dba53337ca88f460c), pagador `CB5BHCD6…` |
| `GET /premium-caro` (15 XLM, por encima del límite por pago) | el agente no pudo pagar: la cuenta rechazó la autorización (#2); no se envió nada a la red |
| `GET /free` (sin cobro) | HTTP 200 |

## Lo que esta prueba no demuestra

- Pagos en USDC, ni un servidor en producción.
- Que las wallets sepan firmar para esta cuenta.
- Que el costo en comisiones (unas 25 veces el de una transferencia clásica) sea aceptable para pagos pequeños. Ver [`docs/ARQUITECTURA-B.md`](../../docs/ARQUITECTURA-B.md).
