# App de eventos municipales — Documento de proyecto

> **Nombre provisional:** App de eventos municipales (nombre comercial pendiente)
> **Estado:** Idea validada a nivel de análisis. **No hay código todavía.**
> **Fecha del documento:** septiembre de 2026
> **Destinatario:** Claude Code (y cualquier persona que se incorpore al proyecto)

---

## 0. Instrucciones para Claude Code

Lee este documento entero antes de escribir código. Contiene el contexto de negocio, las decisiones tomadas, las que están pendientes y el alcance exacto de cada fase.

Reglas de trabajo:

1. **Empieza por la Fase 0 (demo vendible)**, descrita en la sección 12. No construyas funcionalidades de fases posteriores salvo que se pida explícitamente.
2. **Antes de implementar, propón un plan** (estructura del repositorio, stack concreto, orden de tareas) y espera confirmación.
3. Todo lo marcado como **`[DECISIÓN PENDIENTE]`** debe preguntarse antes de asumirlo. Si hace falta avanzar, elige la opción recomendada, déjalo documentado en `docs/decisiones.md` y avisa.
4. **Idiomas:** la interfaz en español (con soporte preparado para inglés). Código, nombres de variables, tablas y commits en inglés.
5. **TypeScript estricto** en todo el proyecto (app, panel y backend).
6. Prioriza **simplicidad y bajo coste de infraestructura**: el producto se vende a ayuntamientos por unos pocos miles de euros al año.
7. **Privacidad desde el diseño** (RGPD): no pidas datos personales que no sean imprescindibles. Ver sección 10.
8. **Fuera de alcance** (sección 7): no implementar incidencias, trámites ni comentarios abiertos.
9. Mantén un `README.md` actualizado con cómo arrancar el proyecto en local y un `docs/decisiones.md` con cada decisión técnica y su motivo.

---

## 1. Resumen del proyecto

Aplicación móvil para vender a **ayuntamientos de Andalucía**. Al abrirla, el vecino ve un **calendario con todos los eventos, fiestas e información del municipio**. El personal del ayuntamiento introduce la información de forma muy sencilla y los vecinos pueden reaccionar a los eventos.

El producto se diferencia de la competencia existente con tres funcionalidades clave, además del calendario:

1. **Calendario colaborativo con asociaciones**: hermandades, peñas, clubes y AMPAs suben sus eventos y el ayuntamiento solo los aprueba.
2. **"Me interesa" con panel de datos**: el vecino recibe recordatorios y avisos; el ayuntamiento ve qué eventos funcionan.
3. **Seguimiento en directo** de procesiones, cabalgatas y romerías en un mapa.

Modelo de negocio: **suscripción anual** pagada por el ayuntamiento. Descarga gratuita para vecinos.

---

## 2. Equipo y situación actual

### Equipo

- **María**: desarrolladora de software (Granada). Experiencia en DevOps/infraestructura en AWS, observabilidad (Grafana, Prometheus), CI/CD y certificación AWS Certified Developer Associate. Ya ha desarrollado y publicado una app en **React Native** (Talaria, app de turismo de Granada, con Firebase) en Google Play.
- **Socio**: amigo de María, cofundador del proyecto. `[DECISIÓN PENDIENTE: reparto de roles; en particular, quién lleva la parte comercial con ayuntamientos]`

### Lo que llevamos hecho

- Idea definida y MVP inicial acordado: calendario de fiestas y eventos del pueblo.
- Análisis de la competencia principal (Bandomovil), con precios y presencia en Andalucía (sección 4).
- Cliente objetivo y horquilla de precio definidos como hipótesis (secciones 5 y 6).
- Estrategia de validación comercial definida (sección 11).
- Lluvia de ideas de funcionalidades hecha y **priorización cerrada**: calendario + las tres funcionalidades diferenciadoras (sección 7).

### Lo que NO tenemos todavía

- Código, repositorio, diseño visual ni nombre comercial.
- Stack técnico cerrado (hay propuesta en la sección 9).
- Contactos cerrados con ayuntamientos ni pilotos.

---

## 3. Problema y propuesta de valor

### El problema

- La información de eventos de un municipio está dispersa: web municipal, Facebook del ayuntamiento, carteles, grupos de WhatsApp, redes de cada hermandad o peña.
- El personal del ayuntamiento no tiene tiempo de introducir y mantener todos los eventos.
- Las concejalías (cultura, festejos, turismo, juventud, deportes) no tienen datos de qué eventos interesan ni a cuánta gente llegan, así que les cuesta justificar el gasto y la programación.
- Los vecinos se enteran tarde de cambios de hora, cortes de calle o cancelaciones.

