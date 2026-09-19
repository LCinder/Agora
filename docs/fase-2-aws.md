# Fase 2 — Arquitectura en AWS

Backend real para los pilotos. Escrito bajo una restricción que manda sobre todo lo demás:
**coste cero mientras no haya clientes**, y coste proporcional al uso cuando los haya.

Esa restricción no es un capricho: decide la base de datos, elimina la mitad de las piezas y
cambia dónde vive el panel. Conviene entender por qué antes de tocar el Terraform.

---

## 1. Las tres decisiones que lo explican todo

### DynamoDB, y por tanto no hay VPC

Una base de datos relacional gestionada cuesta dinero por existir, esté o no atendiendo peticiones.
DynamoDB bajo demanda cuesta cero cuando nadie la usa.

El efecto de segundo orden es el importante: **las Lambdas ya no necesitan estar dentro de una
VPC**, porque hablan con DynamoDB por la API de AWS. Sin VPC no hay pasarela NAT, y la pasarela NAT
costaba unos 32 € al mes, más que la propia base de datos. Con ella desaparecen también las
subredes, los grupos de seguridad, los endpoints de VPC y el RDS Proxy.

**Lo que ha costado:** el trabajo de `infra/db/` — esquema, políticas de seguridad por fila y 23
tests — deja de usarse. El modelo de permisos que documenta sigue siendo válido y es el que se
reproduce aquí; lo que se tira es la implementación.

### El panel es estático

El panel son componentes de cliente de principio a fin: no renderiza nada en servidor. Servido
como export estático desde S3 y CloudFront, cuesta cero y su Terraform son un bucket y una
distribución.

Que el panel *pudiera* exportarse fue lo último en llegar, y no era gratis: hay dos compilaciones
de la misma aplicación, el identificador del evento viaja por la query en vez de por la ruta, y las
URLs limpias las resuelve una función de CloudFront. Está explicado en D-031, y el resumen es que
`pnpm --filter @agora/web build:static` deja en `apps/web/out` exactamente lo que se sincroniza con
S3.

Lo único que necesita servidor es la **página pública de evento**, y por una sola razón: las
etiquetas Open Graph de la previsualización de WhatsApp. Eso es una Lambda pequeña, no un servidor
de Next.

Esto descarta OpenNext (seis piezas de infraestructura para servir un panel que usan tres personas)
y Vercel (cuyo plan gratuito excluye el uso comercial, así que costaría 40 $/mes y además sacaría
los datos de la cuenta).

### Los vecinos casi no se autentican

Todo lo que hace un vecino es leer datos públicos, y eso no necesita identidad ninguna: sale de la
caché de CloudFront sin tocar una Lambda. Solo «Me interesa» necesita saber qué dispositivo es, y
para eso basta un testigo firmado que emitimos nosotros.

Cognito queda para el personal municipal y las asociaciones, que es donde encaja: el `sub` de
Cognito se guarda como `auth_user_id` y los permisos viven en la tabla, porque un rol es **por
municipio** y los grupos de Cognito no saben de eso.

---

## 2. Arquitectura

```
   App móvil                Panel web              Enlace de WhatsApp
       │                        │                          │
       └────────────┬───────────┴──────────────┬───────────┘
                    │                          │
               CloudFront ◄────────────── S3 (panel estático, carteles)
                    │
         ┌──────────┴───────────┐
         │                      │
   API Gateway HTTP API    Lambda página pública
         │
    ┌────┴────┬──────────┬─────────────┐
    │         │          │             │
  Lambda    Lambda     Lambda        Lambda
  pública   panel      carteles      voluntario
  (hecha)   (501)      (501)         (sin escribir)
    │         │          │             │
    └─────────┴────┬─────┴─────────────┘
                   │
              DynamoDB (tabla única, TTL)

   Cognito ──► personal municipal y asociaciones
   EventBridge Scheduler ──► recordatorios y avisos
```

Ninguna pieza está dentro de una VPC. Todo vive en tu cuenta de AWS, en `eu-central-1`.

Los manejadores están en `apps/functions`, en TypeScript, y se empaquetan con esbuild antes de
aplicar (D-035). La API pública y la de dispositivos están escritas y probadas contra DynamoDB Local;
el panel, la página de evento y los carteles responden 501 todavía, y lo dicen.

---

## 3. Diseño de la tabla única

Una sola tabla, `agora-<entorno>`, con clave de partición `pk` y de ordenación `sk`.

