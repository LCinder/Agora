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

**4. De la referencia visual, la idea y no la forma.** De la captura que pasaste se coge **una** cosa: que la barra inferior no esté soldada al canto. Deja de ser un borde y pasa a flotar sobre el contenido, separada del borde y del área segura, con el contenido corriendo por debajo. Eso le da aire a la pantalla y hace que la barra se lea como un control y no como un muro.

Lo que **no** se coge es su forma. La barra usa el radio `lg` de la app, no una pastilla, y los radios se quedan donde estaban (`lg` 20, `md` 12): esta dirección habla en carteles, y un cartel es un rectángulo. Redondear las esquinas hasta la blandura de la referencia sería cambiar de dirección sin haberlo decidido. La sombra del punto 2 se queda porque resuelve un problema real —una tarjeta blanca sobre fondo blanco no existe—, no porque la referencia la tenga.

**Comprobado y no comprobado.** Los cambios se recorrieron con el navegador: la agenda en oscuro y en claro, la ficha, la barra flotante y la navegación a la pantalla de mapa. **Los teselas del mapa no se pueden verificar aquí**: el navegador del entorno de desarrollo no tiene salida a `basemaps.cartocdn.com` ni a `tiles.openfreemap.org` (la petición se corta), así que el mapa sale en negro en las capturas. La pantalla, sus controles y el enrutado sí están verificados; el dibujo del basemap hay que mirarlo en la APK.

---

## D-024 — Los carteles pasan a IA gratuita: Gemini para leer y escribir, Cloudflare para dibujar
**Fecha:** 2026-09-12 · **Estado:** aceptada · **Ref.:** sustituye a D-014 y D-018

**Lo que rompió la decisión anterior.** D-018 daba por hecho que el nivel gratuito de Gemini dibujaba imágenes, y el `.env.example` prometía «unas 50 imágenes al día, sin tarjeta». **Ya no es verdad**: la página de precios de Google marca hoy los modelos de imagen (Nano Banana y Gemini Flash Image) como _Not available_ en el nivel gratuito, solo de pago. Y D-014 ponía la lectura de carteles en Claude Opus 5, que es mejor leyendo un cartel arrugado en una foto de WhatsApp, pero Anthropic nunca ha tenido nivel gratuito. Con las dos decisiones juntas, la función estrella de la demo no se podía enseñar sin poner una tarjeta.

El requisito es explícito: que funcione con claves que se saquen en cinco minutos, con un correo y sin tarjeta.

**Lo que se hace ahora.**

| Paso | Antes | Ahora | Gratis |
| --- | --- | --- | --- |
| Leer un cartel (visión) | Claude Opus 5 | Gemini Flash | ~1.500 peticiones/día |
| Escribir la instrucción del dibujo | Claude Opus 5 | Gemini Flash | la misma cuota |
| Dibujar el cartel | Gemini (imagen) | Cloudflare Workers AI, FLUX.1 [schnell] | 10.000 neuronas/día |

**Por qué Cloudflare para la imagen.** Es la mayor cuota gratuita recurrente que hay sin tarjeta: 10.000 neuronas **al día**, que no caducan en un mes ni son un saldo de prueba que se gasta y se acaba. A 4,80 neuronas por tesela de 512×512 y 9,60 por paso, un cartel de 1024×1024 a cuatro pasos sale por unas 58, así que da del orden de **150-250 carteles al día**. Un ayuntamiento publica decenas de eventos al mes. Las alternativas eran saldos de prueba (1 $ en Together, 5 $ en Leonardo) que se agotan, o Hugging Face, cuyo límite gratuito flota con la carga y no se puede prometer en una reunión.

FLUX schnell está además bajo licencia Apache 2.0, lo que evita una conversación incómoda sobre a quién pertenece el cartel que sale.

**Dos consecuencias de diseño.**

1. **La instrucción del dibujo se escribe en inglés.** FLUX sigue el inglés bastante mejor que el español. El técnico municipal sigue escribiendo en español y el texto alternativo —lo que de verdad va a leer en voz alta el móvil de un vecino— sigue saliendo en español; lo único que cambia de idioma es el campo que solo lee el modelo de imagen.
2. **Se cae el SDK de Anthropic** y con él la salida estructurada por Zod que traía de fábrica. Gemini valida contra su propio dialecto de esquema, y la respuesta se sigue validando con Zod al salir, que es donde estaba la garantía de verdad. Todo el trato con Gemini vive en `apps/web/src/lib/gemini.ts` para no escribirlo dos veces.

**Lo que esto no arregla.** El nivel gratuito de Gemini **sigue usando lo enviado para mejorar los productos de Google**; la propia página de precios lo marca como _Yes_. Para la demo, con carteles de eventos ya públicos, es asumible. **Antes de tocar datos reales de un ayuntamiento hay que pasar a nivel de pago**, y eso va en el contrato de encargo del tratamiento. Cloudflare cobra por ampliar cuota, no por privacidad, así que ahí el salto es solo de volumen.

**Verificado y no verificado.** Las dos rutas responden 503 con el mensaje correcto cuando falta cada credencial, comprobado con el panel levantado. **El camino bueno no está probado**: no hay claves en este entorno, y el navegador del contenedor no tiene salida a ninguno de los dos proveedores. La primera prueba real es pegar las claves y dibujar un cartel.

---

## D-025 — Backend en AWS. D-001 cerrada
**Fecha:** 2026-09-18 · **Estado:** aceptada

La decisión de backend, que se dejó abierta a propósito en la Fase 0, se cierra a favor de **AWS**.

**Por qué:** es donde está la experiencia de María, que es el activo técnico del equipo. La recomendación original (Supabase) valía por velocidad de montaje, y esa ventaja pesa menos cuando una de las dos personas lleva años en AWS.

---

## D-026 — DynamoDB, y por tanto sin VPC
**Fecha:** 2026-09-18 · **Estado:** aceptada

La restricción que manda es **coste cero mientras no haya clientes**. Una base de datos relacional gestionada cuesta por existir; DynamoDB bajo demanda no cuesta nada cuando nadie la usa.

**El efecto de segundo orden es el importante:** sin una base de datos dentro de una VPC, las Lambdas no necesitan estar en una VPC, y sin VPC no hace falta pasarela NAT. La NAT costaba unos 32 €/mes, más que la propia base de datos. Con ella desaparecen subredes, grupos de seguridad, endpoints y RDS Proxy.

**Lo que cuesta:** el trabajo de `infra/db/` deja de usarse. El modelo de permisos que documenta sigue siendo el bueno y se reproduce en DynamoDB; lo que se tira es la implementación.