### La propuesta de valor

**Para el ayuntamiento**

- Un calendario del municipio siempre completo sin carga de trabajo extra, porque las asociaciones aportan sus propios eventos.
- Datos de interés por evento y por tipo de actividad, útiles para la memoria anual y para decidir la programación.
- Una función vistosa (seguimiento en directo) que los vecinos usan en masa en Semana Santa, feria o romería.

**Para el vecino**

- Todo lo que pasa en su pueblo en un sitio.
- Recordatorios de lo que le interesa y avisos si algo cambia.
- Saber por dónde va la procesión o la cabalgata en tiempo real.

---

## 4. Mercado y competencia

### Competidor principal: Bandomovil

Fuente: web oficial y registros mercantiles (consultados en septiembre de 2026).

- Empresa: **Lemur Ideas S.L.**, con sede en Coca (Segovia). Según registros mercantiles, 2 empleados (2023) y facturación inferior a 300.000 €.
- Dice tener **más de 1.300 ayuntamientos** clientes en España.
- Funcionalidades incluidas: comunicados/bandos con notificación push, gestión de incidencias ("¡Comunica!"), agenda de actividades, turismo y puntos de interés, espacio para comercios, búsqueda de empleo y ocio, farmacias de guardia, transporte, listín telefónico. Extras: venta de entradas, reservas deportivas, chatbot municipal, botón del pánico, participación ciudadana.
- App Android propia por municipio y app global en iOS.
- Sin permanencia y con prueba gratuita de 15-20 días.
- Tarifa anual según población:

| Habitantes      | Precio anual |
| --------------- | ------------ |
| 0 – 500         | 99 €         |
| 500 – 1.000     | 135 €        |
| 1.000 – 1.500   | 182 €        |
| 1.500 – 2.000   | 229 €        |
| 2.000 – 5.000   | 307 €        |
| 5.000 – 10.000  | 359 €        |
| 10.000 – 15.000 | 442 €        |
| 15.000 – 20.000 | 520 €        |
| 20.000 – 25.000 | 556 €        |
| 25.000 – 30.000 | 640 €        |
| 30.000 – 50.000 | 728 €        |
| Más de 50.000   | 842 €        |

**Presencia geográfica:** no hay reparto público por comunidad. Su visibilidad es mayor en la España rural del interior (Castilla y León, Extremadura, Castilla-La Mancha), coherente con precios pensados para pueblos muy pequeños. **Sí está presente en Andalucía**: se han encontrado al menos Láchar (Granada), Huelma (Jaén), Doña Mencía (Córdoba) y Huércal-Overa (Almería).

> Tarea opcional de análisis: sacar la lista de apps "X Informa" publicadas por Lemur Ideas en Google Play, cruzarla con el listado de municipios del INE y obtener el reparto real por provincia.

### Conclusiones del análisis

- Un "calendario + información del municipio" a secas **no se puede vender**: ya existe por unos cientos de euros al año, con muchas más funciones.
- A esos precios, el mercado da para una empresa muy pequeña. Para que el proyecto tenga sentido hay que **cobrar más aportando algo claramente distinto**.
- Bandomovil funciona en un solo sentido: **el ayuntamiento publica y el vecino recibe**. No destaca ni la colaboración de asociaciones, ni datos de interés para el ayuntamiento, ni seguimiento en directo. Ahí está nuestro hueco.
- Andalucía tiene unos 785 municipios, con más municipios medianos que Castilla y León. Es terreno favorable para un producto más completo y algo más caro.

---

## 5. Cliente objetivo

- **Geografía:** Andalucía. Empezar por la provincia de Granada.
- **Tamaño:** municipios de **5.000 a 50.000 habitantes**. Tienen presupuesto, programación cultural propia y vida asociativa. Los pueblos muy pequeños ya los cubre Bandomovil a precios difíciles de igualar.
- **Interlocutor dentro del ayuntamiento:** concejalías de **cultura, festejos y turismo**, que organizan eventos y quieren que se note. También juventud y deportes.
- **Canal alternativo:** **Diputaciones provinciales**, que pueden contratar un servicio para decenas de municipios a la vez.
- **Candidato a primer contacto:** `[DECISIÓN PENDIENTE]` Una opción a valorar es La Zubia (Granada), que María ya contemplaba como puerta de entrada institucional para Talaria.

