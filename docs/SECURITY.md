# Modelo de amenazas y seguridad

> Describe el contrato **v2**, la versión oficial. La v1 (la del hackathon) no tiene dirección de recuperación fija, techos, monto mínimo ni validación on-chain de roles; ver [V2.md](V2.md).

## Alcance

CrimsonSentry es un prototipo para Stellar testnet. Protege los fondos depositados en el Policy Vault mediante reglas on-chain. No protege el saldo independiente de la cuenta del agente ni valida el entorno donde se ejecuta un agente.

No debe utilizarse para custodiar fondos reales. El informe de Scout es una auditoría estática acotada y no equivale a una auditoría independiente del contrato, del SDK, de las herramientas ni del proceso de despliegue.

## Activos

| Activo | Impacto de compromiso |
|---|---|
| Saldo del vault | El agente puede usar el presupuesto permitido; el dueño puede mover el saldo completo, pero solo a la dirección de recuperación. |
| Clave del dueño | Permite cambiar la política (dentro de los techos), rotar al agente, pausar, proponer un dueño nuevo o retirar fondos a la dirección de recuperación. |
| Clave de la dirección de recuperación | Recibe todo retiro del dueño. Si se pierde, `withdraw` deja de ser útil; si se compromete, el atacante recibe los retiros. |
| Clave del agente | Permite intentar pagos bajo la política y consumir la cuota disponible. |
| Código y hash WASM | Determinan qué reglas se ejecutan en la instancia desplegada. |
| Log de pagos | Se usa para calcular el gasto y la frecuencia dentro de la ventana móvil. |

## Límites de confianza

- **Contrato:** aplica reglas a los pagos que pasan por `pay`.
- **Dueño:** entidad de confianza con control administrativo sobre el vault, acotado por los techos inmutables y por la dirección de recuperación fija.
- **Dirección de recuperación:** cuenta de confianza elegida al desplegar; no se puede cambiar. Debería ser fría o multifirma.
- **Agente:** se trata como potencialmente comprometido; no puede cambiar las reglas del contrato.
- **Escáner:** observador de solo lectura. Su resultado depende de RPC, Horizon, datos de referencia y los controles que puede observar.
- **Cuenta de agente:** si conserva activos propios, puede moverlos sin pasar por el vault.
- **Token configurado:** el constructor acepta una dirección de token; el despliegue debe verificar que corresponda al activo esperado.

## Escenarios y mitigaciones

| Escenario | Mitigación actual | Riesgo residual |
|---|---|---|
| Clave del agente comprometida | Allowlist, límites por operación y ventana, monto mínimo, máximo de pagos, pausa y rotación. | El atacante puede consumir la cuota del día con pagos del monto mínimo y bloquear pagos legítimos hasta que expire. |
| Pago directo desde el saldo del agente | C1 y C10 del escáner señalan saldo y actividad observables. | El escáner detecta; no bloquea. El saldo propio permite evadir el vault. |
| Clave del dueño comprometida: retiro | `withdraw` solo paga a la dirección de recuperación, fijada al desplegar. | Si la dirección de recuperación también está comprometida, no hay protección. |
| Clave del dueño comprometida: aflojar la política y pagar por el agente | Los techos inmutables (`#14`) limitan lo que cualquier política puede permitir. C12 y C17 recomiendan multifirma. | **El atacante puede sacar hasta `max_daily_limit` por cada ventana de 24 h** (rotando al agente y agregando su dirección a la allowlist) hasta que alguien reaccione. Con una sola clave, atacante y dueño legítimo compiten. |
| Cambio de dueño a una dirección equivocada | Dos pasos: la dirección nueva acepta con su propia firma; el dueño puede cancelar antes. | Una dirección propuesta que el atacante controla puede aceptar si la clave del dueño actual ya está comprometida. |
| Pago a un destino no autorizado | Validación on-chain de la allowlist, que excluye al vault, al dueño y al agente; el escáner (C5) alerta si aparecen. | Un destino permitido puede ser malicioso o cambiar su comportamiento si es otro contrato. |
| Reintentos o pagos en paralelo | Contabilidad y validación ocurren en la ejecución on-chain; los errores revierten la transacción. | Los fallos pueden consumir comisiones del agente y su cuota de intentos puede agotarse. |
| Caducidad del almacenamiento | Renovación del TTL de instancia en las llamadas; el log renueva TTL en cada pago. | Operación prolongada sin invocaciones requiere vigilar la vida del contrato y restaurarlo si caduca. |
| Token incorrecto o implementación distinta | C13 compara hash WASM; C14 comprueba el SAC de XLM esperado. | El escáner es informativo y usa una referencia de hash local que debe mantenerse confiable. |
| Error del dueño o política excesiva | Validaciones estructurales, techos fijos y límites máximos de allowlist y frecuencia. | El contrato no determina si los montos son adecuados para el negocio, y unos techos altos dan poca protección. |

## Controles implementados

- Las funciones privilegiadas exigen `require_auth` del rol correspondiente.
- El constructor crea el estado inicial; no existe un método público de inicialización.
- La allowlist no puede incluir al vault, al dueño ni al agente, y dueño y agente son distintos. Se valida on-chain en el constructor, en `set_policy`, en `set_agent` y en el cambio de dueño.
- `withdraw(amount)` solo paga a la dirección de recuperación, que debe ser distinta del dueño, del agente y del vault, y no se puede cambiar.
- Los techos (`max_tx_limit`, `max_daily_limit`) se fijan en el constructor; ninguna política, inicial o posterior, puede superarlos.
- Monto mínimo por pago, para que agotar la cuota con micropagos tenga un costo.
- Cambio de dueño en dos pasos (`propose_owner`, `accept_owner`, `cancel_owner_change`).
- Las operaciones están limitadas por tamaño de allowlist y máximo de pagos.
- La suma del gasto usa operaciones comprobadas y el perfil release activa `overflow-checks`.
- El gasto se registra antes de transferir; la atomicidad de Stellar revierte ambas operaciones ante un fallo.
- La pausa no impide el retiro administrativo a la dirección de recuperación.
- La integración continua compila, prueba y ejecuta análisis estático.

## Respuesta a vulnerabilidades

No publiques detalles explotables de una vulnerabilidad en un issue público. Usa el canal privado de reporte de vulnerabilidades de GitHub si está habilitado para el repositorio; de lo contrario, contacta en privado a los mantenedores antes de divulgarla públicamente.

## Recomendaciones antes de producción

1. Encargar una auditoría independiente del contrato y de los flujos de autorización.
2. Operar multifirma o separación institucional para el dueño, y una dirección de recuperación fría o multifirma, distinta del dueño.
3. Elegir los techos con cuidado: no se pueden cambiar y definen la pérdida máxima por ventana de 24 h si se compromete la clave del dueño.
4. Definir límites, token y destinos mediante un proceso de aprobación revisable.
5. Verificar el hash WASM desplegado contra una compilación reproducible y revisada.
6. Operar alertas para TTL, saldo, eventos, fallos y cambios del estado administrativo.
7. Evaluar una cuenta de contrato del agente y un relayer antes de afirmar que se intercepta el gasto completo.
