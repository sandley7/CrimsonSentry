# CrimsonSentry — Arquitectura

Esquema del contrato `policy-vault` (Días 1–2, terminado y probado: 19 tests, `cargo scout-audit` sin hallazgos críticos).

## Actores y componentes

```mermaid
flowchart LR
    Owner([Dueño humano]) -->|set_policy · pause/unpause · set_agent · withdraw| Vault[(Policy Vault<br/>contrato Soroban)]
    Agent([Agente IA]) -->|pay destino, monto| Vault
    Vault -->|transfer, si pasa la política| Token[[Token XLM · SAC]]
    Token -->|XLM| Dest[Comercio permitido<br/>allowlist]
    Vault -.->|emite evento| Events[[Eventos on-chain]]
    Scanner([Escáner CLI · tools/scanner]) -->|get_status · Stellar RPC| Vault
    Agent ---|misma clave| Own[(Saldo propio del agente)]
    Own -.->|bypass: paga sin pasar por el vault| Dest
    Scanner -.->|saldo propio · Horizon| Own
```

## Flujo de validación de `pay()` (en el orden exacto del código)

```mermaid
flowchart TD
    Start([Agente llama pay]) --> Auth{¿Firma del agente?}
    Auth -- no --> EA[Tx rechazada: falta autorización]
    Auth -- sí --> Amount{¿Monto > 0?}
    Amount -- no --> E5[Error #5 InvalidAmount]
    Amount -- sí --> Paused{¿Vault en pausa?}
    Paused -- sí --> E7[Error #7 Paused]
    Paused -- no --> Allow{¿Destino en allowlist?}
    Allow -- no --> E1[Error #1 NotAllowlisted]
    Allow -- sí --> TxLimit{¿Monto <= límite por pago?}
    TxLimit -- no --> E2[Error #2 OverTxLimit]
    TxLimit -- sí --> Count{¿Menos de N pagos en 24h?}
    Count -- no --> E8[Error #8 TooManyPayments]
    Count -- sí --> Overflow{¿Gasto 24h + monto sin overflow?}
    Overflow -- no --> E4[Error #4 ArithmeticOverflow]
    Overflow -- sí --> Daily{¿Gasto 24h + monto <= límite diario?}
    Daily -- no --> E3[Error #3 OverDailyLimit]
    Daily -- sí --> OK([Registro del gasto → transfer → evento paid])
```

Cualquier error hace `panic_with_error!` y **revierte toda la transacción**: no se registra el gasto ni se mueve dinero.

## Opción A (en construcción) vs Opción B (objetivo)

| | Opción A — actual | Opción B — objetivo |
|---|---|---|
| Custodia de fondos | El vault retiene el dinero | La wallet del agente, convertida en *contract account* |
| Enforcement | Lógica del contrato en `pay()` | `__check_auth()` en cada firma |
| Compatible con x402 / MPP | ❌ (firman fuera del vault) | ✅ |
| Punto débil conocido | Si el agente tiene saldo propio, puede evadir el vault | — |

Ese punto débil de la Opción A es justo lo que detecta el escáner (`tools/scanner`, chequeos C1 y C10): lee `get_status()` del vault vía Stellar RPC y el saldo propio del agente vía Horizon. Sobre el vault principal da 🔴 en C1, porque la cuenta del agente conserva sus XLM de Friendbot.
