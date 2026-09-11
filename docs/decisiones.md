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

---

## D-011 — Rutas tipadas de expo-router desactivadas
**Fecha:** 2026-09-11 · **Estado:** aceptada, revisable

El experimento `typedRoutes` de expo-router genera tipos de ruta a partir del árbol de ficheros y, en este monorepo, incluía rutas inventadas a partir de las importaciones de los paquetes compartidos, haciendo fallar la comprobación de tipos con errores que no correspondían a ningún error real.

**Qué se ha hecho:** `experiments.typedRoutes: false` en `app.json`.

**Por qué:** el coste de pelearse con la generación de tipos supera lo que aporta en un proyecto con doce rutas. Conviene reintentarlo en una versión posterior del SDK.

---

## D-012 — Mapas: MapLibre nativo y MapLibre GL JS en web
**Fecha:** 2026-09-11 · **Estado:** aceptada

`components/map.tsx` usa el módulo nativo `@maplibre/maplibre-react-native`; `components/map.web.tsx` usa `maplibre-gl` en el navegador. Ambas implementaciones comparten props y origen de teselas en `map-shared.ts`.

**Por qué:** el módulo nativo no funciona en el navegador, y la compilación web es lo que permite enseñar la demo desde un portátil en una sala de reuniones sin depender de que el móvil tenga la build instalada. Además da una comprobación automática real: si algo se rompe, la exportación web falla.

**Teselas:** OpenStreetMap en lugar de Google Maps, porque el producto tiene que costar unos pocos euros al mes por municipio y el precio por carga de Google no sobrevive a una procesión que mira medio pueblo. Para producción hay que contratar un proveedor de teselas: mandar ese pico de tráfico a los servidores de la fundación OSM no es aceptable.

---

## D-013 — El panel guarda su estado en el navegador
**Fecha:** 2026-09-11 · **Estado:** aceptada, solo para la Fase 0

El panel carga la semilla una vez y guarda lo que se crea, edita, aprueba o cancela en el almacenamiento local del navegador.

**Por qué:** el panel tiene que poder escribirse — enseñar cómo se crea y se aprueba un evento es el objetivo de la demo — pero en Fase 0 no hay backend. Guardarlo en el navegador tiene dos ventajas concretas para una reunión: la demo sobrevive a una recarga, y nada de lo que teclee un concejal probando sale del portátil.

**Consecuencia:** todo eso vive en `apps/web/src/lib/panel-store.tsx`. En Fase 2 ese módulo pasa a ser un cliente del API real y las pantallas no cambian.

**Cómo reiniciar la demo:** el estado se borra vaciando el almacenamiento local del navegador (hay un `resetToSeed` en el store para engancharlo a un botón cuando haga falta).

---

## D-014 — Lector de carteles: Claude Opus 5 con salida validada
**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** D-009

`POST /api/poster` recibe la imagen del cartel y devuelve título, fecha, hora, lugar, precio y organizador, más un nivel de confianza.

**Cómo:** API de Claude (`claude-opus-5`) con visión y salida estructurada validada contra un esquema Zod, así que el panel nunca recibe un JSON con una forma inesperada. El prompt le prohíbe explícitamente inventar datos: si algo no está en el cartel, devuelve cadena vacía.

**Revisión humana obligatoria:** el resultado rellena el formulario y no publica nada. Una IA leyendo una fecha de un cartel acierta casi siempre, y casi siempre no basta para publicar sin mirar. Cuando la confianza en la fecha es baja, la interfaz lo dice.

**Configuración:** `ANTHROPIC_API_KEY` en `apps/web/.env.local` (ver `.env.example`). Sin clave, el panel funciona igual y el botón avisa de que falta configurarla, así que la demo nunca se rompe por eso.

**Coste:** céntimos por cartel.

---

## D-015 — Gráficas del panel de datos: una sola serie, un solo tono
**Fecha:** 2026-09-11 · **Estado:** aceptada

Todas las gráficas del panel dibujan una única serie en un azul validado (`#2a78d6` en claro, `#3987e5` en oscuro), con rejilla discreta y una vista de tabla alternativa.

**Por qué:** con una sola serie una paleta categórica solo añade ruido, y el color deja de ser la única forma de leer el dato, que es lo que exige la accesibilidad del sector público. Los tonos están comprobados contra las superficies clara y oscura (banda de luminosidad, croma y contraste mínimo 3:1), y los pasos oscuros están elegidos para fondo oscuro, no invertidos de los claros.

---

## D-016 — Esquema de base de datos y aislamiento escritos antes que el backend
**Fecha:** 2026-09-11 · **Estado:** aceptada

`infra/db/` contiene el esquema, las políticas de seguridad por fila y 23 pruebas de aislamiento, en PostgreSQL portable. No está en uso: la Fase 0 funciona con los ficheros de `content/`.

**Por qué antes de tiempo:** el aislamiento entre municipios es lo que el documento de proyecto marca como prioridad máxima y es lo más caro de arreglar si se descubre tarde. Además es lo que hay que enseñar cuando un ayuntamiento pregunte por protección de datos, así que sirve para vender y no solo para desarrollar.

**Por qué no cierra D-001:** es PostgreSQL a secas. Lo único específico del proveedor son las tres funciones de identidad del principio de `policies.sql`. Cambiar Supabase por Cognito es reescribir esas tres funciones.

**Una decisión de diseño que conviene recordar:** no existe ninguna política que permita a un usuario municipal leer `event_interests`. Los números llegan al panel por agregados diarios. Es la promesa de la política de privacidad, escrita donde no se puede saltar por error, y hay una prueba que lo comprueba.

**Matiz sobre el aislamiento:** los eventos publicados son públicos a propósito, porque un vecino los lee sin cuenta y puede seguir varios municipios. La frontera que se defiende es la de los datos no publicados y la de todas las escrituras.
