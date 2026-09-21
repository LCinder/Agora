# Primer despliegue, paso a paso

Esto se hace **una vez**. Al acabar tendrás la infraestructura en marcha y un botón en
GitHub que despliega sin que exista ninguna clave de AWS en ningún sitio.

Léelo entero antes de empezar. Son unas dos horas la primera vez, y una hora de eso es
esperar a que CloudFront se propague.

> **Nunca pegues una clave de AWS en un chat, en un issue ni en un comentario.** Si
> alguna vez lo haces, bórrala en la consola de IAM en ese momento: una clave que ha
> pasado por un log es una clave quemada. Todo lo que se pide más abajo son nombres y
> números de cuenta, que no son secretos.

---

## Parte 0 — Lo que necesitas antes de empezar

- Una **tarjeta** y un **teléfono** para abrir la cuenta de AWS.
- Unos **20 minutos** sin interrupciones para la Parte 1, que es la que no conviene
  hacer a medias.
- El repositorio en GitHub, que ya lo tienes.

Nada de esto lo puedo hacer yo: abrir una cuenta de AWS pide una identidad legal y un
medio de pago, y ahí tienes que estar tú.

---

## Parte 1 — La cuenta de AWS y tu propio acceso

**1.1. Abre la cuenta** en https://aws.amazon.com → «Crear una cuenta de AWS». Usa un
correo que no sea el personal de nadie —algo como `aws@tudominio.es`— porque ese correo
**es** la cuenta y cambiarlo después es un trámite.

**1.2. Pon MFA a la cuenta raíz, ahora.** Consola → arriba a la derecha, tu nombre →
*Security credentials* → *Multi-factor authentication* → *Assign MFA device*. Usa la app
del móvil (Google Authenticator, 1Password, la que uses).

**1.3. No vuelvas a usar la cuenta raíz.** Es la única llave que no se puede limitar. A
partir de aquí trabajas con un usuario normal.

**1.4. Crea tu usuario administrador.** IAM → *Users* → *Create user*:

- Nombre: el tuyo, `maria` por ejemplo.
- Marca *Provide user access to the AWS Management Console*.
- *Attach policies directly* → `AdministratorAccess`.
- Crea el usuario y **pon MFA también a este**.

**1.5. Crea unas claves de acceso para tu terminal.** IAM → tu usuario → *Security
credentials* → *Create access key* → *Command Line Interface*. Guárdalas en un gestor de
contraseñas y luego:

```bash
aws configure --profile hoyq
# Access key ID, secret, región eu-central-1, formato json
```

Comprueba que funciona:

```bash
aws sts get-caller-identity --profile hoyq
```

Tiene que imprimir tu número de cuenta de doce dígitos. **Anótalo**, se usa cuatro veces
más abajo.

> Estas claves son las tuyas y solo salen de tu máquina. La CI no va a tener ninguna:
> de eso va la Parte 3.

---

## Parte 2 — El arranque: estado remoto y el rol de despliegue

Esto crea tres cosas que no vuelven a tocarse: el bucket donde vive el estado de
Terraform, la tabla de bloqueo, y el rol que va a usar GitHub.

**2.1. Instala las herramientas**, si no las tienes:

```bash
# Terraform 1.5.7 exactamente: es la última con licencia MPL y la versión
# para la que está escrita esta configuración.
terraform version   # debe decir v1.5.x
aws --version
```

**2.2. Rellena el tfvars del arranque:**

```bash
cd infra/terraform/bootstrap
cp ../terraform.tfvars.example terraform.tfvars
```

Ábrelo y pon:

```hcl
aws_profile       = "hoyq"                # el nombre que le diste en `aws configure`
aws_account_id    = "123456789012"        # el tuyo, de 1.5
github_repository = "LCinder/Agora"       # owner/nombre, tal cual
```

**2.3. Aplícalo:**

```bash
cd ../../..          # a la raíz del repositorio
infra/deploy.sh bootstrap
```

Te muestra el plan y pregunta. Di `s`. Debe crear **diez recursos**: el bucket del
estado con sus cuatro ajustes, la tabla de bloqueo, el proveedor OIDC, el rol de
despliegue y sus dos políticas. Si el plan quiere borrar algo, no sigas.

Al terminar imprime seis valores. **Cópialos a un sitio**, los necesitas en los dos
pasos siguientes:

```
bucket          = "agora-tfstate-123456789012"
dynamodb_table  = "agora-tfstate-lock"
AWS_DEPLOY_ROLE = arn:aws:iam::123456789012:role/agora-github-deploy
AWS_ACCOUNT_ID  = 123456789012
TF_STATE_BUCKET = agora-tfstate-123456789012
TF_LOCK_TABLE   = agora-tfstate-lock
```

