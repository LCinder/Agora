# Decisiones técnicas

Registro de decisiones del proyecto. Cada entrada: qué se decidió, cuándo, por qué y qué alternativas se descartaron.

---

## D-001 — Backend: sin decidir en Fase 0

**Fecha:** 2026-09-11 · **Estado:** aceptada (provisional) · **Ref.:** decisión pendiente nº 3

La demo de Fase 0 funciona íntegramente con datos semilla locales. La elección entre Supabase, AWS y Firebase se pospone a la Fase 2.

**Por qué:** en Fase 0 el backend no aporta nada visible en una reunión comercial y cerrarlo ahora obliga a montar infraestructura que quizá no se use. Se mantiene la recomendación del documento (Supabase para el MVP) como opción por defecto cuando llegue el momento.

**Consecuencia obligatoria:** ninguna pantalla accede directamente a un origen de datos. Todo pasa por la interfaz `DataSource` de `packages/data`, cuya única implementación en Fase 0 lee de `content/municipalities/<slug>/`. Migrar en Fase 2 debe ser sustituir esa implementación, no reescribir la UI.

---

## D-002 — Panel web: Next.js (App Router)

**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** decisión pendiente nº 5

**Por qué:** un solo proyecto sirve el panel del ayuntamiento, el panel de asociaciones y la página pública de evento que se abre desde los enlaces compartidos por WhatsApp. Con React + Vite habría que resolver la página pública aparte.

**Descartado:** React + Vite (más ligero, pero deja fuera el renderizado de la página pública de evento, que es parte del bucle de crecimiento del producto).

---

## D-003 — Municipio de la demo: La Zubia (Granada)

**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** decisión pendiente nº 8

**Por qué:** ~20.000 habitantes (dentro de la franja objetivo), programación cultural publicada y ya contemplado como puerta de entrada institucional. La demo sirve directamente para la primera reunión.

**Pendiente:** conseguir escudo/logo y color corporativo del ayuntamiento. Hasta entonces se usan marcadores de posición. Los eventos semilla proceden de programación pública y la demo debe indicar que son datos de ejemplo.

---

## D-004 — Mapas en la app móvil: development build (EAS)

**Fecha:** 2026-09-11 · **Estado:** propuesta, pendiente de confirmación

MapLibre en React Native es un módulo nativo y **no funciona en Expo Go**. Se opta por una development build distribuida internamente.

**Por qué:** el directo simulado sobre mapa es la parte más vistosa de la demo y debe ir fluida en la reunión. La Fase 0 ya contempla enseñarla con "una build interna".

**Alternativa descartada:** MapLibre GL JS dentro de un WebView (funcionaría en Expo Go, pero es más frágil y se nota peor).

---

## D-005 — Orden de construcción por valor, no por vistosidad

**Fecha:** 2026-09-11 · **Estado:** aceptada

El alta de eventos en el panel sube al tercer puesto del plan de Fase 0 y el seguimiento en directo baja al último.

**Por qué:** si al técnico municipal le cuesta meter eventos, el calendario se vacía en semanas y el producto muere, así que esa pantalla es crítica. El directo, en cambio, se usa cuatro días al año y en Fase 0 es una simulación: aporta mucho en la reunión pero no condiciona nada de lo anterior.

---

## D-006 — App global multi-municipio con selector y detección por ubicación

**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** decisión pendiente nº 4

Una sola app en las tiendas. Al abrirla por primera vez, el vecino elige su municipio en un buscador; si concede el permiso de ubicación, la app le propone directamente el municipio en el que está, siempre que exista en la plataforma. Puede seguir más de un municipio.

**Por qué:** una sola ficha en las tiendas y un solo mantenimiento. Cada ayuntamiento recibe su enlace y su QR, que abren la app ya configurada con su municipio. Seguir varios municipios cubre un caso real de pueblo (vivir en uno y ser de otro) y el modelo de datos del documento ya lo contempla con `device_municipalities`.