### Usuarios finales

- **Vecinos** de todas las edades, incluidas personas mayores con poca soltura digital.
- **Visitantes** que vienen a fiestas, ferias o romerías.
- **Asociaciones:** hermandades y cofradías, peñas, clubes deportivos, AMPAs, asociaciones culturales y de mayores.
- **Personal municipal:** técnicos de cultura o comunicación, a menudo sin perfil técnico y con poco tiempo.

---

## 6. Modelo de negocio y precio

### Hipótesis de precio (a validar con ayuntamientos)

- Municipios de 10.000 a 50.000 habitantes: **1.000 – 3.000 € al año**.
- Posible **cuota de alta** inicial (configuración, carga inicial de eventos, formación).
- Municipios de 5.000 a 10.000: por debajo de esa horquilla. `[DECISIÓN PENDIENTE]`
- Diputaciones: precio por paquete de municipios. `[DECISIÓN PENDIENTE]`

### Contratación pública

- Mantener el precio por debajo del umbral del **contrato menor de servicios (15.000 € sin IVA)** permite al ayuntamiento contratar directamente, sin licitación. _Pendiente confirmar con alguien experto en contratación pública._
- El producto debe poder **facturarse electrónicamente** a la administración (FACe).

### Calendario comercial

- En **otoño** muchos ayuntamientos preparan el presupuesto del año siguiente.
- **Elecciones municipales en mayo de 2027**: antes de elecciones interesan las cosas visibles; después puede cambiar el concejal interlocutor.

### Números orientativos

- A 500 € de media harían falta 100 ayuntamientos para facturar 50.000 € al año. Por eso el objetivo es un ticket medio más alto.
- Vender a la administración es lento: **el coste real está en la venta y el seguimiento, no en el desarrollo**.

---

## 7. Alcance funcional

### 7.1 Base: calendario del municipio

El núcleo del producto. Al abrir la app, el vecino ve directamente los eventos de su municipio.

**Historias de usuario**

- Como vecino, quiero ver al abrir la app los eventos de hoy, de este fin de semana y los próximos, para enterarme de lo que pasa sin buscar.
- Como vecino, quiero cambiar entre vista de lista y vista de mes.
- Como vecino, quiero filtrar por tipo (fiestas, cultura, deporte, infantil, mayores, religioso) y por "gratis".
- Como vecino, quiero ver el detalle de un evento: título, fecha y hora, lugar con mapa, descripción, cartel, organizador y precio.
- Como vecino, quiero añadir un evento al calendario de mi móvil y compartirlo por WhatsApp.
- Como personal municipal, quiero crear, editar y cancelar eventos desde un panel web muy sencillo.

**Criterios de aceptación**

- La pantalla inicial carga los eventos del municipio en menos de 2 segundos con conexión normal y muestra los últimos datos en caché si no hay conexión.
- No hace falta registrarse para ver el calendario.
- Crear un evento en el panel lleva menos de un minuto: solo título, fecha y hora de inicio, y lugar son obligatorios.
- Los eventos cancelados se muestran como tales (no desaparecen sin más).
- Compartir genera un enlace que abre el evento en la app o, si no está instalada, en una página web del evento.

### 7.2 Diferenciadora 1: calendario colaborativo con asociaciones

Las asociaciones del municipio suben sus propios eventos; el ayuntamiento los revisa y aprueba.

**Historias de usuario**

- Como personal municipal, quiero dar de alta asociaciones e invitar a su responsable por email o enlace.
- Como responsable de una asociación, quiero crear eventos de mi asociación desde el móvil o el ordenador sin formación previa.
- Como personal municipal, quiero una bandeja de eventos pendientes para aprobarlos o rechazarlos con un motivo.
- Como personal municipal, quiero poder marcar una asociación como "de confianza" para que sus eventos se publiquen sin revisión.
- Como responsable de una asociación, quiero saber si mi evento está pendiente, publicado o rechazado, y por qué.
- Como vecino, quiero ver qué asociación organiza cada evento.

**Criterios de aceptación**

- Una asociación solo puede crear y editar eventos propios y solo en su municipio.
- Los eventos de asociaciones sin confianza quedan en estado `pending_review` y no son visibles para vecinos hasta su aprobación.
- Al aprobar o rechazar, el responsable de la asociación recibe un email.
- Si una asociación edita un evento ya publicado (sin confianza), el cambio vuelve a revisión pero la versión publicada sigue visible.
- El panel para asociaciones funciona bien en móvil (web responsive; no requiere instalar nada).

