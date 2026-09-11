# Base de datos — punto de partida de la Fase 2

**Esto no está en uso todavía.** La Fase 0 funciona con los ficheros de `content/` y no toca ninguna
base de datos. Estos ficheros son el punto de partida del MVP, escritos ahora por dos razones:

1. El aislamiento entre municipios es lo que el documento de proyecto marca como **prioridad
   máxima** y lo más caro de arreglar si se hace mal. Tenerlo pensado antes de escribir el backend
   evita rehacerlo después.
2. Es lo que hay que enseñar cuando un ayuntamiento pregunte por protección de datos. Sirve tanto
   para desarrollar como para vender.

Es **PostgreSQL a secas**: funciona en Supabase, en RDS o en un contenedor, así que escribirlo no
cierra la decisión de backend, que sigue abierta (D-001 en `docs/decisiones.md`).

## Ficheros

| Fichero        | Qué es                                                            |
| -------------- | ----------------------------------------------------------------- |
| `schema.sql`   | Tablas, tipos, restricciones e índices                            |
| `policies.sql` | Seguridad por fila: la frontera entre municipios                  |
| `tests.sql`    | 23 pruebas de aislamiento                                         |
| `verify.sh`    | Lo levanta todo en un PostgreSQL desechable y ejecuta las pruebas |

## Verificado, no supuesto

```bash
./infra/db/verify.sh    # necesita Docker
```

Levanta un PostgreSQL 17 limpio, aplica el esquema y las políticas, y ejecuta **23 pruebas de
aislamiento**. Las que más importan:

- Un técnico de un municipio no ve los borradores de otro, ni siquiera con una consulta sin filtro.
- Un técnico municipal **no puede leer `event_interests` en absoluto**.
- Una asociación no ve los eventos de otra asociación ni los borradores del ayuntamiento.
- Una asociación **no puede publicar directamente ni aprobarse sus propios eventos**. Si esto
  fallara, la bandeja de revisión sería decorativa.
- Un dispositivo no puede leer ni los intereses ni la fila de otro dispositivo.
- Quien no es nadie solo ve eventos publicados.

Las pruebas corren como un rol sin `BYPASSRLS`, porque el superusuario se salta la seguridad por
fila y haría pasar cualquier cosa.

## Las tres ideas que lo sostienen

**Todo dato pertenece a un municipio, y la base de datos lo impone.** La aplicación no es de fiar:
aunque una consulta salga sin filtro, solo devuelve las filas a las que quien pregunta tiene
derecho. Las políticas de `policies.sql` son esa garantía.

**Un vecino no es una persona, es un dispositivo.** La tabla `devices` no tiene nombre, ni email, ni
teléfono, y está así de vacía a propósito: es la primera que mirará un auditor. Un dispositivo solo
puede leerse a sí mismo, lo que impide que la tabla de intereses se convierta en un grafo social.

**El ayuntamiento no puede leer quién marcó qué.** No existe ninguna política que permita a un
usuario municipal leer `event_interests`. Los números llegan al panel por `event_daily_stats`, que
son agregados por día. No es una omisión: es la promesa que hace la política de privacidad, escrita
donde no se puede saltar por error.

## Lo que falta antes de usarlo

- [ ] **Cerrar D-001** (Supabase, AWS o Firebase). Solo afecta a las tres funciones de identidad
      del principio de `policies.sql`; el resto es portable.
- [x] **Tests de aislamiento.** Hechos y pasando (`tests.sql`). Habrá que ampliarlos según crezca
      el esquema, y engancharlos a la CI cuando exista un entorno con Docker.
- [ ] **Migraciones.** Estos ficheros son el estado deseado, no un historial de migraciones.
- [ ] **Borrado del detalle de `live_positions`** al terminar un evento, con el recorrido
      simplificado conservado. Es un requisito de RGPD, no una tarea de mantenimiento.
- [ ] **Retención y copias de seguridad**, y los datos alojados en la Unión Europea.
- [ ] Promoción automática a `published` de los eventos de asociaciones marcadas como de confianza
      (un trigger, para que la asociación no pueda otorgárselo ella misma).
