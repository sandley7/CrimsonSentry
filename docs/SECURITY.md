# Modelo de amenazas y seguridad

## Alcance

CrimsonSentry es un prototipo para Stellar testnet. Protege los fondos depositados en el Policy Vault mediante reglas on-chain. No protege el saldo independiente de la cuenta del agente ni valida el entorno donde se ejecuta un agente.

No debe utilizarse para custodiar fondos reales. El informe de Scout es una auditoría estática acotada y no equivale a una auditoría independiente del contrato, del SDK, de las herramientas ni del proceso de despliegue.

## Activos

| Activo | Impacto de compromiso |
|---|---|
| Saldo del vault | El agente puede usar el presupuesto permitido; el dueño puede retirar el saldo completo. |
| Clave del dueño | Permite cambiar la política, rotar al agente, pausar o retirar los fondos. |
| Clave del agente | Permite intentar pagos bajo la política y consumir la cuota disponible. |
| Código y hash WASM | Determinan qué reglas se ejecutan en la instancia desplegada. |
| Log de pagos | Se usa para calcular el gasto y la frecuencia dentro de la ventana móvil. |

## Límites de confianza

- **Contrato:** aplica reglas a los pagos que pasan por `pay`.
- **Dueño:** entidad de confianza con control administrativo total sobre el vault.
- **Agente:** se trata como potencialmente comprometido; no puede cambiar las reglas del contrato.
- **Escáner:** observador de solo lectura. Su resultado depende de RPC, Horizon, datos de referencia y los controles que puede observar.
- **Cuenta de agente:** si conserva activos propios, puede moverlos sin pasar por el vault.
- **Token configurado:** el constructor acepta una dirección de token; el despliegue debe verificar que corresponda al activo esperado.

## Escenarios y mitigaciones

| Escenario | Mitigación actual | Riesgo residual |
|---|---|---|
| Clave del agente comprometida | Allowlist, límites por operación y ventana, máximo de pagos, pausa y rotación. | El atacante puede consumir la cuota del día y bloquear pagos legítimos hasta que expire. |
| Pago directo desde el saldo del agente | C1 y C10 del escáner señalan saldo y actividad observables. | El escáner detecta; no bloquea. El saldo propio permite evadir el vault. |
| Clave del dueño comprometida | C12 recomienda multifirma. El cambio de dueño en dos pasos está propuesto en la rama `harden-policy-and-docs` (no desplegado). | Una clave de dueño comprometida puede retirar todo; el contrato desplegado no tiene función para cambiar de dueño ni límite de retiro. |
| Pago a un destino no autorizado | Validación on-chain de la allowlist, que excluye al propio vault; el escáner (C5) alerta si el dueño o el agente figuran en ella. | Un destino permitido puede ser malicioso o cambiar su comportamiento si es otro contrato. |
| Reintentos o pagos en paralelo | Contabilidad y validación ocurren en la ejecución on-chain; los errores revierten la transacción. | Los fallos pueden consumir comisiones del agente y su cuota de intentos puede agotarse. |
| Caducidad del almacenamiento | Renovación del TTL de instancia en las llamadas; el log renueva TTL en cada pago. | Operación prolongada sin invocaciones requiere vigilar la vida del contrato y restaurarlo si caduca. |
| Token incorrecto o implementación distinta | C13 compara hash WASM; C14 comprueba el SAC de XLM esperado. | El escáner es informativo y usa una referencia de hash local que debe mantenerse confiable. |
| Error del dueño o política excesiva | Validaciones estructurales y límites máximos de allowlist y frecuencia. | El contrato no determina si los montos son adecuados para el negocio. |

## Controles implementados

- Las funciones privilegiadas exigen `require_auth` del rol correspondiente.
- El constructor crea el estado inicial; no existe un método público de inicialización.
- La allowlist no puede incluir al propio vault. El contrato desplegado **no** valida que dueño y agente sean direcciones distintas ni que estén fuera de la allowlist; el escáner lo señala (C4, C5).
- Las operaciones están limitadas por tamaño de allowlist y máximo de pagos.
- La suma del gasto usa operaciones comprobadas y el perfil release activa `overflow-checks`.
- El gasto se registra antes de transferir; la atomicidad de Stellar revierte ambas operaciones ante un fallo.
- La pausa no impide el retiro administrativo.
- Propuesto en la rama `harden-policy-and-docs` (no desplegado; [PR #2 del repositorio original](https://github.com/JoseEscajadillo/CrimsonSentry/pull/2)): cambio de dueño en dos pasos, con autorización de la dirección entrante y cancelación antes de aceptar.
- Propuesto en la rama `harden-policy-and-docs` (no desplegado): validación on-chain de que dueño y agente son direcciones distintas y de que ninguno de los dos figura en la allowlist.
- La integración continua compila, prueba y ejecuta análisis estático.

## Respuesta a vulnerabilidades

No publiques detalles explotables de una vulnerabilidad en un issue público. Usa el canal privado de reporte de vulnerabilidades de GitHub si está habilitado para el repositorio; de lo contrario, contacta en privado a los mantenedores antes de divulgarla públicamente.

## Recomendaciones antes de producción

1. Encargar una auditoría independiente del contrato y de los flujos de autorización.
2. Operar multifirma o separación institucional para el dueño.
3. Definir límites, token y destinos mediante un proceso de aprobación revisable.
4. Verificar el hash WASM desplegado contra una compilación reproducible y revisada.
5. Operar alertas para TTL, saldo, eventos, fallos y cambios del estado administrativo.
6. Evaluar una cuenta de contrato del agente y un relayer antes de afirmar que se intercepta el gasto completo.