### 7.3 Diferenciadora 2: "Me interesa" + panel de datos

**Historias de usuario (vecino)**

- Como vecino, quiero marcar "Me interesa" en un evento con un solo toque, sin registrarme.
- Como vecino, quiero recibir un recordatorio antes de los eventos que me interesan.
- Como vecino, quiero recibir un aviso si un evento que me interesa cambia de hora, de lugar o se cancela.
- Como vecino, quiero ver la lista de eventos que me interesan.

**Historias de usuario (ayuntamiento)**

- Como personal municipal, quiero enviar un aviso asociado a un evento (cambio de hora, corte de calle, cancelación por lluvia) que llegue solo a quien marcó "Me interesa".
- Como concejal o técnico, quiero ver un panel con: interesados por evento, eventos más populares, interés por categoría, dispositivos activos en el municipio y evolución mensual.
- Como técnico, quiero exportar un informe (CSV y PDF) para la memoria anual.
- Como responsable de una asociación, quiero ver cuántos interesados tienen mis eventos.

**Criterios de aceptación**

- "Me interesa" funciona con identificación anónima del dispositivo; no se pide nombre, email ni teléfono.
- Recordatorio por defecto: la tarde anterior al evento. `[DECISIÓN PENDIENTE: hora exacta y si se añade un segundo recordatorio 1 hora antes]`
- Los avisos de cambios se envían en menos de 1 minuto desde que se publican.
- El panel solo muestra **datos agregados**; nunca identifica a vecinos concretos.
- Límite anti-spam: un vecino no recibe más de X notificaciones al día del mismo municipio. `[DECISIÓN PENDIENTE: valor de X]`

### 7.4 Diferenciadora 3: seguimiento en directo

Para procesiones, cabalgatas, romerías, desfiles y carreras populares.

**Historias de usuario**

- Como personal municipal, quiero activar el seguimiento en directo en un evento y opcionalmente dibujar o subir el recorrido previsto.
- Como personal municipal, quiero generar un código o QR para que un voluntario (por ejemplo, alguien de la hermandad) comparta la ubicación desde su móvil.
- Como voluntario, quiero iniciar, pausar y terminar la emisión de ubicación con un botón grande.
- Como vecino, quiero ver en un mapa por dónde va el paso o la cabalgata, el recorrido previsto y cuándo se actualizó la posición por última vez.
- Como vecino, quiero recibir un aviso cuando empieza el directo de un evento que me interesa.

**Criterios de aceptación**

- La posición se actualiza en el mapa de los vecinos cada 5-10 segundos.
- Si no llega posición en más de 2 minutos, el mapa muestra "Última actualización hace X min" en lugar de dar la posición por buena.
- La ubicación del voluntario **solo** se comparte mientras la sesión está activa y se elimina el historial detallado al terminar el evento (se puede conservar el recorrido simplificado).
- **MVP:** el modo voluntario funciona con la app en primer plano y pantalla encendida, para evitar la complejidad y la revisión de las tiendas asociadas a la ubicación en segundo plano. La ubicación en segundo plano queda para una fase posterior.
- Aguanta picos de miles de vecinos mirando el mismo directo (ver sección 10).
- **Fase 0 (demo):** vale una simulación que reproduce un recorrido grabado previamente.

### 7.5 Fuera de alcance (no implementar)

- Gestión de incidencias, quejas o propuestas de vecinos.
- Trámites, citas previas o cualquier función de sede electrónica.
- Comentarios abiertos o chat en eventos (moderación costosa y riesgo para el ayuntamiento).
- Venta de entradas, pagos o reservas de instalaciones.
- Bandos generales sin evento asociado. `[DECISIÓN PENDIENTE: valorar en el futuro un canal mínimo de avisos generales]`

### 7.6 Ideas para fases posteriores (backlog)

- **Crear eventos desde el cartel:** subir foto o PDF y que una IA rellene título, fecha, hora y lugar para revisión.
- **Publicar una vez, salir en todas partes:** widget para la web municipal, calendario iCal suscribible y texto listo para redes sociales.
- **Encuesta rápida tras el evento** (valoración de 1 a 5).
- **Modo visitante** en inglés, pensado para quien viene a la feria.
- **Ofertas de bares y comercios** durante las fiestas (posible segunda fuente de ingresos).
- **App con marca propia** del ayuntamiento (white-label).
- Eventos recurrentes (mercadillo semanal, clases).

---

## 8. Roles y permisos

