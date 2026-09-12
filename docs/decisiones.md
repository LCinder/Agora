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

---

## D-017 — La build de Android se compila en la CI, no en EAS
**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** matiza D-004

Cada vez que algo entra en `main` —una fusión de rama incluida— el workflow `android-build.yml` genera el proyecto nativo con `expo prebuild`, compila el APK con Gradle en el propio runner de GitHub y lo sube como artefacto del run, descargable desde la pestaña Actions.

**Por qué no EAS Build:** D-004 daba por hecho EAS, y `apps/mobile/eas.json` sigue ahí para el día que haga falta. Pero EAS exige cuenta de Expo, proyecto enlazado y un `EXPO_TOKEN` en los secretos, y la cuenta es justo uno de los pendientes de Fase 0. Compilar en el runner no necesita cuenta, ni secretos, ni tarjeta, y el repositorio es público, así que los minutos de Actions no se pagan. La build deja de depender de nadie.

**Cómo llega al móvil:** el artefacto del run se descarga en `.zip` y exige sesión iniciada, que en un teléfono es inservible. Así que cada build de `main` se publica además como *release* con la etiqueta rodante `android-latest`: un enlace fijo a un `.apk` que el navegador del móvil descarga e instala de un toque. El artefacto del run se mantiene como copia por commit, que es lo que sirve para volver a una build anterior.

**Lo que se pierde frente a EAS:** el código QR y la página de instalación con su historial de builds. El artefacto por run vive 90 días; la release, hasta que la sustituye la siguiente.

**Firma:** el APK va firmado con la clave de depuración que genera la plantilla de Expo. Sirve para instalar a mano y para la demo; no sirve para publicar en Google Play. Cuando llegue la publicación en tiendas —fuera de Fase 0— hará falta una clave real y ahí EAS vuelve a ser la respuesta razonable.

**Perfiles:** por defecto compila el perfil `preview`, que lleva el JavaScript dentro y arranca sin nada detrás. D-004 hablaba de una *development build* porque es lo que EAS llama a la build con módulos nativos, pero una *development build* está vacía de JavaScript y lo pide a Metro por la red: es una herramienta de desarrollo, no una versión del producto, y sin portátil delante no arranca. Lo que resuelve D-004 —que MapLibre no funciona en Expo Go— lo resuelve igual el `preview`, porque también es una build nativa. El perfil `development` sigue disponible lanzando el workflow a mano, para programar con el móvil en la mano.

**Arquitecturas:** solo `arm64-v8a` por defecto, que es cualquier móvil de los últimos años, para que el APK pese lo menos posible. El lanzamiento manual permite incluir `armeabi-v7a` y las de emulador.

**iOS queda fuera:** compilar para iOS exige cuenta de Apple Developer de pago y certificados de firma, y no se puede hacer en un runner de GitHub. Cuando haya cuenta, iOS irá por EAS.

---

## D-018 — Dibujar carteles: Gemini para la imagen, Claude para la instrucción
**Fecha:** 2026-09-11 · **Estado:** aceptada (provisional) · **Ref.:** amplía D-009 y D-014

El panel hace ahora las dos direcciones del cartel. Leerlo, que ya estaba, y dibujarlo: el técnico escribe una frase y sale un cartel.

**Dos pasos, no uno.** Lo que escribe un técnico municipal es «concurso de tortillas en la plaza», que describe bien el evento y sirve muy mal de instrucción para un modelo de imagen. Así que Claude Opus 5 la convierte primero en una instrucción visual completa, con salida validada por Zod, y solo después dibuja el modelo de imagen. El técnico no tiene que aprender a escribir instrucciones para una IA, que es exactamente lo que no va a hacer.

**Por qué Gemini:** Claude no genera imágenes. `gemini-3.1-flash-image` (Nano Banana 2) es hoy la opción gratuita más generosa —unas 50 imágenes al día por la API de Google AI Studio, sin tarjeta— y la que mejor escribe texto dentro de la imagen, que aquí es justo lo que más cuesta.

