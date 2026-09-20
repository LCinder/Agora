#!/usr/bin/env bash
#
# Deploying this product, one step at a time.
#
# The steps are the ones in infra/terraform/README.md and nothing else: this file
# exists so they run in the right order, with the checks a person would forget at
# eleven at night, and so that "deploy it" is not six commands copied from a
# document that will drift from the code.
#
# What it will not do:
#
#   * Apply anything without showing the plan first and asking. There is no
#     --auto-approve in here, and prod asks you to type its name.
#   * Print a secret. It checks that the parameters are filled, never their value.
#   * Destroy. Nothing here removes infrastructure; that is `terraform destroy`,
#     typed on purpose, by a person who means it.
#
# Messages are in Spanish because a person reads them; the code is in English like
# the rest of the repository.
#
# Usage:
#   infra/deploy.sh status [dev|prod]     What exists and what is missing
#   infra/deploy.sh bootstrap             The state bucket, once per account
#   infra/deploy.sh infra  [dev|prod]     Build the functions and apply
#   infra/deploy.sh panel  [dev|prod]     Build the panel and upload it
#   infra/deploy.sh seed   [dev|prod] [slug]  Load content/ into the table
#   infra/deploy.sh all    [dev|prod]     infra, then panel
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT
readonly REGION_DEFAULT="eu-central-1"

# --- talking to a person ----------------------------------------------------

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
warn() { printf '\033[33m  %s\033[0m\n' "$1"; }
fail() {
  printf '\033[31m\n  %s\033[0m\n\n' "$1" >&2
  exit 1
}

step() {
  printf '\n'
  bold "▸ $1"
}

confirm() {
  local question="$1"
  local answer

  read -r -p "  ${question} [s/N] " answer
  [[ "${answer}" == "s" || "${answer}" == "S" ]]
}

# --- the environment we are working on --------------------------------------

environment_dir() {
  echo "${ROOT}/infra/terraform/envs/$1"
}

tf() {
  terraform -chdir="$(environment_dir "${ENVIRONMENT}")" "$@"
}

output_of() {
  tf output -raw "$1" 2>/dev/null || true
}

# The profile and the region come from the environment's own tfvars, so there is
# one place that names the account and it is the one Terraform already reads.
read_tfvar() {
  local name="$1"
  local file
  file="$(environment_dir "${ENVIRONMENT}")/terraform.tfvars"

  [[ -f "${file}" ]] || return 0

  sed -n "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*\"\([^\"]*\)\".*/\1/p" "${file}" | head -1
}

aws_profile() { read_tfvar aws_profile; }
aws_region() {
  local region
  region="$(read_tfvar region)"
  echo "${region:-${REGION_DEFAULT}}"
}

# Every AWS call goes through here so the profile and the region are never left
# to whatever the shell happens to have exported.
aws_cli() {
  local profile
  profile="$(aws_profile)"

  if [[ -n "${profile}" ]]; then
    aws --profile "${profile}" --region "$(aws_region)" "$@"
  else
    aws --region "$(aws_region)" "$@"
  fi
}

# --- checks -----------------------------------------------------------------

require_tool() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta $1. $2"
}

check_tools() {
  require_tool terraform "Instálalo desde https://developer.hashicorp.com/terraform/install (1.5 o posterior)."
  require_tool aws "Instala la CLI de AWS: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  require_tool pnpm "Instálalo con: corepack enable && corepack prepare pnpm@latest --activate"
  require_tool node "Hace falta Node 22 o posterior."
}

check_environment_name() {
  case "${ENVIRONMENT}" in
    dev | prod) ;;
    *) fail "El entorno es 'dev' o 'prod', no '${ENVIRONMENT}'." ;;
  esac

  [[ -d "$(environment_dir "${ENVIRONMENT}")" ]] ||
    fail "No existe infra/terraform/envs/${ENVIRONMENT}."
}

check_tfvars() {
  local file
  file="$(environment_dir "${ENVIRONMENT}")/terraform.tfvars"

  if [[ ! -f "${file}" ]]; then
    fail "Falta ${file}.
  Cópialo del ejemplo y rellena tu perfil, tu cuenta y tu correo:
    cp ${file}.example ${file}"
  fi

  local account
  account="$(read_tfvar aws_account_id)"

  [[ -n "${account}" && "${account}" != "000000000000" ]] ||
    fail "Pon tu número de cuenta real en aws_account_id, dentro de ${file}."
}

# The account Terraform will refuse to apply against is worth checking before the
# apply rather than after two minutes of plan.
check_credentials() {
  local expected actual
  expected="$(read_tfvar aws_account_id)"

  actual="$(aws_cli sts get-caller-identity --query Account --output text 2>/dev/null || true)"

  [[ -n "${actual}" ]] || fail "AWS no reconoce tus credenciales.
  Si usas un perfil con SSO: aws sso login --profile $(aws_profile)"

  [[ "${actual}" == "${expected}" ]] ||
    fail "Estás apuntando a la cuenta ${actual} y el entorno ${ENVIRONMENT} es de la ${expected}."

  info "Cuenta ${actual}, región $(aws_region)."
}