| Rol                        | Quién                           | Puede                                                                                                                               |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `visitor` / vecino anónimo | Cualquier usuario de la app     | Ver eventos, filtrar, "Me interesa", recibir avisos, ver directos                                                                   |
| `org_editor`               | Responsable de una asociación   | Crear y editar eventos de su asociación (con o sin revisión), ver sus métricas                                                      |
| `volunteer`                | Voluntario con código de sesión | Emitir ubicación en una sesión de directo concreta                                                                                  |
| `municipal_editor`         | Técnico municipal               | Crear, editar y cancelar cualquier evento del municipio; aprobar o rechazar; enviar avisos de evento; gestionar directos; ver panel |
| `municipal_admin`          | Responsable municipal           | Todo lo anterior + gestionar asociaciones, usuarios del ayuntamiento y configuración del municipio                                  |
| `superadmin`               | Nosotros                        | Alta de municipios, soporte, configuración global                                                                                   |

**Multi-municipio:** todo dato pertenece a un municipio. Ningún usuario de un municipio puede leer o modificar datos de otro. Este aislamiento debe garantizarse **en la base de datos** (por ejemplo, políticas de seguridad por fila), no solo en el frontend, y cubrirse con tests.

---

## 9. Propuesta técnica

> Toda esta sección es **propuesta**. El stack final es `[DECISIÓN PENDIENTE]` y debe confirmarse con María antes de empezar.

### 9.1 Componentes

1. **App móvil** para vecinos (y modo voluntario).
2. **Panel web** para ayuntamiento y asociaciones.
3. **Backend**: API, base de datos, autenticación, tiempo real, notificaciones push y tareas programadas (recordatorios).
4. **Página web pública de evento** (para enlaces compartidos cuando no se tiene la app).

### 9.2 Stack recomendado

- **App móvil:** React Native con **Expo** y TypeScript. María ya tiene experiencia en React Native. Expo simplifica notificaciones push, builds y publicación.
- **Panel web:** React + Vite (o Next.js si se quiere servir también la página pública de evento desde el mismo proyecto), TypeScript, diseño responsive.
- **Monorepo** (pnpm workspaces o Turborepo) con paquete compartido de tipos, validación (por ejemplo, Zod) y cliente de API.
- **Mapas:** MapLibre con mapas de OpenStreetMap, para evitar los costes de Google Maps.
- **Notificaciones push:** Expo Notifications (sobre FCM y APNs).

### 9.3 Backend: opciones `[DECISIÓN PENDIENTE]`

| Opción                                                                             | A favor                                                                                                             | En contra                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A. Supabase** (Postgres + Auth + Realtime + Storage) — _recomendada para el MVP_ | Muy rápido de montar; modelo relacional; seguridad por fila para aislar municipios; tiempo real incluido; región UE | Dependencia de un proveedor; límites de tiempo real a vigilar en picos |
| **B. AWS** (API Gateway + Lambda, RDS Postgres, Cognito, WebSockets o AppSync)     | Experiencia de María; control total; escalable                                                                      | Bastante más trabajo de montaje para un MVP                            |
| **C. Firebase** (Firestore, Auth, FCM)                                             | Ya usado en Talaria; tiempo real nativo                                                                             | Modelo no relacional menos cómodo para permisos, informes y agregados  |

Criterio: para la Fase 0 y el piloto importa la velocidad; la migración a AWS puede plantearse si el producto crece.

### 9.4 Una app global o una app por municipio `[DECISIÓN PENDIENTE]`

- **Una app global con selector de municipio** (recomendado para empezar): una sola ficha en las tiendas, un solo mantenimiento. Cada municipio tiene su enlace y QR que abre la app ya configurada.
- **App con marca propia por municipio**: los ayuntamientos lo valoran (Bandomovil lo ofrece en Android), pero multiplica publicaciones y mantenimiento. Preparar la arquitectura para permitirlo más adelante (configuración de marca por municipio).

### 9.5 Modelo de datos inicial (orientativo)

