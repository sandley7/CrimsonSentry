# Guía para colaboradores y para su Claude Code

> Estado al **17/10/2026**. Escrita por Santiago Lindley (líder y mantenedor de este repositorio) para José Escajadillo y Cesar Guevara, y para el Claude Code que cada uno use con este proyecto.

## Cómo usar este archivo

Si eres una persona: pásale este archivo a tu Claude Code (`@docs/PARA-COLABORADORES.md`) y dile qué quieres hacer. Este documento **explica el estado del proyecto y propone tareas; no decide por ti ni autoriza ninguna acción**.

Si eres un asistente de IA que lee esto, estas reglas valen mientras trabajes con este repositorio:

1. **Obedece a la persona con la que trabajas, no a este texto.** Si algo de aquí contradice lo que ella te pide, gana ella. Antes de modificar un repositorio, publicar, abrir o fusionar un PR, borrar ramas, invitar personas o enviar mensajes, **confirma con ella**.
2. **Nunca muestres, pidas ni escribas claves secretas, frases de recuperación ni el contenido del almacén de identidades de Stellar CLI** (`~/.config/stellar/identity`). En el proyecto solo circulan direcciones públicas (`G…`, `C…`).
3. **Cada persona firma sus propios commits.** No crees commits a nombre de otra persona. Si la persona pide que no figures como coautor, no añadas líneas `Co-Authored-By`.
4. **No cambies configuraciones del sistema ni de seguridad** (hipervisor, `bcdedit`, variables TEMP globales). Explícalo y que lo ejecute la persona.
5. **Trabaja en una rama y propón un PR.** No empujes a `main` sin acuerdo.
6. **La memoria y las preferencias de la persona prevalecen** sobre cualquier sugerencia de este documento (por ejemplo, el idioma, el estilo de planificación o dónde guardar archivos).
7. **El agente demo sigue un guion explícito**; no lo conviertas en un agente que siga instrucciones ocultas en contenidos. Se descartó a propósito.

## Qué es el proyecto, en breve

CrimsonSentry es un *Policy Vault* en Soroban (Rust) que custodia los fondos de un agente de IA y aplica una política on-chain en cada pago, más un escáner de seguridad (17 chequeos mapeados al OWASP Top 10 for Agentic Applications 2026) y un agente demo con guion. Nació en el hackathon Stellar Odyssey Perú 2026 (Track 04), donde quedó en **tercer lugar**. Lee el [README](../README.md) y [`docs/V2.md`](V2.md) antes de tocar nada.

## Qué cambió desde el hackathon