| Entidad | `pk` | `sk` |
| --- | --- | --- |
| Municipio | `MUN#<id>` | `META` |
| Categoría | `MUN#<id>` | `CAT#<categoryId>` |
| Asociación | `MUN#<id>` | `ORG#<orgId>` |
| Evento | `MUN#<id>` | `EVT#<eventId>` |
| Aviso de evento | `EVT#<eventId>` | `UPD#<createdAt>#<id>` |
| Sesión de directo | `EVT#<eventId>` | `LIVE` |
| Posición del directo | `EVT#<eventId>` | `POS#<recordedAt>` |
| Estadística diaria | `EVT#<eventId>` | `STAT#<fecha>` |
| Interés de un vecino | `DEV#<deviceId>` | `INT#<municipalityId>#<eventId>` |
| Pertenencia de un usuario | `USER#<cognitoSub>` | `MEM#<municipalityId>` |
| Índice de municipios | `PLATFORM` | `MUN#<slug>` |

**La clave de partición empieza siempre por el municipio.** No es que esté prohibido leer otro: es
que no existe la consulta que lo haría sin nombrarlo.

### Índices secundarios

| Índice | `pk` | `sk` | Para qué |
| --- | --- | --- | --- |
| `gsi1` | `MUN#<id>#PUB` | `<startAt>` | El calendario del vecino, ordenado por fecha |
| `gsi2` | `MUN#<id>#REVIEW` | `<createdAt>` | La bandeja de revisión del ayuntamiento |
| `gsi3` | `EVT#<eventId>` | `DEV#<deviceId>` | Recordatorios: a quién avisar de un evento |

### El truco que sustituye a la seguridad por fila

`gsi1` y `gsi2` son **índices dispersos**: un evento solo aparece en ellos si tiene el atributo
correspondiente, y ese atributo solo se escribe cuando el evento pasa a `published` o a
`pending_review`.

La consecuencia importa: **la consulta del calendario público no puede devolver un evento sin
aprobar**, porque ese evento no está en el índice que la consulta lee. No es una comprobación que
el código pueda olvidarse de hacer; es una propiedad de dónde vive el dato. Es lo mismo que nos
daba `events_public_read` en Postgres, conseguido de otra manera.

### Qué índice puede leer cada función

Cada índice se pasa a cada módulo por su nombre, no dentro de una lista llamada «los públicos»
(D-032). El reparto es este, y las denegaciones son explícitas además de no estar concedidas:

| Función | `gsi1` calendario | `gsi2` revisión | `gsi3` interesados |
| --- | --- | --- | --- |
| pública | sí | denegado | denegado |
| dispositivos | no | denegado | denegado |
| panel | sí | sí | **denegado** |
| página pública de evento | no | denegado | denegado |
| recordatorios | sí | no | sí |

### El índice que el panel no puede leer

`gsi3` permite ir de un evento a los dispositivos interesados. Lo necesita la tarea de
recordatorios, y **no puede leerlo nadie más**: el rol de IAM de la Lambda del panel no tiene
permiso sobre ese índice.

Esa es la promesa de la política de privacidad — el ayuntamiento ve cuántos, nunca quiénes — puesta
donde el código no puede saltársela. Los números que ve el panel salen de un contador atómico en el
propio evento, que se incrementa al marcar y se decrementa al desmarcar.

### El TTL

Las posiciones del directo llevan atributo `expiresAt`. DynamoDB las borra solo. La purga del
detalle que exige el RGPD deja de ser una tarea programada que hay que escribir, probar y vigilar,
y pasa a ser una línea de configuración.

---

## 4. Autenticación

### Personal municipal y asociaciones

```
Panel → Cognito (usuario y contraseña) → JWT
     → API Gateway (autorizador JWT nativo, valida la firma)
     → Lambda lee `sub` del testigo
     → consulta USER#<sub> en la tabla → obtiene sus pertenencias
     → acota la petición al municipio (y a la asociación, si es org_editor)
```

Cognito responde a «quién eres». **Los permisos nunca salen del testigo**, salen de la tabla: si un
técnico deja el ayuntamiento, se borra su pertenencia y deja de tener acceso de inmediato, sin
esperar a que caduque ningún JWT.

### Vecinos

```
Primera apertura → POST /devices → Lambda crea DEV#<id> y devuelve un testigo firmado
Lecturas públicas → sin testigo, directas contra CloudFront
«Me interesa»     → con el testigo, autorizador Lambda propio
```

