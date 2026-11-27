#!/usr/bin/env bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# deploy-gcp.sh — instalador interativo para o Cloud Run.
# Knowledge Catalog Business Interface (base upstream v1.4.4) + painel RC 18.
#
# O que este script cria/alterna no projeto informado:
#   - habilita APIs (Cloud Run, Cloud Build, Artifact Registry, Resource Manager, BigQuery,
#     Dataplex, Data Lineage);
#   - cria um repositório no Artifact Registry e uma conta de serviço dedicada para o runtime;
#   - constrói a imagem (Cloud Build) e publica um serviço Cloud Run.
#
# Modos de identidade (iguais aos do projeto upstream):
#   1) OAuth do usuário (padrão): cada chamada às APIs usa o token do usuário conectado.
#      A conta de serviço do runtime fica SEM papéis de dados.
#   2) Conta de serviço: todas as chamadas usam a conta de serviço do runtime. Atenção: neste
#      modo todo usuário autorizado a entrar no aplicativo enxerga o que a conta de serviço
#      enxerga. Por isso o script exige a lista de domínios de e-mail permitidos.

set -euo pipefail

echo "=============================================================================="
echo " Knowledge Catalog Business Interface + painel RC 18 — instalador (Cloud Run)"
echo "=============================================================================="

# 1. Projeto ---------------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  read -r -p "ID do projeto GCP de destino: " PROJECT_ID
else
  read -r -p "Projeto detectado [$PROJECT_ID]. Usar este projeto? (S/n): " CONFIRM_PROJ
  if [[ "$CONFIRM_PROJ" =~ ^[Nn]$ ]]; then
    read -r -p "ID do projeto GCP de destino: " PROJECT_ID
  fi
fi
if [ -z "$PROJECT_ID" ]; then
  echo "Erro: o ID do projeto é obrigatório." >&2
  exit 1
fi

# 2. Região ----------------------------------------------------------------------------------
read -r -p "Região do Cloud Run [us-central1]: " REGION
REGION="${REGION:-us-central1}"

# 3. OAuth Client ID -------------------------------------------------------------------------
read -r -p "OAuth Client ID (tipo Web application, termina em .apps.googleusercontent.com): " CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
  echo "Erro: o OAuth Client ID é obrigatório. Crie um em https://console.cloud.google.com/auth/clients" >&2
  exit 1
fi

# 4. E-mail do administrador -----------------------------------------------------------------
read -r -p "E-mail do administrador do aplicativo: " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
  echo "Erro: o e-mail do administrador é obrigatório (é o destinatário de feedback e suporte)." >&2
  exit 1
fi

# 5. Modo de identidade ----------------------------------------------------------------------
echo ""
echo "Modo de identidade para as chamadas às APIs do Google Cloud:"
echo "  [1] OAuth do usuário (recomendado): cada pessoa vê apenas o que o próprio IAM permite."
echo "  [2] Conta de serviço: todos os usuários do aplicativo veem o que a conta de serviço vê."
read -r -p "Modo [1]: " AUTH_MODE
AUTH_MODE="${AUTH_MODE:-1}"

IS_SA="false"
ALLOWED_EMAIL_DOMAINS="${ALLOWED_EMAIL_DOMAINS:-}"
if [ "$AUTH_MODE" = "2" ]; then
  IS_SA="true"
  echo ""
  echo "No modo conta de serviço é obrigatório restringir quem pode usar o aplicativo."
  read -r -p "Domínios de e-mail permitidos, separados por vírgula (ex.: suaempresa.com.br): " ALLOWED_EMAIL_DOMAINS
  if [ -z "$ALLOWED_EMAIL_DOMAINS" ]; then
    echo "Erro: informe ao menos um domínio para o modo conta de serviço." >&2
    exit 1
  fi
elif [ "$AUTH_MODE" != "1" ]; then
  echo "Erro: modo inválido (use 1 ou 2)." >&2
  exit 1
fi

SERVICE_NAME="${SERVICE_NAME:-knowledge-catalog-ui}"
REPO_NAME="${REPO_NAME:-knowledge-catalog-ui-repo}"
SA_NAME="${SA_NAME:-kc-business-ui-run}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "------------------------------------------------------------------------------"
echo " Projeto            : $PROJECT_ID"
echo " Região             : $REGION"
echo " Serviço Cloud Run  : $SERVICE_NAME"
echo " Conta de serviço   : $SA_EMAIL"
echo " OAuth Client ID    : $CLIENT_ID"
echo " Administrador      : $ADMIN_EMAIL"
echo " Modo conta serviço : $IS_SA"
[ -n "$ALLOWED_EMAIL_DOMAINS" ] && echo " Domínios permitidos: $ALLOWED_EMAIL_DOMAINS"
echo "------------------------------------------------------------------------------"
read -r -p "Prosseguir com a criação dos recursos e o deploy? (S/n): " START_CONFIRM
if [[ "$START_CONFIRM" =~ ^[Nn]$ ]]; then
  echo "Cancelado."
  exit 0