**Consecuencia:** la estructura multi-municipio se construye desde la Fase 0, aunque el backend multi-inquilino real llegue en Fase 2. Ninguna pantalla asume un municipio único.

**No descartado para el futuro:** la app con marca propia por municipio (white-label) sigue siendo posible como módulo de Fase 3, porque la marca vive en la configuración del municipio, no en el código.

---

## D-007 — Funcionalidades como módulos activables por municipio

**Fecha:** 2026-09-11 · **Estado:** aceptada

Cada municipio tiene un bloque `features` en su configuración que dice qué módulos están activos. La app y el panel se dibujan a partir de él: lo que no está activo no aparece.

**Por qué:** tres razones. Los pueblos no son iguales (uno vive de la Semana Santa y otro de una romería); permite empezar un piloto con lo mínimo y encender funciones según se venden; y sostiene una tarifa por tramos (base + módulos) en lugar de un precio único, lo que ayuda con los municipios de 5.000-10.000 habitantes sin regalar el producto a los de 50.000.

**Detalle:** ver `modulos-por-municipio.md`.

---

## D-008 — Uso de la ubicación del vecino: puntual, opcional y sin almacenar

**Fecha:** 2026-09-11 · **Estado:** aceptada

La ubicación del vecino se usa **solo** en el selector de municipio, una vez, para proponerle su pueblo. Se resuelve en el dispositivo contra la lista de municipios, no se envía a ningún servidor, no se guarda y no se vuelve a pedir.

**Por qué:** el documento de proyecto establece que "la ubicación del vecino no se recoge". Esta decisión no lo contradice porque no hay recogida: hay una lectura efímera en el dispositivo. Aun así queda registrada por ser un matiz sensible en RGPD.

**Obligatorio:** el selector debe funcionar igual de bien sin conceder el permiso (buscador con la lista completa). El permiso se pide con una explicación clara de para qué sirve y nunca bloquea el uso de la app. La única ubicación que sí se transmite sigue siendo la del voluntario durante una sesión de directo.

---

## D-009 — Lectura de carteles con IA: real desde la Fase 0

**Fecha:** 2026-09-11 · **Estado:** aceptada

Subir la foto o el PDF de un cartel y que se rellenen título, fecha, hora, lugar y descripción para revisión humana. En Fase 0 se implementa funcionando de verdad, no simulado.

**Por qué:** el mayor riesgo del producto no es que no guste, es el calendario vacío porque el técnico municipal no tiene tiempo de teclear eventos. Esto lo ataca de frente. Además, en una reunión permite pedirle al concejal un cartel suyo y procesarlo en directo, algo que una simulación no aguanta.

**Cómo:** llamada a la API de Claude con visión y salida validada contra un esquema Zod compartido. El resultado **siempre** pasa por revisión humana antes de publicarse; nunca se publica automáticamente. Coste por cartel del orden de céntimos.

**Adelanto respecto al documento:** estaba en el backlog de Fase 3 (sección 7.6).

---

## D-010 — Excepción a la cuarentena de paquetes de pnpm para el ámbito de Expo
**Fecha:** 2026-09-11 · **Estado:** aceptada, temporal

pnpm 12 rechaza por defecto cualquier paquete publicado en las últimas 24 horas, como protección frente a ataques de cadena de suministro. El día en que se montó el monorepo, Expo publicó el conjunto de parches del SDK 57 (19 paquetes, todos a la misma hora), así que la instalación quedaba bloqueada.

**Qué se ha hecho:** en `pnpm-workspace.yaml` se exime del control únicamente a `expo`, `expo-*` y `@expo/*`. El resto del árbol de dependencias sigue protegido.

**Por qué es temporal:** en cuanto esas versiones tengan más de 24 horas, la excepción deja de hacer falta. Conviene quitarla en la próxima revisión de dependencias.

**Además:** el script de instalación de `unrs-resolver` (binario nativo que usa ESLint) está aprobado explícitamente en `allowBuilds`. Ningún otro paquete puede ejecutar scripts de instalación.
