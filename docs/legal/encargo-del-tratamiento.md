# Contrato de encargo del tratamiento (artículo 28 RGPD)

> **Borrador.** Está redactado desde lo que el sistema hace de verdad —cada medida de seguridad de
> abajo corresponde a una decisión de `docs/decisiones.md`— pero **no lo ha revisado un abogado**.
> Antes de firmarlo con un ayuntamiento tiene que pasar por alguien de derecho digital y por la
> secretaría del propio ayuntamiento, que suele tener su propio modelo.
>
> Donde pone `[...]` van datos que todavía no existen: la razón social, el NIF, el domicilio y el
> correo. Se rellenan en `packages/core/src/company.json` para las páginas web y aquí a mano.

## Partes

- **Responsable del tratamiento:** el Ayuntamiento de `[MUNICIPIO]`, con CIF `[CIF]` y domicilio en
  `[DIRECCIÓN]`.
- **Encargado del tratamiento:** `[RAZÓN SOCIAL]`, con NIF `[NIF]` y domicilio en `[DIRECCIÓN]`.

## 1. Objeto

El encargado presta al responsable el servicio de agenda municipal de eventos descrito en el
contrato principal, lo que implica tratar por su cuenta los datos personales descritos en el anexo I
únicamente para prestarlo.

## 2. Duración

Mientras dure el contrato principal. A su terminación se aplica la cláusula 9.

## 3. Instrucciones del responsable

El encargado trata los datos **únicamente siguiendo instrucciones documentadas** del responsable,
incluidas las relativas a transferencias internacionales. El propio uso normal del servicio —crear
eventos, aprobarlos, enviar avisos, activar un directo— constituye instrucción documentada.

Si el encargado considera que una instrucción infringe la normativa de protección de datos, lo
comunicará de inmediato.

## 4. Obligaciones del encargado

1. No utilizar los datos para ningún fin propio, ni cederlos a terceros salvo lo previsto aquí.
2. Mantener la confidencialidad, también después de terminar el contrato, y garantizar que se
   comprometen a ella todas las personas autorizadas a tratar los datos.
3. Llevar el registro de actividades de tratamiento previsto en el artículo 30.2 del Reglamento.
4. Aplicar las medidas de seguridad del anexo II.
5. Asistir al responsable para responder a los derechos de las personas (anexo III) y en las
   evaluaciones de impacto y consultas previas que procedan.
6. **Notificar cualquier violación de seguridad sin dilación indebida y, en todo caso, antes de 24
   horas** desde que tenga constancia, con la información del artículo 33.3 que esté disponible.

## 5. Subencargados autorizados

El responsable autoriza a los siguientes, con los que el encargado tiene firmados contratos con las
mismas obligaciones:

| Subencargado                 | Para qué                                            | Dónde                 |
| ---------------------------- | --------------------------------------------------- | --------------------- |
| Amazon Web Services EMEA     | Alojamiento, base de datos, copias de seguridad     | Fráncfort (Alemania)  |
| Expo (650 Industries, Inc.)  | Entrega de las notificaciones a los móviles         | Estados Unidos        |
| Google (Gemini API)          | Lectura del cartel que sube el ayuntamiento         | Unión Europea         |
| Cloudflare (Workers AI)      | Dibujo de un cartel a petición del ayuntamiento     | Unión Europea         |

El encargado informará de cualquier alta o baja con **treinta días de antelación**, y el responsable
podrá oponerse por motivos razonables.

**Transferencia internacional:** el envío a Expo implica una transferencia a Estados Unidos, amparada
en las cláusulas contractuales tipo de la Comisión Europea. Lo que se transfiere es el testigo del
dispositivo y el texto del aviso; no viaja ningún dato identificativo, porque no existe.

## 6. Lugar del tratamiento

Los datos se alojan en la Unión Europea (región `eu-central-1`, Fráncfort), salvo la transferencia
descrita arriba.

## 7. Aislamiento entre municipios

El encargado garantiza que los datos de un municipio no son accesibles desde otro. La garantía está
implementada en cuatro capas y **se comprueba automáticamente en cada cambio del programa**:

1. La clave de partición de cada dato nombra su municipio, de modo que una consulta que no lo nombre
   no puede formularse.
2. Cada componente del programa se construye alrededor de un único municipio y no acepta otro como
   parámetro.
3. Las credenciales con las que se ejecuta cada petición del panel están limitadas, en la propia
   nube, a las particiones de su municipio.
4. Existe una batería de pruebas automáticas que intenta cruzar el límite y comprueba que falla.

## 8. Datos que el responsable no puede obtener

Por diseño, el encargado **no puede** facilitar al responsable la identidad de los vecinos que han
marcado un evento: el sistema guarda un identificador aleatorio por dispositivo y el rol que usa el
panel tiene denegado el acceso al índice que relaciona eventos con dispositivos. El responsable
recibe recuentos agregados, y los segmentos con menos de cinco dispositivos se muestran como
«menos de 5».

## 9. Al terminar el contrato

A elección del responsable, y en el plazo de treinta días:

- **Devolución:** entrega de todos los datos del municipio en formato JSON o CSV.
- **Supresión:** borrado de los datos y de las copias de seguridad, con certificado de destrucción.

Las copias de seguridad existentes se borran, como muy tarde, a los treinta días de la terminación,
que es su plazo de conservación.

---

## Anexo I — Datos tratados

| Categoría                          | Datos                                                                       | Personas afectadas             |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| Dispositivos de vecinos            | Identificador aleatorio, plataforma, idioma, testigo de notificaciones      | Vecinos y visitantes           |
| Actividad                          | Eventos marcados, municipios seguidos, contador diario de avisos            | Vecinos y visitantes           |
| Ubicación                          | Posición durante una sesión de directo, con consentimiento explícito        | Voluntarios de una procesión   |
| Cuentas del panel                  | Correo, nombre y apellidos, papel y municipio                               | Personal municipal, asociaciones |
| Registro de auditoría              | Quién creó, aprobó, rechazó o canceló qué, y cuándo                         | Personal municipal, asociaciones |

**No se tratan** nombre, apellidos, dirección, teléfono ni correo de los vecinos, ni su ubicación, ni
categorías especiales de datos del artículo 9.

## Anexo II — Medidas de seguridad

- Cifrado en tránsito (TLS) y en reposo, con claves gestionadas por el proveedor de nube.
- Autenticación del personal con contraseña de doce caracteres mínimo y testigos de una hora.
- Permisos por municipio leídos de la base de datos en cada petición, nunca del testigo: retirar un
  acceso es borrar una fila y surte efecto de inmediato.
- Principio de mínimo privilegio en cada componente, con denegación explícita del índice que
  relaciona eventos con dispositivos.
- Registro de auditoría de toda acción que modifica datos.
- Copias de seguridad diarias conservadas treinta días.
- Borrado automático de las posiciones de un directo al terminar y, en todo caso, a las 24 horas.
- Seudonimización desde el origen: de un vecino solo existe un identificador aleatorio.

## Anexo III — Asistencia en los derechos de las personas

| Derecho                    | Cómo se atiende                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Supresión                  | Desde Ajustes de la aplicación, borra el dispositivo y todo lo suyo en el servidor      |
| Acceso, rectificación      | Artículo 11 del Reglamento: no hay dato identificativo con el que localizar a la persona |
| Oposición a notificaciones | Desactivándolas en Ajustes o en el sistema operativo                                     |
| Cuentas del panel          | El encargado facilita, rectifica o suprime en 72 horas a petición del responsable        |
