# Lienzo de diseño

Propuesta visual de la app. **Ya implementada**: el lienzo fue la herramienta para elegir la
dirección y las variaciones, y desde D-020 la app va por delante. Se mantiene al día en lo que
sirve para decidir —paleta, ritmo, portadas—, no como espejo de cada pantalla: para eso están
las capturas de la app real.

Dirección elegida: **C, «Cartel»** — fondo oscuro, color plano de la categoría, celosía y
tipografía de gran tamaño. Las direcciones A («Programa de fiestas») y B («Servicio público»)
se descartaron y ya no están en el lienzo.

| Fichero | Qué es |
| --- | --- |
| `Main.dc.html` | Agenda |
| `Selector.dc.html` · `Mes.dc.html` · `Evento.dc.html` · `MisEventos.dc.html` · `Directo.dc.html` | El resto de pantallas |
| `Portadas.dc.html` | Los cinco tratamientos de portada para eventos sin cartel |
| `Rejilla.dc.html` · `Claro.dc.html` | Variaciones: otro ritmo de listado y fondo claro |
| `canvas.json` | Colocación, páginas y notas |

Cada `.dc.html` es un artboard. El fichero que se publica se ensambla a partir de estos con la
herramienta de Claude Design y **no se versiona**: son 2,5 MB de editor empaquetado que se
regenera entero en cada cambio.

## Decisiones del sistema

**La fecha es el gráfico.** Casi ningún evento trae imagen, así que la portada se genera con el
color de la categoría y el día en Archivo Black. No depende de que nadie suba nada.

**Sin degradados.** Color plano, trama de celosía y tipografía grande: en un cartel pega más
fuerte, y el degradado es el recurso más gastado que hay.

**Etiquetas aclaradas sobre oscuro.** Los colores de `content/shared/categories.json` se hunden
en el negro como texto, así que las etiquetas usan una versión aclarada (Cultura `#6D28D9` pasa a
`#A98BE8`). El plano de la portada sí conserva el color exacto.

**Contrastes medidos, no supuestos.** 21 pares comprobados contra el 4,5:1 de WCAG 2.1 AA, que es
lo que exige el RD 1112/2018. El más justo es el texto secundario, en 5,15.

**Morado, no verde.** El color de marca es `#4F46E5` (D-023). Se eligió midiendo: 6,29:1 sobre
blanco, y `readableOn` lo sube a 4,89:1 sobre la tinta oscura. Se aparta a propósito del morado de
la categoría Cultura (`#6D28D9`), porque si el color de marca y el de una categoría coinciden, la
categoría deja de significar nada.

**El claro es blanco, no crema.** Lo que se pide de un modo claro es papel. Como una tarjeta blanca
sobre fondo blanco deja de existir, la jerarquía la da una sombra muy baja; en oscuro no hay sombra
ninguna, la da el tono.

## Decidido (antes estaba pendiente)

- **Portada por categoría**, no una fija para todo el municipio.
- **Ritmo con destacado** grande más filas. La rejilla de dos se queda como variación descartada,
  en `Rejilla.dc.html`, por si un ayuntamiento pide ver más programación de golpe.
- **Fondo oscuro por defecto y claro como ajuste**, no uno u otro.