**Cómo se conserva el aislamiento** sin seguridad por fila:
1. La clave de partición nombra siempre el municipio.
2. Una sola capa de acceso donde los tipos impiden llamar sin municipio.
3. Índices dispersos: un evento sin aprobar no está en el índice que lee el calendario público, así que esa consulta no puede devolverlo.
4. Roles de IAM por Lambda, con denegación explícita del índice de recordatorios en todos menos en la tarea que lo necesita.

Los 23 tests de aislamiento se portan a DynamoDB Local. Eso no se negocia.

---

## D-027 — Panel estático, no OpenNext ni Vercel
**Fecha:** 2026-09-18 · **Estado:** aceptada

El panel se despliega como export estático a S3 y CloudFront. La página pública de evento, que sí necesita servidor por las etiquetas Open Graph, es una Lambda aparte.

**Por qué no Vercel:** su plan gratuito excluye el uso comercial, así que harían falta unos 40 $/mes para dos personas, y además saca los datos de la cuenta de AWS y añade un subencargado del tratamiento al contrato con cada ayuntamiento.

**Por qué no OpenNext:** genera función de servidor, optimización de imágenes, cola de revalidación, bucket de caché y función de calentamiento. Son seis piezas para servir un panel que usan tres técnicos municipales, y persigue las versiones de Next.

**Lo que se pierde:** renderizado en servidor del panel. Nadie posiciona en Google el panel interno de un ayuntamiento.

---

## D-028 — El directo se cachea, no se emite
**Fecha:** 2026-09-18 · **Estado:** aceptada

El seguimiento en directo no usa WebSockets. El móvil consulta `/live/{eventId}` cada cinco segundos y CloudFront lo sirve con un TTL de cinco segundos.

**Por qué:** con 5.000 vecinos mirando una procesión, WebSockets significan mantener 5.000 conexiones y hacer 5.000 envíos cada cinco segundos, unas 1.000 llamadas por segundo desde Lambda. Con caché, esas mismas 1.000 peticiones por segundo las absorbe el borde y el origen recibe **una cada cinco segundos**.

El desfase cabe dentro del criterio de aceptación, que pide una posición cada 5-10 segundos. El terabyte mensual gratuito de CloudFront cubre el tráfico.

---

## D-029 — Los vecinos no están en Cognito
**Fecha:** 2026-09-18 · **Estado:** aceptada

Cognito es solo para el personal municipal y las asociaciones. Los vecinos se identifican con un testigo firmado que emite la propia plataforma.

**Por qué:** todo lo que hace un vecino es leer datos públicos, que salen de la caché sin tocar una Lambda. Lo único que necesita identidad es «Me interesa». Meter a los vecinos en un grupo de identidades de Cognito sería pagar complejidad por una identidad que no tienen.

**Y los permisos no salen del testigo.** Cognito responde a «quién eres»; qué puede hacer sale de la tabla, porque un rol es por municipio y los grupos de Cognito no saben de municipios. La ventaja práctica: dar de baja a un técnico que se va del ayuntamiento es borrar una fila, no esperar a que caduque un JWT.

---

## D-030 — El nombre comercial vive en un solo fichero, y los nombres de AWS no lo siguen

**Fecha:** 2026-09-18 · **Estado:** aceptada

El nombre comercial está sin decidir (decisión 1 del documento de proyecto) y va a cambiar. Todo lo que un usuario lee sale de **`packages/core/src/brand.json`**: nombre, slug, esquema de enlaces profundos, identificador de Android y de iOS.

Lo leen los tres sitios que lo necesitan sin pasar por el compilador de TypeScript: `apps/mobile/app.config.ts` (que inyecta esos valores en la configuración de Expo), el workflow de Android (que nombra el APK y la release) y el Terraform, con `jsondecode(file(...))`. El panel y la app lo leen como `BRAND` desde `@agora/core`.

**Lo que NO sigue al nombre comercial:** los nombres físicos de AWS. Son `infra_name`, que se queda en `agora` para siempre. El motivo es que una tabla de DynamoDB no se renombra: Terraform la destruye y crea otra, y eso significa perder los datos de todos los municipios. Lo mismo vale para los buckets y el grupo de usuarios de Cognito. Así que hay dos nombres a propósito, y la variable que no se toca lo dice en su propia descripción.

`app_name` en Terraform es el nombre que se lee en el correo de invitación al panel, en el comentario de la distribución de CloudFront y en las alarmas. Si no se define, sale de `brand.json`.

**Cómo se renombra el producto:** [`docs/renombrar-la-app.md`](renombrar-la-app.md).

---

## D-031 — El panel se exporta estático de verdad: dos compilaciones de la misma aplicación

**Fecha:** 2026-09-18 · **Estado:** aceptada

D-027 decidió servir el panel como export estático desde S3, pero el código no podía exportarse: `next.config.ts` no tenía `output: 'export'` y el panel incluye dos endpoints de servidor (los de carteles) y la página pública de evento, que es `force-dynamic`. La decisión estaba tomada y el código la contradecía.

**Cómo se resuelve, sin duplicar la aplicación:**

1. **Dos compilaciones.** `next build` lo incluye todo, que es lo que hace falta en local y en la demo. `PANEL_STATIC_EXPORT=1 next build` (`pnpm --filter @agora/web build:static`) exporta solo el panel, a `apps/web/out`, que es lo que se sincroniza con S3.
2. **El mecanismo es `pageExtensions`.** Los ficheros que necesitan servidor se llaman `route.dynamic.ts` y `page.dynamic.tsx`; la compilación de export no incluye esa extensión en la lista, así que dejan de ser rutas. Se descartó un segundo proyecto de Next (duplica la configuración) y un script que mueve carpetas antes de compilar (produce una compilación que no se puede reproducir a mano).
3. **El identificador del evento viaja en la query**, `/eventos/editar?id=…`, no como segmento de ruta. Un export solo puede generar las páginas que se pueden enumerar al compilar, y los eventos de un municipio no se conocen entonces: el panel los crea en el navegador (D-013). Con la query funciona también un evento creado hace un minuto.
4. **Las URLs limpias se resuelven en el borde.** S3 leído por origin access control es un almacén de objetos: no añade `.html` ni sirve `index.html` de una carpeta. Una función de CloudFront de 15 líneas lo hace en la petición del visitante, y solo en el comportamiento del panel.
5. **Se quita la reescritura de 404 a `index.html`.** Era un `custom_error_response` que devolvía el panel con código 200 para cualquier ruta no encontrada, y esa opción es de toda la distribución: un evento inexistente en `/e/…` — la página de la que WhatsApp saca la previsualización — respondía el HTML del panel con un 200, igual que un 404 de la API. Ya no hace falta, porque cada página del panel es un fichero real.

**Lo que cuesta:** una URL mal escrita del panel muestra el error de S3 en vez de una página con diseño. Es el lado correcto del intercambio, y desaparece cuando haya dominio propio y una distribución por nombre de host.

