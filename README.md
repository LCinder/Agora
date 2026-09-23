# App de eventos municipales

Monorepo del proyecto. El nombre comercial es **HoyQ**, de «¿hoy qué hacemos?». El espacio de trabajo
y los recursos de AWS siguen llamándose `agora`, y eso es deliberado: una tabla de DynamoDB no se
renombra.

El nombre que ve la gente vive en un solo fichero, **`packages/core/src/brand.json`**, y cambiarlo
cambia la app, el panel, el APK y los correos del panel a la vez. Ver
[`docs/renombrar-la-app.md`](docs/renombrar-la-app.md).

- Contexto de negocio y alcance: [`CLAUDE.md`](CLAUDE.md)
- Plan de la fase actual: [`docs/plan-fase-0.md`](docs/plan-fase-0.md)
- Decisiones técnicas y su motivo: [`docs/decisiones.md`](docs/decisiones.md)
- Módulos contratables por municipio: [`docs/modulos-por-municipio.md`](docs/modulos-por-municipio.md)
- **Guion de la demostración: [`docs/demo.md`](docs/demo.md)**
- **Llamar a un ayuntamiento: [`docs/llamadas.md`](docs/llamadas.md)**, con los contactos en [`docs/municipios-granada.csv`](docs/municipios-granada.csv)
- Argumentos y cosas que venden: [`docs/ideas-de-venta.md`](docs/ideas-de-venta.md)
- A quién ver y cuándo: [`docs/fase-1-validacion.md`](docs/fase-1-validacion.md)
- Arquitectura en AWS de la Fase 2: [`docs/fase-2-aws.md`](docs/fase-2-aws.md)
- Textos legales y contrato de encargo: [`docs/legal/`](docs/legal/) (las tres páginas se sirven en `/legal/…`)
- **Primer despliegue, paso a paso: [`docs/primer-despliegue.md`](docs/primer-despliegue.md)**
- Desplegar: [`infra/deploy.sh`](infra/deploy.sh) y [`infra/terraform/README.md`](infra/terraform/README.md)
- Dar de alta un ayuntamiento: `pnpm --filter @agora/tools create-municipality -- --help`
- Quién entra a qué panel: `pnpm --filter @agora/tools grant-access -- --list`
- Quitarle el acceso a alguien: `pnpm --filter @agora/tools revoke-access -- --help`
- Credenciales de AWS para esos comandos: copia [`.env.example`](.env.example) a `.env` (ignorado por git)
- Cómo renombrar la aplicación: [`docs/renombrar-la-app.md`](docs/renombrar-la-app.md)

## Qué hay dentro

| Paquete                  | Qué es                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `apps/mobile`            | App del vecino (Expo + expo-router). Incluye el directo.                               |
| `apps/web`               | Panel del ayuntamiento y página pública de evento (Next.js).                           |
| `packages/core`          | Modelo de dominio, esquemas Zod y lógica pura. Sin React, sin Expo, sin Next.          |
| `packages/data`          | Interfaz `DataSource` y su implementación de datos semilla.                            |
| `packages/i18n`          | Textos de interfaz (español por defecto, inglés preparado).                            |
| `packages/poster`        | Leer y dibujar carteles con IA. Lo usan el panel en local y la Lambda de carteles.     |
| `packages/store`         | Tabla única de DynamoDB: un almacén por rol. Lo usan las Lambdas, nunca la app.        |
| `apps/functions`         | Manejadores de las Lambdas. `pnpm --filter @agora/functions build` los empaqueta.      |
| `apps/tools`             | Herramientas de operación. Hoy, cargar un municipio en la tabla.                       |
| `content/municipalities` | Configuración y datos de cada municipio. Ver [`content/README.md`](content/README.md). |

## Requisitos

- Node.js 22 o superior
- pnpm 12 (`npm install -g pnpm`)

## Arrancar en local

```bash
pnpm install
```

