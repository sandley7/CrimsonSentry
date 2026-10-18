## Qué cambia y por qué

<!-- Una o dos frases. Si responde a un feedback, un issue o un hallazgo, enlázalo. -->

## Comprobaciones

- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` y `cargo test` pasan
- [ ] `npm --prefix tools test` pasa
- [ ] `python scripts/check-doc-links.py` pasa
- [ ] Si cambié un contrato: redesplegué en testnet y regeneré la evidencia y el archivo (`scripts/archive-evidence.py`)
- [ ] Lo que afirmo en la documentación está comprobado; lo que no, lo digo
- [ ] No hay claves secretas ni frases de recuperación en el diff

## Qué no cubre este cambio

<!-- Límites, pendientes o riesgos conocidos. -->