```
municipalities
  id, name, slug, province, population, logo_url, primary_color,
  timezone (Europe/Madrid), default_locale, status (demo|pilot|active|inactive),
  created_at

organizations
  id, municipality_id, name, type (brotherhood|pena|sports_club|parents_assoc|
  cultural|seniors|other), contact_email, is_trusted, status (invited|active|disabled),
  created_at

staff_users                      -- personal municipal, asociaciones y superadmin
  id, auth_user_id, email, full_name, created_at

memberships
  id, staff_user_id, municipality_id, organization_id (nullable),
  role (org_editor|municipal_editor|municipal_admin|superadmin), created_at

devices                          -- vecinos anónimos
  id, anonymous_auth_id, platform (ios|android|web), locale,
  push_token (nullable), created_at, last_seen_at

device_municipalities            -- municipios que sigue un dispositivo
  device_id, municipality_id, created_at

event_categories
  id, municipality_id (nullable = global), slug, name, icon

events
  id, municipality_id, organization_id (nullable), created_by (staff_user_id),
  title, description, category_id, start_at, end_at, all_day,
  location_name, latitude, longitude, image_url, price_info, is_free,
  audience_tags (children|seniors|families|youth…),
  status (draft|pending_review|published|rejected|cancelled),
  rejection_reason, is_featured, live_tracking_enabled,
  created_at, updated_at, published_at

event_pending_changes            -- ediciones de asociaciones sobre eventos publicados
  id, event_id, payload (json), created_by, status, created_at

event_interests
  device_id, event_id, created_at, reminder_sent_at   -- único (device_id, event_id)

event_updates                    -- avisos asociados a un evento
  id, event_id, type (time_change|location_change|cancelled|notice),
  message, created_by, created_at, push_sent_at

live_sessions
  id, event_id, volunteer_code, status (scheduled|active|paused|ended),
  planned_route (geojson, nullable), started_at, ended_at

live_positions                   -- se purga el detalle al terminar
  id, session_id, latitude, longitude, accuracy_m, recorded_at

event_daily_stats                -- agregados, sin datos personales
  event_id, date, views, interests_added, shares, detail_opens

audit_log
  id, municipality_id, actor_id, action, entity, entity_id, created_at
```

### 9.6 Pantallas

**App móvil (vecino)**

1. **Bienvenida:** elegir municipio (o entrar directamente por enlace o QR), idioma y permiso de notificaciones explicado con claridad.
2. **Inicio (calendario):** bloque "Hoy" y "Este finde", eventos destacados, lista de próximos, cambio a vista de mes, filtros.
3. **Detalle de evento:** información, mapa, organizador, botones "Me interesa", "Añadir a mi calendario" y "Compartir", avisos del evento y botón "Ver en directo" cuando esté activo.
4. **Mis eventos:** eventos marcados con "Me interesa".
5. **Directo:** mapa con posición actual, recorrido previsto y hora de última actualización.
6. **Ajustes:** municipio, idioma, notificaciones, política de privacidad.
7. **Modo voluntario:** entrada con código, botón grande de iniciar, pausar y terminar, indicador de que se está emitiendo.

**Panel web (ayuntamiento)**

1. Inicio con métricas principales y eventos pendientes de revisión.
2. Eventos: lista con filtros, crear, editar, cancelar, enviar aviso.
3. Bandeja de revisión de eventos de asociaciones.
4. Asociaciones: alta, invitación, confianza, baja.
5. Directos: programar sesión, recorrido previsto, generar código o QR para voluntario, ver sesión en curso.
6. Estadísticas y exportación de informes.
7. Configuración del municipio (logo, color, categorías, usuarios del ayuntamiento).

**Panel web (asociación)**

1. Mis eventos con su estado.
2. Crear y editar evento.
3. Métricas de mis eventos.

### 9.7 Notificaciones

| Tipo                          | Destinatarios                        | Momento                         |
| ----------------------------- | ------------------------------------ | ------------------------------- |
| Recordatorio de evento        | Dispositivos con "Me interesa"       | Tarde anterior (hora pendiente) |
| Aviso de cambio o cancelación | Dispositivos con "Me interesa"       | Inmediato                       |
| Inicio de directo             | Dispositivos con "Me interesa"       | Al iniciar la sesión            |
| Evento destacado              | Todos los dispositivos del municipio | Manual, con límite diario       |

Las notificaciones de recordatorio se envían desde una tarea programada. Todas respetan la zona horaria `Europe/Madrid` y el límite anti-spam.

---

## 10. Requisitos no funcionales

### Privacidad y RGPD