**Dos modos, y el que se recomienda no es el vistoso.** Un cartel municipal es una comunicación oficial: si la fecha sale mal, el problema no es una errata. Por eso el modo por defecto pide al modelo una ilustración **sin texto** y el panel compone encima el título, la fecha, el lugar y el color del municipio, que son datos que ya tiene en el formulario. Salen bien siempre y se pueden corregir sin volver a dibujar. El modo de cartel entero, con el texto dentro de la imagen, queda disponible en un desplegable y avisa de que hay que repasarlo.

**Sin llave, el panel sigue funcionando**, igual que con el lector de carteles: el botón avisa de qué falta y el técnico rellena el formulario a mano.

**La composición ocurre en el navegador**, sobre un `canvas`, porque el panel no tiene servidor donde renderizar (D-013). El cartel se descarga; no se guarda en el evento, porque el panel persiste en el navegador y un JPEG en base64 se comería la cuota de almacenamiento.

### Lo que queda abierto, y hay que cerrar antes de Fase 2

**El nivel gratuito de Google usa lo que se le envía para entrenar sus modelos**, con revisión humana declarada, y desde marzo de 2026 sus términos dicen que AI Studio no es para uso de consumidor. Vendemos a ayuntamientos, donde el ayuntamiento es responsable del tratamiento y nosotros encargados (sección 10 del documento de proyecto): montar una función del producto sobre esos términos no se sostiene en un contrato del artículo 28.

Se ha aceptado a sabiendas para Fase 0 y Fase 1, porque en una demo no hay datos de nadie y porque quita fricción para probarlo. **Antes de que un ayuntamiento lo use de verdad hay que pasar a nivel de pago**, donde Google no entrena con lo enviado: es activar la facturación, la misma clave y ni una línea de código distinta. El coste es despreciable —unos pocos carteles al mes por municipio— y cabe de sobra en el objetivo de pocos euros al mes por municipio.

**Y no cierra la elección de proveedor:** son una llamada HTTP y una variable de entorno. Cambiar a otro modelo de imagen es reescribir esa llamada, no tocar el panel.

---

## D-019 — Vista de mes: rejilla con puntos, no una agenda en miniatura
**Fecha:** 2026-09-11 · **Estado:** aceptada

La agenda tiene ahora un conmutador «Lista / Mes». La lista sigue siendo lo que se abre por defecto.

**Por qué existe:** la lista responde a «qué hay pronto», que es para lo que un vecino abre la app. El mes responde a «qué hay cuando yo esté libre», que es lo que pregunta quien organiza un finde o viene de fuera a las fiestas. Y es la forma en la que el ayuntamiento ya publica su programación, así que es la vista que un concejal reconoce de un vistazo.

**Puntos, no números:** cada día muestra hasta tres puntos con el color de la categoría, no un contador. De un vistazo lo que se quiere saber es si hay algo, y contar viene después. Ningún significado depende solo del color: cada día dice en voz alta su fecha y cuántos eventos tiene para los lectores de pantalla, que es lo que exige el RD 1112/2018.

**De lunes a domingo**, porque es un calendario para España. Las iniciales de los días viven en `@agora/i18n`, así que el inglés no hereda «L M X J V S D».

**El día elegido se despliega debajo** con las mismas tarjetas de la lista, en vez de abrir otra pantalla. Un mes sin poder ver qué hay en un día es una decoración.

**La lógica está en `@agora/core`**, con 13 pruebas: una rejilla de calendario es engañosa en los finales de mes, los años bisiestos y el vecino que abre la app desde el extranjero, y nada de eso es algo que apetezca depurar mirando un móvil. Los días se calculan en la zona horaria del municipio, nunca en la del dispositivo, igual que la agrupación: una verbena que acaba a la 01:30 sale en los dos días, y un evento de varios días sale en todos ellos.

