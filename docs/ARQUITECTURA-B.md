# Arquitectura B: la wallet del agente como cuenta-contrato (prototipo)

> Estado: **prototipo probado en testnet, sin auditar.** Demuestra que una cuenta-contrato puede aplicar la política de CrimsonSentry a cada transferencia del token, con firmas y un host de Soroban reales, y que **un flujo x402 completo por HTTP (402, pago desde la cuenta, 200) funciona contra el facilitador alojado de testnet, y el código oficial del facilitador también acepta y liquida el pago**. Lo que no está probado: el cliente oficial de x402 (no sabe firmar para cuentas-contrato), USDC y las wallets. Ver [x402](#x402).

## Por qué existe

En la arquitectura A (el vault) el agente llama a `pay` y el dinero vive en el vault. Si el agente tiene saldo propio, puede pagar sin pasar por el vault, y los protocolos x402 y MPP firman **un `transfer` desde la cuenta del agente**, no una llamada al vault. Por eso la A no los intercepta.

La B convierte la propia cuenta del agente en un contrato. El dinero vive en la cuenta, y cuando alguien intenta mover algo, el host de Soroban llama a su `__check_auth`, que decide con la política. No hay un camino "por fuera": toda transferencia desde esa cuenta pasa por la política.

```mermaid
flowchart LR
    Agent([Clave del agente]) -- "firma la autorización de un transfer" --> Relayer[Relayer / facilitador<br/>paga las comisiones]
    Relayer -- "transfer(from = cuenta, to, monto)" --> Token[[Token SAC]]
    Token -- "from.require_auth()" --> Account[(Cuenta del agente<br/>contrato)]
    Account -- "__check_auth: política" --> Token
    Owner([Dueño]) -- "set_policy · pause · set_agent_key" --> Account
    OwnerKey([Clave del dueño]) -- "solo transfer a la recuperación" --> Account
```

## Cómo decide `__check_auth`

El contrato está en [`contracts/agent-account`](../contracts/agent-account/src/lib.rs). Tiene dos firmantes, y el campo de firma de la entrada de autorización lleva uno de dos valores (`Agent` u `Owner`):

| Firmante | Qué puede autorizar | Qué rechaza |
|---|---|---|
| **Clave del agente** | Únicamente `transfer(from = esta cuenta, to, monto)` del token configurado, si la política lo permite: allowlist, mínimo, límite por pago, límite en 24 h móviles, máximo de pagos y no pausado | Cualquier otra función (por ejemplo `approve`, que dejaría a un tercero vaciar la cuenta), otro contrato, crear contratos, o un `transfer` cuyo origen no sea esta cuenta |
| **Clave del dueño** | Únicamente un `transfer` a la dirección de recuperación fijada al desplegar, aunque esté en pausa | Todo lo demás |

La política, los techos inmutables y la dirección de recuperación funcionan como en el [vault v2](V2.md). Las funciones de administración (`set_policy`, `pause`, `unpause`, `set_agent_key`) exigen la autorización de la dirección del dueño. Los errores usan los mismos números que el vault, más `#15` (llamada no soportada), `#16` (origen que no es la cuenta) y `#17` (el dueño intentó mover fondos fuera de la recuperación).

Decisiones de diseño:

- **Falla cerrado.** Un argumento que no se puede leer, un destino multiplexado o una llamada desconocida se rechazan.
- **Todo el contexto cuenta.** Si una autorización trae varias transferencias, se suman todas y, si alguna falla, no se registra ninguna.
- **El estado se actualiza en `__check_auth`.** La ventana de 24 h se escribe al autorizar, igual que hace la política de límite de gasto de OpenZeppelin.
- **La repetición la evita el host:** el nonce y la expiración forman parte del payload que se firma.

## Evidencia

Cuenta [`CC3ZG5MN…TZ5`](https://stellar.expert/explorer/testnet/contract/CC3ZG5MN6MDUQDCTOZ5IFEPH7P5FEJGYZ2G3SOILGJDLRW32TNSUDTZ5) (WASM `3abe847a…a412f`, [`evidence/agent-account/wasm-sha256.txt`](../evidence/agent-account/wasm-sha256.txt)), con un relayer propio que paga las comisiones. Todo en [`evidence/agent-account/testnet-evidence.md`](../evidence/agent-account/testnet-evidence.md):

- ✅ Pago válido de 8 XLM, firmado por el agente.
- 🛑 Fuera de la política, con la autorización real (modo `enforce`): `#1`, `#12`, `#2`; y `#17` para la clave del dueño hacia un destino que no es la recuperación.
- ⛔ Un pago que pasó la simulación y se envía cuando la política ya no lo permite: **falla on-chain** con `#1`.
- ⛔ **Ataque de pagos paralelos:** el pago A pasa y el **B revierte on-chain con `#3`**, como en el vault.
- ✅ La clave del dueño mueve fondos a la dirección de recuperación.
- 🛑 Con la cuenta en pausa, el pago se rechaza (`#7`).

Se reproduce con:

```bash
node tools/agent-account/demo.js init        # claves de prueba desechables y un relayer fondeado
bash scripts/deploy-account.sh
bash scripts/demo-account.sh

# x402: una cuenta limpia, y el cliente y el facilitador oficial en local
ACCOUNT_ALIAS=crimson-agent-account-x402 OUT=evidence/agent-account/x402-deployment.env bash scripts/deploy-account.sh
cd tools/agent-account/x402 && npm install && node e2e.mjs
```

El agente, el dueño y el relayer de esta demo son claves **desechables de testnet**, generadas en `tools/agent-account/.keys.json` (ignorado por Git). No tocan el almacén de claves de Stellar CLI.

## x402

Prueba de extremo a extremo en testnet, en [`evidence/agent-account/x402-evidence.md`](../evidence/agent-account/x402-evidence.md):

- **Cliente:** [`tools/agent-account/x402/client.mjs`](../tools/agent-account/x402/client.mjs), una copia del cliente oficial de `@x402/stellar` 2.28 (Apache-2.0) que firma la entrada de autorización con la firma propia de la cuenta.
- **Facilitador:** `ExactStellarScheme` de `@x402/stellar/exact/facilitator` 2.28, **sin modificar**, ejecutado en local con el relayer como firmante (paga las comisiones y gasta el número de secuencia, como hace un facilitador real).
- **Resultado:** `verify` válido con la cuenta-contrato como pagador y `settle` correcto en testnet ([`04450e3d…`](https://stellar.expert/explorer/testnet/tx/04450e3d27471fa3060e085150f7531bc64ff558d81f442552c2120ca23d2ca9)). Un pago de 15 XLM y uno firmado con la clave del dueño hacia el comercio los rechaza la cuenta (`#2` y `#17`) antes de llegar al facilitador.
- **Facilitador alojado:** el mismo pago, enviado por HTTP al facilitador público de testnet (`channels.openzeppelin.com/x402/testnet`, con una clave gratuita sin registro), también da `verify` válido y `settle` correcto ([`f88a4ab6…`](https://stellar.expert/explorer/testnet/tx/f88a4ab62df544237b368e71469b4e6499f85487b13968fad83e3645e199190a)), con las comisiones pagadas por el firmante del facilitador. Detalle en [`evidence/agent-account/x402-hosted-evidence.md`](../evidence/agent-account/x402-hosted-evidence.md). Su tope de comisión no rechazó el pago, a diferencia del valor por defecto del código local.
- **Flujo HTTP completo:** un servidor Express con `@x402/express` cobra 1 XLM por `GET /premium` y un agente con `@x402/fetch` recibe el **402**, paga desde su cuenta-contrato y recibe el **200** con el contenido; el facilitador alojado verificó y liquidó el pago ([`fa01effc…`](https://stellar.expert/explorer/testnet/tx/fa01effcf2e15b2a4b2e8460de8f626c9b2630f5b539739dba53337ca88f460c)). Una ruta de 15 XLM, por encima del límite de la cuenta, la rechaza la propia cuenta (`#2`) y no se envía nada a la red. Detalle en [`evidence/agent-account/x402-http-evidence.md`](../evidence/agent-account/x402-http-evidence.md).

Lo que se comprobó al leer la [especificación del esquema `exact` de Stellar](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_stellar.md) y el código de `@x402/stellar`:

- El cliente arma una transacción con **una** operación `invokeHostFunction` que llama a `transfer(from, to, amount)`, la simula y **firma solo las entradas de autorización**. El facilitador sustituye la fuente por la suya.
- La especificación dice que esta firma «admite cuentas C y cuentas G». El facilitador exige que la entrada del pagador esté firmada y que la simulación contra el estado actual tenga éxito; con una cuenta-contrato, esa simulación ejecuta `__check_auth`, así que la política se aplica también ahí.

Hallazgos:

1. **El cliente oficial no firma para cuentas-contrato.** Con una dirección `C…` falla con `invalid version byte` porque el SDK construye una firma clásica a partir de la dirección. El adaptador evita eso con una `authorizeEntry` propia. Lo ideal sería que el cliente oficial admitiera firmas personalizadas.
2. **El pago cuesta mucho más.** La comisión de recursos de la simulación es de unos 286 000 stroops (la primera vez que una cuenta paga, unos 647 000, por crear el registro de gastos), frente a 11 700 de una transferencia clásica. **El tope por defecto del código del facilitador (50 000 stroops) rechaza el pago**; el facilitador alojado lo aceptó. Quien opere un facilitador tiene que aceptar comisiones mucho mayores, y en pagos pequeños la comisión puede superar el monto.
   **No se arregla optimizando el contrato.** En una prueba con el presupuesto del host, `__check_auth` gasta unas 560 000 instrucciones, y unas 543 000 de ellas se consumen **antes de aplicar la política** (leer las claves y verificar la firma ed25519: un pago rechazado justo después de la verificación ya cuesta 543 000). La lógica de la política (allowlist, ventana de 24 h, registro de pagos) cuesta unas 20 000. El sobrecosto es el de verificar una firma dentro de un contrato en lugar de hacerlo de forma nativa, como en una cuenta clásica.
3. **El cliente oficial de x402 trae sus propios controles de gasto** (por defecto, solo USDC y hasta 1 USD por pago). Son del lado del cliente, es decir, fuera de la cadena: un cliente comprometido puede saltárselos, mientras que los de la cuenta se aplican on-chain. Para pagar en XLM hubo que permitirlo explícitamente.
4. **Las credenciales que devuelve hoy la simulación son las clásicas** (`sorobanCredentialsAddress`). El adaptador no maneja la variante V2 que la especificación pide aceptar.

Lo que **no** está resuelto:

- Se pagó en **XLM nativo**. x402 usa USDC por defecto: la cuenta puede tener un saldo SAC sin trustline, pero el comercio que recibe sí necesita la suya.
- **Un solo token por cuenta.**
- Las **wallets** tendrían que saber firmar el formato propio de esta cuenta.

## Límites y riesgos

- Prototipo de testnet, **sin auditoría independiente**.
- La cuenta es inmutable, como el vault: un bug obliga a desplegar una nueva y migrar.
- La clave del agente se guarda fuera de la cadena: si se compromete, el atacante puede gastar dentro de la política hasta que el dueño la rote o pause. Los techos no cambian nada de eso.
- La clave del dueño puede mover todo, pero solo a la dirección de recuperación, y puede aflojar la política dentro de los techos, como en el vault.
- El registro de pagos tiene el mismo tope que en el vault (100 entradas).
- La lógica de la política está duplicada respecto al vault. Una versión definitiva debería compartirla en una biblioteca, o expresarse como una política de las cuentas inteligentes de OpenZeppelin (ver [POSICIONAMIENTO.md](POSICIONAMIENTO.md)).

## Auditoría estática

`cargo scout-audit` sobre la cuenta, ejecutado en la CI (informe en el artefacto `scout-report` de cada corrida): **0 críticos · 2 medios · 0 menores · 4 mejoras** antes de añadir los eventos.

| Hallazgo | Nivel | Veredicto |
|---|---|---|
| `dynamic_storage`: el registro de pagos es un `Vec` en storage persistente | Medio | **Riesgo aceptado**, igual que en el vault: está acotado a 100 entradas |
| `dos_unexpected_revert_with_storage`: `push_back` sobre el registro «sin control de acceso» | Medio | **Falso positivo.** El control de acceso es la verificación de la firma ed25519 al principio de `__check_auth`: con una firma inválida el host aborta antes de llegar a esa línea |
| `storage_change_events` ×4: `set_policy`, `pause`, `unpause` y `set_agent_key` no emitían eventos | Mejora | **Era un hallazgo real, corregido.** Ahora emiten `PolicyUpdated`, `PausedChanged` y `AgentKeyRotated`, con un test (`every_admin_change_emits_an_event`). Las cuentas de testnet de esta evidencia se redesplegaron con esa versión |

Como la cuenta no tiene hallazgos críticos, la CI ya la trata igual que al vault: **falla si scout encuentra uno**.

## Pruebas

23 tests en `contracts/agent-account/src/test.rs`, con firmas ed25519 reales y `try_invoke_contract_check_auth`, la forma que ofrece el SDK de probar una cuenta personalizada: política, ventana móvil, varias transferencias en una autorización, llamadas no soportadas, firma incorrecta, firma del dueño usada como la del agente, ruta de recuperación, pausa, rotación de clave, eventos de administración y constructor.