**2.4. Escribe el bucket en los dos entornos.** Terraform no acepta variables en un
bloque `backend`, así que va a mano una vez. En `infra/terraform/envs/dev/main.tf` y en
`envs/prod/main.tf`:

```hcl
  backend "s3" {
    key            = "dev/terraform.tfstate"   # o prod/, según el fichero
    region         = "eu-central-1"
    encrypt        = true
    bucket         = "agora-tfstate-858351789763"
    dynamodb_table = "agora-tfstate-lock"
  }
```

**Ya está hecho en el repositorio** para la cuenta actual; solo hay que rehacerlo si
algún día se despliega en otra. El número de cuenta en el nombre del bucket **no es un
secreto**: no abre nada por sí solo.

No pongas `profile` ahí. Un bloque `backend` no lee variables, así que sería un literal:
nombraría el perfil local de una persona en un repositorio compartido y fallaría en la
CI, donde la identidad es un rol asumido. `infra/deploy.sh` exporta `AWS_PROFILE` desde
el tfvars del entorno, que es lo que el backend sí respeta.

---

## Parte 3 — Que GitHub pueda desplegar sin ninguna clave

Lo que acabas de crear en 2.3 incluye la confianza entre AWS y GitHub. Ahora solo hay
que decirle al repositorio a qué rol llamar.

**3.1. En GitHub:** *Settings* → *Secrets and variables* → *Actions* → pestaña
**Variables** (la de *Variables*, **no** la de *Secrets*) → *New repository variable*, y
crea estas:

| Nombre | Valor | Para qué |
| --- | --- | --- |
| `AWS_DEPLOY_ROLE` | el ARN de 2.3 | el rol que asume el workflow |
| `AWS_ACCOUNT_ID` | tus doce dígitos | comprobar que no se despliega en otra cuenta |
| `AWS_REGION` | `eu-central-1` | |
| `TF_STATE_BUCKET` | el bucket de 2.3 | |
| `TF_LOCK_TABLE` | `agora-tfstate-lock` | |
| `ALERT_EMAIL` | tu correo | avisos de presupuesto y alarmas |
| `ALLOWED_ORIGINS` | `["http://localhost:3000"]` | JSON tal cual, con corchetes |
| `SITE_URL` | déjala vacía por ahora | se rellena en 4.4 |

Son **variables y no secretos** a propósito: ninguna es una llave, y verlas en el log de
un workflow fallido ayuda en vez de preocupar.

**3.2. Pon una revisión a producción.** *Settings* → *Environments* → *New environment* →
`prod` → marca *Required reviewers* y ponte a ti y a tu socio. Crea también `dev`, sin
revisores.

Eso es lo que sustituye al «escribe `prod` para seguir» que pide el script en local: la
misma pregunta, hecha antes y por escrito.

**3.3. Comprueba que la confianza funciona**, antes de desplegar nada. En GitHub →
*Actions* → *Deploy* → *Run workflow* → entorno `dev`, «what» = `status`. Debe terminar
en verde diciendo «Cuenta 123456789012». Si falla ahí, el problema es el rol o la
variable, y no has tocado infraestructura.

---

## Parte 4 — El primer despliegue de verdad

**4.0. El tfvars del entorno**, si vas a aplicar desde tu máquina. La CI lo escribe
sola desde las variables del repositorio; en local hace falta el fichero:

```bash
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars
# y pon aws_profile = "hoyq", tu aws_account_id y tu alert_email
```

**4.1. Aplica la infraestructura.** *Actions* → *Deploy* → `dev` / `infra`.

Tarda unos 15 minutos, casi todo CloudFront. Al acabar, el paso «What exists now»
imprime las direcciones.

**4.2. Rellena las cuatro claves de Parameter Store.** Terraform las crea vacías, con el
valor `PENDIENTE`, y no vuelve a tocarlas. Desde tu terminal:

```bash
# La clave que firma los testigos de los móviles. La generas tú, ahora.
aws ssm put-parameter --profile hoyq --region eu-central-1 \
  --name /agora-dev/device-token-key --type SecureString --overwrite \
  --value "$(openssl rand -base64 32)"

# Las dos de los carteles. Saca las claves de sus paneles (las dos tienen plan
# gratuito): https://aistudio.google.com/apikey y el panel de Cloudflare.
aws ssm put-parameter --profile hoyq --region eu-central-1 \
  --name /agora-dev/gemini-api-key --type SecureString --overwrite --value "AI..."

aws ssm put-parameter --profile hoyq --region eu-central-1 \
  --name /agora-dev/cloudflare-account-id --type String --overwrite --value "..."

aws ssm put-parameter --profile hoyq --region eu-central-1 \
  --name /agora-dev/cloudflare-api-token --type SecureString --overwrite --value "..."
```