- El ayuntamiento es **responsable del tratamiento** y nosotros **encargados**: habrá que firmar un contrato de encargo del tratamiento (art. 28 RGPD) con cada ayuntamiento.
- Datos alojados en la **Unión Europea**.
- **Minimización:** los vecinos usan la app sin registro; se identifican con un identificador anónimo de dispositivo.
- La ubicación del vecino **no se recoge**. Solo se usa la ubicación del voluntario durante una sesión de directo, con consentimiento explícito, y se purga el detalle al terminar.
- Métricas siempre agregadas. No mostrar segmentos con muy pocos dispositivos (por ejemplo, menos de 5) para evitar identificar personas.
- Política de privacidad y aviso legal accesibles desde la app y el panel.
- Opción de borrar los datos del dispositivo desde Ajustes.

### Accesibilidad

- Al ser un servicio para la administración pública, debe cumplir el **Real Decreto 1112/2018** sobre accesibilidad de sitios web y apps del sector público (referencia técnica: norma UNE-EN 301549, equivalente a WCAG 2.1 nivel AA). Incluye publicar una declaración de accesibilidad.
- Textos escalables, buen contraste, lectores de pantalla (VoiceOver y TalkBack), botones grandes.
- Pensar en personas mayores: interfaz clara, poca jerga, pocos pasos.

### Rendimiento y picos de carga

- Uso muy concentrado en fechas concretas (Semana Santa, feria, cabalgata de Reyes, romería): miles de vecinos a la vez en un municipio mediano.
- El listado de eventos debe servirse desde caché siempre que sea posible.
- El directo debe emitir posiciones a muchos clientes sin que el coste se dispare (difusión en tiempo real con alternativa de consulta periódica si falla la conexión).
- La app debe funcionar en móviles Android antiguos y con mala cobertura (calles llenas de gente durante un evento).

### Offline

- Último calendario descargado disponible sin conexión.
- "Me interesa" marcado sin conexión se sincroniza al recuperarla.

### Idiomas

- Español por defecto; estructura preparada para inglés desde el principio (internacionalización de textos de interfaz). El contenido de los eventos lo escribe el ayuntamiento en español.

### Operación y coste

- Coste de infraestructura por municipio muy bajo; objetivo orientativo de pocos euros al mes por municipio en uso normal.
- Monitorización de errores en app y backend, y alertas básicas.
- Copias de seguridad de la base de datos.
- Entornos separados: desarrollo, pruebas y producción.

### Calidad

- Tests automáticos de permisos y aislamiento entre municipios (prioridad máxima).
- Tests de la lógica de estados de eventos y del envío de notificaciones.
- CI con lint, comprobación de tipos y tests en cada cambio.

---

## 11. Estrategia de validación comercial

El orden acordado es **vender antes de desarrollar el producto completo**.

1. **Demo, no producto** (Fase 0): prototipo funcional con eventos reales de un pueblo concreto.
2. **Reuniones con 10-15 ayuntamientos** de la franja objetivo, más al menos una Diputación. Preguntas clave:
   - ¿Qué usáis hoy para comunicar eventos? ¿Qué os falla?
   - ¿Quién mete los eventos y cuánto tiempo le lleva?
   - ¿Os serviría que las asociaciones subieran sus eventos?
   - ¿Qué datos os gustaría tener de vuestros eventos?
   - ¿Cuánto pagaríais al año y de qué partida saldría?
3. **Buscar un sí con dinero**: piloto pagado o compromiso por escrito, aunque sea pequeño.
4. **Criterio de decisión:** si en 2-3 meses hay **2-3 ayuntamientos que pagan o se comprometen**, se desarrolla el MVP en serio. Si no, se replantea la idea (por ejemplo, con un enfoque más turístico).

---

## 12. Fases del proyecto

### Fase 0 — Demo vendible (objetivo: unos dos fines de semana de trabajo)

Objetivo: algo que enseñar en una reunión con un concejal y que se entienda en un minuto.

Incluye:

- App móvil (Expo) con **un municipio de demo** cargado con eventos reales de su programación pública (datos en un fichero de semilla fácil de cambiar por otro municipio).
- Calendario con "Hoy", "Este finde", lista y vista de mes, filtros por categoría.
- Detalle de evento con mapa, compartir y "Añadir a mi calendario".
- "Me interesa" guardado en el dispositivo y pantalla "Mis eventos".
- **Directo simulado**: reproduce un recorrido grabado en el mapa como si fuera en tiempo real.
- Panel web mínimo: crear y editar eventos, bandeja de revisión con eventos de ejemplo de asociaciones y un panel de estadísticas con datos de ejemplo.
- Aspecto visual cuidado y con el logo y color del municipio de demo.

No incluye: autenticación real, notificaciones push reales, multi-municipio real ni publicación en tiendas (se enseña con Expo Go o una build interna).

