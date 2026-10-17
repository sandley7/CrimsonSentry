# Escáner

El escáner consulta el estado del vault por Stellar RPC y obtiene cuentas, actividad y reservas mediante Horizon. No utiliza claves ni envía transacciones. Los resultados describen señales observables; un estado verde no demuestra ausencia de vulnerabilidades.

## Uso

```bash
cd tools
npm ci
node scanner/scan.js --vault <CONTRACT_ID>
node scanner/scan.js --vault <CONTRACT_ID> --expected-wasm <SHA256> --json
```

Opciones:

- `--vault`: contrato que se va a revisar; obligatorio.
- `--network`: red configurada; actualmente solo `testnet`.
- `--expected-wasm`: hash SHA-256 esperado. Si se omite, usa `evidence/wasm-sha256.txt` cuando esté disponible.
- `--fee-buffer`: saldo XLM que se considera razonable para comisiones; predeterminado `2`. Admite hasta siete decimales.
- `--json`: imprime un objeto JSON para integración con otras herramientas.
- `--help`: muestra el uso.

Código de salida: `0` verde, `1` amarillo, `2` rojo, `64` argumentos incompletos y `70` error de consulta o configuración.

## Controles

| ID | Control | Señal principal |
|---|---|---|
| C1 | Saldo propio del agente | Puede realizar pagos fuera del vault. |
| C2 | Otros activos del agente | Activos o trustlines fuera del vault. |
| C3 | Firmantes del agente | Firmantes adicionales con autoridad sobre la cuenta. |
| C4 | Separación de roles | Dueño y agente iguales o agente como firmante del dueño. |
| C5 | Partes en allowlist | Agente o dueño como destino permitido. |
| C6 | Higiene de allowlist | Destinos contractuales, cuentas inexistentes o lista extensa. |
| C7 | Proporción de límites | Pago que agota cuota, límite que agota el vault o frecuencia alta. |
| C8 | Uso de ventana | Consumo cercano al límite o número máximo de pagos. |
| C9 | Transacciones fallidas | Rechazos del agente observados durante las últimas 24 horas. |
| C10 | Pagos fuera del vault | Operaciones directas del agente detectadas en Horizon. |
| C11 | Kill switch | Saldo del dueño para comisiones y estado de pausa. |
| C12 | Clave del dueño | Señales básicas de multifirma y umbral de cuenta. |
| C13 | Integridad del WASM | Comparación del hash desplegado con la referencia configurada. |
| C14 | Token del vault | Comprobación contra el SAC de XLM de la red. |
| C15 | TTL del contrato | Vida restante o instancia archivada. |
| C16 | Fondos del vault | Saldo menor que un pago máximo permitido. |
| C17 | Dirección de recuperación y techos | Solo aplica a la v2. 🔴 si la recuperación coincide con el dueño o el agente; 🟡 si su cuenta no existe o tiene una sola clave, o si el techo diario alcanza para vaciar el vault en 24 h. En un vault v1 (sin recuperación fija ni techos) sale 🟡 con la recomendación de migrar a la v2. |

## Límites de observabilidad

- Horizon y Soroban RPC son fuentes externas; disponibilidad y retrasos afectan los resultados.
- Las consultas de actividad tienen un límite de registros y pueden no cubrir toda la historia.
- La detección de pagos directos es heurística y depende de las operaciones que Horizon expone.
- El escáner no inspecciona el host, el prompt, herramientas locales ni memoria del agente.
- El escáner informa los dos riesgos que no observa directamente: ejecución inesperada en el host (ASI05) y envenenamiento de memoria/contexto (ASI06).
- La puntuación de semáforo es una herramienta de triaje, no una certificación de seguridad.