**Y el lector de carteles:** las credenciales de Gemini y Cloudflare no pueden estar en un sitio estático. En local responden los dos `route.dynamic.ts`; en la nube responde la Lambda de carteles, y el panel apunta a ella con `NEXT_PUBLIC_POSTER_API_BASE`. Los tipos y las rutas están en `apps/web/src/lib/poster-contract.ts`, que es lo único que comparten.

---

## D-032 — Permisos por índice, no por «los índices públicos»

**Fecha:** 2026-09-18 · **Estado:** aceptada

La primera versión del Terraform daba a la Lambda pública una lista llamada `public_index_arns` que incluía `gsi1` **y `gsi2`**. `gsi2` es la bandeja de revisión: los eventos que una asociación ha enviado y el ayuntamiento todavía no ha aprobado. Con los manejadores sin escribir no era explotable, pero contradecía el modelo que documenta D-026 y era exactamente el tipo de error que una lista con nombre genérico facilita.

Ahora cada índice se pasa por su nombre y cada rol recibe el que le corresponde:

| Función | `gsi1` calendario | `gsi2` revisión | `gsi3` interesados |
| --- | --- | --- | --- |
| pública | sí | **denegado** | **denegado** |
| dispositivos | no | **denegado** | **denegado** |
| panel | sí | sí | **denegado** |
| página pública de evento | no | **denegado** | **denegado** |
| recordatorios | sí | no | sí |

Las denegaciones son explícitas además de no estar concedidas: una denegación en IAM no la puede anular una concesión posterior, así que ampliar una lista por error no abre nada.

**Y las alarmas dicen de quién es el error.** La alarma de errores de Lambda no tenía dimensión `FunctionName`, así que sumaba todas las funciones de la cuenta, incluidas las de proyectos ajenos: una alarma que avisa por código que no es tuyo se deja de leer. Ahora hay una por función, más una de 5xx de la API y una de throttling de la tabla, que es la señal de que la caché del directo no está haciendo su trabajo.

El presupuesto tenía otro descuido: la variable se llamaba `monthly_budget_eur` y la unidad era `USD`. Ahora son `monthly_budget_amount` y `budget_currency`.

**Corrección del 19 de septiembre (2):** la tabla **no tiene recuperación a un instante** (PITR). Cuesta 0,20 $ por GB y mes, y la restricción del proyecto es que nada cueste dinero por existir. La consecuencia hay que tenerla escrita, porque es lo que hay que contestar cuando un ayuntamiento pregunte qué pasa si se pierden sus datos: la replicación en tres zonas de disponibilidad es automática y no protege de un error propio, así que **un script de migración que sobreescriba la programación de un municipio no tiene vuelta atrás**. No hay versión gratuita: las copias bajo demanda también se facturan por gigabyte.

A tamaño piloto la tabla son megas, así que serían céntimos al mes. Está apuntado en el módulo, con la línea que hay que descomentar, y **revisarlo entra en la Fase E**, antes de que haya dentro datos de un ayuntamiento de verdad en vez de datos semilla. Lo que sí se queda, porque es gratis, es `deletion_protection_enabled` en producción: impide que la tabla se borre, lo pida quien lo pida.

**Corrección del 19 de septiembre:** las alarmas se crean **solo en producción**. CloudWatch regala diez alarmas por cuenta y un entorno gasta nueve (una por función, una de 5xx de la API, una de throttling de la tabla), así que tenerlas en los dos entornos costaba unos 0,80 $ al mes por avisar de un entorno en el que nadie está de guardia. En dev lo que avisa de que algo se ha roto es el test que acaba de fallar. El aviso de presupuesto y el tema de SNS siguen en los dos: un gasto que se desmadra en dev es precisamente el que nadie mira.

---

## D-033 — Los secretos del lector de carteles siguen al proveedor de verdad

**Fecha:** 2026-09-18 · **Estado:** aceptada

El Terraform creaba un parámetro `anthropic-api-key` y se lo pasaba a la Lambda de carteles, pero D-024 había movido los carteles a **Gemini** para leer y escribir y a **Cloudflare Workers AI** para dibujar. La infraestructura aprovisionaba una credencial que el producto ya no usa y ninguna de las que necesita.

Ahora crea tres parámetros: `gemini-api-key` y `cloudflare-api-token` como `SecureString`, y `cloudflare-account-id` como texto plano, porque un identificador de cuenta no es un secreto. La Lambda los recibe como un mapa (`poster_parameter_names`), no como una variable por proveedor: este es el segundo cambio de proveedor del proyecto y no será el último.

Faltaba además la ruta `POST /poster/generate`, así que dibujar un cartel no tenía endpoint en la API. Las dos rutas existen ya y son las mismas que llama el panel.

---

## D-034 — La tabla se toca desde un paquete aparte, con un almacén por rol

**Fecha:** 2026-09-18 · **Estado:** aceptada

El acceso a DynamoDB vive en **`packages/store`** y no en `@agora/data`. El motivo es concreto: la app y el panel importan `@agora/data`, y si el SDK de AWS entrara ahí acabaría en el bundle de una aplicación que habla con la API por HTTP y no tiene nada que hacer con DynamoDB. `@agora/data` se queda con la interfaz y los datos semilla; `@agora/store` es lo que responde al otro lado, desde las Lambdas.

**Un almacén por rol, no un cliente genérico.** Son cuatro, y son exactamente los mismos cortes que hacen las políticas de IAM (D-032):

| Almacén | Quién lo usa | Qué alcanza |
| --- | --- | --- |
| `createPublicStore` | Lambda pública | Calendario y evento visible. Nada más existe como método. |
| `createStaffStore` | Lambda del panel | Un actor, en un municipio. El municipio no es parámetro de ningún método. |
| `createDeviceStore` | Lambda de dispositivos | Las marcas del propio dispositivo. |
| `createReminderStore` | Tarea de recordatorios | De un evento a los dispositivos interesados. El único sitio donde existe ese camino. |

Que el municipio **no sea un parámetro** del almacén del panel es la parte que importa: no es que leer otro municipio esté prohibido, es que no se puede escribir la llamada. Es la misma idea que la clave de partición, una capa más arriba.

**El aislamiento se prueba contra DynamoDB de verdad.** 29 tests en `packages/store/src/isolation.test.ts`, sobre DynamoDB Local en Docker, que cubren lo mismo que los 23 de PostgreSQL más lo que aquí es nuevo. Un cliente falso en memoria no probaría nada: la mitad de la garantía está en cómo responde DynamoDB a una consulta sobre un índice disperso. La CI levanta el contenedor en el mismo job que el resto de comprobaciones, para que no se pueda olvidar; en una máquina sin Docker los tests se saltan diciéndolo por consola.

