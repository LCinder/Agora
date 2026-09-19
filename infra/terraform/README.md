# Infraestructura en AWS

Terraform de la Fase 2. La arquitectura y el porqué de cada decisión están en
[`docs/fase-2-aws.md`](../../docs/fase-2-aws.md).

**Nada de esto está aplicado todavía.** La Fase 0 sigue funcionando con los ficheros de `content/`.

## Antes de nada: la red de seguridad

Esta máquina tiene perfiles de AWS de varias cuentas ajenas al proyecto (`public-apis`,
`platform-connectors`, `saml`…) y la región por defecto es `eu-west-1`. Por eso:

- **`aws_profile` no tiene valor por defecto.** Hay que decirlo siempre.
- **`aws_account_id` es obligatorio** y se pasa como `allowed_account_ids` al proveedor. Si las
  credenciales apuntan a otra cuenta, Terraform falla al instante en vez de empezar a crear cosas
  donde no debe.

## Los dos nombres

- **`infra_name`** es el prefijo de todos los nombres físicos y vale `agora`. **No es el nombre
  comercial y no cambia cuando este cambie:** una tabla de DynamoDB no se renombra, Terraform la
  destruye y crea otra vacía. Ver [`docs/renombrar-la-app.md`](../../docs/renombrar-la-app.md).
- **`app_name`** es el nombre que se lee en el correo de invitación al panel, en el comentario de la
  distribución y en las alarmas. Si no se define, sale de `packages/core/src/brand.json`, que es el
  fichero que hay que editar el día que haya nombre.

## Estructura

```
infra/terraform/
├─ bootstrap/      bucket de estado y tabla de bloqueo (se aplica una vez)
├─ modules/
│  ├─ stack/       compone el entorno entero
│  ├─ data/        tabla única de DynamoDB
│  ├─ auth/        Cognito para personal municipal y asociaciones
│  ├─ api/         HTTP API, Lambdas y autorizadores
│  ├─ web/         CloudFront, panel estático y página pública de evento
│  ├─ storage/     bucket de carteles
│  ├─ jobs/        recordatorios programados
│  ├─ observability/  presupuesto y alarmas
│  └─ lambda/      una función con su rol, su política y su grupo de logs
├─ envs/
│  ├─ dev/
│  └─ prod/
└─ (los manejadores ya no están aquí: son apps/functions, en TypeScript, y esta
    configuración comprime su dist/ — ver D-035)
```

## Puesta en marcha

### 1. Estado remoto

```bash
cd infra/terraform/bootstrap
cp ../terraform.tfvars.example terraform.tfvars   # rellena perfil y cuenta
terraform init
terraform apply
```

Apunta las dos salidas: el nombre del bucket y el de la tabla de bloqueo.

### 2. Backend de cada entorno

Terraform no admite variables en el bloque `backend`, así que hay que escribirlo a mano una vez.
En `envs/dev/main.tf`, descomenta y rellena:

```hcl
backend "s3" {
  key            = "dev/terraform.tfstate"
  region         = "eu-central-1"
  encrypt        = true
  bucket         = "agora-tfstate-<tu-cuenta>"
  dynamodb_table = "agora-tfstate-lock"
  profile        = "<tu-perfil>"
}
```

### 3. Aplicar

Las funciones se compilan antes, porque Terraform comprime lo que encuentre y no compila nada:

```bash
pnpm --filter @agora/functions build
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars      # rellena perfil, cuenta y correo
terraform init
terraform plan        # míralo antes de aplicar
terraform apply
```

### 4. Cargar los municipios

La tabla se crea vacía. Los municipios de `content/` se cargan con:

```bash
pnpm --filter @agora/tools migrate-seed -- --table "$(terraform output -raw table_name)"
```

Con `--dry-run` cuenta sin escribir, y con `--municipality <slug>` carga uno solo. Volver a
ejecutarlo es seguro: es una actualización que **conserva los contadores de «Me interesa»**.

Ojo con una cosa: los eventos de la semilla están anclados al día en que se ejecuta, porque la demo
mantiene su calendario alrededor de hoy. Para un piloto de verdad, los eventos los mete el
ayuntamiento por el panel; esto es para tener algo que mirar mientras.

### 5. Los secretos

Terraform los crea vacíos y tiene orden de ignorar su valor, para que **el secreto real nunca entre
en el fichero de estado**. Se escriben una vez con la CLI:

```bash
# Clave con la que se firman los testigos de los dispositivos
aws ssm put-parameter --profile <perfil> --region eu-central-1 \
  --name /agora-dev/device-token-key --type SecureString --overwrite \
  --value "$(openssl rand -base64 48)"

# Gemini: lee el cartel y escribe la instrucción para dibujarlo
aws ssm put-parameter --profile <perfil> --region eu-central-1 \
  --name /agora-dev/gemini-api-key --type SecureString --overwrite \
  --value "AIza..."

# Cloudflare Workers AI: dibuja el cartel. El identificador de cuenta no es un
# secreto; el testigo sí, y solo necesita permiso de Workers AI.
aws ssm put-parameter --profile <perfil> --region eu-central-1 \
  --name /agora-dev/cloudflare-account-id --type String --overwrite \
  --value "..."
aws ssm put-parameter --profile <perfil> --region eu-central-1 \
  --name /agora-dev/cloudflare-api-token --type SecureString --overwrite \
  --value "..."
```

`terraform output secret_parameters` los lista con su nombre exacto.

