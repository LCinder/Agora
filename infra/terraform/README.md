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
└─ lambda-src/     manejadores (ahora mismo, esqueletos)
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

```bash
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars      # rellena perfil, cuenta y correo
terraform init
terraform plan        # míralo antes de aplicar
terraform apply
```

### 4. Los secretos

Terraform los crea vacíos y tiene orden de ignorar su valor, para que **el secreto real nunca entre
en el fichero de estado**. Se escriben una vez con la CLI:

```bash
# Clave con la que se firman los testigos de los dispositivos
aws ssm put-parameter --profile <perfil> --region eu-central-1 \
  --name /agora-dev/device-token-key --type SecureString --overwrite \
  --value "$(openssl rand -base64 48)"

# Clave de la API de Claude, para el lector de carteles
aws ssm put-parameter --profile <perfil> --region eu-central-1 \
  --name /agora-dev/anthropic-api-key --type SecureString --overwrite \
  --value "sk-ant-..."
```

### 5. Confirmar el correo de alertas

AWS manda un correo de confirmación para la suscripción de SNS. Hasta que se acepte, las alarmas
no avisan a nadie.

## Desplegar el panel

El panel es un export estático. Tras compilarlo:

```bash
aws s3 sync apps/web/out "s3://$(terraform output -raw panel_bucket)" --delete --profile <perfil>
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw distribution_id)" \
  --paths "/*" --profile <perfil>
```

## Qué falta

- [ ] **Los manejadores de verdad.** `lambda-src/` son esqueletos que responden 501. El autorizador
      de dispositivos deniega todo, que es lo único seguro que puede hacer un esqueleto.
- [ ] **Portar los 23 tests de aislamiento** a DynamoDB Local y engancharlos a la CI.
- [ ] **Migrar los datos semilla** de `content/` a la tabla.
- [ ] **Dominio propio**, cuando haya nombre comercial (decisión pendiente nº 1). Hasta entonces la
      página pública de evento se comparte con una URL de CloudFront, que en un WhatsApp queda mal.
- [ ] **Políticas de sesión con `dynamodb:LeadingKeys`**, para que sea AWS y no el código quien
      rechace el acceso a otro municipio. Media tarde, y la pediría el primer piloto que haga
      revisión de seguridad.

## Nota sobre la versión de Terraform

Esta máquina tiene la 1.5.4, que es de 2023. Todo esto está escrito para funcionar con ella, y por
eso el estado se bloquea con una tabla de DynamoDB. Desde la 1.10 existe el bloqueo nativo en S3
(`use_lockfile = true`) y esa tabla se puede borrar.

Si actualizas, ten en cuenta que a partir de la 1.6 Terraform cambió a la licencia BUSL. Si eso os
importa, OpenTofu es el mismo lenguaje con licencia libre y esta configuración funciona igual.