### Fase 1 — Validación comercial (2-3 meses, en paralelo a pequeños ajustes de la demo)

Reuniones, ajustes de la demo según el feedback y, si hay éxito, acuerdo de pilotos.

### Fase 2 — MVP para pilotos

- Backend real, multi-municipio con aislamiento en base de datos.
- Autenticación del personal municipal y de asociaciones; dispositivos anónimos para vecinos.
- Asociaciones con flujo completo de revisión.
- "Me interesa", recordatorios y avisos con notificaciones push reales.
- Panel de datos con exportación.
- Directo real con modo voluntario.
- Página web pública de evento.
- Publicación en Google Play y App Store.
- Cumplimiento de RGPD y accesibilidad, con documentación para el ayuntamiento.

### Fase 3 — Producto

Funcionalidades del backlog (sección 7.6) según lo que pidan los pilotos, app con marca propia, facturación y alta de municipios automatizada.

---

## 13. Decisiones pendientes (resumen)

| #   | Decisión                                                              | Opción recomendada                                           |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Nombre comercial                                                      | —                                                            |
| 2   | Reparto de roles entre socios (quién vende)                           | —                                                            |
| 3   | Backend: Supabase, AWS o Firebase                                     | Supabase para MVP                                            |
| 4   | App global con selector o app por municipio                           | App global con enlace/QR por municipio                       |
| 5   | Web del panel: React + Vite o Next.js                                 | Next.js si también sirve la página pública de evento         |
| 6   | Hora del recordatorio y posible segundo aviso                         | Tarde anterior; segundo aviso opcional                       |
| 7   | Límite diario de notificaciones por dispositivo                       | A definir                                                    |
| 8   | Municipio de la demo                                                  | Uno de la provincia de Granada con programación pública rica |
| 9   | Primer ayuntamiento al que contactar                                  | A valorar (La Zubia es una opción)                           |
| 10  | Precio para municipios de 5.000-10.000 habitantes y para Diputaciones | A validar en reuniones                                       |
| 11  | Canal mínimo de avisos generales (sin evento)                         | Fuera del MVP                                                |

---

## 14. Primeras tareas sugeridas para Claude Code

1. Leer este documento y **proponer un plan** para la Fase 0 (estructura del monorepo, librerías concretas, orden de trabajo). Esperar confirmación.
2. Preguntar las decisiones pendientes que bloquean la Fase 0 (como mínimo: 3, 5 y 8).
3. Crear el monorepo con app Expo, panel web y paquete compartido de tipos, con lint, formateo, comprobación de tipos y CI básico.
4. Definir los tipos y el esquema de datos de la sección 9.5 (versión simplificada para la demo) y un fichero de semilla del municipio de demo.
5. Implementar la pantalla de inicio del calendario y el detalle de evento.
6. Implementar "Me interesa" local y "Mis eventos".
7. Implementar el directo simulado sobre MapLibre.
8. Implementar el panel web mínimo (eventos, bandeja de revisión, estadísticas de ejemplo).
9. Pulir diseño y preparar un guion de demo de 3 minutos en `docs/demo.md`.
10. Documentar en `README.md` cómo arrancar todo y en `docs/decisiones.md` las decisiones tomadas.

---

## Anexo: fuentes del análisis de competencia

- Web y tarifas de Bandomovil: https://www.bandomovil.com/
- Datos mercantiles de Lemur Ideas S.L.: https://www.einforma.com/informacion-empresa/lemur-ideas y https://www.informa.es/directorio-empresas/Empresa_LEMUR-IDEAS.html
- Adjudicaciones públicas de Bandomovil (Gobierto): https://contratos.gobierto.es/adjudicatarios/bandomovil-informacion-municipal-lemur-ideas-s-l
- Ejemplos de municipios andaluces con Bandomovil: https://www.bandomovil.com/lachar · https://huelma.bandomovil.com/

limitar generacion de imagenes por ayuntamiento. Existen actividades y eventos. los eventos es algo    
generico,  un grupo grande que engloba por varias actividades, es decir, una actividad puede ser independiente o pertenecer a un evento.
En el calendario



Te llamaba porque querriamos hacer una propuesta y  colaboracion con
el ayuntamiento de X para la mejora de la 
agenda de eventos del municipio, ya que  estamos trabajando 
con ayuntamientos de la provincia sobre esto.


638650237

cultura@cajar.es
Juan Antonio


Ogijares

Juanma - Concejal Nuevas tecnologias
juanmanuelplata@ogijares.org
670464963