**Y hay un test contra la deriva.** `table-definition.test.ts` lee `infra/terraform/modules/data/main.tf` y falla si las claves, los índices o las proyecciones dejan de coincidir con lo que el paquete espera. Existe por lo que habría pillado: este mismo repositorio tenía la infraestructura describiendo una cosa y el código haciendo otra en cuatro sitios.

**Lo que falta para que esto llegue a producción:** las Lambdas se empaquetan comprimiendo `.mjs` tal cual, así que todavía no pueden importar TypeScript de un paquete del monorepo. Hace falta un paso de compilación con esbuild antes del `archive_file`, y ese es el siguiente trabajo de infraestructura.

---

## D-035 — Las Lambdas se compilan antes de empaquetarse, y viven en `apps/functions`

**Fecha:** 2026-09-18 · **Estado:** aceptada

Los manejadores eran ficheros `.mjs` sueltos dentro de `infra/terraform/lambda-src/`, que Terraform comprimía tal cual. Eso valía mientras respondían 501 y dejó de valer en cuanto necesitaron `@agora/store`: una Lambda no puede importar TypeScript de un paquete del monorepo.

**Ahora son un paquete del espacio de trabajo,** `apps/functions`, con los manejadores en TypeScript y un `build.mjs` que los empaqueta con esbuild en un directorio por función. Terraform apunta a `apps/functions/dist` y sigue haciendo lo único que hacía: comprimir.

**Terraform no compila.** Podría hacerlo con un `local-exec`, pero `archive_file` es un origen de datos que se lee en la fase de plan, antes de que se ejecute cualquier recurso, así que la compilación tendría que pasar igualmente antes. En vez de esconderlo, el módulo tiene una precondición que falla diciendo qué comando falta:

```
pnpm --filter @agora/functions build
```

**No se marca nada como externo, ni el SDK de AWS.** El tiempo de ejecución de Node 22 lo trae, y excluirlo bajaría las funciones que lo usan de unos dos megas a unos kilos. Pero también significaría ejecutar contra la versión del SDK que AWS despliegue ese mes, y una comprobación `instanceof` entre dos copias del mismo cliente falla de formas que cuestan una tarde de entender. Dos megas son menos de medio comprimido.

**Las funciones que no tocan la tabla siguen pesando ocho kilos,** y eso se cuida: `lib/http.ts` importa la clase de error desde `@agora/store/errors` y no desde la raíz del paquete, porque la raíz arrastra el cliente de DynamoDB. Es la diferencia entre un stub de 8 KB y uno de 6,5 MB.

**Y la CI compila.** Antes solo pasaba lint, tipos y tests, así que ni el export estático del panel ni el empaquetado de las funciones se comprobaban en ningún sitio: las dos cosas se rompen sin que falle un test.

---

## D-036 — El evento se pide por municipio, no por su identificador a secas

**Fecha:** 2026-09-18 · **Estado:** aceptada

La API declaraba `GET /events/{eventId}`. No se puede servir: la clave de partición de un evento nombra su municipio, así que una búsqueda que no lo nombre necesita un índice nuevo o un recorrido de la tabla entera, y las dos cosas contradicen el diseño (D-026).

La ruta pasa a ser `GET /municipalities/{municipalityId}/events/{eventId}`. No se pierde nada: todos los enlaces que genera el producto ya llevan el municipio — `/e/<slug>/<id>` —, y el selector de la app resuelve el slug a su identificador al entrar.

Los intereses hacen lo mismo por el mismo motivo: `PUT /me/interests/{eventId}?municipalityId=…`. La marca se guarda bajo el dispositivo y tiene que decir a qué municipio pertenece el evento, porque un vecino puede seguir más de un pueblo.

---

## D-037 — El nombre comercial es HoyQ. Decisión pendiente nº 1, cerrada

**Fecha:** 2026-09-19 · **Estado:** aceptada, revisable antes de publicar en tiendas

**HoyQ**, de «¿hoy qué hacemos?», que es la pregunta con la que un vecino abre la aplicación y exactamente lo que responde la pantalla de inicio con sus bloques de «Hoy» y «Este finde». El lema pasa a ser **«¿Hoy qué hacemos?»**, porque es lo que explica un nombre abreviado.

Cambia en un fichero, `packages/core/src/brand.json` (D-030): nombre, slug, esquema de enlaces e identificadores de tienda. `infra_name` sigue siendo `agora` y no se toca.

**Lo que se sopesó en contra, para que quede escrito:**

1. **No se dicta bien.** «HoyQ» por teléfono es «hache, o, i griega, cu», y este producto se difunde de boca en boca en un pueblo, entre gente de todas las edades. La alternativa que resolvía justo eso era «HoyQué», con tilde. Queda apuntada por si el nombre se prueba en voz alta y no aguanta.
2. **«Hoy» está poblado en la misma categoría:** existen «Hoy Madrid – Ocio y Cultura», «Hoy Barcelona – Ocio y Cultura», una app llamada «Hoy» y «HoyQuedas», que suena casi igual. Y HOY es un diario de Extremadura. A efectos de marca, «Hoy» no da exclusividad; lo registrable es el conjunto.
3. **«Hoy» describe al vecino, no al cliente.** El ayuntamiento paga por el calendario completo — la Semana Santa entera, la feria, los recordatorios de la semana que viene, los datos de la memoria anual — y el nombre no lo dice.

**Lo que queda abierto, y es de la Fase E:**

- **Los identificadores de tienda son `com.hoyq.app`**, es decir, llevan la marca. Son **inmutables una vez publicada la app**, así que si el nombre cambia después de publicar, el identificador se queda con el viejo. Lo recomendable es que salgan de algo estable (la empresa o un dominio propio) y no del producto; no se ha hecho porque todavía no hay ni empresa ni dominio. Es un cambio de un minuto **mientras no se publique**.
- **Marca y dominio sin confirmar.** `hoyq.es` y `hoyq.com` no tienen DNS, lo que no significa que estén libres. Hay que comprobarlo en un registrador y buscar en OEPM y EUIPO antes de imprimir nada o mandar una oferta a un ayuntamiento.
- El icono no depende del nombre: es la celosía geométrica que dibuja `apps/mobile/scripts/make-icons.py`, no una letra.

---

## D-038 — Un municipio se da de alta cargando su carpeta, y cargarla dos veces no rompe nada

**Fecha:** 2026-09-19 · **Estado:** aceptada

La tabla la crea Terraform vacía, y hasta que el panel sepa escribir no había forma de meter nada en ella. Ahora la hay: `pnpm --filter @agora/tools migrate-seed -- --table agora-dev` convierte la carpeta de un municipio en `content/` en filas.

