# App de eventos municipales

Monorepo del proyecto. Nombre comercial pendiente; `agora` es el nombre provisional del espacio de trabajo.

Contexto de negocio y alcance: [`CLAUDE.md`](CLAUDE.md).
Plan de la fase actual: [`docs/plan-fase-0.md`](docs/plan-fase-0.md).
Decisiones técnicas y su motivo: [`docs/decisiones.md`](docs/decisiones.md).

## Qué hay dentro

| Paquete                  | Qué es                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `apps/mobile`            | App del vecino (Expo + expo-router). También el modo voluntario del directo.        |
| `apps/web`               | Panel del ayuntamiento y de las asociaciones, y página pública de evento (Next.js). |
| `packages/core`          | Modelo de dominio, esquemas Zod y lógica pura. Sin React, sin Expo, sin Next.       |
| `packages/data`          | Interfaz `DataSource` y su implementación de datos semilla.                         |
| `packages/i18n`          | Textos de interfaz compartidos (español por defecto, inglés preparado).             |
| `content/municipalities` | Configuración y datos semilla de cada municipio.                                    |

## Requisitos

- Node.js 22 o superior
- pnpm 12 (`npm install -g pnpm`)

## Arrancar en local

```bash
pnpm install
```

**Panel web** (http://localhost:3000):

```bash
pnpm --filter @agora/web dev
```

**App móvil:**

```bash
pnpm --filter @agora/mobile dev
```

MapLibre es un módulo nativo y no funciona en Expo Go, así que la app se prueba con una
_development build_ de EAS instalada en el dispositivo (decisión D-004). Mientras no haya mapa
en pantalla, `expo start` sigue sirviendo para iterar.

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

## Convenciones

- **Código en inglés**, siempre: identificadores, nombres de fichero, comentarios, mensajes de
  commit y nombres de tablas.
- **Interfaz en español**, con la estructura preparada para inglés desde el principio.
- **TypeScript estricto** en todo el repositorio.
- Ninguna pantalla accede a un origen de datos directamente: todo pasa por `@agora/data`.
- Todo dato pertenece a un municipio. Ninguna consulta ni pantalla asume un municipio único.
