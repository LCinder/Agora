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

Para que funcione el lector de carteles, copia `apps/web/.env.example` a `apps/web/.env.local` y
pon tu `ANTHROPIC_API_KEY`. Sin clave el panel funciona igual: el botón avisa de que falta.

### App móvil

```bash
pnpm --filter @agora/mobile dev
```

MapLibre es un módulo nativo y **no funciona en Expo Go**, así que la app se prueba con una
_development build_ de EAS instalada en el dispositivo (decisión D-004). Mientras no haya mapa en
pantalla, `expo start` sirve para iterar.

Para verla en el navegador, con mapa incluido:

```bash
pnpm --filter @agora/mobile exec expo start --web
```

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