**La propiedad que importa es que se pueda repetir.** Todo son actualizaciones, no inserciones, y los eventos pasan por la misma expresión de escritura que usa el panel, que nunca toca `interestCount`. Un `Put` habría puesto los contadores a cero en cada carga, y eso no se nota: el panel seguiría mostrando un número, solo que el equivocado. Hay un test que marca un interés, vuelve a migrar y comprueba que sigue ahí.

**Dónde vive cada parte y por qué:**

- La lógica está en `@agora/store` y **recibe datos, no un origen de datos**. Los ficheros semilla son de `@agora/data`, y el store no puede depender de ellos: las Lambdas importan el store, y una Lambda no tiene por qué llevar dentro los eventos de un pueblo de demostración.
- La herramienta está en `apps/tools`, que es la casa de los scripts de operación, y es la que junta las dos cosas. Se empaqueta con esbuild porque la semilla son importaciones de JSON, que Node no acepta sin empaquetador, y el paquete resultante es **CommonJS**: el SDK de AWS lo es, y meterlo dentro de un fichero ESM rompe sus propios `require` al cargar.
- **No hay tabla por defecto en la herramienta.** Hay que nombrarla siempre, y eso es lo que evita que una carga de datos de demostración acabe en producción por inercia.

**Lo que no hace:** no carga el recorrido de `route.json`, porque el almacén de sesiones de directo es de la Fase D. Y los eventos de la semilla se anclan al día en que se ejecuta, así que lo que queda en la tabla es una foto de ese día; para un piloto los eventos los mete el ayuntamiento por el panel.

---

## D-039 — Lo que el panel necesita además de los eventos

**Fecha:** 2026-09-19 · **Estado:** aceptada

Seis piezas que faltaban en `@agora/store` para que el panel pueda existir. Cada una es un módulo aparte que recibe el mismo actor, porque son los mismos cortes que hacen las políticas de IAM.

**Las pertenencias son la fuente de los permisos.** `USER#<sub>` / `MEM#<municipio>`. Cognito responde a «quién eres» y esta tabla a «qué puedes hacer», porque un rol es por municipio y un grupo de Cognito no sabe de municipios (D-029). Dar de alta a alguien es cosa de un `municipal_admin`, y **el municipio no se coge de la petición sino del actor**: no existe el campo por el que colar otro ayuntamiento. Tampoco puedes quitarte el acceso a ti mismo, que es la forma tonta de dejar un municipio sin administrador.

**Un cambio sobre un evento publicado no toca el evento.** Es el criterio de aceptación de la sección 7.2 y ahora es literal: una asociación sin confianza edita un evento publicado y lo que se escribe es un `CHG#<id>` junto al evento, con los atributos de `gsi2`, así que **cae en la misma bandeja de revisión que los eventos pendientes**. La versión que ven los vecinos no se mueve. Al aprobar, el cambio se aplica y desaparece; al rechazar, se queda con su motivo y sale del índice, para que la asociación pueda leer por qué. Un evento en borrador, una asociación de confianza o el propio ayuntamiento escriben directo: no hay nada publicado que proteger.

**Los avisos los envía el ayuntamiento.** Una asociación edita sus eventos y ve sus números, pero una notificación es lo único aquí que no se puede retirar, y el documento de proyecto la pone bajo el ayuntamiento. El aviso vive bajo `EVT#<id>`, una partición que no nombra municipio, así que antes de escribirlo se lee el evento **por el municipio del actor**: si no está ahí, no existe.

**Las dos palancas sobre las asociaciones son del ayuntamiento.** Crear una y marcarla de confianza, las dos de `municipal_admin`. Una asociación nunca nace de confianza: eso se gana viendo lo que publica, y el valor por defecto contrario habría hecho la bandeja de revisión opcional por accidente. Y una asociación se ve a sí misma y a nadie más: quién más está en la plataforma es cosa del ayuntamiento, no de una peña.

**Las estadísticas no bajan de cinco.** Un número menor que cinco en un pueblo no es una estadística anónima, son tres vecinos, así que se devuelve `null` y el panel dirá «menos de 5». Se aplica a los segmentos y a los eventos individuales, y el resumen cuenta cuántos números se han guardado. El total del municipio sí se da entero, porque no es un segmento. No hay tabla de agregados diarios: se calcula al leer, en una consulta, porque un municipio tiene decenas de eventos al mes y una tabla de totales precalculados es una segunda versión de la verdad que hay que mantener honesta.

**El registro de auditoría solo añade.** `MUN#<id>` / `AUD#<fecha>#<id>`, se lee del revés y solo lo lee el responsable municipal. No hay método que edite ni borre una línea. Lo escribe la API después de que una operación salga bien, no cada almacén: los almacenes imponen permisos, esto registra peticiones, y las peticiones son lo que tiene la API.

**Y un arreglo del arnés de tests:** cada fichero levantaba su propio DynamoDB y lo paraba al acabar, lo cual da igual en la CI —parar un endpoint ajeno no hace nada— y se rompe en la máquina de un desarrollador: con tres ficheros en paralelo, el primero que termina le quita el contenedor a los otros dos. Ahora lo levanta el `globalSetup` de vitest una vez por ejecución.

---

## D-040 — El panel es una ruta y un enrutador de cincuenta líneas

**Fecha:** 2026-09-19 · **Estado:** aceptada

`panel-api` está escrito. Veinte operaciones detrás de **una sola ruta** de API Gateway, `ANY /panel/{proxy+}`, repartidas por un enrutador propio de unas cincuenta líneas.

**Por qué no veinte rutas declaradas.** Serían veinte bloques de Terraform que hay que mantener en paso con el código a mano, y el día que se olvide uno el síntoma es un 404 que nadie entiende. Con una ruta, el Terraform no cambia cuando la API crece. El precio es el enrutador, y es un precio pequeño: patrones literales con `:nombre` para lo que varía, sin expresiones regulares, sin comodines. Distingue además una ruta que no existe (404) de un método que no vale para una que sí (405), porque lo segundo es un error de quien escribe el cliente y merece que se le diga.

**Los permisos salen de la tabla en cada petición.** El municipio va en la ruta; se busca la pertenencia de ese `sub` en ese municipio y con ella se construyen los almacenes. Si no hay fila, 403 — **la misma respuesta tanto si el municipio no existe como si es de otro**, porque cuál de las dos cosas es no es asunto de quien pregunta. Ningún almacén recibe el municipio como argumento, así que una petición no puede salirse del suyo ni por error.

**Un cambio de contrato que encontraron los tests.** Las seis primeras pruebas fallaron todas por lo mismo: una negativa esperada —«no tienes acceso», «solo el ayuntamiento aprueba»— salía de `route()` como excepción en vez de como respuesta, y solo se convertía en código HTTP en el envoltorio del punto de entrada de Lambda. Ahora **cada `route` mapea sus propias negativas**, así que su firma dice la verdad: devuelve una respuesta, no lanza. El envoltorio se queda como última línea de defensa para los fallos de verdad, que son un 500 con el detalle en el registro y no en la respuesta.