### Panel web y página pública de evento

```bash
pnpm --filter @agora/web dev
```

- Panel del ayuntamiento: <http://localhost:3000> — inicio, eventos, revisión, directos,
  asociaciones, datos y usuarios. Lo que se ve depende del rol de quien entra: una asociación ve sus
  eventos y sus métricas y nada más (D-050).
- Página pública de un evento: <http://localhost:3000/e/la-zubia/lz-cabalgata>

Un evento puede ser una cosa suelta o llevar dentro un **programa de actividades** — es lo que
distingue un taller de cerámica de una feria medieval. El programa se edita al abrir el evento, y
cada actividad tiene su hora y su propio «Me interesa» en la app (D-073).

Para que funcionen los carteles, copia `apps/web/.env.example` a `apps/web/.env.local` y pon tus
claves: `GEMINI_API_KEY` para leer el cartel y escribir la instrucción del dibujo, y
`CLOUDFLARE_ACCOUNT_ID` con `CLOUDFLARE_API_TOKEN` para dibujarlo. Las dos son gratuitas y no piden
tarjeta; el propio `.env.example` explica de dónde se saca cada una. Sin claves el panel funciona
igual: el botón avisa de cuál falta.

El panel hace las dos direcciones del cartel. Si el evento ya tiene uno, se sube y la IA rellena el
formulario. Si no lo tiene, el técnico escribe una frase y se dibuja: un modelo de texto convierte
esa frase en una instrucción visual completa y el modelo de imagen la dibuja. Por defecto dibuja solo
el fondo y el panel compone encima el título, la fecha, el lugar y el color del municipio, para que
esos datos salgan siempre bien; el cartel entero dibujado por la IA, texto incluido, está en el
desplegable. Ver D-024, que incluye una advertencia sobre el nivel gratuito de Google y protección de
datos.

En la nube estos dos endpoints no los sirve el panel, que es estático, sino la Lambda de carteles
(D-031). Para compilar el panel tal y como se sube a S3:

```bash
pnpm --filter @agora/web build:static     # deja el resultado en apps/web/out
```

En local el panel arranca **en modo demostración**: la semilla en el navegador, sin cuentas y sin
red, que es lo que se enseña en una reunión. Para que hable con el backend de verdad e inicie sesión
contra Cognito hacen falta tres variables al compilar (`NEXT_PUBLIC_API_BASE_URL`,
`NEXT_PUBLIC_COGNITO_USER_POOL_ID` y `NEXT_PUBLIC_COGNITO_CLIENT_ID`); las órdenes completas están en
[`infra/terraform/README.md`](infra/terraform/README.md). Ninguna pantalla cambia: las dos
implementaciones son del mismo interfaz (D-048).

### App móvil

```bash
pnpm --filter @agora/mobile dev
```

Por defecto lee los ficheros de `content/`, que es la demo: funciona sin red, que es justo lo que hace
falta con el móvil encima de la mesa en una sala de juntas con mal wifi. Para que hable con el backend
de verdad, dale la URL de la API:

```bash
EXPO_PUBLIC_API_BASE_URL="$(terraform -chdir=infra/terraform/envs/dev output -raw api_endpoint)" \
  pnpm --filter @agora/mobile dev
```

Ninguna pantalla cambia: las dos implementaciones son del mismo interfaz (D-042).

Las notificaciones necesitan además un proyecto de Expo, porque el testigo de push se pide a los
servidores de Expo: `EXPO_PUBLIC_EAS_PROJECT_ID`. Sin él la app funciona igual y Ajustes dice que en
esta versión no se envían avisos (D-047).

