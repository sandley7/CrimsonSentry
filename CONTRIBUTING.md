# Cómo contribuir

CrimsonSentry es un prototipo de testnet mantenido por sus autores. Toda ayuda es bienvenida; esto es lo mínimo que mantiene el proyecto ordenado. La guía completa del estado del proyecto, también pensada para asistentes de IA, está en [`docs/PARA-COLABORADORES.md`](docs/PARA-COLABORADORES.md).

## Flujo

1. **Trabaja en una rama** (`git switch -c mi-cambio`) y abre un pull request hacia `main`. No empujes directamente a `main`.
2. **Que la CI pase.** Corre fmt, clippy, los tests del contrato y del escáner, scout, la verificación de enlaces de la documentación y la construcción de la demo web.
3. **Cada persona firma sus propios commits** y conserva su autoría. No hagas commits a nombre de otra persona.
4. **Fusiona con un merge normal**, no con *squash*, para que los commits de cada autor sigan en el historial.

## Antes de abrir el PR

```bash
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
npm --prefix tools test
python scripts/check-doc-links.py
python scripts/build-web.py          # y confirma que web/data/evidence.json no cambia sin motivo
```

Si cambias un contrato, el WASM cambia de hash: hay que redesplegar en testnet y regenerar la evidencia (`scripts/deploy-testnet.sh`, `demo-testnet.sh`, `demo-v2.sh`, `demo-agente.sh`, luego `python scripts/archive-evidence.py`). Las instrucciones están en [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Reglas que no se negocian

- **Nunca** subas claves secretas, frases de recuperación ni archivos de identidades de Stellar CLI. En el repositorio solo hay direcciones públicas. Las claves de las demos de testnet son desechables y están en archivos ignorados por Git.
- Lo que se afirma en la documentación tiene que estar comprobado. Si algo no se probó, se dice (hay secciones «Lo que no demuestra» para eso).
- El agente demo sigue un guion explícito: no lo conviertas en un agente que obedezca instrucciones ocultas en contenidos.

## Seguridad

Para reportar una vulnerabilidad, usa el reporte privado de GitHub (pestaña *Security*), no un issue público. Ver [`docs/SECURITY.md`](docs/SECURITY.md).
