# App de eventos municipales

Monorepo del proyecto. Nombre comercial pendiente; `agora` es el nombre provisional del espacio de
trabajo.

- Contexto de negocio y alcance: [`CLAUDE.md`](CLAUDE.md)
- Plan de la fase actual: [`docs/plan-fase-0.md`](docs/plan-fase-0.md)
- Decisiones técnicas y su motivo: [`docs/decisiones.md`](docs/decisiones.md)
- Módulos contratables por municipio: [`docs/modulos-por-municipio.md`](docs/modulos-por-municipio.md)
- **Guion de la demostración: [`docs/demo.md`](docs/demo.md)**

## Qué hay dentro

| Paquete                  | Qué es                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `apps/mobile`            | App del vecino (Expo + expo-router). Incluye el directo.                               |
| `apps/web`               | Panel del ayuntamiento y página pública de evento (Next.js).                           |
| `packages/core`          | Modelo de dominio, esquemas Zod y lógica pura. Sin React, sin Expo, sin Next.          |
| `packages/data`          | Interfaz `DataSource` y su implementación de datos semilla.                            |
| `packages/i18n`          | Textos de interfaz (español por defecto, inglés preparado).                            |
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

- Panel del ayuntamiento: <http://localhost:3000>
- Página pública de un evento: <http://localhost:3000/e/la-zubia/lz-cabalgata>

Para que funcionen los carteles, copia `apps/web/.env.example` a `apps/web/.env.local` y pon tus
claves: `ANTHROPIC_API_KEY` para leerlos y `GEMINI_API_KEY` para dibujarlos (se saca gratis en
[AI Studio](https://aistudio.google.com/apikey), unas 50 imágenes al día sin tarjeta). Sin claves el
panel funciona igual: el botón avisa de cuál falta.

El panel hace las dos direcciones del cartel. Si el evento ya tiene uno, se sube y la IA rellena el
formulario. Si no lo tiene, el técnico escribe una frase y se dibuja: Claude convierte esa frase en
una instrucción visual completa y el modelo de imagen la dibuja. Por defecto dibuja solo el fondo y
el panel compone encima el título, la fecha, el lugar y el color del municipio, para que esos datos
salgan siempre bien; el cartel entero dibujado por la IA, texto incluido, está en el desplegable.
Ver D-018, que incluye una advertencia sobre el nivel gratuito de Google y protección de datos.

### App móvil

```bash
pnpm --filter @agora/mobile dev
```

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
- Ninguna pantalla accede a un origen de datos directamente: todo pasa por `@agora/data`.
- Todo dato pertenece a un municipio. Ninguna consulta ni pantalla asume un municipio único.
- Las fechas se calculan siempre en la zona horaria del municipio, nunca en la del dispositivo.
