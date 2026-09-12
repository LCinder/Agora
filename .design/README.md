# Lienzo de diseño

Propuesta visual de la app, **sin implementar**: la app sigue con el aspecto que tiene.

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

## Pendiente de decidir

- Una portada fija para todo el municipio, o una por categoría.
- Ritmo del listado: destacado grande más filas, o rejilla de dos.
- Fondo oscuro, claro, o ajuste que elija el vecino.