**De paso:** la fila de filtros se estiraba en vertical cuando el contenido de debajo era corto, y los chips salían como óvalos altos. Existía desde antes; la vista de mes, con un mes vacío, lo dejó a la vista.

---

## D-020 — Dirección C implementada: portada por categoría, destacado y oscuro por defecto
**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** sustituye el aspecto anterior, ver `.design/`

La app pasa de parecer un formulario a parecer un cartel. De las tres direcciones del lienzo se eligió la C: fondo oscuro, color plano de la categoría, celosía y tipografía de gran tamaño.

**La app dibuja la portada.** Casi ningún evento trae imagen —la charla de una asociación, un taller municipal, un partido de liga— y un calendario de rectángulos grises es exactamente el problema que había. Así que la portada se genera con las dos cosas que todo evento sí tiene: el color de su categoría y su fecha. El día del mes en grande **es** el gráfico. Cuando el evento sí trae cartel, manda el cartel y el dibujo se aparta.

**Una portada por categoría, no una por municipio.** `coverTreatmentFor` en `@agora/core` reparte cuatro tratamientos —fecha, celosía, tipográfica y bandas— con asignación deliberada para las seis categorías compartidas y un hash estable para las que se inventa cada municipio. Nadie en el ayuntamiento tiene que configurar nada, y una categoría no cambia de aspecto entre dos aperturas de la app.

**Los colores de categoría se calculan, no se tabulan.** Están escritos para papel y se hunden sobre fondo oscuro: `#6D28D9` da 2,9:1 sobre `#121211`. `readableOn` de `@agora/core` recorre la luminosidad conservando el tono hasta cruzar el 4,5:1. Se calcula porque cada municipio trae sus propias categorías con sus propios colores, así que ninguna lista de pares elegidos a mano puede cubrirlos. El plano de la portada sí conserva el color exacto: ahí el texto va en blanco.

**El destacado manda.** Solo un bloque de la agenda lleva evento grande —el primero con contenido, y dentro de él el marcado como destacado— para que la pantalla tenga un foco y no una fila de iguales. Es lo que un ayuntamiento quiere empujar.

**Oscuro por defecto, claro en Ajustes.** No se sigue el ajuste del teléfono salvo que el vecino elija «Automático»: una agenda que se consulta en la calle en agosto merece que la decisión sea suya. Las tres opciones viven en Ajustes y se guardan en el dispositivo.

**El color del municipio se repliega.** En esta dirección el color lo llevan las portadas, así que los filtros seleccionados se invierten contra el fondo en vez de teñirse de la marca: una fila de pastillas verdes peleaba con cada cartel de debajo. La marca queda en la barra inferior y en el botón de «Me interesa» —y ahí también pasa por `readableOn`, porque el verde de La Zubia sobre la barra oscura daba 2,38:1.

**La celosía se dibuja con vistas, no con SVG.** Una rejilla de rombos son unas cuantas `View` giradas 45°; traer un renderizador nativo de SVG costaría una dependencia y una recompilación a todos los municipios.

**Lo que queda con el aspecto anterior:** la pantalla de bienvenida, el directo y el mapa heredan la paleta nueva pero no se han recompuesto.

---

## D-021 — Tipografía propia y los detalles que separan «tematizado» de «diseñado»
**Fecha:** 2026-09-11 · **Estado:** aceptada · **Ref.:** remata D-020

D-020 dejó la app coherente pero todavía se leía como una app de React Native bien tematizada. Cinco cosas lo delataban, y las cinco eran de oficio, no de dirección.

**1. La fuente del sistema.** Era lo que más cantaba. Ahora la app trae **Archivo** empaquetada, en cinco pesos, cargada con `expo-font` antes del primer fotograma: una app que enseña la fuente del sistema y luego reflowa es lo más barato que se puede hacer. Archivo es una grotesca con un negro muy pesado; aguanta un titular de cartel y también compone una línea de detalle de 15px.

