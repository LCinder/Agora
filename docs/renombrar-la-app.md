# Cómo renombrar la aplicación

El nombre comercial está sin decidir y va a cambiar (decisión 1 del documento de proyecto). Este
documento es la lista de lo que hay que tocar el día que haya nombre, y está escrita para que sean
**dos ficheros y una línea de comandos**, no una búsqueda por todo el repositorio.

La decisión que lo hace posible es [D-030](decisiones.md#d-030--el-nombre-comercial-vive-en-un-solo-fichero-y-los-nombres-de-aws-no-lo-siguen).

## 1. El nombre que ve la gente

Edita **`packages/core/src/brand.json`**:

```json
{
  "name": "Nombre Nuevo",
  "slug": "nombre-nuevo",
  "scheme": "nombrenuevo",
  "androidPackage": "com.nombrenuevo.app",
  "iosBundleId": "com.nombrenuevo.app",
  "tagline": "Lo que pasa en tu pueblo"
}
```

Con eso cambian, sin tocar nada más:

| Dónde                              | Qué usa                                        |
| ---------------------------------- | ---------------------------------------------- |
| App móvil                          | Nombre en el lanzador, slug, esquema de enlaces, identificadores de tienda (`apps/mobile/app.config.ts`) |
| Panel web                          | Título del documento (`BRAND` desde `@agora/core`)                                                      |
| Enlaces compartidos                | `APP_SCHEME` y la URL pública por defecto (`apps/mobile/src/lib/config.ts`)                             |
| APK de la CI                       | Nombre del fichero y título de la release (`.github/workflows/android-build.yml`)                        |
| Correo de invitación al panel      | `app_name` en Terraform, que sale de este mismo fichero                                                 |

Comprueba que ha entrado donde debe:

```bash
# El nombre, el slug y los identificadores que resuelve Expo
pnpm --filter @agora/mobile exec expo config --type public | head -40

# Lint, tipos y tests de todo el monorepo
pnpm run check
```

## 2. Lo que NO se renombra

**`infra_name` se queda en `agora`.** Es el prefijo de los nombres físicos de AWS: la tabla de
DynamoDB, los buckets, el grupo de usuarios de Cognito, las funciones.

Una tabla de DynamoDB **no se puede renombrar**. Terraform no la renombra: la destruye y crea otra
vacía, y con ella se van los eventos, las asociaciones y los intereses de todos los municipios.
Con los buckets pasa lo mismo y con el grupo de usuarios de Cognito también (además, cambiarlo
invalidaría las contraseñas del personal municipal).

Por eso hay dos nombres: uno es la marca y el otro es una etiqueta interna que nadie ve. Si alguien
quiere que los recursos de AWS lleven el nombre nuevo, la respuesta es que no vale la pena: cuesta
una migración de datos y no lo ve ningún cliente.

## 3. Las tiendas

`androidPackage` e `iosBundleId` **son inmutables una vez publicada la app**. Si ya hay una ficha en
Google Play o en App Store con los identificadores antiguos, cambiarlos crea una aplicación nueva:
los vecinos que la tengan instalada no reciben la actualización. Antes de la primera publicación son
gratis de cambiar; después, no.

Ahora mismo no hay nada publicado, así que este es el momento bueno.

## 4. El dominio

El nombre trae dominio, y el dominio es lo que falta para que un enlace compartido por WhatsApp se
vea bien (hoy es una URL de CloudFront). Cuando lo haya:

1. Certificado en ACM, **en `us-east-1`**, que es de donde CloudFront los lee.
2. `aliases` y `viewer_certificate` en `modules/web`.
3. `allowed_origins` del entorno, con el origen real del panel.
4. `EXPO_PUBLIC_SITE_URL` en la app, para que los enlaces que genera apunten al dominio.

## 5. Opcional: el ámbito de los paquetes

Los paquetes del monorepo se llaman `@agora/core`, `@agora/data`, `@agora/i18n`. Son privados y no
se publican en ningún registro, así que el nombre no lo ve nadie de fuera. Renombrarlos es un
`find`/`replace` de un rato y no aporta nada al producto: hazlo solo si molesta al leer el código.
