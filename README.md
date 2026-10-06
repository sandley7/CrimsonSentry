<p align="center"><img src="docs/logo.jpg" alt="CrimsonSentry" width="520"></p>

# CrimsonSentry

> Los agentes de IA ya mueven dinero solos, pero nadie revisa si su wallet tiene límites de seguridad.
> CrimsonSentry pone un **contrato-guardián en Soroban** entre el agente y su dinero, y un **escáner** que audita la configuración del agente: cualquier pago fuera de las reglas **revierte on-chain**, comprobable en Stellar testnet.

> **Alcance, en una línea:** protege los fondos depositados en el vault y los pagos que pasan por `pay`. No protege el saldo propio de la cuenta del agente ni intercepta x402/MPP, que firman desde esa cuenta (el escáner lo detecta pero no lo bloquea). Eso requiere la arquitectura B, aún por construir. Detalle en [Limitaciones conocidas](#limitaciones-conocidas).

**Stellar Odyssey Perú · Track 04 — Research, Cryptography & Security Architecture** (cruzado con Track 01, AI Agents)

**Líder y mantenedor:** Santiago Fabrizio Lindley Santivañez ([@sandley7](https://github.com/sandley7))  
**Autores originales:** Santiago Fabrizio Lindley Santivañez · José Fernando Escajadillo Gaspar ([@JoseEscajadillo](https://github.com/JoseEscajadillo)) · Cesar Adrian Guevara Salcedo ([@CyberStill-GmbH](https://github.com/CyberStill-GmbH)) — Licencia [MIT](LICENSE)

> **Origen:** CrimsonSentry nació en el hackathon Stellar Odyssey Perú 2026 como proyecto de los tres autores, en [JoseEscajadillo/CrimsonSentry](https://github.com/JoseEscajadillo/CrimsonSentry). Este repositorio continúa ese trabajo con el historial de commits intacto, de modo que cada autor conserva su autoría. La rama `harden-policy-and-docs` conserva la propuesta de Cesar (PR #2 del repositorio original), todavía sin integrar.

🎬 **Video demo:** https://www.youtube.com/watch?v=lgQYx48JnV0 · 🎤 **Video pitch:** https://www.youtube.com/watch?v=Lhr5abKy-eI

📐 Esquema completo, con diagramas de flujo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) · Seguridad: [`docs/SECURITY.md`](docs/SECURITY.md) · Operación: [`docs/OPERATIONS.md`](docs/OPERATIONS.md) · Escáner: [`docs/SCANNER.md`](docs/SCANNER.md) · Para quién es y frente a qué alternativas: [`docs/POSICIONAMIENTO.md`](docs/POSICIONAMIENTO.md) · Plan de validación: [`docs/VALIDACION.md`](docs/VALIDACION.md)

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Policy Vault** | Contrato Soroban que custodia los fondos del agente y aplica la política en cada pago | [`contracts/policy-vault`](contracts/policy-vault) |
| **Escáner** | CLI que audita al agente y su vault: semáforo de 16 chequeos mapeado al OWASP Agentic Top 10 (2026) | [`tools/scanner`](tools/scanner) |
| **Agente demo** | Reproduce los intentos de pago de un agente (legítimos y maliciosos) contra el vault | [`tools/agent`](tools/agent) |

---

## ✅ Evidencia en Stellar testnet

**Contrato Policy Vault:** [`CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG`](https://stellar.expert/explorer/testnet/contract/CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG)
WASM sha256 `8f063bdcefa17824502ed78aa6cecca68727fad558c8fb26de2c69d8257c6bef` ([`evidence/wasm-sha256.txt`](evidence/wasm-sha256.txt)): idéntico al que compila este repo.

Política desplegada: máx. 10 XLM por pago, 25 XLM por 24h móviles, máx. 5 pagos en 24h, un solo comercio en la allowlist. El vault se fondeó con 100 XLM de testnet.

| Escenario | Resultado on-chain | Transacción |
|---|---|---|
| Deploy del contrato | ✅ | [`83a8576b…`](https://stellar.expert/explorer/testnet/tx/83a8576b01aeae5a858a61fe83452275f87aaa7c2daa4e29f9bcf7b242634954) |
| Pago válido de 10 XLM al comercio permitido | ✅ SUCCESS (ledger 4824948) | [`353b05e3…`](https://stellar.expert/explorer/testnet/tx/353b05e366f9e4491b87747bfea9e5e624a33307c413470df5926d6cdc990671) |
| Ataque de pagos paralelos — pago A de 10 XLM (acumulado 20) | ✅ SUCCESS (ledger 4824950) | [`c1fa5ea6…`](https://stellar.expert/explorer/testnet/tx/c1fa5ea6a2d240a82fe25a39b98a1f8355921b76564b1d55696f4260b467971d) |
| Ataque de pagos paralelos — pago B de 10 XLM (acumulado 30 > 25) | ⛔ **FAILED — `Error(Contract, #3)` OverDailyLimit** (ledger 4824951) | [`89f54fce…`](https://stellar.expert/explorer/testnet/tx/89f54fceaeb9907fd1c8bbe63663a4b4cfd3fc9b0bbe94ed5d6481832add745b) |
| Pago de 15 XLM (límite por pago 10) | 🛑 rechazado en simulación: `#2` | — |
| Pago a una dirección fuera de la allowlist | 🛑 rechazado en simulación: `#1` | — |
| Pago con el vault en pausa (kill switch) | 🛑 rechazado en simulación: `#7` | pausa [`9cda2c8c…`](https://stellar.expert/explorer/testnet/tx/9cda2c8ca469daa09215f5b1577ac2f38b52574e91341f8bccfb1a26dd60f73e) · reanudación [`f480e480…`](https://stellar.expert/explorer/testnet/tx/f480e480afe4d6da3fb47361aecf2702236b5bb3061600e916a82a1eaf1ced4d) |

El pago B pasó la simulación por sí solo, porque se construyó cuando solo había 10 XLM gastados. On-chain, el vault vio el acumulado real y revirtió: **las validaciones fuera de la cadena se pueden burlar; la regla on-chain no.** Detalle completo en [`evidence/testnet-evidence.md`](evidence/testnet-evidence.md).

### Demo del agente: cada regla, rechazada on-chain

Vault de demo [`CAMVNGOG…DNTHQ`](https://stellar.expert/explorer/testnet/contract/CAMVNGOGDRO354W7KTPEZG55SPVH374IGYB5MKYGE6QUYRRP35WDNTHQ), con la misma política. El agente actúa como un **cliente comprometido**: envía los pagos aunque la simulación los rechace, así que el rechazo lo impone el contrato en la cadena.

| Intento del agente | Resultado on-chain | Transacción |
|---|---|---|
| Factura legítima: 8 XLM al comercio | ✅ SUCCESS | [`8b3a585d…`](https://stellar.expert/explorer/testnet/tx/8b3a585d87ac63ad5d971e14fad986c3c1178e332bfca53190cc0c82170cdcdb) |
| 50 XLM a una dirección fuera de la allowlist | ⛔ **FAILED — `#1` NotAllowlisted** | [`969e551b…`](https://stellar.expert/explorer/testnet/tx/969e551b48072ea5d8ee61146c8fdb0f48427e3b28278e6ca4dedf0df3fb12de) |
| Bucle: 6.º pago en 24h con máximo de 5 | ⛔ **FAILED — `#8` TooManyPayments** | [`c8adfc3b…`](https://stellar.expert/explorer/testnet/tx/c8adfc3b11294721b363c20a6a7fa8d07377fbdcf1ab1ac803e44c8e2022ca4b) |
| Pago con el vault en pausa | ⛔ **FAILED — `#7` Paused** | [`f66b31e8…`](https://stellar.expert/explorer/testnet/tx/f66b31e830105fc5657e415b108e53fb6b0592260e6bfdd8b472cef7d6119567) |

Registro completo, con los 9 intentos: [`evidence/agent-demo-20260923-032222.md`](evidence/agent-demo-20260923-032222.md).

---

## Cómo funciona

```
 Agente IA ──pay(destino, monto)──▶  Policy Vault (Soroban)  ──transfer──▶ Comercio
 (solo firma pagos)                   ├─ allowlist de destinos
                                      ├─ límite por pago
                                      ├─ límite en 24h MÓVILES
                                      ├─ máx. N pagos en 24h
                                      └─ pausa (kill switch)
 Dueño humano ──set_policy / pause / set_agent / withdraw──▶ Vault
 Escáner ──get_status() (RPC) + cuenta del agente (Horizon)──▶ semáforo OWASP
```

Los fondos viven en el contrato, no en la wallet del agente. El agente solo puede llamar a `pay`; si viola una regla, el contrato hace `panic_with_error!` y **toda la transacción revierte**.

### API del contrato

| Función | Quién firma | Qué hace |
|---|---|---|
| `__constructor(owner, agent, token, policy)` | — (deploy) | Configuración única; no existe `initialize()`, así que no se puede reinicializar |
| `pay(destino, monto)` | agente | Paga si cumple las 4 reglas y el vault no está en pausa |
| `set_policy(policy)` | dueño | Reemplaza la política de forma atómica, validándola |
| `pause()` / `unpause()` | dueño | Kill switch: bloquea todos los pagos del agente |
| `set_agent(new_agent)` | dueño | Rota una clave de agente comprometida |
| `withdraw(to, amount)` | dueño | Recupera fondos, incluso en pausa |
| `get_policy()` / `get_status()` | — (lectura) | Estado completo para el escáner |

`Policy = { tx_limit, daily_limit, max_payments_per_day, allowlist }`

Orden exacto de los controles en `pay()`: firma del agente → monto > 0 (`#5`) → no pausado (`#7`) → destino permitido (`#1`) → límite por pago (`#2`) → cantidad de pagos en 24h (`#8`) → suma sin overflow (`#4`) → límite de 24h (`#3`). Si todo pasa: registra el gasto, transfiere y emite el evento `paid`.

### Códigos de error (lo que se ve en Stellar Expert)

| Código | Error | Causa |
|---|---|---|
| `#1` | `NotAllowlisted` | Destino fuera de la allowlist |
| `#2` | `OverTxLimit` | Pago mayor al límite por transacción |
| `#3` | `OverDailyLimit` | Supera el límite de las últimas 24h |
| `#4` | `ArithmeticOverflow` | Overflow en la suma del gasto |
| `#5` | `InvalidAmount` | Monto ≤ 0 |
| `#6` | `InvalidPolicy` | Política incoherente (límites ≤ 0, `tx_limit > daily_limit`, allowlist > 32, etc.) |
| `#7` | `Paused` | El dueño activó el kill switch |
| `#8` | `TooManyPayments` | Superó el máximo de pagos en 24h |
| `#9` | `NotInitialized` | Estado corrupto (no debería ocurrir) |

Cada operación exitosa emite un evento (`paid`, `policy_updated`, `paused_changed`, `agent_rotated`, `withdrawn`) para monitoreo.

---

## Escáner de seguridad

Audita un agente y su vault **sin claves ni transacciones**: simula `get_status()` por Stellar RPC y lee las cuentas del agente y del dueño en Horizon.

```bash
cd tools && npm ci
node scanner/scan.js --vault CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG
node scanner/scan.js --vault <C...> --json        # para CI o un dashboard
```

Código de salida: `0` verde · `1` amarillo · `2` rojo.

| # | Chequeo | 🔴 / 🟡 cuando… | OWASP Agentic 2026 |
|---|---|---|---|
| C1 | Saldo propio del agente | Puede gastar más que un pago máximo **fuera del vault** / más que lo necesario para fees | ASI02 · ASI03 · ASI10 |
| C2 | Otros activos del agente | Tiene activos no nativos con saldo / trustlines abiertas | ASI02 · ASI03 |
| C3 | Firmantes del agente | Hay firmantes extra en su cuenta | ASI03 |
| C4 | Separación dueño/agente | Agente = dueño, o el agente firma por el dueño | ASI03 |
| C5 | Agente o dueño en la allowlist | El agente puede pagarse a sí mismo / el dueño está en la lista | ASI02 · ASI03 |
| C6 | Higiene de la allowlist | Vacía, destinos que son contratos, cuentas inexistentes, más de 10 | ASI02 · ASI04 · ASI07 |
| C7 | Proporción de límites | Un pago agota el día, el día vacía el vault, más de 20 pagos/día | ASI08 |
| C8 | Consumo de la ventana | ≥ 80 % del límite o todos los pagos usados | ASI08 · ASI10 |
| C9 | Intentos rechazados on-chain (24h) | ≥ 3 / 1–2 | ASI01 · ASI10 |
| C10 | Pagos por fuera del vault | El agente movió fondos sin pasar por el vault | ASI02 · ASI10 |
| C11 | Kill switch disponible | El dueño no puede pagar el fee de `pause` / vault en pausa | ASI09 · ASI10 |
| C12 | Clave del dueño | Una sola clave controla el vault | ASI03 · ASI09 |
| C13 | Integridad del código | El WASM on-chain no es el auditado / sin hash de referencia | ASI04 |
| C14 | Token custodiado | No es el SAC oficial de XLM | ASI04 |
| C15 | Vida del contrato (TTL) | Archivado / quedan menos de 7 días | ASI08 |
| C16 | Fondos del vault | Menos que un pago máximo | — |

Sobre el vault principal, hoy da **🔴 en C1**: la cuenta del agente conserva ~9,999 XLM de Friendbot, 125 veces lo que protege el vault. Es la [limitación 1](#limitaciones-conocidas) vista en vivo. En la demo del agente, devolver ese excedente al dueño pasa C1 a 🟢.

Fuera del alcance on-chain: ASI05 (ejecución de código en el host del agente) y ASI06 (el gasto real vive en el `SpendLog`, no en la memoria del agente).

---

## Demo del agente

[`scripts/demo-agente.sh`](scripts/demo-agente.sh) arma cada vez **un agente y un vault nuevos**, así que es reproducible y nunca toca la evidencia principal:

1. El agente nace con 500 XLM propios, una *hot wallet* típica → escáner 🔴 (C1).
2. El agente devuelve el excedente al dueño → C1 🟢.
3. El agente ejecuta [`tools/agent/scenario.json`](tools/agent/scenario.json) como cliente comprometido: factura legítima ✅, pago a un destino desconocido ⛔ `#1`, bucle de reintentos (4 ✅ y luego ⛔ `#8`).
4. El escáner muestra los rechazos (🔴 C9) → el dueño pausa → el siguiente intento ⛔ `#7`.

```bash
bash scripts/demo-agente.sh            # STEP=1 bash scripts/demo-agente.sh pausa antes de cada paso (para grabar)
```

El agente firma a través del keystore de `stellar-cli` (`stellar tx sign --sign-with-key`): **su código nunca ve una clave secreta**. Su única herramienta es `pay` del vault ([`tools/agent/wallet.js`](tools/agent/wallet.js)). Los intentos son un guion explícito, no las decisiones de un LLM; lo que se demuestra es que, decida lo que decida el agente, la política se cumple on-chain.

---

## Decisiones de seguridad

| Riesgo | Mitigación |
|---|---|
| Falta de `require_auth()` (CRÍTICO) | `pay` exige la firma del agente; todo lo administrativo, la del dueño. Hay tests que verifican quién firma y que nada funciona sin firmas |
| Reinicialización (CRÍTICO) | `__constructor` en lugar de `initialize()` |
| Overflow (ALTO) | `checked_add` / `checked_sub` más `overflow-checks = true` en release |
| Colisión de claves (ALTO) | `enum DataKey` con `#[contracttype]`, una variante por dato |
| TTL (MEDIO) | Cada función llama a `extend_ttl`: cuando al contrato le quedan menos de 7 días de vida, se extiende a 30 días. El `SpendLog` es *persistent* (si caduca se archiva, nunca se reinicia en silencio) |
| Montos negativos o cero | Rechazados explícitamente (`#5`), sin depender de que el token falle |
| Doble gasto en la medianoche | Ventana **móvil** de 24h, no día calendario (test `midnight_boundary_cannot_double_the_daily_limit`) |
| Agente desbocado con muchos micro-pagos | `max_payments_per_day` (`#8`) |
| Agente comprometido | `pause`, `set_agent` y `withdraw` para el dueño |
| DoS por bucles sin límite | Allowlist ≤ 32 y registro de gastos ≤ 100 entradas |
| Estado inconsistente | El gasto se registra **antes** de transferir (checks-effects-interactions); cualquier error revierte todo |

### Auditoría estática — `cargo scout-audit`

Resultado: **0 críticos · 1 medio (aceptado) · 0 menores · 5 mejoras (falsos positivos)**, igual en local y en CI. El reporte completo está en [`docs/scout-report.md`](docs/scout-report.md).

| Hallazgo | Nivel | Veredicto |
|---|---|---|
| `dynamic_storage`: `SpendLog` es un `Vec` en storage persistente | Medio | **Riesgo aceptado.** El vector está acotado (≤ `max_payments_per_day` ≤ 100 entradas; medido on-chain: 72 B por pago, unos 7.3 KB en el peor caso, muy por debajo del límite de 64 KB por entrada), se poda en cada pago y solo `pay`, tras `require_auth` del agente, puede escribirlo. Guardarlo como un `Vec` es lo que permite una ventana móvil de 24h exacta |
| `storage_change_events` ×5 (`pay`, `set_policy`, `pause`, `unpause`, `set_agent`) | Mejora | **Falso positivo.** Las cinco funciones emiten eventos con `#[contractevent]` (SDK ≥ 23), que el detector no reconoce. El test `every_state_change_emits_an_event` lo demuestra |
| ~~`dos_unexpected_revert_with_storage`~~ en `window()` | ~~Medio~~ | **Corregido**: la ventana ahora se calcula con `slice` sobre el log ordenado, sin `push_back` |

Scout 0.3.16 no compila `soroban-sdk 28` tal como viene; [`scripts/scout.sh`](scripts/scout.sh) aplica dos ajustes solo para la auditoría, sin tocar el contrato, y explica por qué.

```bash
cargo install --locked cargo-dylint dylint-link cargo-scout-audit@0.3.16   # una vez (Linux/WSL/macOS)
bash scripts/scout.sh
```

### Limitaciones conocidas

1. **Arquitectura A (MVP, este repo):** el agente llama explícitamente al vault. Si la cuenta del agente tiene saldo propio, puede pagar **sin pasar por el vault**. Por eso el dinero debe estar en el vault, y el escáner lo vigila (C1 y C10). Además, el agente paga los fees de sus propias transacciones, así que siempre conserva algo de saldo; un *relayer* con fee-bump lo eliminaría.
2. **x402 y MPP:** estos protocolos firman transferencias directamente desde la cuenta del agente (*auth-entry signing*), así que la arquitectura A **no las intercepta**. La **arquitectura B (objetivo)** convierte la wallet del agente en una *contract account* cuyo `__check_auth` aplica esta misma política; así sí es compatible con x402 y MPP. En el modo *Channel* de MPP, la política debe limitar también el monto de apertura del canal.
3. **Clave del dueño:** no existe `set_owner` y `withdraw` no tiene tope. Si esa clave se compromete, se pierde el vault. Mitigación sin tocar el contrato: cuenta del dueño multifirma (C12 del escáner).
4. **`validate_policy`** no impide que el agente o el dueño estén en la allowlist. El escáner lo detecta (C5); la validación en el contrato queda para la v2.
5. **Cuota consumible:** quien robe la clave del agente puede agotar los N pagos del día con montos mínimos y bloquear al agente legítimo 24h. La pérdida de fondos sigue acotada a `daily_limit`, y el dueño puede ajustar la política o pausar.
6. **Contrato inmutable:** no hay función de upgrade. Un bug implica desplegar un vault nuevo y migrar los fondos (`withdraw`).

---

## Mapeo al OWASP Top 10 for Agentic Applications (2026)

| Riesgo OWASP | Qué aporta CrimsonSentry |
|---|---|
| ASI01 Agent Goal Hijack | Un agente manipulado sigue atado a la allowlist y a los límites on-chain (demo: `#1`); el escáner cuenta los intentos rechazados (C9) |
| ASI02 Tool Misuse & Exploitation | La herramienta "pagar" tiene límites que el propio agente no puede cambiar; el escáner detecta pagos por fuera del vault (C1, C10) |
| ASI03 Identity & Privilege Abuse | Separación agente/dueño; el agente no puede tocar la política ni retirar fondos (C4, C5, C12) |
| ASI04 Agentic Supply Chain | El escáner verifica que el WASM desplegado sea el auditado y que el token sea el oficial (C13, C14) |
| ASI08 Cascading Failures | Límites de monto y de frecuencia cortan un bucle de pagos (demo: `#8`) |
| ASI09 Human-Agent Trust Exploitation | El dueño decide con el estado real de la cadena, no con lo que reporta el agente (C11) |
| ASI10 Rogue Agents | Kill switch, rotación de clave y retiro de fondos por el dueño (demo: `#7`) |

---

## Qué construimos durante el hackathon

Todo el código de este repositorio se escribió dentro de la ventana de desarrollo del evento (desde el kickoff del 19/09/2026). **No partimos de un proyecto previo.**

| Fecha | Trabajo |
|---|---|
| 19–22/09 | Investigación (Agentic Payments de Stellar, x402/MPP, OWASP Agentic Top 10), propuesta y primer borrador del contrato |
| 23/09 | Contrato reescrito y endurecido (ventana móvil de 24h, límite de frecuencia, kill switch, rotación del agente, retiro, eventos, `get_status`); 18 tests; auditoría con scout; CI; deploy en testnet con evidencia on-chain |
| 23/09 | Escáner de seguridad (16 chequeos, 10 tests) y demo del agente con rechazos `#1`, `#7` y `#8` on-chain |

El historial de commits del repo refleja este trabajo.

### Código y herramientas de terceros

| Componente | Uso | Licencia |
|---|---|---|
| [`soroban-sdk`](https://github.com/stellar/rs-soroban-sdk) 28.0.0 | SDK del contrato | Apache-2.0 |
| [`@stellar/stellar-sdk`](https://github.com/stellar/js-stellar-sdk) 17.1.0 | RPC, Horizon y XDR en el escáner y el agente | Apache-2.0 |
| [`stellar-cli`](https://github.com/stellar/stellar-cli) 28.0.0 | Build, deploy, firma; la estructura inicial salió de `stellar contract init` | Apache-2.0 |
| [`cargo-scout-audit`](https://github.com/coinfabrik/scout-audit) 0.3.16 | Auditoría estática (herramienta, no se redistribuye) | MIT |

---

## Desarrollo

### Requisitos

- Rust ≥ 1.91 con el target `wasm32v1-none`
- `stellar-cli` ≥ 28 (testnet corre el protocolo 28, `soroban-sdk 28.0.0`)
- Node.js ≥ 22.12 para el escáner y el agente (`cd tools && npm ci`)

En la PC de desarrollo (Windows) el toolchain está en `D:\Rust`. Carga el entorno con:

```bash
source scripts/env.sh        # Git Bash
```
```powershell
. .\scripts\env.ps1          # PowerShell
```

> **Windows con usuario con tilde** (`C:\Users\José`): `wasm-opt` falla con *"Failed to write module"* si la carpeta temporal tiene caracteres no ASCII. Los scripts `env.*` apuntan `TMP`/`TEMP` a `D:\Rust\tmp`.

### Tests

```bash
cargo test                   # contrato: 19 tests
cd tools && npm test         # escáner: 11 tests
```

Los tests del contrato cubren:
- los 4 escenarios del plan original;
- la ventana móvil y el caso de la medianoche;
- el límite de frecuencia de pagos;
- la pausa, el retiro y la rotación del agente;
- quién firma cada función y que nada funciona sin firmas;
- la validación de políticas y el constructor;
- `get_status`;
- que cada cambio de estado emite un evento.

### Build

```bash
stellar contract build       # -> target/wasm32v1-none/release/policy_vault.wasm
```

### Deploy y demos en testnet

```bash
bash scripts/deploy-testnet.sh   # crea identidades cs-owner / cs-agent / cs-shop, despliega y fondea 100 XLM
bash scripts/demo-testnet.sh     # pago válido, rechazos y el ataque de pagos paralelos → evidence/testnet-evidence.md
bash scripts/demo-agente.sh      # demo completa con agente, escáner y kill switch sobre un vault nuevo
```

El ataque de pagos paralelos prepara dos pagos de 10 XLM; cada uno por separado pasa la simulación (10 + 10 ≤ 25), pero on-chain el vault ve el acumulado (30 > 25) y **el segundo revierte con `Error(Contract, #3)`**.

---

## Roadmap

- [x] Policy Vault con tests (Días 1–2)
- [x] `cargo scout-audit`: 0 críticos (hallazgos revisados arriba)
- [x] Deploy en testnet más evidencia (Día 3)
- [x] Escáner CLI con semáforo y mapeo OWASP (Día 4)
- [x] Demo del agente con rechazos on-chain (Día 5)
- [ ] Arquitectura B: *contract account* con `__check_auth`, compatible con x402/MPP
- [ ] Relayer con fee-bump para que el agente no necesite saldo propio
- [ ] v2 del contrato: agente y dueño fuera de la allowlist, monto mínimo, cambio de dueño en dos pasos y dirección de recuperación fija y techos inmutables de la política. **Escrita, probada y desplegada en testnet desde la rama [`v2-contract`](docs/V2.md), con [evidencia propia](evidence/v2/testnet-evidence.md); falta la revisión final de scout y fusionarla**
- [ ] Keeper de TTL e indexador de eventos con pausa automática ante anomalías
