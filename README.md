<p align="center"><img src="docs/logo.jpg" alt="CrimsonSentry" width="520"></p>

# CrimsonSentry

> Los agentes de IA ya mueven dinero solos, pero nadie revisa si su wallet tiene límites de seguridad.
> CrimsonSentry pone un **contrato-guardián en Soroban** entre el agente y su dinero, y un **escáner** que audita la configuración del agente: cualquier pago fuera de las reglas **revierte on-chain**, comprobable en Stellar testnet.

> **Alcance, en una línea:** protege los fondos depositados en el vault y los pagos que pasan por `pay`. No protege el saldo propio de la cuenta del agente ni intercepta x402/MPP, que firman desde esa cuenta (el escáner lo detecta pero no lo bloquea). Eso lo cubre la arquitectura B (la cuenta del agente como contrato), que tiene un [prototipo probado en testnet](docs/ARQUITECTURA-B.md), incluidos pagos x402, pero no es la versión oficial. Detalle en [Limitaciones conocidas](#limitaciones-conocidas). Es un prototipo de testnet, sin auditoría independiente.

**Stellar Odyssey Perú · Track 04 — Research, Cryptography & Security Architecture** (cruzado con Track 01, AI Agents)

**Líder y mantenedor:** Santiago Fabrizio Lindley Santivañez ([@sandley7](https://github.com/sandley7))  
**Autores originales:** Santiago Fabrizio Lindley Santivañez · José Fernando Escajadillo Gaspar ([@JoseEscajadillo](https://github.com/JoseEscajadillo)) · Cesar Adrian Guevara Salcedo ([@CyberStill-GmbH](https://github.com/CyberStill-GmbH)) — Licencia [MIT](LICENSE)

> **Origen:** CrimsonSentry nació en el hackathon Stellar Odyssey Perú 2026 como proyecto de los tres autores, en [JoseEscajadillo/CrimsonSentry](https://github.com/JoseEscajadillo/CrimsonSentry). Este repositorio continúa ese trabajo con el historial de commits intacto, de modo que cada autor conserva su autoría. La **v2 del contrato**, que es la versión oficial de este repositorio, integra los cambios de Cesar al contrato (roles separados y cambio de dueño en dos pasos) con su autoría. La rama `harden-policy-and-docs` conserva su propuesta original completa.

🌐 **Demo en vivo (sin claves):** https://sandley7.github.io/CrimsonSentry/: lee el vault real de testnet, simula pagos fuera de las reglas contra el contrato y ejecuta el escáner en el navegador.

🎬 **Video demo:** https://www.youtube.com/watch?v=lgQYx48JnV0 · 🎤 **Video pitch:** https://www.youtube.com/watch?v=Lhr5abKy-eI (ambos muestran la **v1**, la que se presentó en el hackathon)

📐 Esquema completo, con diagramas de flujo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) · Seguridad: [`docs/SECURITY.md`](docs/SECURITY.md) · Operación: [`docs/OPERATIONS.md`](docs/OPERATIONS.md) · Escáner: [`docs/SCANNER.md`](docs/SCANNER.md) · Qué cambia en la v2: [`docs/V2.md`](docs/V2.md) · Para quién es y frente a qué alternativas: [`docs/POSICIONAMIENTO.md`](docs/POSICIONAMIENTO.md) · Plan de validación: [`docs/VALIDACION.md`](docs/VALIDACION.md) · Guía para colaboradores: [`docs/PARA-COLABORADORES.md`](docs/PARA-COLABORADORES.md)

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Policy Vault (v2)** | Contrato Soroban que custodia los fondos del agente y aplica la política en cada pago | [`contracts/policy-vault`](contracts/policy-vault) |
| **Escáner** | CLI que audita al agente y su vault: semáforo de 17 chequeos mapeado al OWASP Agentic Top 10 (2026) | [`tools/scanner`](tools/scanner) |
| **Agente demo** | Reproduce los intentos de pago de un agente (legítimos y maliciosos) contra el vault | [`tools/agent`](tools/agent) |
| **Demo web** | Página estática que lee el vault, simula pagos y corre el mismo escáner en el navegador; no usa claves | [`web`](web) · [en vivo](https://sandley7.github.io/CrimsonSentry/) |
| **Cuenta del agente (arquitectura B, prototipo)** | La wallet del agente como contrato: su `__check_auth` aplica la política a cada `transfer`, que es lo que firman x402 y MPP | [`contracts/agent-account`](contracts/agent-account) · [`docs/ARQUITECTURA-B.md`](docs/ARQUITECTURA-B.md) |

---

## ✅ Evidencia en Stellar testnet (v2, versión oficial)

**Contrato Policy Vault v2:** [`CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC`](https://stellar.expert/explorer/testnet/contract/CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC), compilado con `soroban-sdk 29.0.1`.
WASM sha256 `96a2ea9ba8350a77e5615341e0d3d7ae7c27dcb9f1aebafae0f4c8732c155810` ([`evidence/wasm-sha256.txt`](evidence/wasm-sha256.txt)): idéntico al que compila este repo.

Política: 1 a 10 XLM por pago, 25 XLM por 24 h móviles, máx. 5 pagos en 24 h y un solo comercio en la allowlist. **Techos inmutables:** 20 XLM por pago y 50 XLM por 24 h. **Retiro del dueño:** solo a la dirección de recuperación fijada al desplegar. El vault se fondeó con 100 XLM de testnet.

| Escenario | Resultado on-chain | Transacción |
|---|---|---|
| Despliegue del vault (constructor con recuperación y techos) | ✅ | [`439fcc96…`](https://stellar.expert/explorer/testnet/tx/439fcc96b3e3c5be9db29cc2f09313e8b6347a0576db90782947580ce0ef34d2) |
| Pago válido de 10 XLM al comercio permitido | ✅ SUCCESS | [`42c5dbb2…`](https://stellar.expert/explorer/testnet/tx/42c5dbb2bc11c9deba7546a8a8c6cf047d8ede2bff917d6112f2e8879819b991) |
| Ataque de pagos paralelos: pago A de 10 XLM (acumulado 20) | ✅ SUCCESS | [`e1823c21…`](https://stellar.expert/explorer/testnet/tx/e1823c2120275bcf5c5ad4d234d2653e05b70841de775973bdc1f3a28a152e47) |
| Ataque de pagos paralelos: pago B de 10 XLM (acumulado 30 > 25) | ⛔ **FAILED**: `Error(Contract, #3)` OverDailyLimit | [`28e5ef02…`](https://stellar.expert/explorer/testnet/tx/28e5ef02603a2246723b5e889b94bb4940e796fb134228bf8281b6f433f02e63) |
| Pago de 0,5 XLM, por debajo del mínimo de 1 XLM, enviado aunque la simulación lo rechaza | ⛔ **FAILED**: `Error(Contract, #12)` UnderMinAmount | [`e3c8a91d…`](https://stellar.expert/explorer/testnet/tx/e3c8a91d381b437ec1de3a440c8b0f2d48066eb72f42abdddb8bff840e691410) |
| El dueño retira 10 XLM: el dinero va **solo** a la dirección de recuperación (evento `withdrawn`) | ✅ | [`22ab609b…`](https://stellar.expert/explorer/testnet/tx/22ab609b070547ea3f40794236ac6e3e96d47b1f31c4ced629861f7a14748241) |
| El dueño fija la política exactamente en el techo (20 / 50 XLM) | ✅ | [`cf8b47b6…`](https://stellar.expert/explorer/testnet/tx/cf8b47b614136c8369a1fe203bb52fc94785c0b1624b52658313453e3f4fcf96) |
| El dueño intenta subir el límite por pago a 30 XLM (techo: 20) | 🛑 rechazado en simulación: `#14` PolicyOverCeiling | — |
| Pago de 15 XLM (límite por pago 10) | 🛑 rechazado en simulación: `#2` | — |
| Pago a una dirección fuera de la allowlist | 🛑 rechazado en simulación: `#1` | — |
| Pago con el vault en pausa (kill switch) | 🛑 rechazado en simulación: `#7` | — |

El pago B pasó la simulación por sí solo, porque se construyó cuando solo había 10 XLM gastados. On-chain, el vault vio el acumulado real y revirtió: **las validaciones fuera de la cadena se pueden burlar; la regla on-chain no.** Detalle: [`evidence/testnet-evidence.md`](evidence/testnet-evidence.md) (escenarios del script `demo-testnet.sh`) y [`evidence/testnet-v2-features.md`](evidence/testnet-v2-features.md) (recuperación, techos y mínimo, de `demo-v2.sh`).

**Copia de seguridad:** testnet se reinicia varias veces al año y entonces los enlaces de Stellar Expert dejan de funcionar. Cada transacción citada en esta página está archivada completa (sobre, resultado y metadata) en [`evidence/archive/`](evidence/archive/INDEX.md); `python scripts/archive-evidence.py` la regenera.

### Demo del agente sobre la v2: cada regla, rechazada on-chain

Vault de demo [`CCDEQWLY…MP6H`](https://stellar.expert/explorer/testnet/contract/CCDEQWLYKHHXMUO4VTIE4GAM23HG5MASKYYWS2G4FQ7IS2VCDW6YMP6H), con la misma política. El agente actúa como un **cliente comprometido**: envía los pagos aunque la simulación los rechace, así que el rechazo lo impone el contrato en la cadena.

| Intento del agente | Resultado on-chain | Transacción |
|---|---|---|
| Factura legítima: 8 XLM al comercio | ✅ SUCCESS | [`de278b11…`](https://stellar.expert/explorer/testnet/tx/de278b1132ac4f603c31786fadbb8b22c5968752d279330c26db20e1de73b172) |
| 50 XLM a una dirección fuera de la allowlist | ⛔ **FAILED**: `#1` NotAllowlisted | [`6acaa660…`](https://stellar.expert/explorer/testnet/tx/6acaa660e2aa9f73da3b26033cf8a406bc3a17ba06448a1ba6229eabca5c5e33) |
| Bucle: pago de más con el máximo de 5 en 24 h | ⛔ **FAILED**: `#8` TooManyPayments | [`ef65d189…`](https://stellar.expert/explorer/testnet/tx/ef65d1892c66e6c81795313745355787c1585ceb76ef16629ee5fba8b18b0d42) |
| Pago con el vault en pausa | ⛔ **FAILED**: `#7` Paused | [`71caf600…`](https://stellar.expert/explorer/testnet/tx/71caf600b40a47eaa69c8eb8e2958e5c47f54b957c3c7e582dec50913118a0a2) |

Registro completo: [`evidence/agent-demo-20261018-014117.md`](evidence/agent-demo-20261018-014117.md).

### Evidencia histórica: v2 con `soroban-sdk 28`

La primera versión desplegada de la v2 usaba el SDK 28. Mismo código, otro WASM. Vault [`CDXNZEYS…KOIJ`](https://stellar.expert/explorer/testnet/contract/CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ), WASM `3d016235…acd9c4`. Su evidencia, incluido el pago B de los pagos paralelos revertido con `#3` ([`e7a809bc…`](https://stellar.expert/explorer/testnet/tx/e7a809bc23d560e03916066bace425dd10cc861337a805ee979198c3b5fa8867)), el rechazo `#12` ([`6f7600d7…`](https://stellar.expert/explorer/testnet/tx/6f7600d7c09b0aca176c931a3adc8ab2d0227bccfd6169aece4d0ee5169b3191)) y el retiro a la recuperación ([`edaf0df0…`](https://stellar.expert/explorer/testnet/tx/edaf0df0a3c493fbd406013cb9d052090b3e6dce55171392e4b95233963e8488)), está en [`evidence/v2-sdk28/`](evidence/v2-sdk28/testnet-v2-features.md).

### Evidencia histórica de la v1 (la que presentó el hackathon)

La v1 sigue desplegada y es la que muestran los videos. **Ya no es la versión oficial:** su `withdraw` acepta cualquier destino y la política no tiene techos. Contrato [`CB5X32K4…JEBXG`](https://stellar.expert/explorer/testnet/contract/CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG), WASM `8f063bdc…7c6bef` ([`evidence/v1/wasm-sha256.txt`](evidence/v1/wasm-sha256.txt)).

| Escenario | Resultado on-chain | Transacción |
|---|---|---|
| Despliegue del contrato | ✅ | [`83a8576b…`](https://stellar.expert/explorer/testnet/tx/83a8576b01aeae5a858a61fe83452275f87aaa7c2daa4e29f9bcf7b242634954) |
| Pago válido de 10 XLM | ✅ SUCCESS | [`353b05e3…`](https://stellar.expert/explorer/testnet/tx/353b05e366f9e4491b87747bfea9e5e624a33307c413470df5926d6cdc990671) |
| Ataque de pagos paralelos, pago A | ✅ SUCCESS | [`c1fa5ea6…`](https://stellar.expert/explorer/testnet/tx/c1fa5ea6a2d240a82fe25a39b98a1f8355921b76564b1d55696f4260b467971d) |
| Ataque de pagos paralelos, pago B (30 > 25) | ⛔ **FAILED**: `#3` | [`89f54fce…`](https://stellar.expert/explorer/testnet/tx/89f54fceaeb9907fd1c8bbe63663a4b4cfd3fc9b0bbe94ed5d6481832add745b) |
| Pausa y reanudación (kill switch) | ✅ | pausa [`9cda2c8c…`](https://stellar.expert/explorer/testnet/tx/9cda2c8ca469daa09215f5b1577ac2f38b52574e91341f8bccfb1a26dd60f73e) · reanudación [`f480e480…`](https://stellar.expert/explorer/testnet/tx/f480e480afe4d6da3fb47361aecf2702236b5bb3061600e916a82a1eaf1ced4d) |
| Demo del agente: 50 XLM fuera de la allowlist | ⛔ **FAILED**: `#1` | [`969e551b…`](https://stellar.expert/explorer/testnet/tx/969e551b48072ea5d8ee61146c8fdb0f48427e3b28278e6ca4dedf0df3fb12de) |
| Demo del agente: 6.º pago en 24 h | ⛔ **FAILED**: `#8` | [`c8adfc3b…`](https://stellar.expert/explorer/testnet/tx/c8adfc3b11294721b363c20a6a7fa8d07377fbdcf1ab1ac803e44c8e2022ca4b) |
| Demo del agente: pago con el vault en pausa | ⛔ **FAILED**: `#7` | [`f66b31e8…`](https://stellar.expert/explorer/testnet/tx/f66b31e830105fc5657e415b108e53fb6b0592260e6bfdd8b472cef7d6119567) |

Detalle: [`evidence/v1/testnet-evidence.md`](evidence/v1/testnet-evidence.md) y [`evidence/v1/agent-demo-20260923-032222.md`](evidence/v1/agent-demo-20260923-032222.md).

---

## Cómo funciona

```
 Agente IA ──pay(destino, monto)──▶  Policy Vault (Soroban)  ──transfer──▶ Comercio
 (solo firma pagos)                   ├─ allowlist de destinos
                                      ├─ monto mínimo y límite por pago
                                      ├─ límite en 24h MÓVILES
                                      ├─ máx. N pagos en 24h
                                      └─ pausa (kill switch)
 Dueño humano ──set_policy (≤ techos) / pause / set_agent / propose_owner / withdraw──▶ Vault
                withdraw ──▶ SOLO a la dirección de recuperación fijada al desplegar
 Escáner ──get_status() (RPC) + cuentas del agente, dueño y recuperación (Horizon)──▶ semáforo OWASP
```

Los fondos viven en el contrato, no en la wallet del agente. El agente solo puede llamar a `pay`; si viola una regla, el contrato hace `panic_with_error!` y **toda la transacción revierte**.

### API del contrato

| Función | Quién firma | Qué hace |
|---|---|---|
| `__constructor(owner, agent, token, policy, recovery, ceilings)` | — (deploy) | Configuración única; no existe `initialize()`, así que no se puede reinicializar. Fija la dirección de recuperación y los techos para siempre |
| `pay(destino, monto)` | agente | Paga si cumple todas las reglas y el vault no está en pausa |
| `set_policy(policy)` | dueño | Reemplaza la política de forma atómica, validándola y sin superar los techos |
| `pause()` / `unpause()` | dueño | Kill switch: bloquea todos los pagos del agente |
| `set_agent(new_agent)` | dueño | Rota una clave de agente comprometida |
| `propose_owner(new_owner)` · `accept_owner()` · `cancel_owner_change()` | dueño · dueño nuevo · dueño | Cambio de dueño en dos pasos: la dirección nueva debe aceptar con su propia firma |
| `withdraw(amount)` | dueño | Mueve fondos **solo a la dirección de recuperación**, incluso en pausa |
| `get_policy()` / `get_status()` / `get_pending_owner()` | — (lectura) | Estado completo para el escáner |

`Policy = { min_amount, tx_limit, daily_limit, max_payments_per_day, allowlist }` · `Ceilings = { max_tx_limit, max_daily_limit }`

Orden exacto de los controles en `pay()`: firma del agente → monto > 0 (`#5`) → no pausado (`#7`) → destino permitido (`#1`) → monto mínimo (`#12`) → límite por pago (`#2`) → cantidad de pagos en 24h (`#8`) → suma sin overflow (`#4`) → límite de 24h (`#3`). Si todo pasa: registra el gasto, transfiere y emite el evento `paid`.

### Códigos de error (lo que se ve en Stellar Expert)

| Código | Error | Causa |
|---|---|---|
| `#1` | `NotAllowlisted` | Destino fuera de la allowlist |
| `#2` | `OverTxLimit` | Pago mayor al límite por transacción |
| `#3` | `OverDailyLimit` | Supera el límite de las últimas 24h |
| `#4` | `ArithmeticOverflow` | Overflow en la suma del gasto |
| `#5` | `InvalidAmount` | Monto ≤ 0 |
| `#6` | `InvalidPolicy` | Política incoherente (límites ≤ 0, `tx_limit > daily_limit`, allowlist > 32, dueño o agente en la allowlist, etc.) o techos incoherentes |
| `#7` | `Paused` | El dueño activó el kill switch |
| `#8` | `TooManyPayments` | Superó el máximo de pagos en 24h |
| `#9` | `NotInitialized` | Estado corrupto (no debería ocurrir) |
| `#10` | `InvalidOwner` | Dueño propuesto igual al actual, al agente, a la recuperación o a un destino de la allowlist |
| `#11` | `NoPendingOwner` | No hay un cambio de dueño propuesto |
| `#12` | `UnderMinAmount` | Pago menor que el mínimo |
| `#13` | `InvalidRecovery` | Recuperación igual al dueño, al agente o al propio vault |
| `#14` | `PolicyOverCeiling` | La política supera un techo inmutable |

Cada operación exitosa emite un evento (`paid`, `policy_updated`, `paused_changed`, `agent_rotated`, `owner_change_proposed`, `owner_rotated`, `owner_change_cancelled`, `withdrawn`) para monitoreo.

---

## Escáner de seguridad

Audita un agente y su vault **sin claves ni transacciones**: simula `get_status()` por Stellar RPC y lee las cuentas del agente, del dueño y de la recuperación en Horizon.

```bash
cd tools && npm ci
node scanner/scan.js --vault CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC
node scanner/scan.js --vault <C...> --json        # para CI o un dashboard
node scanner/scan.js --vault CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG --expected-wasm 8f063bdcefa17824502ed78aa6cecca68727fad558c8fb26de2c69d8257c6bef   # vault v1
```

Por defecto compara el WASM on-chain con el hash de [`evidence/wasm-sha256.txt`](evidence/wasm-sha256.txt) (el de la v2). Código de salida: `0` verde · `1` amarillo · `2` rojo.

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
| C17 | Dirección de recuperación y techos (solo v2; en la v1 sale 🟡) | Recuperación igual al dueño o al agente, cuenta inexistente o de una sola clave, o un techo diario que alcanza para vaciar el vault | ASI03 · ASI09 |

**Estado del vault v2 oficial:** la cuenta del agente devolvió 9 997 XLM de su saldo propio al dueño antes de esta demo ([`877aafc5…`](https://stellar.expert/explorer/testnet/tx/877aafc524adc8837b2a457c2da483a31797a89925080240ec6633bef7887e24)) y C1 está en 🟢: solo puede mover ~1,9 XLM, para fees. No hay ningún 🔴; los 🟡 permanentes son C12 (una sola clave controla al dueño) y C17 (la cuenta de recuperación de la demo tiene una sola clave). C8 y C9 se encienden mientras la ventana de 24 h esté usada o haya intentos rechazados, por ejemplo justo después de correr las demos.

**Cómo se vio en la v1:** C1 dio **🔴** al principio, porque la cuenta del agente conservaba ~9,999 XLM de Friendbot, 125 veces lo que protege el vault. Era la [limitación 1](#limitaciones-conocidas) vista en vivo y uno de los jurados la señaló. El 06/10/2026 el agente de la v1 devolvió 9 997 XLM al dueño ([`7769ba70…`](https://stellar.expert/explorer/testnet/tx/7769ba70fda1c792585158819f5b6277eb0ff2adfe5b42a167920759121474a6)) y C1 pasó a 🟢.

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

Con `OPEN_FIRST_REJECTION=0` no abre el navegador solo, y `EVIDENCE_DIR` cambia la carpeta donde guarda su registro. El escenario [`tools/agent/scenario-v2.json`](tools/agent/scenario-v2.json) añade un pago por debajo del mínimo (`#12`).

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
| Montos negativos, cero o de polvo | Cero o negativos, rechazados (`#5`); por debajo del mínimo, rechazados (`#12`), así que agotar la cuota con micropagos tiene un costo |
| Doble gasto en la medianoche | Ventana **móvil** de 24h, no día calendario (test `midnight_boundary_cannot_double_the_daily_limit`) |
| Agente desbocado con muchos micro-pagos | `max_payments_per_day` (`#8`) y monto mínimo (`#12`) |
| Agente comprometido | `pause`, `set_agent` y `withdraw` para el dueño |
| **Clave del dueño robada: retiro a un destino propio** | `withdraw(amount)` solo paga a la dirección de recuperación, fija desde el despliegue |
| **Clave del dueño robada: aflojar la política y pagar por el agente** | Techos inmutables (`#14`): ni el dueño puede superarlos. Limita la pérdida a `max_daily_limit` por ventana de 24 h; no la elimina, ver [`docs/V2.md`](docs/V2.md) |
| Agente o dueño como destino de pago, o ambos en la misma cuenta | Validado on-chain en el constructor, `set_policy`, `set_agent` y el cambio de dueño |
| Cambio de dueño a una dirección equivocada | Dos pasos: la dirección nueva debe aceptar con su propia firma; el dueño puede cancelar antes |
| DoS por bucles sin límite | Allowlist ≤ 32 y registro de gastos ≤ 100 entradas |
| Estado inconsistente | El gasto se registra **antes** de transferir (checks-effects-interactions); cualquier error revierte todo |

### Auditoría estática — `cargo scout-audit`

Resultado de la v2 con `soroban-sdk 29.0.1`: **0 críticos · 2 medios · 0 menores · 8 mejoras**, según la CI. El reporte completo está en [`docs/scout-report.md`](docs/scout-report.md). (La v1 daba 0 · 1 · 0 · 5.)

| Hallazgo | Nivel | Veredicto |
|---|---|---|
| `dynamic_storage`: `SpendLog` es un `Vec` en storage persistente | Medio | **Riesgo aceptado.** El vector está acotado (≤ `max_payments_per_day` ≤ 100 entradas; medido on-chain: 72 B por pago, unos 7.3 KB en el peor caso, muy por debajo del límite de 64 KB por entrada), se poda en cada pago y solo `pay`, tras `require_auth` del agente, puede escribirlo. Guardarlo como un `Vec` es lo que permite una ventana móvil de 24h exacta |
| `missing_new_admin_auth` en `propose_owner` | Medio (nuevo en la v2) | **Falso positivo por diseño.** En un cambio en dos pasos, quien propone guarda la dirección y la dirección nueva firma en `accept_owner` (`pending_owner.require_auth()`), que es donde se vuelve dueño. Tests: `owner_rotation_requires_proposal_and_acceptance_by_new_owner` y `nothing_works_without_signatures` |
| `storage_change_events` ×8 | Mejora | **Falso positivo.** Las funciones que cambian el estado emiten eventos con `#[contractevent]` (SDK ≥ 23), que el detector no reconoce. El test `every_state_change_emits_an_event` lo demuestra |
| `soroban_version` | Mejora | **Resuelto** al migrar de `soroban-sdk 28` a `29.0.1`: scout ya no lo avisa |
| ~~`dos_unexpected_revert_with_storage`~~ en `window()` | ~~Medio~~ | **Corregido** en la v1: la ventana se calcula con `slice` sobre el log ordenado, sin `push_back` |

Scout 0.3.16 no compila `soroban-sdk 28` tal como viene; [`scripts/scout.sh`](scripts/scout.sh) aplica dos ajustes solo para la auditoría, sin tocar el contrato, y explica por qué.

```bash
cargo install --locked cargo-dylint dylint-link cargo-scout-audit@0.3.16   # una vez (Linux/WSL/macOS)
bash scripts/scout.sh
```

### Limitaciones conocidas

1. **Arquitectura A (MVP, este repo):** el agente llama explícitamente al vault. Si la cuenta del agente tiene saldo propio, puede pagar **sin pasar por el vault**. Por eso el dinero debe estar en el vault, y el escáner lo vigila (C1 y C10). Además, el agente paga los fees de sus propias transacciones, así que siempre conserva algo de saldo; un *relayer* con fee-bump lo eliminaría.
2. **x402 y MPP:** estos protocolos firman transferencias directamente desde la cuenta del agente (*auth-entry signing*), así que la arquitectura A **no las intercepta**. La **arquitectura B** convierte la wallet del agente en una *contract account* cuyo `__check_auth` aplica esta misma política, que es lo que x402 y MPP necesitan. Hay un [prototipo probado en testnet](docs/ARQUITECTURA-B.md) (pagos válidos, rechazos y el ataque de pagos paralelos revertido on-chain), y **el código oficial del facilitador x402 de Stellar y el facilitador alojado de testnet aceptan y liquidan un pago cuyo pagador es esa cuenta** (con un cliente adaptado: el oficial no sabe firmar para cuentas-contrato, y el pago cuesta unas 25 veces más en comisiones). Un flujo HTTP completo (402, pago, 200) también funciona. Falta probar USDC y las wallets. En el modo *Channel* de MPP, la política debe limitar también el monto de apertura del canal.
3. **Clave del dueño:** si se compromete, el atacante no puede retirar a una dirección propia ni superar los techos, pero **sí puede sacar hasta `max_daily_limit` por cada ventana de 24 h** (aflojando la política y rotando al agente) hasta que alguien reaccione, y con una sola clave el atacante y el dueño legítimo compiten. Mitigación: cuenta del dueño multifirma (C12 del escáner).
4. **Los techos y la dirección de recuperación no se pueden cambiar** una vez desplegado el vault. Unos techos altos dan poca protección, y si se pierde la clave de recuperación, `withdraw` deja de ser útil (los fondos solo salen por el camino de pagos del agente, dentro de la política).
5. **Cuota consumible:** quien robe la clave del agente puede agotar los N pagos del día con el monto mínimo y bloquear al agente legítimo 24h. El mínimo hace que cueste algo; la pérdida de fondos sigue acotada a `daily_limit`, y el dueño puede ajustar la política o pausar.
6. **Contrato inmutable:** no hay función de upgrade. Un bug implica desplegar un vault nuevo y migrar los fondos (`withdraw`, que va a la dirección de recuperación).

---

## Mapeo al OWASP Top 10 for Agentic Applications (2026)

| Riesgo OWASP | Qué aporta CrimsonSentry |
|---|---|
| ASI01 Agent Goal Hijack | Un agente manipulado sigue atado a la allowlist y a los límites on-chain (demo: `#1`); el escáner cuenta los intentos rechazados (C9) |
| ASI02 Tool Misuse & Exploitation | La herramienta "pagar" tiene límites que el propio agente no puede cambiar; el escáner detecta pagos por fuera del vault (C1, C10) |
| ASI03 Identity & Privilege Abuse | Separación agente/dueño validada on-chain; el agente no puede tocar la política ni retirar fondos; el dueño no puede retirar a un destino propio ni superar los techos; cambio de dueño en dos pasos (C4, C5, C12, C17) |
| ASI04 Agentic Supply Chain | El escáner verifica que el WASM desplegado sea el auditado y que el token sea el oficial (C13, C14) |
| ASI08 Cascading Failures | Límites de monto y de frecuencia cortan un bucle de pagos (demo: `#8`); el monto mínimo encarece el agotamiento de la cuota (`#12`) |
| ASI09 Human-Agent Trust Exploitation | El dueño decide con el estado real de la cadena, no con lo que reporta el agente (C11) |
| ASI10 Rogue Agents | Kill switch, rotación de clave y retiro de fondos por el dueño hacia una dirección fija (demo: `#7`) |

---

## Qué construimos durante el hackathon

Todo el código del hackathon se escribió dentro de la ventana de desarrollo del evento (desde el kickoff del 19/09/2026). **No partimos de un proyecto previo.**

| Fecha | Trabajo |
|---|---|
| 19–22/09 | Investigación (Agentic Payments de Stellar, x402/MPP, OWASP Agentic Top 10), propuesta y primer borrador del contrato |
| 23/09 | Contrato reescrito y endurecido (ventana móvil de 24h, límite de frecuencia, kill switch, rotación del agente, retiro, eventos, `get_status`); 18 tests; auditoría con scout; CI; deploy en testnet con evidencia on-chain |
| 23/09 | Escáner de seguridad (16 chequeos, 10 tests) y demo del agente con rechazos `#1`, `#7` y `#8` on-chain |

### Después del hackathon (octubre de 2026)

| Fecha | Trabajo |
|---|---|
| 02/10 | Corrección de bugs del escáner y del agente y más tests (Santiago); documentación de seguridad, operación y escáner, y verificador de enlaces (Cesar) |
| 06–17/10 | **Contrato v2** con evidencia propia: recuperación fija, techos inmutables y monto mínimo (Santiago), sobre los roles separados y el cambio de dueño en dos pasos (Cesar). Chequeo C17 del escáner. Documentos de posicionamiento y de validación con clientes |

El historial de commits del repo refleja este trabajo, con la autoría de cada persona.

### Código y herramientas de terceros

| Componente | Uso | Licencia |
|---|---|---|
| [`soroban-sdk`](https://github.com/stellar/rs-soroban-sdk) 29.0.1 | SDK del contrato | Apache-2.0 |
| [`@stellar/stellar-sdk`](https://github.com/stellar/js-stellar-sdk) 17.1.0 | RPC, Horizon y XDR en el escáner y el agente | Apache-2.0 |
| [`stellar-cli`](https://github.com/stellar/stellar-cli) 28.x | Build, deploy, firma; la estructura inicial salió de `stellar contract init` | Apache-2.0 |
| [`cargo-scout-audit`](https://github.com/coinfabrik/scout-audit) 0.3.16 | Auditoría estática (herramienta, no se redistribuye) | MIT |

---

## Desarrollo

### Requisitos

- Rust ≥ 1.91 con el target `wasm32v1-none`
- `stellar-cli` ≥ 28 y `soroban-sdk 29.0.1`. Testnet corre el protocolo 29; el contrato se compila, se prueba y se despliega con el SDK 29 sin cambios de código respecto al 28 (los 37 tests pasan en ambos)
- Node.js ≥ 22.12 para el escáner y el agente (`cd tools && npm ci`)

En la PC de desarrollo de José (Windows) el toolchain está en `D:\Rust`; en otras máquinas `scripts/env.sh` no hace nada. Carga el entorno con:

```bash
source scripts/env.sh        # Git Bash
```
```powershell
. .\scripts\env.ps1          # PowerShell
```

> **Windows con usuario con tilde** (`C:\Users\José`): `wasm-opt` falla con *"Failed to write module"* si la carpeta temporal tiene caracteres no ASCII. Los scripts `env.*` apuntan `TMP`/`TEMP` a `D:\Rust\tmp`.

### Tests

```bash
cargo test                   # vault v2: 37 tests · cuenta del agente (arquitectura B): 22 tests
cd tools && npm test         # escáner: 16 tests
```

Los tests del contrato cubren:
- los 4 escenarios del plan original;
- la ventana móvil y el caso de la medianoche;
- el límite de frecuencia de pagos y el monto mínimo;
- la pausa, el retiro a la dirección de recuperación y la rotación del agente;
- el cambio de dueño en dos pasos y la separación de roles;
- los techos inmutables;
- quién firma cada función y que nada funciona sin firmas;
- la validación de políticas y el constructor;
- `get_status`;
- que cada cambio de estado emite un evento.

### Demo web

```bash
python scripts/build-web.py                          # arma _site/ (la página y los módulos del escáner que reutiliza)
python -m http.server 8080 --directory _site         # http://localhost:8080
```

La página usa `tools/scanner/checks.js` y `tools/lib/stellar.js` tal cual (el hash del WASM se calcula con WebCrypto, así que corre igual en Node y en el navegador). `web/vault.json` dice qué vaults ofrece: uno de demostración, sin actividad, para que las simulaciones den siempre el mismo resultado, y el oficial de la evidencia. El flujo `.github/workflows/pages.yml` la publica en GitHub Pages.

### Build

```bash
stellar contract build       # -> target/wasm32v1-none/release/policy_vault.wasm
```

### Deploy y demos en testnet

```bash
bash scripts/deploy-testnet.sh   # crea cs-owner / cs-agent / cs-shop / cs-recovery, despliega con techos y fondea 100 XLM
bash scripts/demo-testnet.sh     # pago válido, rechazos y el ataque de pagos paralelos → evidence/testnet-evidence.md
bash scripts/demo-agente.sh      # demo completa con agente, escáner y kill switch sobre un vault nuevo
```

`RECOVERY_ADDRESS=<G…>` usa una dirección propia como recuperación (solo hace falta la pública); `CEILING_TX_XLM` y `CEILING_DAILY_XLM` fijan los techos (20 y 50 XLM por defecto). Si ya existe una identidad `cs-shop`, se reutiliza: se puede registrar una wallet propia solo con su clave pública (`stellar keys add cs-shop --public-key <G…>`).

El ataque de pagos paralelos prepara dos pagos de 10 XLM; cada uno por separado pasa la simulación (10 + 10 ≤ 25), pero on-chain el vault ve el acumulado (30 > 25) y **el segundo revierte con `Error(Contract, #3)`**.

---

## Roadmap

- [x] Policy Vault con tests
- [x] `cargo scout-audit`: 0 críticos (hallazgos revisados arriba)
- [x] Deploy en testnet más evidencia
- [x] Escáner CLI con semáforo y mapeo OWASP (17 chequeos)
- [x] Demo del agente con rechazos on-chain
- [x] **v2 del contrato:** roles separados, cambio de dueño en dos pasos, monto mínimo, dirección de recuperación fija y techos inmutables, desplegada en testnet con evidencia
- [x] Migrar a `soroban-sdk 29` (otro WASM: despliegue y evidencia nuevos)
- [x] Arquitectura B, prototipo: *contract account* con `__check_auth` que aplica la política, probada en testnet ([detalle](docs/ARQUITECTURA-B.md))
- [x] Arquitectura B con x402: cliente que firma para cuentas-contrato y pago verificado y liquidado por el código oficial del facilitador (en local) y por el facilitador alojado de testnet
- [x] Arquitectura B con x402: flujo HTTP completo (servidor `@x402/express`, agente `@x402/fetch`, 402 → pago desde la cuenta-contrato → 200)
- [ ] Arquitectura B con x402: USDC, wallets que firmen para la cuenta y reducir el costo de las comisiones
- [ ] Relayer con fee-bump para que el agente no necesite saldo propio
- [x] Demo web pública: vault en vivo, simulador de pagos, escáner en el navegador y evidencia verificable en Stellar Expert
- [ ] Keeper de TTL e indexador de eventos con pausa automática ante anomalías
- [ ] Revisión de seguridad independiente antes de cualquier uso con dinero real