**La línea de auditoría la escribe el manejador**, después de que la operación salga bien, con el verbo en forma de `event.approve` u `organization.trust`. Los almacenes imponen permisos; esto registra peticiones, y una petición es lo que tiene la API.

**Y el cuerpo de la petición se valida con Zod**, con una frontera explícita: un campo opcional que no viene llega como `undefined` y los almacenes distinguen «ausente» de «presente y vacío», así que hay una función que quita los `undefined` y **deja pasar los `null`**, porque en un evento `null` es un valor — «no tiene hora de fin» — y no un hueco.

**Lo que falta para invitar a una persona de verdad:** hoy `POST /panel/.../staff` recibe el `sub` de Cognito ya creado. Falta la llamada `AdminCreateUser`, el permiso de IAM para hacerla y el identificador del grupo de usuarios en el entorno. No lo he escrito porque no puedo ejecutarlo contra un Cognito real, y escribir autenticación sin poder probarla es la forma más fácil de dar por hecho algo que no lo está.

---

## D-041 — Los carteles y la página de evento, con una sola implementación de cada cosa

**Fecha:** 2026-09-19 · **Estado:** aceptada

**La página pública de evento** ya la sirve su Lambda. Es la única cosa del sistema que devuelve HTML, y existe por las etiquetas Open Graph: sin ellas, un enlace pegado en un grupo de WhatsApp es una URL pelada en vez de una tarjeta con el título, la fecha y el pueblo. Esa tarjeta es el bucle de crecimiento del producto, no un adorno.

Sin framework y con los estilos dentro: una sola petición, nada que cachear aparte y nada que pueda faltar. Va cacheada un minuto, así que el mismo enlace en un grupo de cuatrocientas personas llega a la función una vez. Un borrador responde **exactamente lo mismo** que un evento que no existe, porque si no, un enlace compartido se convierte en una forma de averiguar qué está preparando el ayuntamiento. Y todo lo que se escribe en la página pasa por un escapado: el texto lo teclea un técnico municipal y no un desconocido, pero «nuestros usuarios no harían eso» es como se escriben los fallos de inyección, y un título con un ampersand es un martes cualquiera.

**Los carteles pasan a un paquete, `@agora/poster`.** Estaban en el panel, y la Lambda tenía un esqueleto: dos copias, una a punto de ser la verdad y la otra a punto de podrirse. Ahora hay una, sin framework, y **nada dentro lee el entorno**: las credenciales son argumentos, porque los dos llamantes las guardan en sitios distintos — un `.env.local` en desarrollo, Parameter Store en la nube. Las rutas del panel y el manejador de la Lambda son adaptadores de veinte líneas.

La taxonomía de fallos también se comparte, y esa es la parte que se nota: una cuota agotada, una clave mal, un modelo que contesta algo inservible. Cada uno llega al técnico como una frase distinta y con su código HTTP, y los dos caminos dan la misma. Están probados con la red simulada, que es donde se puede provocar un 429 a voluntad.

**Una incoherencia que encontré al juntarlos:** el panel enviaba el cartel como `multipart` y la Lambda esperaba JSON, así que en la nube habría fallado. Ahora los dos usan JSON con la imagen en base64 — una forma para los dos, y una Lambda que no tiene que interpretar multipart a mano. El límite baja a **6 MB** por el transporte y no por el modelo: base64 infla un tercio y el cuerpo de una petición no puede pasar de 10 MB. Una foto de móvil suele pasarse de ahí, así que el panel la reescala antes de subirla: 1.500 píxeles en el lado largo y JPEG al 85 %, que es la diferencia entre una petición de 400 kB y una de 8 MB que la API rechaza. Leer una fecha y un lugar de un cartel no necesita doce megapíxeles, y así también se puede subir desde una oficina con una línea lenta. Si el navegador no puede decodificar el fichero, o ya era pequeño, se envían los bytes originales.

**Y una dependencia circular evitada:** la página necesita su dirección absoluta para las etiquetas Open Graph, y no se puede leer de la distribución de CloudFront porque la propia página es uno de sus orígenes — Terraform se perseguiría la cola. Es una variable, `site_url`, vacía en el primer `apply` y rellenada en el segundo con la salida. Con la variable vacía la página funciona igual: omite las dos etiquetas en vez de escribirlas mal.

---

## D-042 — La app habla con la API, y sigue funcionando sin ella

**Fecha:** 2026-09-19 · **Estado:** aceptada

Existe la segunda implementación de `DataSource`, la que D-001 anticipaba: `createHttpDataSource`. Ninguna pantalla cambia — era para esto para lo que se escribió el interfaz.

**Cuál se usa depende de una variable.** Con `EXPO_PUBLIC_API_BASE_URL` puesta, la app habla con el backend; sin ella, lee los ficheros de `content/`. Eso no es un apaño transitorio: la demo **tiene** que funcionar sin red, porque se enseña con el móvil encima de la mesa en una sala de juntas con mal wifi. Una build de demostración y una de piloto se diferencian en una variable de entorno y en nada más.

**Una diferencia entre las dos implementaciones, que no es un fallo:** `listEvents` por HTTP devuelve solo lo que un vecino puede ver, porque es todo lo que da la API pública; la de semilla devuelve todo y deja filtrar a quien llama. Las dos son correctas para su llamante, y está escrito donde se pueda tropezar con ello.

**Lo que el cliente se toma en serio es fallar bien.** Un vecino abre esto en una calle llena de gente durante la feria, con una barra de cobertura: una petición que se queda colgada es peor que una que se rinde, así que todo lleva tiempo límite. Y un fallo distingue tres cosas que para el usuario son distintas: **no hay cobertura**, **el servidor ha dicho que no** (con su código) y **la respuesta no se entiende**, que es lo que pasa cuando la app es más vieja que la API. Esa última no revienta la pantalla: se cuenta como un fallo normal.

**El testigo del dispositivo se lee en cada llamada, no se captura**, porque la primera petición de un arranque es el propio registro y todavía no hay testigo. Dónde se guarda es cosa de la app: el cliente recibe un almacén con dos métodos, así que el mismo código vale con AsyncStorage en el móvil y con localStorage en la web.

**Y hay un test de contrato,** que es el que de verdad importa: sustituye `fetch` por una función que reparte a los manejadores de verdad sobre un DynamoDB de verdad. Ninguno de los dos lados lo habría pillado por su cuenta — que el cliente construya una ruta que la API no declara, que un campo cambie de nombre, que una parte envíe una forma que la otra no lee. Esa clase de fallo ya me mordió una vez hoy, con los carteles y el `multipart`.