Detalle que se come a mucha gente: **React Native no sintetiza pesos de una fuente empaquetada**. Cada peso es su propia familia y `fontWeight` no se usa nunca con ellas, porque en Android cae en silencio a la fuente del sistema. Por eso `theme.fonts` expone los cinco nombres y no queda ni un `fontWeight` en la app. La auditoría encontró además `Body` y `Caption` sin familia, que es el clásico fallo de fuentes mezcladas: titulares en Archivo y cuerpo en la del sistema.

**2. Dos filas de pastillas apiladas.** El conmutador Lista/Mes y los filtros tenían la misma forma, así que ninguno de los dos se leía como una elección. El conmutador pasa a ser un control segmentado en la cabecera, y el nombre del municipio se convierte en el propio control para cambiar de pueblo —como en cualquier app con selector de ubicación—, lo que elimina una fila entera.

**3. Un panel opaco sobre el destacado.** Un rectángulo de borde duro encima de un cartel parece una pegatina pegada por encima. Ahora es un degradado (`expo-linear-gradient`), y el destacado baja de 296 a 264 px porque sobraba aire en medio.

**4. Filas flotando.** Un filete entre eventos para que la lista se lea como una lista.

**5. Iconos siempre rellenos** en la barra inferior. Contorno cuando está inactivo y relleno cuando está activo, que es la convención de las dos plataformas.

**Y dos de tipografía fina:** el nombre del municipio llevaba un tracking de -0,9 que cerraba «LA ZUBIA» en una sola palabra, y la meta de cada fila gastaba la hora de fin, que empujaba el lugar fuera de pantalla. El lugar es lo que un vecino busca; la hora de fin no.

---

## D-022 — Movimiento, esqueletos, las pantallas que faltaban y la marca
**Fecha:** 2026-09-12 · **Estado:** aceptada · **Ref.:** cierra lo que D-021 dejó pendiente

Los cuatro huecos que quedaban entre «se ve bien» y «se ve acabada».

**1. Movimiento.** La agenda entra escalonada —el destacado primero y las filas 40 ms detrás, en orden de lectura—, cambiar de lista a mes cruza en vez de saltar, y pulsar una tarjeta la encoge un 1,5%. Con `react-native-reanimated`, que ya era dependencia. Las transiciones de pantalla tienen intención: el detalle empuja desde la derecha, el directo sube desde abajo, porque es algo a lo que se entra y de lo que se sale, no una página a la que se navega.

**2. Esqueletos en vez de ruleta.** Un indicador girando dice que algo pasa; un esqueleto dice **qué** va a aparecer, y la pantalla no da un salto cuando llega. Los bloques copian el ritmo real —una portada grande, luego sellos y líneas— así que la llegada es un relleno, no un redibujado. La ruleta se queda solo donde todavía no se sabe de qué municipio se trata.

**3. Bienvenida, directo y mapa.** La bienvenida pasa al lenguaje de cartel con titular pesado y sello de iniciales por municipio —«La Zubia» da LZ, «Villa de Otura» da VO, «Cájar» da CÁ: las mayúsculas llevan el nombre y los enlaces en minúscula de un topónimo español no—. El directo pasa a mapa a pantalla completa con los controles flotando encima y un panel inferior, porque seguir una procesión es mirar el mapa. **Y el mapa tiene ahora un estilo por tema:** uno claro dentro de una app oscura es un agujero en la pantalla, y de noche es lo más brillante que va a mirar un vecino.

**4. Icono y arranque propios.** Eran los de la plantilla de Expo, y es lo primero que ve un concejal al instalarla. La marca es una celosía: un rombo con otro dentro. Es lo que la app dibuja en cada portada, es la celosía de cualquier tapia andaluza y es la forma de un día en una rejilla, que es lo que el producto es. Se dibuja con un script (`apps/mobile/scripts/make-icons.py`) en lugar de exportarse a mano, para que todo el juego —icono, capas adaptativas de Android, arranque y favicon— se regenere solo cuando cambien los colores.

