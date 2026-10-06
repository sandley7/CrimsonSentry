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

El primer comando crea las identidades CLI que falten, despliega un vault y escribe sus identificadores públicos en `evidence/deployment.env`. Ese archivo solo contiene direcciones públicas y se regenera en cada despliegue; el del vault principal está versionado porque lo usan los scripts de demo. Las claves privadas permanecen en el keystore local de Stellar CLI.

Los scripts interactúan con Stellar testnet y crean transacciones. Revisa sus parámetros y la cuenta de origen antes de ejecutarlos. No los adaptes a mainnet sin una revisión de seguridad independiente.

## Rotación del dueño

El contrato desplegado no tiene una función para cambiar de dueño. Para rotar la clave del dueño sin redesplegar, conviene que la cuenta del dueño sea multifirma (`SetOptions`): se agrega un firmante nuevo y se retira el anterior, sin tocar el contrato.

El cambio de dueño en dos pasos (`propose_owner`, `accept_owner` y `cancel_owner_change`) está propuesto en la rama `harden-policy-and-docs`. Como el contrato no admite upgrades, adoptarlo requiere desplegar un vault nuevo.

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

Los logs auxiliares y los `.env` locales están ignorados por Git; los `evidence/*.env` versionados solo contienen direcciones públicas. Los informes Markdown de evidencia se pueden revisar y compartir, verificando primero que no contengan información privada.

## Auditoría estática

En Linux, WSL o macOS instala Scout y ejecuta:

```bash
cargo install --locked cargo-dylint dylint-link cargo-scout-audit@0.3.16
bash scripts/scout.sh
```

El script contiene los ajustes necesarios para ejecutar Scout 0.3.16 con el SDK del proyecto. CI falla si el contrato no puede analizarse o si Scout encuentra hallazgos críticos.

## Integración continua

El flujo `.github/workflows/ci.yml` ejecuta la verificación de enlaces de la documentación, Rust fmt, Clippy, pruebas, compilación WASM, pruebas Node.js y auditoría Scout. Las transacciones de testnet no forman parte de CI.
