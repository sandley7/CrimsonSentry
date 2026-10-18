# Operación y desarrollo

## Requisitos

- Rust 1.91 o posterior y target `wasm32v1-none`.
- Stellar CLI 28 o posterior.
- Node.js 22.12 o posterior.
- Bash para los scripts de despliegue y demos.

En la máquina Windows usada durante el desarrollo, `. .\scripts\env.ps1` configura las rutas locales. En Git Bash, `source scripts/env.sh`. Los scripts pueden no requerir configuración en otros sistemas.

## Validación local

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --target wasm32v1-none --release
cd tools
npm ci
npm test
```

Para el WASM de despliegue, compila con `stellar contract build`; el comando prepara los artefactos y metadatos que espera la red. CI usa una compilación WASM como comprobación adicional.

## Despliegue en testnet

```bash
bash scripts/deploy-testnet.sh
bash scripts/demo-testnet.sh
```

El primer comando crea las identidades CLI que falten (`cs-owner`, `cs-agent`, `cs-shop` y `cs-recovery`), despliega un vault v2 y escribe sus identificadores públicos en `evidence/deployment.env`. Ese archivo solo contiene direcciones públicas y se regenera en cada despliegue; el del vault principal está versionado porque lo usan los scripts de demo. Las claves privadas permanecen en el keystore local de Stellar CLI.

Variables útiles: `RECOVERY_ADDRESS=<G…>` (dirección de recuperación propia; basta la pública), `CEILING_TX_XLM` y `CEILING_DAILY_XLM` (techos, 20 y 50 XLM por defecto), `OUT` (dónde escribir los identificadores) y `VAULT_ALIAS`.

### Antes de desplegar: dos decisiones que no se pueden deshacer

La **dirección de recuperación** y los **techos** se fijan en el constructor y no se pueden cambiar.

- Recuperación: debe ser distinta del dueño, del agente y del vault. Conviene una cuenta fría o multifirma. Si se pierde su clave, `withdraw` deja de ser útil.
- Techos: definen cuánto puede salir por el camino de pagos del agente en 24 h aunque se comprometa la clave del dueño. Unos techos altos dan poca protección. Si el negocio crece, hay que desplegar un vault nuevo y migrar los fondos.

Los scripts interactúan con Stellar testnet y crean transacciones. Revisa sus parámetros y la cuenta de origen antes de ejecutarlos. No los adaptes a mainnet sin una revisión de seguridad independiente.

## Rotación del dueño

La v2 cambia de dueño en dos pasos:

1. El dueño actual llama a `propose_owner(new_owner)`. La dirección propuesta no puede ser el dueño actual, el agente, la dirección de recuperación ni un destino de la allowlist.
2. La dirección nueva llama a `accept_owner()` con su propia firma y pasa a ser el dueño.

Antes de que se acepte, el dueño actual puede llamar a `cancel_owner_change()`. `get_pending_owner()` muestra la propuesta pendiente. Aun así, conviene que la cuenta del dueño sea multifirma (`SetOptions`), porque rotar los firmantes de la cuenta no toca el contrato.

## Retiros

`withdraw(amount)` solo paga a la dirección de recuperación fijada al desplegar, incluso con el vault en pausa. No hay forma de elegir otro destino. Los vaults v1 anteriores, en cambio, aceptan cualquier destino: ver [V2.md](V2.md).

## Demos

La demo completa crea un agente y un vault nuevos:

```bash
bash scripts/demo-agente.sh
```

La demo corta se prepara antes de una presentación y se ejecuta durante ella:

```bash
bash scripts/demo-corta.sh prep
bash scripts/demo-corta.sh live
```

Con `EVIDENCE_DIR` la demo guarda su registro en otra carpeta, con `OPEN_FIRST_REJECTION=0` no abre el navegador solo y `EXPECTED_WASM_FILE` cambia el hash que el escáner compara. Los logs auxiliares y los `.env` locales están ignorados por Git; los `evidence/*.env` versionados solo contienen direcciones públicas. La evidencia del vault v1 del hackathon está en `evidence/v1/`. Los informes Markdown de evidencia se pueden revisar y compartir, verificando primero que no contengan información privada.

## Demo web

`web/` contiene la página y `scripts/build-web.py` la arma en `_site/` junto con los módulos del escáner (`tools/scanner/checks.js`, `owasp.js` y `tools/lib/stellar.js`), el hash del WASM y las transacciones archivadas. Regenera `web/data/evidence.json` a partir de las tablas de `evidence/`; la CI falla si ese archivo no coincide con la evidencia.

Para cambiar los vaults que ofrece, edita `web/vault.json`. El de demostración debe ser un vault sin actividad: las simulaciones no gastan nada, pero si alguien paga con la clave del agente la ventana de 24 h se llena y la demo deja de mostrar un pago aceptado. Con un agente que solo tenga lo justo para fees, el escáner sale casi todo en verde.

La página se publica en GitHub Pages con `.github/workflows/pages.yml` cuando cambia `main`. Requiere que el repositorio tenga Pages con la fuente «GitHub Actions».

## Archivo de la evidencia

Testnet se reinicia 2 a 4 veces al año, con aviso previo, y entonces se borran contratos, cuentas y transacciones. `python scripts/archive-evidence.py` lee los enlaces de Stellar Expert de los documentos, descarga cada transacción de Horizon y la guarda en `evidence/archive/txs/`, con un índice en `evidence/archive/INDEX.md`. Solo guarda datos públicos. Conviene ejecutarlo después de cada despliegue o demo nuevos y subir el resultado.

## Auditoría estática

En Linux, WSL o macOS instala Scout y ejecuta:

```bash
cargo install --locked cargo-dylint dylint-link cargo-scout-audit@0.3.16
bash scripts/scout.sh
```

El script contiene los ajustes necesarios para ejecutar Scout 0.3.16 con el SDK del proyecto. CI falla si el contrato no puede analizarse o si Scout encuentra hallazgos críticos.

## Integración continua

El flujo `.github/workflows/ci.yml` ejecuta la verificación de enlaces de la documentación, Rust fmt, Clippy, pruebas, compilación WASM, pruebas Node.js y auditoría Scout. Las transacciones de testnet no forman parte de CI.
