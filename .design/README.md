# Lienzo de diseño

Propuesta visual de la app, **sin decidir todavía**. Nada de esto está implementado:
la app sigue con el aspecto que tiene.

| Fichero | Qué es |
| --- | --- |
| `Main.dc.html` | Agenda, en la dirección que lidera («Programa de fiestas») |
| `Selector.dc.html` · `Mes.dc.html` · `Evento.dc.html` · `MisEventos.dc.html` · `Directo.dc.html` | El resto de pantallas en esa misma dirección |
| `DireccionB.dc.html` · `DireccionC.dc.html` | La pantalla de agenda en las otras dos direcciones, para comparar |
| `canvas.json` | Colocación en el lienzo, las dos páginas y las notas |

Cada `.dc.html` es un artboard. El fichero que se publica se ensambla a partir de
estos con la herramienta de Claude Design y **no se versiona**: son 2,5 MB de
editor empaquetado y se regenera entero en cada cambio.

Los valores salen del sistema que ya existe, no inventados: los radios, la escala
tipográfica y el objetivo táctil de `apps/mobile/src/theme/theme.ts`, y los colores
de categoría de `content/shared/categories.json`. El verde es el de La Zubia
(`content/municipalities/la-zubia/municipality.json`).