# Terraform zips whatever is in dist/ and compiles nothing, so a stale build is a
# deploy of yesterday's code with today's confidence.
build_functions() {
  step "Compilando las funciones"
  (cd "${ROOT}" && pnpm --filter @agora/functions build)
}

check_backend() {
  local file
  file="$(environment_dir "${ENVIRONMENT}")/main.tf"

  grep -qE '^\s*bucket\s*=' "${file}" || fail "El backend de ${ENVIRONMENT} todavía no tiene bucket.
  Ejecuta primero 'infra/deploy.sh bootstrap' y escribe el nombre que imprime en
  el bloque backend de ${file}."
}

# --- the steps --------------------------------------------------------------

do_bootstrap() {
  local dir="${ROOT}/infra/terraform/bootstrap"

  step "Estado remoto (una vez por cuenta)"

  if [[ ! -f "${dir}/terraform.tfvars" ]]; then
    fail "Falta ${dir}/terraform.tfvars.
  Cópialo del ejemplo y rellena perfil y cuenta:
    cp ${ROOT}/infra/terraform/terraform.tfvars.example ${dir}/terraform.tfvars"
  fi

  terraform -chdir="${dir}" init -input=false
  terraform -chdir="${dir}" plan -input=false -out=tfplan

  confirm "¿Aplico el plan de arriba?" || fail "Cancelado. No se ha creado nada."

  terraform -chdir="${dir}" apply -input=false tfplan
  rm -f "${dir}/tfplan"

  printf '\n'
  info "Escribe estos dos valores en el bloque backend de envs/dev/main.tf y envs/prod/main.tf:"
  info "  bucket         = \"$(terraform -chdir="${dir}" output -raw state_bucket)\""
  info "  dynamodb_table = \"$(terraform -chdir="${dir}" output -raw lock_table)\""
}

do_infra() {
  check_tfvars
  check_backend
  check_credentials
  build_functions

  step "Aplicando ${ENVIRONMENT}"

  tf init -input=false

  if [[ "${ENVIRONMENT}" == "prod" ]]; then
    local typed
    read -r -p "  Esto es PRODUCCIÓN. Escribe 'prod' para seguir: " typed
    [[ "${typed}" == "prod" ]] || fail "Cancelado."
  fi

  tf plan -input=false -out=tfplan
  confirm "¿Aplico el plan de arriba?" || fail "Cancelado. No se ha cambiado nada."
  tf apply -input=false tfplan
  rm -f "$(environment_dir "${ENVIRONMENT}")/tfplan"

  check_secrets
  check_site_url
}

# Reports which parameters are still empty, and how to fill each one. It never
# reads a value into a variable: whether it is filled is all this needs to know.
check_secrets() {
  step "Secretos en Parameter Store"

  local names
  names="$(tf output -json secret_parameters 2>/dev/null | node -e \
    'let raw="";process.stdin.on("data",(d)=>raw+=d).on("end",()=>{try{process.stdout.write(JSON.parse(raw).join("\n"))}catch{}})' || true)"

  [[ -n "${names}" ]] || {
    warn "No he podido leer la lista de parámetros. Míralos con: terraform output secret_parameters"
    return 0
  }

  local pending=0

  while IFS= read -r name; do
    [[ -n "${name}" ]] || continue

    local value
    value="$(aws_cli ssm get-parameter --name "${name}" --with-decryption \
      --query 'Parameter.Value' --output text 2>/dev/null || echo 'PENDIENTE')"

    if [[ -z "${value}" || "${value}" == "PENDIENTE" || "${value}" == "None" ]]; then
      warn "sin rellenar: ${name}"
      pending=$((pending + 1))
    else
      info "ok: ${name}"
    fi

    unset value
  done <<<"${names}"

  if ((pending > 0)); then
    printf '\n'
    warn "Hasta que estén rellenos, los carteles y los testigos de dispositivo no funcionan."
    info "La clave de firma se genera sola:"
    info "  aws ssm put-parameter --profile $(aws_profile) --region $(aws_region) \\"
    info "    --name /agora-${ENVIRONMENT}/device-token-key --type SecureString --overwrite \\"
    info "    --value \"\$(openssl rand -base64 48)\""
    info "Las de Gemini y Cloudflare se sacan de sus paneles; están en infra/terraform/README.md."
  fi
}

