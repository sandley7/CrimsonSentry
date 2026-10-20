# CrimsonSentry — Arquitectura

Esquema del contrato `policy-vault` **v2**, la versión oficial: 37 tests y `cargo scout-audit` sin hallazgos críticos. La v1 del hackathon tenía 19 tests; los cambios están en [V2.md](V2.md).

## Actores y componentes

```mermaid
flowchart LR
    Owner([Dueño humano]) -->|set_policy dentro de los techos · pause/unpause · set_agent · propose_owner · withdraw| Vault[(Policy Vault<br/>contrato Soroban)]
    Agent([Agente IA]) -->|pay destino, monto| Vault
    Vault -->|transfer, si pasa la política| Token[[Token XLM · SAC]]
    Token -->|XLM| Dest[Comercio permitido<br/>allowlist]
    Vault -->|withdraw: solo a la dirección fija| Recovery[(Dirección de recuperación<br/>fijada al desplegar)]
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
    Allow -- sí --> Min{¿Monto >= mínimo?}
    Min -- no --> E12[Error #12 UnderMinAmount]
    Min -- sí --> TxLimit{¿Monto <= límite por pago?}
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

## Lo que controla el dueño

```mermaid
flowchart TD
    O([Dueño llama set_policy]) --> Auth{¿Firma del dueño?}
    Auth -- no --> EA[Tx rechazada: falta autorización]
    Auth -- sí --> Valid{¿Política coherente?<br/>mínimo, límites, allowlist,<br/>dueño y agente fuera de ella}
    Valid -- no --> E6[Error #6 InvalidPolicy]
    Valid -- sí --> Ceil{¿Límite por pago y diario<br/>dentro de los techos?}
    Ceil -- no --> E14[Error #14 PolicyOverCeiling]
    Ceil -- sí --> OK([Política reemplazada → evento policy_updated])
```

Los techos y la dirección de recuperación se fijan en el constructor y no tienen ninguna función que los cambie. `withdraw(amount)` solo paga a la dirección de recuperación. El cambio de dueño es en dos pasos: `propose_owner`, y luego `accept_owner` con la firma de la dirección nueva.

## Opción A (el vault) vs Opción B (la cuenta del agente)

La B tiene un prototipo probado en testnet: ver [ARQUITECTURA-B.md](ARQUITECTURA-B.md).

| | Opción A — el vault (oficial) | Opción B — la cuenta del agente (prototipo) |
|---|---|---|
| Custodia de fondos | El vault retiene el dinero | La wallet del agente, convertida en *contract account* |
| Enforcement | Lógica del contrato en `pay()` | `__check_auth()` en cada firma |
| Compatible con x402 / MPP | ❌ (firman fuera del vault) | ✅ en testnet, con un cliente adaptado: ver [ARQUITECTURA-B.md](ARQUITECTURA-B.md) |
| Punto débil conocido | Si el agente tiene saldo propio, puede evadir el vault | Cada pago cuesta unas 25 veces más en comisiones; sin auditar |

Ese punto débil de la Opción A es justo lo que detecta el escáner (`tools/scanner`, chequeos C1 y C10): lee `get_status()` del vault vía Stellar RPC y el saldo propio del agente vía Horizon. Sobre el vault v1 del hackathon dio 🔴 en C1 mientras la cuenta del agente conservaba sus XLM de Friendbot; desde el 06/10/2026, tras devolver el excedente al dueño, da 🟢. El vault v2 oficial da 🟢 en C1 con su agente de demostración.