### 6. Confirmar el correo de alertas

AWS manda un correo de confirmación para la suscripción de SNS. Hasta que se acepte, las alarmas
no avisan a nadie.

## Desplegar el panel

El panel es un export estático, y se compila con el script que excluye las partes que necesitan
servidor (D-031). La URL de la API se inyecta al compilar, porque los botones de cartel llaman a la
Lambda de carteles y no al propio panel:

```bash
cd ../..                                   # raíz del repositorio
export NEXT_PUBLIC_POSTER_API_BASE="$(terraform -chdir=infra/terraform/envs/dev output -raw api_endpoint)"
pnpm --filter @agora/web build:static       # deja el resultado en apps/web/out

cd infra/terraform/envs/dev
aws s3 sync ../../../../apps/web/out "s3://$(terraform output -raw panel_bucket)" --delete --profile <perfil>
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw distribution_id)" \
  --paths "/*" --profile <perfil>
```

Las URLs limpias (`/eventos/editar`) las resuelve una función de CloudFront, porque S3 leído por
origin access control no añade `.html` por su cuenta. Está en `modules/web/functions/`.

## Qué falta

- [x] **La API pública y la de dispositivos.** Hechas y probadas contra DynamoDB Local: calendario,
      municipios, evento visible, alta de dispositivo con testigo firmado, «Me interesa» y el
      autorizador. En `apps/functions/src/handlers/`.
- [x] **El panel.** Hecho y probado contra DynamoDB Local: eventos, bandeja de revisión con cambios
      pendientes, avisos, asociaciones, altas de personal, estadísticas y auditoría (D-040).
- [ ] **Invitar a una persona** implica crear su usuario en Cognito (`AdminCreateUser`) y quedarse con
      su `sub`. Hoy `POST /panel/.../staff` recibe el `sub` ya creado: falta la llamada a Cognito, el
      permiso de IAM para hacerla y el identificador del grupo de usuarios en el entorno.
- [x] **La página pública de evento y los carteles.** Hechos (D-041). La página se sirve desde la
      Lambda con sus etiquetas Open Graph, y los carteles comparten implementación con el panel.
- [ ] **`site_url` en el segundo apply.** La página de evento necesita su dirección absoluta para las
      etiquetas Open Graph, y no se puede leer de la distribución porque la propia página es uno de
      sus orígenes. Tras el primer `apply`, copia la salida `site_url` a `terraform.tfvars` y vuelve a
      aplicar. Sin ella la página funciona, pero comparte peor.
- [ ] **Reducir la foto antes de subirla.** El cartel viaja en base64 y el cuerpo de una petición no
      puede pasar de 10 MB, así que el límite está en 6 MB. Una foto de móvil suele pasarse: el panel
      debería reescalarla a unos 1500 píxeles antes de enviarla.
- [x] **El directo.** Hecho (D-043): sesiones, código de un solo uso, emisión del voluntario con el
      evento dentro del testigo, lectura cacheada para el vecino y borrado del rastro al terminar.
- [x] **Portar los tests de aislamiento** a DynamoDB Local y engancharlos a la CI. Hechos:
      `packages/store`, 29 tests, y la CI levanta un DynamoDB Local en cada cambio.
- [x] **Empaquetado de las Lambdas.** Hecho: `apps/functions` con esbuild, un directorio por función
      (D-035). Hay que compilar antes de aplicar, y el Terraform falla diciéndolo si no se ha hecho.
- [x] **Migrar los datos semilla** de `content/` a la tabla. Hecho: `apps/tools` (D-038).
- [ ] **Emisión del directo:** solo existe `GET /live/{eventId}`. Falta la ruta por la que el
      voluntario publica su posición y el canje del código por un testigo de sesión.
- [ ] **Notificaciones push.** Ni Expo Push ni SNS: el recordatorio se ejecuta pero no tiene por
      dónde salir. Es el único manejador que sigue en esqueleto, y está bloqueado por una decisión y
      no por código.
- [ ] **Dominio propio**, cuando haya nombre comercial (decisión pendiente nº 1). Hasta entonces la
      página pública de evento se comparte con una URL de CloudFront, que en un WhatsApp queda mal.
      Con dominio conviene además una distribución por nombre de host, y entonces el panel puede
      volver a tener su propia página de error.
- [ ] **Políticas de sesión con `dynamodb:LeadingKeys`**, para que sea AWS y no el código quien
      rechace el acceso a otro municipio. Media tarde, y la pediría el primer piloto que haga
      revisión de seguridad.
- [ ] **Cola de mensajes fallidos** en la Lambda de recordatorios, para no perder un envío si falla.

## Lo que comprueba la CI

`.github/workflows/ci.yml` ejecuta `terraform fmt -check` y `terraform validate` de los tres stacks
en cada cambio, con `-backend=false`: sin credenciales y sin estado, así que comprueba la
configuración, no la cuenta. La versión está fijada a 1.5.7.

## Nota sobre la versión de Terraform

Esta máquina tiene la 1.5.4, que es de 2023. Todo esto está escrito para funcionar con ella, y por
eso el estado se bloquea con una tabla de DynamoDB. Desde la 1.10 existe el bloqueo nativo en S3
(`use_lockfile = true`) y esa tabla se puede borrar.

Si actualizas, ten en cuenta que a partir de la 1.6 Terraform cambió a la licencia BUSL. Si eso os
importa, OpenTofu es el mismo lenguaje con licencia libre y esta configuración funciona igual.