# The public event page needs its own absolute address for the Open Graph tags,
# and it cannot be read from the distribution because the page is one of its
# origins. So the first apply leaves it empty and this says so, once.
check_site_url() {
  local file url
  file="$(environment_dir "${ENVIRONMENT}")/terraform.tfvars"
  url="$(output_of site_url)"

  [[ -n "${url}" ]] || return 0

  if grep -qE '^\s*site_url\s*=' "${file}"; then
    return 0
  fi

  step "Dirección pública"
  info "El sitio está en ${url}"

  if confirm "¿Lo escribo en terraform.tfvars y vuelvo a aplicar? (lo piden las etiquetas de WhatsApp)"; then
    printf '\n# Añadido por infra/deploy.sh: la página de evento necesita su dirección absoluta.\nsite_url = "%s"\n' \
      "${url}" >>"${file}"

    tf plan -input=false -out=tfplan
    confirm "¿Aplico el plan de arriba?" || fail "Cancelado. La dirección ya está en tfvars; aplica cuando quieras."
    tf apply -input=false tfplan
    rm -f "$(environment_dir "${ENVIRONMENT}")/tfplan"
  else
    info "Cuando quieras: añade site_url = \"${url}\" a ${file} y vuelve a aplicar."
  fi
}

do_panel() {
  check_tfvars
  check_backend
  check_credentials

  local api bucket distribution pool client
  api="$(output_of api_endpoint)"
  bucket="$(output_of panel_bucket)"
  distribution="$(output_of distribution_id)"
  pool="$(output_of cognito_user_pool_id)"
  client="$(output_of cognito_client_id)"

  [[ -n "${api}" && -n "${bucket}" ]] ||
    fail "No hay salidas de Terraform todavía. Ejecuta primero: infra/deploy.sh infra ${ENVIRONMENT}"

  step "Compilando el panel"
  info "API: ${api}"

  (
    cd "${ROOT}"
    NEXT_PUBLIC_API_BASE_URL="${api}" \
      NEXT_PUBLIC_POSTER_API_BASE="${api}" \
      NEXT_PUBLIC_COGNITO_USER_POOL_ID="${pool}" \
      NEXT_PUBLIC_COGNITO_CLIENT_ID="${client}" \
      pnpm --filter @agora/web build:static
  )

  step "Subiendo a S3"
  aws_cli s3 sync "${ROOT}/apps/web/out" "s3://${bucket}" --delete

  if [[ -n "${distribution}" ]]; then
    step "Invalidando la caché de CloudFront"
    aws_cli cloudfront create-invalidation --distribution-id "${distribution}" \
      --paths '/*' --query 'Invalidation.Id' --output text
  fi

  printf '\n'
  info "Panel: $(output_of site_url)/"
}

do_seed() {
  check_tfvars
  check_backend
  check_credentials

  local table
  table="$(output_of table_name)"

  [[ -n "${table}" ]] ||
    fail "No hay tabla todavía. Ejecuta primero: infra/deploy.sh infra ${ENVIRONMENT}"

  step "Cargando municipios en ${table}"

  # Safe to repeat: it is an update that keeps the "Me interesa" counters (D-038).
  local arguments=(--table "${table}")
  [[ -n "${MUNICIPALITY}" ]] && arguments+=(--municipality "${MUNICIPALITY}")

  (
    cd "${ROOT}"
    AWS_PROFILE="$(aws_profile)" AWS_REGION="$(aws_region)" \
      pnpm --filter @agora/tools migrate-seed -- "${arguments[@]}"
  )
}

do_status() {
  check_environment_name

  step "Entorno ${ENVIRONMENT}"

  local file
  file="$(environment_dir "${ENVIRONMENT}")/terraform.tfvars"

  if [[ -f "${file}" ]]; then
    info "tfvars: sí"
  else
    warn "tfvars: falta (cópialo del .example)"
  fi

  if grep -qE '^\s*bucket\s*=' "$(environment_dir "${ENVIRONMENT}")/main.tf"; then
    info "backend: configurado"
  else
    warn "backend: sin bucket (ejecuta 'bootstrap' y escríbelo en main.tf)"
  fi

  if [[ ! -d "$(environment_dir "${ENVIRONMENT}")/.terraform" ]]; then
    warn "terraform init: sin ejecutar"

    return 0
  fi

  local api
  api="$(output_of api_endpoint)"

  if [[ -z "${api}" ]]; then
    warn "aplicado: no. Nada creado todavía."

    return 0
  fi

  info "API:      ${api}"
  info "Sitio:    $(output_of site_url)"
  info "Tabla:    $(output_of table_name)"
  info "Cognito:  $(output_of cognito_user_pool_id)"
  info "Fallidos: $(output_of failed_jobs_queue_url)"
}

# --- what was asked for -----------------------------------------------------

COMMAND="${1:-status}"
ENVIRONMENT="${2:-dev}"
MUNICIPALITY="${3:-}"

check_tools

case "${COMMAND}" in
  bootstrap)
    do_bootstrap
    ;;
  infra)
    check_environment_name
    do_infra
    ;;
  panel)
    check_environment_name
    do_panel
    ;;
  seed)
    check_environment_name
    do_seed
    ;;
  all)
    check_environment_name
    do_infra
    do_panel
    printf '\n'
    info "Falta cargar los municipios: infra/deploy.sh seed ${ENVIRONMENT}"
    ;;
  status)
    do_status
    ;;
  *)
    fail "No conozco '${COMMAND}'. Usa: status, bootstrap, infra, panel, seed o all."
    ;;
esac

printf '\n'
bold "Listo."