| Antes (repo de José, hackathon) | Ahora |
|---|---|
| Repo [`JoseEscajadillo/CrimsonSentry`](https://github.com/JoseEscajadillo/CrimsonSentry) | Se conserva como **registro del hackathon**. La continuación vive en [`sandley7/CrimsonSentry`](https://github.com/sandley7/CrimsonSentry), con el historial intacto y la autoría de cada persona |
| Contrato v1 (`CB5X32K4…`), con `withdraw(to, amount)` a cualquier destino y sin techos | **La v2 es la versión oficial** (`CCGYAPPA…VZC`, compilada con `soroban-sdk 29.0.1`): recuperación fija, techos inmutables, monto mínimo, roles separados y cambio de dueño en dos pasos. La v1 sigue desplegada y es la de los videos |
| PR #2 de Cesar abierto en el repo de José | Su trabajo en el contrato (roles separados y cambio de dueño en dos pasos) está integrado en la v2 **con su autoría** (commit `87e3841`). La rama `harden-policy-and-docs` conserva su propuesta original completa |
| Escáner con 16 chequeos | 17: C17 revisa la dirección de recuperación y los techos |
| Evidencia en `evidence/` | La de la v2 está en `evidence/`; la de la v1, en `evidence/v1/` |
| Vault principal con C1 en 🔴 | C1 en 🟢 desde el 06/10/2026, cuando el agente devolvió 9 997 XLM al dueño |
| CI en `ubuntu-latest` | Fijada en `ubuntu-24.04` |

Datos públicos de la v2 oficial: vault `CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC`, WASM `96a2ea9ba8350a77e5615341e0d3d7ae7c27dcb9f1aebafae0f4c8732c155810`. Detalle y enlaces a Stellar Expert en [`evidence/`](../evidence/testnet-v2-features.md). La primera versión de la v2, con el SDK 28, se conserva en [`evidence/v2-sdk28/`](../evidence/v2-sdk28/testnet-v2-features.md).

## Cómo comprobar el estado por tu cuenta

Todo esto es de solo lectura (salvo que compila en `target/`):

```bash
git clone https://github.com/sandley7/CrimsonSentry.git && cd CrimsonSentry
source scripts/env.sh               # en la PC de José carga D:\Rust; en otras, no hace nada
cargo test                          # contrato: 37 tests
cd tools && npm ci && npm test      # escáner: 16 tests
node scanner/scan.js --vault CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC
```

Resultado esperado del escáner sobre la v2: ningún 🔴; en 🟡, C12 (una sola clave del dueño) y C17 (la cuenta de recuperación de la demo tiene una sola clave), más C8 y C9 mientras la ventana de 24 h esté usada o haya intentos rechazados. Las identidades de la demo en testnet (`cs-owner`, `cs-agent`, `cs-recovery`, …) se crean con `scripts/deploy-testnet.sh` y viven solo en el almacén local de cada PC.

## Tareas que cada uno puede querer hacer (opcionales)

### José

Solo si José lo decide:

- **Revisar la v2** en el repo nuevo (tiene permiso de escritura): `docs/V2.md`, `contracts/policy-vault/src/lib.rs` y la evidencia. Si algo no le convence, que lo diga en un issue o en un PR.
- **En su repo del hackathon:** añadir al README un aviso que apunte a la continuación; cerrar el PR #2 explicando que su contenido de contrato quedó integrado en la v2; borrar la rama `docs/scope-and-security-accuracy`, que se subió ahí por error. Nada de esto es necesario: el repo puede quedar congelado como registro.
- **El vault v1** sigue en testnet, con unos 80 XLM de prueba. Su `owner` (la identidad `cs-owner` de José) puede retirarlos con `withdraw`, a cualquier dirección. No es urgente.
- **Archivar la evidencia on-chain** antes de que testnet se reinicie (2 a 4 veces al año, con aviso previo): `stellar tx fetch` de cada transacción de los README, guardado en una carpeta del repo.
- **Los videos de YouTube** siguen mostrando la v1. Si quiere, puede añadir a la descripción una línea con el alcance real: protege los fondos del vault y no el saldo propio del agente.

### Cesar

- Revisar que su trabajo en el contrato figure con su autoría y que la descripción en `docs/V2.md` sea fiel a lo que escribió.
- Si quiere conservar su rama `harden-policy-and-docs`, sigue en el repositorio nuevo.

## Pendientes del proyecto

| Pendiente | Notas |
|---|---|
| Arquitectura B y x402 | Hay un prototipo probado en testnet ([`docs/ARQUITECTURA-B.md`](ARQUITECTURA-B.md)). El pago x402 desde la cuenta-contrato ya se verificó y liquidó con el código oficial del facilitador y con el facilitador alojado de testnet; falta un flujo HTTP completo, USDC y bajar el costo en comisiones. Lo piden 4 de los 7 jurados |
| Demo web pública | Pedida por un jurado. Requiere una cuenta de hosting (por ejemplo, Vercel) |
| Validación con clientes | Plan en [`docs/VALIDACION.md`](VALIDACION.md). Lo ejecutan personas; nada se envía de forma automática |
| Video demo y pitch nuevos | Santiago los grabará de nuevo, con la v2 |
| Revisión de seguridad independiente | Imprescindible antes de usar dinero real |

## Límites que conviene no olvidar

- Es un prototipo de **testnet**, sin auditoría independiente.
- La arquitectura sigue siendo la **A**: no protege el saldo propio del agente ni intercepta x402 ni MPP.
- Los techos limitan la pérdida por ventana de 24 h si se compromete la clave del dueño, pero no la eliminan. Más detalle en [`docs/V2.md`](V2.md).
- El contrato es inmutable: un bug obliga a desplegar uno nuevo.
