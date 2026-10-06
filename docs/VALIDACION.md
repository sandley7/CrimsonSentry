# Plan de validación con clientes

> Estado: **plan, todavía sin ejecutar**. Nada de lo que sigue se ha comprobado con clientes reales. Parte de la propuesta que dejó uno de los jurados del hackathon (GDUK4) y de las preguntas de otro (GDBYH) sobre quién compra y por qué. El análisis de mercado está en [POSICIONAMIENTO.md](POSICIONAMIENTO.md).

## Qué queremos averiguar

1. ¿Existe un equipo que **ya mueve dinero con un agente** y se preocupa lo bastante por perderlo como para cambiar su configuración?
2. ¿Qué parte de la protección le importa: el límite on-chain, el escáner o la verificación pública?
3. ¿Cuánto cuesta (en tiempo) adoptarlo? La meta que propuso el jurado es **que un equipo lo adopte en menos de una tarde**.
4. ¿Pagaría? ¿Cuánto, y por qué unidad (agente protegido, vault, revisión)?

## Cliente ideal (hipótesis)

Según el jurado: una startup de agentes de IA en Latinoamérica, de 5 a 20 personas, que ya mueve dinero de forma automática. Decide el líder técnico, que teme que un error vacíe la cuenta en minutos.

Es una hipótesis a probar, no un hecho. Si las primeras conversaciones la contradicen (por ejemplo, si el comprador real es una plataforma y no una startup), se cambia el perfil.

## Cómo conseguir las primeras conversaciones

1. **Armar la lista de prospectos** con la plantilla [`prospectos-plantilla.csv`](prospectos-plantilla.csv), que se puede importar en Notion o abrir en una hoja de cálculo. Registrar la **fuente de cada dato**; sin fuente, el dato no entra.
2. **Buscar empresas que encajen**, dentro y fuera del ecosistema Stellar, y ordenarlas por volumen de pagos automáticos y etapa. Claude puede ayudar a buscar y resumir, siempre citando la fuente.
3. **Escribir al líder técnico** con una oferta concreta y pequeña: una revisión gratuita (ver el borrador más abajo). **Cada mensaje lo revisa y lo envía una persona del equipo.** No se automatiza el envío.
4. **Redes sugeridas por los jurados** para encontrar equipos y apoyo: Opportuni (opportuni.xyz) y su grupo de México o el general, el SCF Build Award Integration Track y los talleres de Instawards. No las hemos evaluado todavía.

## La revisión gratuita como entrevista

El escáner solo necesita **direcciones públicas** (la del vault o la del agente). No se pide ninguna clave. Cada revisión sirve a la vez como entrevista:

1. El equipo describe cómo paga hoy su agente y de dónde sale el dinero.
2. Se corre el escáner sobre su configuración y se revisa el resultado juntos.
3. El equipo **configura sus propias reglas** frente a nosotros (límite por pago, límite diario, destinos permitidos). Se anota dónde se traba y qué le da tranquilidad.
4. Se cierra con las preguntas de la sección siguiente.

### Preguntas para la entrevista

- ¿Qué pasaría hoy si alguien robara la clave de su agente? ¿Cuánto podría perder y en cuánto tiempo?
- ¿Cómo limitan hoy lo que el agente puede gastar? ¿Lo hacen en su servidor, con un proveedor o en la cadena?
- ¿Han tenido un susto, una prueba de penetración o una auditoría que les haya hecho pensar en esto?
- ¿Qué les impediría adoptar un contrato como este? (Auditoría, x402, soporte, otra red, la clave del dueño...)
- ¿Qué tendría que pasar para que lo pagaran? ¿Quién decide?
- ¿Con qué otras soluciones lo comparan?

## Cómo se mide

Propuesta del jurado: **10 revisiones** que lleven a **3 clientes** que protejan agentes reales. Además se registra, para cada revisión:

- si el equipo terminó de configurar su política y cuánto tardó;
- qué chequeos del escáner salieron en rojo o amarillo;
- si pidió algo que hoy no existe (x402, multicadena, interfaz web...).

Los pedidos repetidos ordenan el desarrollo. Si el pedido más repetido es x402, la prioridad es la arquitectura B.

## Cobro (hipótesis, sin precio todavía)

El jurado propuso una **tarifa mensual por agente protegido**. No hay precio, porque no hay datos todavía para ponerlo: se define con lo que se aprenda en las revisiones. Antes de cobrar hay que resolver lo que dice [SECURITY.md](SECURITY.md): auditoría independiente y operación con dinero real.

## Borrador del correo (no enviado)

> **Asunto:** Revisión gratuita de los límites de pago de su agente
>
> Hola [nombre]:
>
> Soy [tu nombre], del equipo de CrimsonSentry. Vimos que [empresa] tiene agentes que [mueven dinero / pagan APIs / ...], y construimos un contrato en Stellar que limita a dónde, cuánto y cuántas veces puede pagar un agente, más un escáner que revisa la configuración. Funciona hoy en testnet; todavía no está auditado y no es para dinero real.
>
> Les ofrecemos una **revisión gratuita de 30 minutos**: corremos el escáner con direcciones públicas, sin que nos pasen ninguna clave, y revisamos juntos qué pasaría si se les comprometiera la clave del agente. A cambio, nos ayuda mucho saber cómo lo resuelven hoy.
>
> Demo en video: https://www.youtube.com/watch?v=lgQYx48JnV0 · Código: https://github.com/sandley7/CrimsonSentry
>
> ¿Les sirve conversar esta semana?
>
> [tu nombre]

Antes de enviarlo: reemplaza lo que está entre corchetes, confirma que lo que dice del escáner sigue siendo cierto en la versión que uses y manda los mensajes uno por uno desde tu propio correo.

## Qué no hacer

- **No pedir claves** ni frases de recuperación, ni en la revisión ni por correo. El escáner no las necesita.
- **No prometer** protección contra x402 ni contra el saldo propio del agente: la arquitectura actual no lo cubre.
- **No presentar una revisión** como auditoría de seguridad del cliente.
