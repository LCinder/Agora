# Plan de Fase 0 — Demo vendible

**Objetivo:** algo que enseñar a un concejal y que se entienda en un minuto. Municipio principal de la demo: La Zubia (Granada).
**Fuera de Fase 0:** autenticación real, notificaciones push reales, backend real, publicación en tiendas.

El orden está fijado por valor de producto, no por vistosidad (ver D-005 en `decisiones.md`).

---

## Estructura del repositorio

```
Agora/
├─ apps/
│  ├─ mobile/              Expo + expo-router (app del vecino + directo)
│  └─ web/                 Next.js App Router (panel municipal + página pública de evento)
├─ packages/
│  ├─ core/                tipos TS + esquemas Zod + lógica de dominio + módulos
│  ├─ data/                interfaz DataSource + implementación "seed"
│  └─ i18n/                textos es/en compartidos
├─ content/
│  └─ municipalities/
│     ├─ la-zubia/         municipality.json, events.json, organizations.json,
│     │                    route.json, assets/
│     ├─ ogijares/         datos mínimos (para el selector)
│     ├─ cajar/            datos mínimos
│     └─ otura/            datos mínimos
└─ docs/                   decisiones.md, plan-fase-0.md, modulos-por-municipio.md, demo.md
```

Todo dato pertenece a un municipio desde la primera línea de código. Ver `modulos-por-municipio.md`.

## Stack

| Pieza                            | Elección                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Monorepo                         | pnpm workspaces + Turborepo                                                      |
| Móvil                            | Expo + expo-router, TypeScript estricto                                          |
| Mapas                            | MapLibre + teselas OpenStreetMap (móvil y web)                                   |
| Ubicación                        | expo-location, uso puntual y opcional en el selector (ver D-008)                 |
| Fechas                           | date-fns + date-fns-tz, todo en `Europe/Madrid`                                  |
| Persistencia local               | AsyncStorage (municipios seguidos, "Me interesa")                                |
| Calendario del móvil / compartir | expo-calendar + Share API nativa                                                 |
| Panel web                        | Next.js + Tailwind; gráficas con Recharts                                        |
| Lectura de carteles              | API de Claude (visión) con salida validada por Zod                               |
| Validación                       | Zod en `packages/core`, compartido por app y panel                               |
| Calidad                          | ESLint + Prettier, Vitest sobre `core`, GitHub Actions (lint + typecheck + test) |

---

## Orden de trabajo

### Preparación

**0. Andamiaje del monorepo.**
pnpm workspaces + Turborepo, TypeScript estricto, ESLint, Prettier, CI con lint + typecheck + test. `README.md` inicial.

**1. `packages/core`.**
Tipos y esquemas Zod del modelo de la sección 9.5 en versión demo: `Municipality` (con `features` y `branding`), `Organization`, `Event`, `EventCategory`, `LiveSession`. Lógica de dominio pura y testeada: agrupación "Hoy / Este finde / Próximos", filtros, estados del evento y **resolución de módulos activos por municipio**.

**2. Semillas.**
La Zubia con programación pública real, categorías propias, 3-4 asociaciones de ejemplo y un recorrido de procesión en GeoJSON. Más tres municipios vecinos (Ogíjares, Cájar, Otura) con datos mínimos, para que el selector y la detección por ubicación se puedan enseñar de verdad.

### Núcleo irreducible

**3. App — selector de municipio.**
Primera pantalla. Buscador con la lista de municipios y, si el vecino concede el permiso, detección de su municipio actual con un "¿Estás en La Zubia?" confirmable de un toque. Funciona igual de bien sin permiso (D-008). Si su municipio no está en la app, pantalla de "todavía no está disponible" con un botón de aviso que cuenta la demanda de forma anónima. Permite seguir más de un municipio.

**4. App — inicio del calendario.**
Bloques "Hoy", "Este finde" y "Próximos", destacados, filtros por categoría y "gratis". Sin registro. Cambio rápido de municipio desde la cabecera.

**5. App — detalle de evento.**
Información, mapa, organizador, "Añadir a mi calendario" y "Compartir".

**6. Panel web — alta y edición de evento en menos de un minuto.**
Obligatorios solo título, fecha/hora de inicio y lugar. Lista con filtros, editar y cancelar (los cancelados se muestran como tales, no desaparecen).
_La pantalla más crítica del producto: si al técnico municipal le cuesta, el calendario se vacía._