Escribiéndolo salieron dos cosas pequeñas y reales: el cliente se comía la causa del error al envolverlo —así que «no hay conexión» era también lo que parecía un fallo mío— y el arnés del test convertía un 204 con cuerpo vacío en un `Response`, que la especificación prohíbe. Las dos arregladas.

---

## D-043 — El directo: el evento va dentro del testigo, y el rastro se borra

**Fecha:** 2026-09-19 · **Estado:** aceptada

La funcionalidad que hace que media comarca abra la app una tarde, y la única del producto donde se registra la ubicación de alguien. Así que las reglas son estrechas y están en el almacén, no en un manejador.

**El voluntario emite a una sesión y a ninguna otra.** El ayuntamiento programa el directo y obtiene un código de ocho caracteres de un alfabeto sin O ni 0 ni I ni 1 — se dicta por teléfono y se lee en una pantalla al sol. El voluntario lo canjea **una vez** por un testigo, y el identificador del evento **va dentro del testigo**. No es que esté prohibido escribir en otro directo: es que el evento no viaja en la petición, así que no hay forma de pedirlo. Hay un test que manda otro `eventId` en el cuerpo y comprueba que se ignora.

**Dos clases de testigo que no se pueden confundir.** El del dispositivo y el del voluntario llevan prefijo de versión distinto y cada verificador solo acepta el suyo, aunque los firme la misma clave. Confundirlos sería confundir «quién marcó un evento» con «quién lleva el móvil en la procesión».

**No hay autorizador delante.** Un autorizador de API Gateway se gana el sueldo cacheando una respuesta entre peticiones, y aquí no lo haría: una posición llega cada pocos segundos y es una escritura que hay que hacer igual. Comprobar dentro de la función cuesta lo mismo y ahorra una pieza y una Lambda.

**Al terminar, el rastro se borra.** Un borrado explícito, no una espera a que el TTL pase: «estará borrado dentro de dos días» no es lo que dice la promesa. Lo que se queda es un recorrido simplificado — puntos a más de 25 metros, sin horas — que sirve para decir por dónde fue la procesión y no dice nada de quién llevaba el teléfono. El TTL sigue puesto como segunda línea: aunque nadie cierre una sesión, ninguna posición sobrevive a la tarde.

**Y el vecino recibe solo la última posición**, nunca el rastro, con la hora a la que se registró. La app decide si fiarse: un mapa que muestra un punto de hace cuatro minutos como si fuera en directo es peor que uno que lo dice, y el dominio ya tenía escrito el umbral desde la Fase 0.

La pantalla del voluntario, que es el otro extremo de esto, está en D-044.

---

## D-044 — La pantalla del voluntario: un botón, primer plano y nada guardado de la persona

**Fecha:** 2026-09-19 · **Estado:** aceptada

El otro extremo de D-043. Quien lleva el móvil en la procesión es alguien de la hermandad al que le han dado un código, y va a tener esta pantalla abierta tres horas andando. Todo el diseño sale de ahí.

**Un botón grande y un estado que se lee de un vistazo.** Doscientos píxeles de alto, icono y etiqueta, y el color del directo cuando está emitiendo. Nada más en la pantalla que se pueda tocar por error, y la ubicación no se pide hasta que se pulsa empezar.

**Primer plano, como decidió el documento de producto.** La ubicación en segundo plano abre una conversación con las tiendas que no hace falta tener antes del primer piloto, así que se mantiene la pantalla encendida mientras se emite —y solo mientras se emite— y se dice en la propia pantalla. El voluntario emite cada cinco segundos o cada cinco metros, lo que ocurra antes, que para una procesión a paso de palio es lo mismo.

**Pausar no avisa a la API.** Deja de enviar, y el mapa del vecino dice cuánto hace que llegó la última posición, que es la respuesta honesta. Añadir un estado «en pausa» que el voluntario pudiera cambiar sería darle un botón que afecta a lo que ven miles de personas.

**Tres respuestas del servidor, tres comportamientos distintos:** sin cobertura se sigue intentando sin decir nada dramático; un 403 es que el ayuntamiento no ha activado el directo, y el testigo **se conserva** porque el mismo voluntario sigue cuando lo activen; un 401 es un testigo muerto, y el cliente lo tira él solo para que la pantalla vuelva a pedir código en lugar de reintentar para siempre.

**La sesión se guarda en el móvil.** Un teléfono que se queda sin batería a mitad de la carrera vuelve al mismo directo en vez de mandar a alguien a buscar al técnico del ayuntamiento a las once de la noche. Lo que se guarda es un testigo atado a un evento; de la persona, nada. «Borrar mis datos» de Ajustes también lo borra.

**En la demo funciona sin API**, porque el modo voluntario es una de las cosas que se enseñan en una reunión: acepta cualquier código, no envía nada y la pantalla lo dice.

Y hay dos tests de contrato nuevos que recorren el camino entero contra los manejadores de verdad: el código que el ayuntamiento genera se convierte en testigo, la posición llega al mapa del vecino, y cuando el ayuntamiento pausa el directo la posición se rechaza sin que el voluntario pierda el código.

---

## D-045 — El mapa del vecino: la misma pantalla, dos fuentes

**Fecha:** 2026-09-19 · **Estado:** aceptada

La pantalla del directo ya existía desde la Fase 0 replicando un recorrido grabado. Ahora, cuando hay API, pregunta por la última posición de verdad — y es **la misma pantalla**. La demo que se enseña en una reunión es la versión que se publica; lo único que cambia es de dónde sale el punto.

**El cliente del directo va aparte del `DataSource`.** Todo lo que hay allí es el calendario, que se cachea un minuto y se pide una vez por pantalla. Esto se pide cada cinco segundos y se cachea cinco. Mezclarlos habría significado que uno de los dos tuviera el cacheo equivocado.

**Cinco segundos de intervalo, porque la API cachea cinco.** Preguntar más rápido devolvería lo mismo y costaría dinero. Y el sondeo es sondeo, no WebSockets: para miles de vecinos mirando el mismo punto, una respuesta cacheada en CloudFront cuesta prácticamente nada y una conexión abierta por vecino no.

**Un sondeo que falla no cambia nada en la pantalla, a propósito.** La posición anterior se queda en el mapa y su hora envejece, que es justo lo que la pantalla dice en voz alta. La cobertura se muere en una calle llena de gente y eso no es un estado de error. Pasados los dos minutos que el dominio tiene escritos desde la Fase 0, el punto y la etiqueta «EN DIRECTO» se vuelven grises y el texto pasa a «sin señal desde hace X min».

**El recorrido que se dibuja es el previsto mientras dura y el simplificado cuando acaba**, así que un mapa abierto a la mañana siguiente sigue enseñando por dónde fue la procesión, sin decir nada de quién llevaba el teléfono.

