# x402 de punta a punta por HTTP: un agente paga una API desde su cuenta-contrato

- Fecha: 2026-10-18 07:48 UTC
- Cuenta del agente (contrato): [`CCZZLL4CPKBO3K6EMQ5KMVLSI5JI46HT756UAUCI75ZN4KIU5M27F3JC`](https://stellar.expert/explorer/testnet/contract/CCZZLL4CPKBO3K6EMQ5KMVLSI5JI46HT756UAUCI75ZN4KIU5M27F3JC)
- **Servidor de recursos:** Express con `@x402/express` (oficial) y el esquema de servidor `@x402/stellar` 2.28, cobrando en XLM nativo (un token SEP-41).
- **Cliente:** `fetch` envuelto con `@x402/fetch` (oficial) y `AgentAccountScheme` (`client.mjs`), que firma para una cuenta-contrato.
- **Facilitador:** el alojado de testnet, `https://channels.openzeppelin.com/x402/testnet`, que verifica, liquida y paga las comisiones.

| Petición | Resultado |
|---|---|
| `GET /premium` sin pagar | HTTP **402** Payment Required (pide 1 XLM a `GC6DTO6S…` en `stellar:testnet`) |
| `GET /premium` pagando desde la cuenta-contrato | HTTP **200**, cuerpo `{"message":"contenido de pago entregado","price":"1 XLM"}`, liquidado en [`d9658fbb…`](https://stellar.expert/explorer/testnet/tx/d9658fbbeb012a1944da939bef6ae38addf06bd8acdeae4dc23c52a7d54faeef), pagador `CCZZLL4C…` |
| `GET /premium-caro` (15 XLM, por encima del límite por pago) | el agente no pudo pagar: la cuenta rechazó la autorización (#2); no se envió nada a la red |
| `GET /free` (sin cobro) | HTTP 200 |

## Lo que esta prueba no demuestra

- Pagos en USDC, ni un servidor en producción.
- Que las wallets sepan firmar para esta cuenta.
- Que el costo en comisiones (unas 25 veces el de una transferencia clásica) sea aceptable para pagos pequeños. Ver [`docs/ARQUITECTURA-B.md`](../../docs/ARQUITECTURA-B.md).