MapLibre es un módulo nativo y **no funciona en Expo Go**, así que la app se prueba con una
_development build_ instalada en el dispositivo (decisión D-004). Esa build la genera la CI sola:
ver [Builds de Android](#builds-de-android). Mientras no haya mapa en pantalla, `expo start` sirve
para iterar.

Con la _development build_ ya instalada en el móvil, el servidor de desarrollo se arranca así:

```bash
pnpm --filter @agora/mobile exec expo start --dev-client
```

Para verla en el navegador, con mapa incluido:

```bash
pnpm --filter @agora/mobile exec expo start --web
```

## Builds de Android

**Cada vez que algo entra en `main` —una fusión de rama incluida— la CI compila un APK y lo deja
listo para descargar.** No hace falta cuenta de Expo ni ningún secreto: se compila en el propio
runner de GitHub (decisión D-017).

**Desde el móvil, que es lo normal:** abre
[la release `android-latest`](../../releases/tag/android-latest) en el navegador del teléfono y
toca el `.apk`. Android pedirá permitir orígenes desconocidos: es normal, va firmado con la clave
de depuración. Ese enlace no cambia nunca; siempre apunta a la última fusión en `main`.

**Desde el ordenador, o para una build antigua:** pestaña **Actions** → workflow **Android build**
→ el run que te interese. El resumen trae el enlace, el tamaño y el commit del que salió. Ahí
GitHub lo entrega dentro de un `.zip` que hay que descomprimir.

Hay dos perfiles:

| Perfil        | Qué es                                                               | Cuándo                                       |
| ------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `preview`     | **El de cada fusión.** Lleva el JavaScript dentro y arranca solo.    | Prototipo en el bolsillo y reuniones.        |
| `development` | Vacío de JavaScript: lo pide a `expo start --dev-client` por la red. | Solo para programar con el móvil en la mano. |

La _development build_ no es una versión del producto, es una herramienta de desarrollo: sin Metro
corriendo en el portátil se queda en una pantalla de error. Por eso lo que se compila en cada
fusión es el `preview`.

Para el `development`, o para incluir arquitecturas antiguas: **Actions** → **Android build** →
**Run workflow**, y elige perfil y arquitecturas. Por defecto se compila solo `arm64-v8a`, que es
cualquier móvil de los últimos años.

El APK se guarda 90 días. Pasado ese plazo, se vuelve a lanzar el workflow y listo.

> iOS no se compila: exige cuenta de Apple Developer de pago y certificados de firma, que no caben
> en un runner de GitHub. `apps/mobile/eas.json` sigue en el repositorio para ese día.

## Comprobaciones

```bash
pnpm run check       # formato + lint + tipos + tests
```

O por separado:

```bash
pnpm run format      # aplica Prettier
pnpm run lint
pnpm run typecheck
pnpm run test
```

Es lo mismo que ejecuta la CI en cada cambio.

## Cambiar el municipio de la demo

1. Copia una carpeta de `content/municipalities/` y edita su `municipality.json`, sus categorías,
   sus asociaciones y sus eventos.
2. Añade una entrada en `packages/data/src/seed/content.ts`.
3. Si quieres que el panel apunte a ese municipio, cambia `DEMO_MUNICIPALITY_SLUG` en
   `apps/web/src/lib/demo.ts`.

No hace falta tocar ninguna pantalla.

## Convenciones

- **Código en inglés**, siempre: identificadores, nombres de fichero, comentarios, mensajes de
  commit y nombres de tablas.
- **Interfaz en español**, con la estructura preparada para inglés desde el principio.
- **TypeScript estricto** en todo el repositorio.
- El panel se prueba también **en un navegador**: `pnpm --filter @agora/web test:e2e` abre cada
  pantalla de la demostración y recorre aprobar un evento, preparar un directo y descargar el
  informe. La CI lo ejecuta en su propio trabajo.
- Ninguna pantalla accede a un origen de datos directamente: todo pasa por `@agora/data`.
- Todo dato pertenece a un municipio. Ninguna consulta ni pantalla asume un municipio único.
- Las fechas se calculan siempre en la zona horaria del municipio, nunca en la del dispositivo.
