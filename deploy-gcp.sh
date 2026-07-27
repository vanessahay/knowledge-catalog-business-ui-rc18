#!/usr/bin/env bash
#
# deploy-gcp.sh - Automated One-Click Deployment Script for GCP Organizations & Projects
# Knowledge Catalog & BigQuery Data Quality Business UI
#

set -e

echo "=============================================================================="
echo "🚀 Knowledge Catalog & BigQuery Data Quality UI - GCP Deployment Script"
echo "=============================================================================="

# 1. Get or prompt for GCP Project ID
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
fi

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  read -p "📌 Digite o ID do Projeto GCP onde deseja instalar: " PROJECT_ID
else
  read -p "📌 Projeto detectado: [$PROJECT_ID]. Confirmar? (Y/n): " CONFIRM
  if [[ "$CONFIRM" =~ ^[Nn]$ ]]; then
    read -p "📌 Digite o ID do Projeto GCP: " PROJECT_ID
  fi
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Erro: Project ID é obrigatório!"
  exit 1
fi

gcloud config set project "$PROJECT_ID"

# 2. Get Region
read -p "📌 Digite a Região GCP para o Cloud Run [us-central1]: " REGION
REGION=${REGION:-us-central1}

# 3. Get OAuth Client ID
read -p "📌 Digite o Google OAuth Client ID (ex: 123456...apps.googleusercontent.com): " CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
  echo "❌ Erro: OAuth Client ID é obrigatório para autenticação Google SignIn!"
  echo "👉 Crie um em: https://console.cloud.google.com/apis/credentials"
  exit 1
fi

# 4. Get Admin Email
read -p "📌 Digite o e-mail do Administrador da aplicação: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}

# 5. Service Name & Repo Name
SERVICE_NAME="knowledge-catalog-ui"
REPO_NAME="dataplex-ui-repo"

echo ""
echo "=============================================================================="
echo "⚙️  Configurações do Deploy:"
echo " 🔹 Projeto GCP       : $PROJECT_ID"
echo " 🔹 Região            : $REGION"
echo " 🔹 Serviço Cloud Run : $SERVICE_NAME"
echo " 🔹 OAuth Client ID   : $CLIENT_ID"
echo " 🔹 Admin Email       : $ADMIN_EMAIL"
echo "=============================================================================="
echo ""
read -p "👉 Iniciar instalação e deploy no GCP? (Y/n): " START_CONFIRM
if [[ "$START_CONFIRM" =~ ^[Nn]$ ]]; then
  echo "🛑 Deploy cancelado pelo usuário."
  exit 0
fi

echo ""
echo "🛠️  [1/5] Habilitando APIs necessárias no Google Cloud..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudresourcemanager.googleapis.com bigquery.googleapis.com dataplex.googleapis.com datacatalog.googleapis.com --project="$PROJECT_ID"

echo ""
echo "📦 [2/5] Verificando/Criando repositório no Artifact Registry ($REPO_NAME)..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location="$REGION" --description="Docker repository for Knowledge Catalog Business UI" --project="$PROJECT_ID"
  echo "✅ Repositório criado com sucesso!"
else
  echo "✅ Repositório já existe."
fi

echo ""
echo "🏗️  [3/5] Construindo a imagem Docker via Google Cloud Build..."
IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME:latest"
gcloud builds submit . --tag "$IMAGE_TAG" --project="$PROJECT_ID"

echo ""
echo "🚀 [4/5] Implantando a aplicação no Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_TAG" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars="VITE_API_URL=/api,VITE_API_VERSION=v1,VITE_ADMIN_EMAIL=$ADMIN_EMAIL,VITE_GOOGLE_PROJECT_ID=$PROJECT_ID,VITE_GOOGLE_CLIENT_ID=$CLIENT_ID,VITE_GOOGLE_REDIRECT_URI=/auth/google/callback,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCP_LOCATION=global,GCP_REGION=$REGION" \
  --project="$PROJECT_ID" \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)' --project="$PROJECT_ID")

echo ""
echo "=============================================================================="
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=============================================================================="
echo "🌐 URL da Aplicação: $SERVICE_URL"
echo ""
echo "⚠️  AÇÃO OBRIGATÓRIA PARA AUTENTICAÇÃO OAUTH:"
echo "1. Acesse o painel de credenciais OAuth: https://console.cloud.google.com/apis/credentials"
echo "2. Edite o seu Cliente OAuth ($CLIENT_ID)."
echo "3. Em 'Origens JavaScript autorizadas', adicione:"
echo "   👉 $SERVICE_URL"
echo "4. Em 'URIs de redirecionamento autorizados', adicione:"
echo "   👉 $SERVICE_URL/auth/google/callback"
echo "5. Salve e acesse o sistema!"
echo "=============================================================================="
