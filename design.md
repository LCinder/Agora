# Design — HoyQ

El sistema visual del **panel municipal** (`apps/web`). Está bloqueado: cada
pantalla lee este fichero antes de cambiar nada, y lo que no esté aquí no se
inventa por página. Si el sistema tiene que crecer, se amplía **este** fichero
primero y luego la pantalla.

La app móvil tiene su propio tema en `apps/mobile/src/theme/theme.ts` y el
dossier el suyo en `docs/DOSSIER.html`. Las tres piezas comparten tipografía y
los colores de categoría; el resto es de cada una.

---

## La única decisión que gobierna el resto

**Hay dos clases de pantalla, y no se maquetan igual.**

|                             | **De trabajo**                                                                                                                                       | **De lectura**                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cuáles                      | Inicio, Eventos, Revisión, Asociaciones, Usuarios, Directos, Actividad, y los formularios                                                            | Datos                                                                    |
| Qué hace ahí quien la usa   | Filtra, aprueba, rellena, despacha                                                                                                                   | Lee, y luego lo lee en voz alta a un concejal                            |
| Cómo se separa el contenido | **Tarjetas.** Cada elemento sobre el que se actúa tiene su borde: es el límite que dice dónde acaba uno y empieza el siguiente, y es la zona de clic | **Reglas finas.** Sin cajas: cuando todo es una tarjeta, ninguna destaca |
| Jerarquía                   | Plana a propósito. Un técnico con prisa necesita que la quinta fila se lea igual que la primera                                                      | Una cifra manda y el resto la matiza                                     |

Convertir una bandeja de revisión en un documento la empeora, y maquetar el
informe como una lista de tarjetas hace que la sala busque el número que
importa. La tentación de unificarlo todo es real y hay que resistirla.

Las primitivas de lectura viven en `components/report.tsx`. Las de trabajo, en
`components/ui.tsx`. Una pantalla no mezcla las dos familias para lo mismo.

---

## Lo que sí comparten todas

Esto es el sistema. Aplica a las dos clases de pantalla, sin excepción.

**Tipografía.** Dos caras y el reparto es por trabajo, no por gusto.

- **Archivo** (`font-display`) en lo que se mira: `h1`, `h2` y cualquier cifra.
  Es la cara de la app y la del dossier.
- **La del sistema** (`font-sans`) en lo que se lee: cuerpo, etiquetas, ayudas,
  contenido de tabla. No cuesta nada cargarla y es la que mejor renderiza el
  sistema operativo de quien la mira.
- Se carga en `app/layout.tsx` con `display: swap` y fallback: si no llega, el
  panel se ve como antes. Nunca hay una tercera cara.

**Cifras.** Siempre `font-display` y siempre `tabular-nums`, estén en una ficha,
en un eje o en una celda. Una cifra que se mueve al filtrar es una cifra que
cuesta comparar.

**Títulos de sección.** `h2` en `font-display`, con una **regla fina encima**.
La regla separa sin encajonar, así que vale en las dos clases de pantalla — es
el único recurso del informe que se usa en todas.

**Iconos.** Un solo juego, **lucide**, y ninguno más: dos juegos es el detalle
que delata una interfaz cosida a trozos. A 18 px y trazo 1,75 en las acciones de
fila, a 16 px y trazo 2 junto a la etiqueta de un botón.

Una acción repetida en cada fila —editar, borrar, revisar— va **solo con icono**,
porque repetir la palabra once veces gasta anchura en algo que el lector ya sabe
y obliga al ojo a leer para encontrar el objetivo. Va con `IconButton` o
`IconLink`, que exigen `label`: de ahí salen el `aria-label` y el `title`, y no
hay forma de construir uno sin nombre. El área de pulsación es de 44 px aunque
el icono mida 18, porque esto se usa en tableta tanto como en portátil.

Una acción **destructiva o que decide algo** conserva su palabra. Aprobar y
rechazar se parecen demasiado como dibujos, y «Quitar acceso» no tiene paso de
confirmación: un icono suelto ahí es un error a un clic de distancia.

**Los ocho estados.** Todo componente interactivo los trae: por defecto,
encima, foco, pulsado, deshabilitado, **ocupado**, **error** y hecho. Lo que
hacía que el panel pareciera un dibujo de un panel no era falta de adorno, era
que un control se pintaba igual pasaras por encima, lo tuvieras pulsado,
estuviera esperando o acabaras de escribir algo inválido.

- **Pulsado:** un píxel hacia abajo y nada más. Una escala o un rebote en un
  formulario municipal parece un juguete.
- **Ocupado:** la etiqueta no cambia y el botón no encoge — cambiar «Guardar»
  por «Guardando…» mueve la maquetación bajo un dedo que sigue encima. El
  girador ocupa el sitio del icono y `aria-busy` lo dice en voz alta.
- **Error:** se dibuja desde `aria-invalid`, que pone `Field`, para que lo que
  anuncia un lector de pantalla y lo que ve el ojo no puedan separarse. El
  mensaje **sustituye** a la ayuda, no se apila debajo.

**Color.** Un solo acento: el color del municipio, levantado a contraste con
`readableOn` contra el fondo sobre el que se pinte. Los seis colores de
categoría son **dato**, no adorno: se usan cuando el color dice de qué
categoría es algo, nunca para decorar. Nada depende solo del color: todo estado
lleva además su texto, y toda gráfica tiene su vista de tabla a un botón.

**Foco.** Todo lo que se puede enfocar sale de `controlBase` o de
`controlClass` en `ui.tsx`, que llevan `focus-visible` dentro. Un enlace con
pinta de botón usa `ButtonLink`; copiar las clases a mano es cómo se pierde el
anillo. Esto no es estética: es el **RD 1112/2018**, sobre el que se vende el
producto.

**Movimiento: ninguno.** Nada anima al montarse — ni gráficas, ni listas, ni
apariciones al hacer scroll. Esta interfaz se proyecta en reuniones y se
imprime, y una pantalla que se redibuja sola es una pantalla que hay que
esperar antes de leer.

**Modo claro, punto.** `globals.css` explica por qué: el panel se enseña a un
concejal y no puede cambiar de aspecto porque el sistema operativo de turno lo
decida. Las clases `dark:` siguen escritas y apuntadas a una clase que nadie
pone, por si algún día se activa.

---

## Lo que no se hace

- Una segunda familia tipográfica, o Archivo en el cuerpo del texto.
- Tarjeta dentro de tarjeta.
- Una paleta categórica para una serie única.
- Un `confirm()` para algo reversible (ver `eventos/page.tsx`, ya resuelto).
- Emoji como icono, cursivas en titulares, degradados, sombras de color.
- Cifras inventadas. Si un dato no existe, la pantalla lo dice.
