# Contenido semilla

Un directorio por municipio. Cambiar la demo de pueblo es copiar una carpeta, no tocar código.

```
content/municipalities/<slug>/
├─ municipality.json    identidad, marca, ajustes y módulos activos
├─ categories.json      categorías propias del municipio (las compartidas van en shared/)
├─ organizations.json   asociaciones del municipio
├─ events.json          eventos, con sus actividades dentro cuando las tienen
├─ route.json        recorrido previsto del directo (opcional)
└─ assets/              logo y demás material del ayuntamiento
```

## Fechas de los eventos

Cada evento declara su fecha de una de estas dos formas:

```json
"when": { "kind": "fixed", "startAt": "2027-01-05T18:00:00+01:00" }
"when": { "kind": "relative", "startsInDays": 2, "startTime": "20:00", "endTime": "22:00" }
```

Las **fijas** son para festividades reales con fecha de calendario: la cabalgata, la romería,
las fiestas patronales.

Las **relativas** se resuelven contra el día en que se abre la app, en la zona horaria del
municipio. Existen por una razón comercial: una demo enseñada en una reunión no puede tener los
bloques "Hoy" y "Este finde" vacíos, y una semilla con fechas fijas caduca en cuanto pasan.

## Eventos con programa

Un evento puede llevar dentro una lista de **actividades**: es lo que distingue «Taller de cerámica»
de «Feria medieval». Se escriben en el propio evento, y cada una declara su `when` igual que él, así
que una feria que empieza hoy con una justa dentro de dos días se resuelve sola cada vez que se abre
la demo.

```json
{
  "id": "lz-feria-medieval",
  "title": "Feria Medieval de La Zubia",
  "when": { "kind": "relative", "startsInDays": 0, "startTime": "11:00" },
  "activities": [
    {
      "id": "lz-feria-aves",
      "title": "Show de aves rapaces",
      "categoryId": "infantil",
      "when": { "kind": "relative", "startsInDays": 0, "startTime": "18:00", "endTime": "19:00" }
    }
  ]
}
```

`categoryId`, `location`, `isFree` y `priceInfo` se pueden dejar fuera, y entonces la actividad usa
los del evento — que es lo que dice casi toda línea de un programa real. Póngalos solo donde esa
línea diga algo distinto: el taller que se paga aparte dentro de una feria gratuita, la misa que es
en la iglesia y no en la plaza.

`status` es opcional y por defecto `published`. Una actividad en `pending_review` sale en la bandeja
de revisión del panel, que es cómo la semilla enseña ese flujo sin tener que teclear nada en la
reunión.

**El fin de un evento con programa puede dejarse en blanco.** La aplicación lo estira hasta la última
actividad, así que una feria de cuatro días ocupa los cuatro sin que la semilla tenga que decirlo —
que además es la única forma de expresarlo con fechas relativas.

## Procedencia de los datos

**La Zubia.** Datos del municipio verificados: código INE 18193, 20.389 habitantes (padrón de
2025), coordenadas 37,12056 / -3,58500. Patrón San Juan Nepomuceno, con fiestas patronales el 16
de mayo, y Romería de San Pedro a finales de junio; ambas son festividades reales del municipio.

**El resto de la programación es de ejemplo**, escrita para que la demo se entienda. No procede
del programa oficial del ayuntamiento y no debe presentarse como tal. Las coordenadas de los
lugares concretos dentro del pueblo son aproximadas.

**Ogíjares, Cájar y Otura** están para que el selector de municipio y la detección por ubicación
se puedan enseñar. Población del padrón de 2025 (15.239, 5.511 y 7.696). Sus coordenadas son
aproximadas y su programación es mínima y de ejemplo.

**Marca.** El logo y el color de La Zubia son marcadores de posición hasta conseguir los
oficiales del ayuntamiento (ver D-003 en `docs/decisiones.md`).
