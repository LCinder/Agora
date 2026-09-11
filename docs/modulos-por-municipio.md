# Módulos por municipio

Cada municipio es un inquilino con su propia configuración. La app y el panel se dibujan a partir de ella: **lo que no está activo no existe para ese municipio**. Ver D-006 y D-007 en `decisiones.md`.

## Qué contiene la configuración de un municipio

```
municipality
├─ identidad      id, slug, nombre, provincia, población, código INE
├─ branding       logo, color primario, imagen de cabecera
├─ ajustes        zona horaria, idioma por defecto, hora del recordatorio,
│                 límite diario de notificaciones
├─ categorías     propias del pueblo (Semana Santa, Feria, Romería, Cruces de Mayo…)
└─ features       módulos activos
```

Las **categorías propias** importan más de lo que parece: un pueblo vive de su romería y otro de sus cruces de mayo. Que cada ayuntamiento defina las suyas es barato de construir y en la reunión se percibe como "esto está hecho para nosotros".

En Fase 0 esa configuración es un `municipality.json` dentro de `content/municipalities/<slug>/`. En Fase 2 pasa a ser una fila en base de datos, sin que la app cambie.

## Catálogo de módulos

| Módulo               | Qué aporta                                               | Fase                          | Dónde se ve                    |
| -------------------- | -------------------------------------------------------- | ----------------------------- | ------------------------------ |
| `calendar`           | Calendario, detalle de evento, compartir, página pública | 0                             | App + web · **siempre activo** |
| `multi_municipality` | Selector, detección por ubicación, seguir varios pueblos | 0                             | App · **siempre activo**       |
| `poster_import`      | Crear evento desde el cartel con IA                      | 0                             | Panel                          |
| `interests`          | "Me interesa", recordatorios y avisos dirigidos          | 0 sim · 2 real                | App + panel                    |
| `associations`       | Calendario colaborativo y bandeja de revisión            | 0 sim · 2 real                | Panel + panel de asociación    |
| `analytics`          | Panel de datos agregados y export CSV                    | 0 sim · 2 real                | Panel                          |
| `live_tracking`      | Seguimiento en directo y modo voluntario                 | 0 sim · 2 real                | App + panel                    |
| `annual_report`      | Memoria anual de la concejalía en un clic                | 3                             | Panel                          |
| `syndication`        | Widget para la web municipal, iCal, texto para redes     | 3                             | Panel + web municipal          |
| `post_event_survey`  | Valoración de 1 a 5 tras el evento                       | 3                             | App + panel                    |
| `visitor_mode`       | Interfaz en inglés para quien viene a la feria           | 3                             | App                            |
| `local_business`     | Ofertas de bares y comercios durante las fiestas         | 3                             | App + panel                    |
| `white_label`        | App con marca propia del ayuntamiento                    | 3                             | Tiendas                        |
| `general_notices`    | Canal mínimo de avisos sin evento asociado               | 3 · solo si lo exige la venta | App + panel                    |

## Por qué esto también es comercial

Con módulos, la tarifa deja de ser un precio único y pasa a ser **base + extras**, lo que resuelve dos problemas abiertos del documento:

- Municipios de 5.000-10.000 habitantes (decisión pendiente nº 10): se les vende solo la base a un precio más bajo, sin regalar el producto completo.
- Municipios de 30.000-50.000: `live_tracking`, `analytics`, `annual_report` y `white_label` justifican la parte alta de la horquilla de 1.000-3.000 €.
- Diputaciones: paquete base para decenas de municipios y módulos a la carta por municipio.

Un módulo se enciende cambiando una línea de configuración, así que un piloto puede empezar con lo mínimo y ampliarse sin desarrollo.

## Reglas de implementación

1. **Todo dato lleva `municipality_id`**, desde la Fase 0. Ningún listado, consulta ni pantalla asume un municipio único.
2. **El aislamiento se garantiza en la capa de datos**, no en el frontend, y se cubre con tests desde el primer día (requisito de la sección 8 del documento de proyecto).
3. **Los módulos se comprueban en el servidor**, no solo ocultando botones: un módulo apagado debe rechazar la operación, no solo esconderla.
4. **Degradación limpia:** si un módulo está apagado, la pantalla no aparece; nunca se muestra una función bloqueada con un candado.
5. **Un módulo nuevo no toca el núcleo.** Si añadir `post_event_survey` obliga a modificar el calendario, la separación está mal hecha.