Sin Cognito, sin cuenta, sin correo. El testigo se firma con una clave guardada en Parameter Store.

### Voluntarios del directo

El ayuntamiento genera un código de un solo uso. El voluntario lo canjea por un testigo con validez
de unas horas y alcance de **una única sesión de directo**. No puede escribir en ningún otro sitio.

---

## 5. Aislamiento entre municipios

Lo que en Postgres garantizaba la seguridad por fila, aquí lo garantizan cuatro cosas en capas:

1. **La forma de las claves.** Toda consulta nombra su municipio en la clave de partición.
2. **Una sola capa de acceso** en `@agora/data`, donde ninguna función se puede invocar sin pasar el
   municipio. Lo imponen los tipos, no la disciplina de quien escribe.
3. **Índices dispersos**, que hacen inalcanzable lo que no está aprobado.
4. **Roles de IAM separados por Lambda**: la del panel no puede leer `gsi3`; la pública solo lee.

Cuando un piloto pida revisión de seguridad, se añade el quinto nivel: **políticas de sesión de IAM
con `dynamodb:LeadingKeys`**, que hacen que sea AWS y no tu código quien rechace el acceso a otro
municipio. Es el patrón que documenta AWS para SaaS multi-inquilino y es media tarde de trabajo.

Los tests de aislamiento **ya están portados**: `packages/store` los ejecuta contra DynamoDB Local y
la CI levanta uno en cada cambio (D-034). Son 29 y cubren lo mismo que los 23 de PostgreSQL, más lo
que aquí es nuevo: que aprobar mueve el evento de un índice al otro y que rechazar lo deja fuera de
los dos. Eso no se negocia: es el requisito que el documento de proyecto marca como prioridad
máxima.

---

## 6. Qué cuesta

| Servicio | Capa gratuita | ¿Permanente? |
| --- | --- | --- |
| Lambda | 1 M peticiones + 400.000 GB-s al mes | Sí |
| DynamoDB bajo demanda | 25 GB de almacenamiento | Sí |
| CloudFront | 1 TB de salida + 10 M peticiones al mes | Sí |
| Cognito | Miles de usuarios activos al mes | Sí |
| Parameter Store (SecureString) | Sin coste en el nivel estándar | Sí |
| API Gateway HTTP | 1 M peticiones al mes | Solo 12 meses |
| S3 | 5 GB | Solo 12 meses |

Pasado el primer año, lo único que empieza a contar son API Gateway (≈1 $ por millón de peticiones)
y S3 (céntimos). Con tres municipios piloto, **céntimos al mes**.

El terabyte gratuito de CloudFront es lo que hace viable el directo: los miles de vecinos que miran
una procesión pegan contra la caché, no contra tu Lambda. Con un TTL de 5 segundos en el endpoint
de posición, 5.000 personas consultando cada 5 segundos se convierten en **una petición cada cinco
segundos** contra el origen.

Lo primero que crea el Terraform es una **alarma de presupuesto**. Un proyecto autofinanciado no
puede enterarse del gasto a fin de mes.

La tabla no lleva recuperación a un instante: se paga por gigabyte y la restricción es que nada cueste
por existir (D-032). A cambio, un error propio sobre datos de producción no se puede deshacer, y eso
hay que resolverlo antes del primer piloto de verdad — son céntimos al mes y la línea está escrita en
`modules/data`. Lo que sí está puesto, por gratis, es la protección contra el borrado de la tabla.

Y una cuenta de CloudWatch tiene **diez alarmas gratuitas**, que es justo lo que cabe: el conjunto de
un entorno son nueve, así que las tiene producción y dev no (D-032). Con eso la factura de AWS de
`dev` y `prod` juntos se queda en céntimos.

---

## 7. Lo que falta por decidir

- **Nombre comercial y dominio** (decisión pendiente nº 1). Sin dominio propio, la página pública de
  evento se comparte con una URL de CloudFront, que en un WhatsApp queda mal. No bloquea nada
  técnico; se añade el día que haya nombre.
- **Notificaciones push.** Expo Push es gratis y ya usáis Expo; SNS sería más «AWS puro» y bastante
  más trabajo. Propuesta: Expo. No hay nada montado todavía: el planificador existe y la Lambda de
  recordatorios se ejecuta, pero no tiene por dónde enviar.
- ~~Migración de los datos semilla~~. Hecha: `pnpm --filter @agora/tools migrate-seed` carga la
  carpeta de un municipio en la tabla, y volver a ejecutarlo conserva los contadores (D-038).