Y el test de contrato recorre ahora el camino entero: el código que genera el ayuntamiento se convierte en testigo, el móvil del voluntario manda una posición y el cliente del vecino la lee por la ruta pública.

---

## D-046 — Notificaciones: Expo Push, un buzón de salida y un tope diario que se salta la cancelación

**Fecha:** 2026-09-19 · **Estado:** aceptada

La decisión pendiente nº 6 y nº 7 del documento de producto, resueltas, y la última función que quedaba en esqueleto.

**El proveedor es Expo Push.** Se pone delante de Firebase Cloud Messaging y de APNs y acepta una llamada HTTP con cien mensajes dentro. Eso es toda la razón: la alternativa —SNS o FCM directo— son una cuenta de servicio de Google y una clave de Apple en Parameter Store, dos SDK en el paquete de la Lambda y un segundo camino de entrega que depurar, para un producto cuyo volumen entero es unos miles de mensajes un jueves por la tarde. Y no lleva credenciales: Expo Push funciona sin testigo de acceso salvo que el proyecto active la seguridad reforzada, así que no hay secreto que rotar.

**Una sola Lambda y dos horarios,** distinguidos por el mensaje que manda el planificador:

- **Cada hora en punto**, para el recordatorio. Cada hora y no una vez a las 19:00 porque la hora es un ajuste **del municipio**: la función mira el reloj en la zona de cada pueblo y envía para los que les toca, y para el resto vuelve en milisegundos. Un ayuntamiento que quiera el suyo a las ocho de la mañana lo tiene sin un segundo horario.
- **Cada minuto**, para el buzón de salida. Los criterios de aceptación piden que un cambio llegue en menos de un minuto, y esto lo cumple sin cola, sin flujo de la tabla y sin conexión abierta: 1.440 invocaciones al día de una función que casi siempre no encuentra nada caben de sobra en la cuota gratis.

**El panel no envía el aviso: escribe la orden.** No puede enviarlo — ningún rol municipal tiene permiso de IAM sobre el índice que dice quién marcó un evento (D-032) — así que el aviso y la orden de reparto se escriben **en una transacción** en una partición única, `pk = OUTBOX`, y la tarea de notificaciones la vacía. Una partición para toda la plataforma es justo lo que la hace barata de consultar: se pregunta por `OUTBOX` y casi siempre no hay nada. La orden lleva TTL de 24 horas, porque un aviso entregado un día tarde diciendo que la hora ha cambiado es peor que uno no entregado.

**El recordatorio se reclama antes de enviarlo, no se marca después.** La tarea corre cada hora, un evento puede caer dentro de la ventana de dos ejecuciones y un reintento tras un tiempo de espera también es una ejecución. Reclamar primero, con una escritura condicional sobre el propio evento, hace que el peor caso sea un recordatorio que nadie recibe en vez de uno que todos reciben dos veces.

**El tope diario es 3 por dispositivo y municipio**, configurable por ayuntamiento, y se lleva en un contador con TTL bajo el propio dispositivo. La comprobación y el incremento son la misma escritura condicional, que es lo que hace que el tope aguante cuando el recordatorio de la tarde y una cancelación caen a la vez. Dos pueblos que sigue un mismo vecino no se gastan la cuota el uno al otro, porque la promesa está escrita «del mismo municipio».

**Y una cancelación se salta el tope, a propósito.** Quien marcó un evento y está a punto de bajar andando tiene que enterarse de que se ha cancelado, y «ya has recibido tres mensajes hoy» no es una razón para dejarle encontrarse la puerta cerrada.

**Cada mensaje va en el idioma de su teléfono**, porque el testigo de push se guarda junto al idioma del dispositivo y los textos están en `@agora/i18n` desde la Fase 0. Y la hora se formatea en la zona del municipio: «Mañana a las 20:00» es la hora del cartel, no la del servidor.

Lo que Expo contesta se usa para una cosa concreta: si un testigo vuelve como `DeviceNotRegistered`, la app se desinstaló de ese móvil y el testigo se borra. Un fallo de red no revienta la tarea —se cuenta, la orden se queda en el buzón y se reintenta al minuto siguiente—, porque quedan otros municipios por recorrer.

---

## D-047 — El testigo de notificaciones, y «borrar mis datos» también en el servidor

**Fecha:** 2026-09-19 · **Estado:** aceptada

La otra mitad de D-046: la tarea sabe enviar, pero necesita una dirección a la que enviar, y esa la da el móvil.

**El permiso se pide al marcar el primer evento, no al abrir la app.** Es el momento en que la pregunta tiene sentido para el vecino: acaba de decir que le interesa algo que tiene fecha y hora. Pedirlo en la pantalla de bienvenida, antes de que haya visto un solo evento, es la forma de que una app tenga las notificaciones desactivadas para siempre. Y en Ajustes hay un interruptor, porque quitarlo tiene que ser tan fácil como ponerlo.

**El testigo se vuelve a enviar en cada arranque si el permiso ya estaba dado.** Un testigo de push no es para siempre: cambia al reinstalar la app o al restaurarla en otro móvil, y uno caducado es un recordatorio que no llega.

**El testigo se valida en el manejador**, con el mismo patrón que usa el cliente de Expo. Un valor que no es un testigo de Expo es un mensaje que la tarea construiría, enviaría y vería rechazado, cada vez que se ejecuta, mientras la fila exista.

**«Me interesa» ahora llega a la API**, que es lo que convierte la marca en un recordatorio: la tarea lee las marcas, así que una marca que no llegó es un recordatorio que no existe. El móvil es la autoridad —hay un registro por instalación, no hay un segundo dispositivo con el que discrepar— y al arrancar se reconcilia: lo que está en el móvil y no en la API se marca, lo que está en la API y no en el móvil se desmarca. Un fallo de red no se le cuenta al vecino: el corazón ya está pintado, la marca está en el teléfono y se arregla en el siguiente arranque. Eso es también el requisito de funcionamiento sin conexión de la sección 10.

**Y «borrar mis datos» ahora borra de verdad.** Antes limpiaba el almacenamiento del móvil y dejaba en el servidor las marcas, los contadores y el testigo de push, así que los avisos habrían seguido llegando a un teléfono que pidió que lo olvidaran. Hay una ruta `DELETE /me` que borra el dispositivo, sus marcas —por el mismo camino que desmarcarlas una a una, para que los contadores que ve el ayuntamiento sigan siendo ciertos— y los contadores del tope diario. Después, la app es un teléfono distinto e igual de anónimo.

Una cosa que **no** está hecha y no bloquea nada: el identificador del proyecto de Expo. Sin él, `getExpoPushTokenAsync` no puede pedir un testigo, así que el registro contesta `unsupported` y la pantalla de Ajustes lo dice. Se rellena con `EXPO_PUBLIC_EAS_PROJECT_ID` el día que se haga la primera build interna, sin tocar código.