**7. Web — página pública de evento.**
Destino de los enlaces compartidos por WhatsApp, con botón de descarga de la app. Es el bucle de crecimiento del producto.

### Pieza de mayor apalancamiento

**8. App — "Me interesa" + "Mis eventos".**
Persistido en el dispositivo, sin registro ni datos personales. "Mis eventos" agrupa por municipio cuando el vecino sigue más de uno.

**9. Panel web — envío de aviso de evento (simulado).**
Formulario de aviso (cambio de hora, cambio de lugar, cancelación) que muestra "se enviará a N interesados". Sin push real en Fase 0.

### Lo que vende

**10. Panel web — crear evento desde el cartel.**
Se arrastra la foto o el PDF de un cartel y la IA rellena título, fecha, hora, lugar y descripción para que el técnico solo revise y publique. **Funciona de verdad, no simulado** (ver D-009): en la reunión se le pide al concejal un cartel suyo y se carga en directo. Ataca el mayor riesgo del producto, que es el calendario vacío.

**11. Panel web — bandeja de revisión de asociaciones.**
Eventos de ejemplo en `pending_review`, aprobar y rechazar con motivo. Argumento comercial número uno: calendario completo sin carga de trabajo extra.

**12. Panel web — panel de datos.**
Interesados por evento, top de eventos, interés por categoría, dispositivos activos y evolución mensual, con datos de ejemplo. Export CSV. Solo datos agregados.

### Lo vistoso, al final

**13. App — directo simulado.**
Reproduce `route.json` sobre MapLibre como si fuera en tiempo real: posición actual, recorrido previsto y "última actualización hace X min".

### Cierre

**14. Pulido y documentación.**
Logo y color de La Zubia aplicados desde su `municipality.json`, accesibilidad básica (contraste, texto escalable, botones grandes), vista de mes si da tiempo, `docs/demo.md` con guion de 3 minutos y `README.md` con cómo arrancar todo en local.

---

## Desviaciones respecto al documento de proyecto

- **Vista de mes:** el documento la incluye en Fase 0; aquí baja al paso 14 como opcional. La vista de lista cubre la mayor parte del uso real.
- **Notificaciones:** el paso 9 simula el envío, como ya preveía el documento.
- **Multi-municipio:** el documento lo deja fuera de Fase 0 ("multi-municipio real"). Aquí sí se construye la **estructura** multi-municipio (selector, módulos, aislamiento de datos por municipio), porque retrofitarla después sería reescribir la app. Lo que sigue fuera es el backend multi-inquilino real, que llega en Fase 2.
- **Cartel con IA:** el documento lo sitúa en el backlog de Fase 3. Se adelanta a Fase 0 por su impacto comercial y su bajo coste de construcción.

---

## Estado

| Paso | Qué es | Estado |
|---|---|---|
| 0 | Andamiaje del monorepo | Hecho |
| 1 | `packages/core` | Hecho |
| 2 | Semillas | Hecho |
| 3 | App — selector de municipio | Hecho |
| 4 | App — inicio del calendario | Hecho |
| 5 | App — detalle de evento | Hecho |
| 6 | Panel — alta y edición de evento | Hecho |
| 7 | Web — página pública de evento | Hecho |
| 8 | App — «Me interesa» y «Mis eventos» | Hecho |
| 9 | Panel — aviso de evento simulado | Hecho |
| 10 | Panel — crear evento desde el cartel | Hecho |
| 11 | Panel — bandeja de revisión | Hecho |
| 12 | Panel — panel de datos | Hecho |
| 13 | App — directo simulado | Hecho |
| 14 | Pulido y documentación | Hecho |

**Pendiente de vosotros, no de código:**

- Logo y color corporativo de La Zubia (ahora hay marcadores de posición).
- ~~Cuenta de EAS para generar la *development build* con el mapa nativo.~~ Ya no hace falta:
  la CI compila el APK de Android en cada fusión con `main` y lo deja descargable en Actions
  (D-017). Solo volvería a hacer falta para iOS o para publicar en tiendas.
- `ANTHROPIC_API_KEY` en `apps/web/.env.local` para el lector de carteles.
- Vista de mes: se dejó fuera a propósito (ver desviaciones más arriba). Es media tarde de trabajo
  si en una reunión resulta que la piden.