fi

echo ""
echo "[1/5] Habilitando APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com \
  bigquery.googleapis.com \
  dataplex.googleapis.com \
  datalineage.googleapis.com \
  --project="$PROJECT_ID"

echo ""
echo "[2/5] Conta de serviço dedicada do runtime ($SA_EMAIL)..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Knowledge Catalog Business UI (runtime)" \
    --project="$PROJECT_ID"
fi

if [ "$IS_SA" = "true" ]; then
  # Papéis somente de metadados. Leitura de DADOS das tabelas (amostras) não é concedida aqui:
  # se a instituição quiser esse recurso no modo conta de serviço, deve conceder
  # roles/bigquery.dataViewer e roles/bigquery.jobUser de forma consciente.
  for ROLE in \
    roles/browser \
    roles/dataplex.catalogViewer \
    roles/dataplex.viewer \
    roles/dataplex.dataScanDataViewer \
    roles/bigquery.metadataViewer \
    roles/datalineage.viewer; do
    echo "  concedendo $ROLE"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="$ROLE" \
      --condition=None \
      --quiet >/dev/null
  done
else
  echo "  modo OAuth do usuário: a conta de serviço do runtime fica sem papéis de dados."
fi

echo ""
echo "[3/5] Repositório no Artifact Registry ($REPO_NAME)..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Imagens do Knowledge Catalog Business UI" \
    --project="$PROJECT_ID"
fi

echo ""
echo "[4/5] Construindo a imagem (Cloud Build)..."
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
gcloud builds submit . --tag "$IMAGE_TAG" --project="$PROJECT_ID"

echo ""
echo "[5/5] Publicando no Cloud Run..."
# GOOGLE_OAUTH_CLIENT_ID faz o backend aceitar apenas tokens emitidos para este OAuth Client.
# O delimitador ## permite valores com vírgula (lista de domínios).
ENV_VARS="^##^VITE_API_URL=/api"
ENV_VARS+="##VITE_API_VERSION=v1"
ENV_VARS+="##VITE_ADMIN_EMAIL=${ADMIN_EMAIL}"
ENV_VARS+="##VITE_GOOGLE_PROJECT_ID=${PROJECT_ID}"
ENV_VARS+="##VITE_GOOGLE_CLIENT_ID=${CLIENT_ID}"
ENV_VARS+="##VITE_GOOGLE_REDIRECT_URI=/auth/google/callback"
ENV_VARS+="##VITE_IS_SERVICE_ACCOUNT=${IS_SA}"
ENV_VARS+="##VITE_FEATURE_REQUEST_ACCESS=false"
ENV_VARS+="##GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}"
ENV_VARS+="##GCP_LOCATION=global"
ENV_VARS+="##GCP_REGION=global"
ENV_VARS+="##IS_SERVICE_ACCOUNT=${IS_SA}"
ENV_VARS+="##GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}"
if [ -n "$ALLOWED_EMAIL_DOMAINS" ]; then
  ENV_VARS+="##ALLOWED_EMAIL_DOMAINS=${ALLOWED_EMAIL_DOMAINS}"
fi

# --allow-unauthenticated: o navegador precisa carregar a página de login; as rotas /api exigem
# token Google válido. Para restringir também o acesso à página, use --no-allow-unauthenticated
# com Identity-Aware Proxy.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_TAG" \
  --service-account="$SA_EMAIL" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances=5 \
  --concurrency=80 \
  --timeout=120s \
  --set-env-vars="$ENV_VARS" \
  --project="$PROJECT_ID" \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)' --project="$PROJECT_ID")

echo ""
echo "=============================================================================="
echo " Deploy concluído: $SERVICE_URL"
echo "=============================================================================="
echo "Último passo — no OAuth Client ($CLIENT_ID), em https://console.cloud.google.com/auth/clients:"
echo "  - Authorized JavaScript origins: $SERVICE_URL"
echo "  - Authorized redirect URIs     : $SERVICE_URL  e  $SERVICE_URL/auth/google/callback"
echo ""
echo "Se o login funcionar mas as chamadas /api retornarem 401 'not issued for this application',"
echo "confira se GOOGLE_OAUTH_CLIENT_ID no serviço é o mesmo Client ID usado na página."
echo ""
echo "Para ver o painel RC 18 com as 12 dimensões medidas em dados sintéticos, crie a demonstração:"
echo "  PROJECT_ID=$PROJECT_ID ./rc18-kit/criar-demo.sh"