**De paso, más contraste.** `tone="primary"` pintaba el color del municipio en crudo, y el verde de La Zubia da 2,38:1 sobre el fondo oscuro. Ahora pasa por `readableOn` en un solo sitio, así que todo lo que lo usa queda cubierto: sube a 4,86:1 para texto y 3,29:1 para objetos gráficos, y sobre el tema claro no lo toca, porque ahí ya daba 7,10:1. Lo mismo con la línea del recorrido y el marcador del mapa, que van sobre el basemap y no sobre el fondo de la app.

---

## D-023 — Morado, claro de verdad, mapa a pantalla completa y barra flotante
**Fecha:** 2026-09-12 · **Estado:** aceptada · **Ref.:** tres correcciones pedidas sobre D-022 + referencia visual

**1. El color pasa a morado.** El verde era un marcador de posición que venía del primer volcado de La Zubia y se había quedado como color de marca por inercia. El nuevo es `#4F46E5`. Se eligió midiendo, no a ojo: da **6,29:1 sobre blanco** —pasa AA como texto en el tema claro sin retoques— y 2,98:1 sobre la tinta oscura, que `readableOn` sube a 4,89:1 para texto y 3,28:1 para el trazo del recorrido y el marcador del mapa. Y se aparta a propósito del morado de la categoría Cultura (`#6D28D9`): si el color de marca y el de una categoría son el mismo, la categoría deja de significar nada.

Está en un sitio por superficie: `FALLBACK_PRIMARY_COLOR` en el tema de la app, `primaryColor` en el municipio de demo, los componentes del panel web y las fixtures de test. No queda ningún `#1B5E20` en el repositorio.

**2. El tema claro es blanco.** Lo que había era un crema cálido —el negativo del tema oscuro— y lo que se pide de un modo claro es papel. Fondo y superficie `#FFFFFF`, tinta `#15141B` (18,30:1), texto secundario `#66647A` (5,72:1) y un gris muy frío para las separaciones.

El problema de un blanco sobre blanco es que las tarjetas dejan de existir: sin cambio de tono no hay tarjeta, solo texto suelto. Por eso el tema expone ahora **`elevation`**, una sombra muy baja y difusa en claro y **nada en oscuro**, donde la jerarquía la da el tono. Es una decisión de tema, no un estilo copiado en cada componente, así que cambiarla de idea es tocar un objeto.

**3. El mapa se puede ampliar.** Un mapa dentro de una ficha es una foto de un mapa: demasiado pequeño para arrastrar y demasiado pequeño para hacer zoom, y «dónde está el Parque de la Encina» es una pregunta que un vecino responde moviéndose por el mapa. Así que la miniatura pasa a ser una **puerta** —gestos desactivados, chip de ampliar encima— y abre `app/map/[id].tsx`, un mapa a pantalla completa con el botón de volver y un panel inferior con el lugar.

Desactivar los gestos en la miniatura no es un detalle: un mapa que traga el gesto dentro de una página que se desplaza deja la ficha atascada. El `interactive` viaja por las dos implementaciones (nativa y web) desde `map-shared.ts`, que es lo que evita que se separen.

**4. De la referencia visual: barra flotante y tarjetas con aire.** La barra inferior deja de ser un borde pegado al canto y pasa a ser una pastilla que flota sobre el contenido, separada del borde y del área segura. Radios más generosos (`lg` de 20 a 22, `md` de 12 a 14) y la sombra del punto 2 completan el aire de la referencia.

**Comprobado y no comprobado.** Los cambios se recorrieron con el navegador: la agenda en oscuro y en claro, la ficha, la barra flotante y la navegación a la pantalla de mapa. **Los teselas del mapa no se pueden verificar aquí**: el navegador del entorno de desarrollo no tiene salida a `basemaps.cartocdn.com` ni a `tiles.openfreemap.org` (la petición se corta), así que el mapa sale en negro en las capturas. La pantalla, sus controles y el enrutado sí están verificados; el dibujo del basemap hay que mirarlo en la APK.
