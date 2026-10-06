# Posicionamiento: para quién es y en qué se diferencia

> Estado: **hipótesis para validar**, no hechos probados. La comparación se basa en la documentación y la prensa consultadas el 06/10/2026. Las soluciones de terceros cambian rápido; verifica cada fila antes de citarla fuera de este repositorio.

Este documento responde a dos preguntas que dejaron los jurados del hackathon: **quién compra** CrimsonSentry y **qué lo diferencia** de las wallets programables y los motores de políticas de gasto que ya existen.

## Qué es, en una frase

Un contrato en Soroban que custodia los fondos de un agente de IA y hace cumplir una política de pago **dentro de la cadena**, más un escáner que audita la configuración del agente. Hoy es un prototipo de testnet, sin auditoría independiente (ver [SECURITY.md](SECURITY.md)).

## Para quién es

| Perfil | Qué necesita | Cómo lo usaría | Confianza de la hipótesis |
|---|---|---|---|
| **Equipos que construyen agentes que pagan en Stellar** (el desarrollador y su líder técnico) | Que un error, una inyección de instrucciones o una clave robada no vacíen la cuenta | Integrar el vault o, a futuro, un SDK, y revisar su configuración con el escáner | Media: es el perfil que propuso uno de los jurados; falta comprobar que alguien pague por esto |
| **Plataformas y proveedores de wallets o de infraestructura para agentes** | Una capa de política verificable públicamente que puedan ofrecer a sus clientes | Incorporar las reglas como componente | Baja: no hay conversación con ninguno todavía |
| **Empresas que operan agentes propios** | Un límite de pérdida que puedan mostrar a su auditor o a su dirección | Usar el vault con un dueño multifirma | Baja: requiere auditoría independiente antes de dinero real |

Distinciones que conviene separar cuando se hable con un cliente:

- **Quién usa** el producto: el desarrollador del agente.
- **Quién decide la compra:** normalmente el líder técnico, que es quien teme que un error vacíe la cuenta en minutos.
- **Quién firma el pago:** todavía no se sabe, porque no hay precio ni modelo de cobro validado.

El plan para comprobar estas hipótesis está en [VALIDACION.md](VALIDACION.md).

## Qué existe hoy

| Solución | Dónde se aplica la regla | Redes | Qué controla (según su documentación) | Diferencia con CrimsonSentry |
|---|---|---|---|---|
| **Privy** (motor de políticas) | Fuera de la cadena, en la infraestructura del proveedor, antes de firmar | Varias | Tokens y cadenas permitidos, topes por transferencia o por ventana, listas de destinatarios y de contratos | Hay que confiar en el proveedor; la regla no se ve en la cadena |
| **Turnkey** (políticas y pagos para agentes) | Dentro de un enclave del proveedor, antes de producir la firma | Varias | Destinatario, contrato, función, cadena y límite de valor; aprobación humana para montos altos | Igual: la garantía es la del enclave y su configuración |
| **Coinbase Agentic Wallets** | Wallets con custodia MPC del proveedor | Varias | Límites de gasto programables y topes por sesión | Orientado al ecosistema de Coinbase y a x402 |
| **Safe** (módulo de allowance) y **Zodiac Roles** | En la cadena, en contratos de EVM | EVM | Allowance por token con reinicio por intervalo; permisos por rol | Mismo enfoque on-chain, pero no están en Stellar |
| **Delegaciones ERC-7715 / ERC-7710** y claves de sesión | En la cadena, en cuentas inteligentes de EVM | EVM | Permisos acotados por contrato, función, monto y tiempo | Ídem: no están en Stellar |
| **OpenZeppelin, cuentas inteligentes de Stellar** | En la cadena, en Stellar, como política de una cuenta-contrato | Stellar | Política de límite de gasto en ventana móvil y políticas de umbral (multifirma). En la documentación consultada **no aparece** una política de lista de destinos | Es la alternativa más cercana y una **base posible** para la arquitectura B (ver abajo) |
| **CrimsonSentry** | En la cadena, en Stellar, en un vault que custodia los fondos | Stellar (testnet) | Lista de destinos, límite por pago, límite en 24 h móviles, máximo de pagos, pausa, rotación del agente, retiro del dueño. Más un escáner de 17 chequeos | Ver siguiente sección |

## Qué nos diferencia, y qué no

**Lo que sí aporta hoy:**

1. **La regla se aplica y se verifica en la cadena de Stellar.** Los rechazos quedan como transacciones fallidas con su código de error, comprobables en Stellar Expert (ver la evidencia del [README](../README.md)). Con un motor de políticas externo hay que creer lo que dice el proveedor.
2. **Varias reglas juntas en un contrato pequeño y legible** (unos 9,8 KB de WASM, 19 tests, 0 hallazgos críticos en `cargo scout-audit`).
3. **Un escáner que audita la configuración del agente**, no solo el contrato, con mapeo al OWASP Agentic Top 10. No lo comparamos con herramientas de terceros porque no investigamos ese mercado.

**Lo que no aporta, o es más débil:**

1. **No es producción.** Los proveedores de la tabla ofrecen servicios operados; esto es un prototipo de testnet sin auditoría independiente.
2. **La arquitectura actual (A) no protege el saldo propio del agente** ni intercepta x402 ni MPP, que firman desde la cuenta del agente. Eso exige la arquitectura B (cuenta-contrato). Está en el [README](../README.md#limitaciones-conocidas).
3. **Solo Stellar.** Las soluciones multicadena cubren más casos.
4. **El contrato es inmutable** y el dueño tiene una sola clave por defecto.

## Cómo posicionarlo: capa de seguridad, no wallet

Una lectura honesta del feedback es que CrimsonSentry no debe competir como wallet, sino como **capa de seguridad que se compone con lo que ya existe**:

- **Hoy:** un vault que custodia fondos y un escáner que audita.
- **Siguiente paso técnico (hipótesis, sin verificar):** expresar estas mismas reglas como una **política compatible con las cuentas inteligentes de OpenZeppelin en Stellar**. Eso daría compatibilidad con x402, porque los pagos saldrían de una cuenta-contrato, y evitaría reinventar el límite de gasto. Habría que comprobar con su documentación técnica que una política de lista de destinos y de contador de pagos encaja en su modelo.
- **Después:** un SDK pequeño, para integrar sin la CLI, y una guía de integración de una página.

## Fuentes consultadas (06/10/2026)

- OpenZeppelin, [políticas de cuentas inteligentes en Stellar](https://docs.openzeppelin.com/stellar-contracts/accounts/policies).
- Stellar, [x402 en Stellar](https://developers.stellar.org/docs/build/agentic-payments/x402): el pagador firma entradas de autorización de Soroban; x402 admite cualquier token SEP-41, con USDC por defecto.
- Privy, [agent wallets](https://docs.privy.io/wallets/overview/solutions/agent-wallets).
- Turnkey, [agentic wallets](https://docs.turnkey.com/solutions/company-wallets/agentic-wallets).
- Coinbase, [Agentic Wallet](https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome).
- Safe, [agente con límite de gasto](https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit).