Si prefieres no dejarlas en el historial del shell, usa la consola web: Systems Manager →
Parameter Store → el parámetro → *Edit*.

**4.3. Sube el panel.** *Actions* → *Deploy* → `dev` / `panel`.

**4.4. Apunta `SITE_URL` a la dirección real.** El paso anterior imprime la URL de
CloudFront. Ponla en la variable `SITE_URL` del repositorio y vuelve a ejecutar
`dev` / `all`. Hace falta porque la página pública de un evento necesita su dirección
absoluta para las etiquetas de WhatsApp, y no se puede leer de la propia distribución.

**4.5. Carga los municipios.** *Actions* → *Deploy* → `dev` / `seed`.

**4.6. Da de alta tu primer ayuntamiento de verdad**, cuando lo tengas. Esto sí va desde
tu terminal, porque crea una cuenta de una persona:

```bash
pnpm --filter @agora/tools create-municipality -- \
  --table agora-dev --user-pool <el pool que imprimió 4.1> \
  --slug huetor-vega --name "Huétor Vega" --province Granada \
  --population 12000 --ine 18101 --lat 37.1258 --lon -3.5846 \
  --admin alcaldia@huetorvega.es --admin-name "Ana Ruiz" \
  --dry-run
```

Con `--dry-run` comprueba todo y no escribe nada. Quítalo cuando la salida te cuadre.
La persona recibe una contraseña temporal por correo y ya puede entrar al panel.

---

## Parte 5 — La app en el móvil

**5.1. Crea la cuenta de Expo** en https://expo.dev, crea un proyecto y copia su id.

**5.2. Pon las tres variables** donde construyas la app (tu `.env.local`, o los secretos
de EAS):

```
EXPO_PUBLIC_EAS_PROJECT_ID=...
EXPO_PUBLIC_API_BASE_URL=https://<la API de 4.1>
EXPO_PUBLIC_SITE_URL=https://<el sitio de 4.4>
```

**5.3. Comprueba que los permisos y los enlaces salen bien:**

```bash
pnpm --filter @agora/mobile check:native
```

Debe decir «3 permissions declared and nothing else; deep links: … claimed for /e/*».

**5.4. Para que el enlace compartido abra la app**, hacen falta dos valores de las
tiendas:

- **Android:** `eas credentials` → la huella **SHA-256** del certificado de firma.
- **iOS:** los diez caracteres del *Team ID* en App Store Connect.

Ponlos como variables `ANDROID_CERT_FINGERPRINT` y `APPLE_TEAM_ID` donde se construya el
panel, y el build escribe los dos ficheros `.well-known`. Sin ellos no escribe ninguno y
el enlace abre la web, que es el comportamiento correcto mientras no haya app publicada.

Después comprueba que la verificación pasa de verdad, porque falla en silencio:

```bash
adb shell pm get-app-links com.hoyq.app
# y el validador de Apple: https://app-site-association.cdn-apple.com/a/v1/<tu dominio>
```

---

## Si algo sale mal

| Síntoma | Casi siempre es |
| --- | --- |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | El `github_repository` del bootstrap no coincide con el repositorio, o estás ejecutando desde una rama que no es la que permite `github_deploy_refs`. |
| `AccessDenied` a mitad de un apply | Al rol le falta un permiso. Añádelo al `Allow` de `infra/terraform/bootstrap/github.tf`, aplica el bootstrap otra vez y repite. **No** añadas `AdministratorAccess`. |
| `Error acquiring the state lock` | Un despliegue anterior se cortó. Espera cinco minutos; si sigue, `terraform force-unlock <id>` con el id que dice el error. |
| `InvalidClientTokenId` en local | Tus claves o tu perfil. `aws sts get-caller-identity --profile hoyq`. |
| La app no carga eventos | `EXPO_PUBLIC_API_BASE_URL` sin poner, o `allowed_origins` sin la dirección del panel. |
| El enlace de WhatsApp abre el navegador teniendo la app | Falta uno de los dos ficheros `.well-known`, o la verificación no ha pasado. Ver 5.4. |

## Lo que cuesta

Con un municipio en uso normal esto cabe en la capa gratuita de AWS casi entero:
DynamoDB y Lambda por uso, CloudFront con su primer terabyte gratis, y las diez alarmas
de CloudWatch que son gratuitas por cuenta. Lo que se paga siempre es la copia de
seguridad diaria de producción, que para una tabla pequeña es menos de un céntimo al mes.
El aviso de presupuesto está puesto para que te enteres tú antes que la tarjeta.

## Después

- La guía completa de la infraestructura: [`infra/terraform/README.md`](../infra/terraform/README.md)
- Por qué cada cosa es como es: [`docs/decisiones.md`](decisiones.md)
- El guion de la demostración: [`docs/demo.md`](demo.md)
