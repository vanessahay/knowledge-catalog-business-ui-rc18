#!/usr/bin/env bash
#
# deploy-gcp.sh - Automated Plug-and-Play Deployment Script for Google Cloud Run
# Knowledge Catalog Business Interface (v1.4.4) + BACEN RC 18/2025 Governance Framework
#

set -euo pipefail

echo "=============================================================================="
echo "🚀 Knowledge Catalog Business Interface (v1.4.4 + RC 18) - GCP Installer"
echo "=============================================================================="

# 1. Detect or prompt for GCP Project ID
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  read -r -p "📌 Enter the target GCP Project ID: " PROJECT_ID
else
  read -r -p "📌 Detected GCP Project [$PROJECT_ID]. Use this project? (Y/n): " CONFIRM_PROJ
  if [[ "$CONFIRM_PROJ" =~ ^[Nn]$ ]]; then
    read -r -p "📌 Enter the target GCP Project ID: " PROJECT_ID
  fi
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GCP Project ID is required."
  exit 1
fi

gcloud config set project "$PROJECT_ID"

# 2. Region
read -r -p "📌 Cloud Run Region [us-central1]: " REGION
REGION="${REGION:-us-central1}"

# 3. Google OAuth Client ID
read -r -p "📌 Google OAuth Web Client ID (e.g. 123456...apps.googleusercontent.com): " CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
  echo "❌ Error: Google OAuth Client ID is required for Google Sign-In."
  echo "👉 Create one at: https://console.cloud.google.com/auth/clients"
  exit 1
fi

# 4. Admin Email
read -r -p "📌 Application Admin Email [admin@example.com]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

# 5. Authentication Mode (User OAuth vs Service Account ADC)
echo ""
echo "🔐 Choose API Authentication Mode (same options as official Knowledge Catalog UI):"
echo "   [1] User OAuth Credentials (IS_SERVICE_ACCOUNT=false) - Each user queries GCP with their own IAM permissions (Recommended)"
echo "   [2] Dedicated Service Account (IS_SERVICE_ACCOUNT=true) - Cloud Run executes API calls via a dedicated Service Account"
read -r -p "📌 Select mode [1]: " AUTH_MODE
AUTH_MODE="${AUTH_MODE:-1}"

IS_SA="false"
SA_FLAG=()
SA_NAME="kc-business-ui-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if [ "$AUTH_MODE" = "2" ]; then
  IS_SA="true"
fi

SERVICE_NAME="${SERVICE_NAME:-knowledge-catalog-ui}"
REPO_NAME="${REPO_NAME:-knowledge-catalog-ui-repo}"

echo ""
echo "=============================================================================="
echo "⚙️  Deployment Summary:"
echo " 🔹 GCP Project      : $PROJECT_ID"
echo " 🔹 Cloud Run Region : $REGION"
echo " 🔹 Cloud Run Service: $SERVICE_NAME"
echo " 🔹 OAuth Client ID  : $CLIENT_ID"
echo " 🔹 Admin Email      : $ADMIN_EMAIL"
echo " 🔹 Service Account  : $IS_SA"
echo "=============================================================================="
read -r -p "👉 Proceed with build and deployment? (Y/n): " START_CONFIRM
if [[ "$START_CONFIRM" =~ ^[Nn]$ ]]; then
  echo "🛑 Deployment cancelled."
  exit 0
fi

echo ""
echo "🛠️  [1/5] Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com \
  bigquery.googleapis.com \
  dataplex.googleapis.com \
  datalineage.googleapis.com \
  dlp.googleapis.com \
  --project="$PROJECT_ID"

if [ "$IS_SA" = "true" ]; then
  echo ""
  echo "🔑 Configuring Service Account ($SA_EMAIL) with Knowledge Catalog fine-grained IAM roles..."
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$SA_NAME" \
      --display-name="Knowledge Catalog Business UI Service Account" \
      --project="$PROJECT_ID"
  fi

  for ROLE in \
    "roles/viewer" \
    "roles/dataplex.catalogViewer" \
    "roles/dataplex.viewer" \
    "roles/dataplex.dataScanDataViewer" \
    "roles/bigquery.metadataViewer" \
    "roles/bigquery.dataViewer" \
    "roles/bigquery.jobUser" \
    "roles/datalineage.viewer" \
    "roles/dlp.reader"; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="$ROLE" \
      --quiet >/dev/null 2>&1 || true
  done

  SA_FLAG=(--service-account="$SA_EMAIL")
fi

echo ""
echo "📦 [2/5] Ensuring Artifact Registry repository ($REPO_NAME) exists..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for Knowledge Catalog Business UI" \
    --project="$PROJECT_ID"
fi

echo ""
echo "🏗️  [3/5] Building container image with Google Cloud Build..."
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
gcloud builds submit . --tag "$IMAGE_TAG" --project="$PROJECT_ID"

echo ""
echo "🚀 [4/5] Deploying to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_TAG" \
  "${SA_FLAG[@]}" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances=5 \
  --concurrency=80 \
  --timeout=60s \
  --set-env-vars="VITE_API_URL=/api,VITE_API_VERSION=v1,VITE_ADMIN_EMAIL=${ADMIN_EMAIL},VITE_GOOGLE_PROJECT_ID=${PROJECT_ID},VITE_GOOGLE_CLIENT_ID=${CLIENT_ID},VITE_GOOGLE_REDIRECT_URI=/auth/google/callback,VITE_IS_SERVICE_ACCOUNT=${IS_SA},VITE_FEATURE_REQUEST_ACCESS=false,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},GCP_LOCATION=global,GCP_REGION=global,IS_SERVICE_ACCOUNT=${IS_SA}" \
  --project="$PROJECT_ID" \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)' --project="$PROJECT_ID")

echo ""
echo "=============================================================================="
echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "=============================================================================="
echo "🌐 Application URL: $SERVICE_URL"
echo ""
echo "⚠️  FINAL STEP — UPDATE GOOGLE OAUTH CREDENTIALS:"
echo "1. Open: https://console.cloud.google.com/auth/clients"
echo "2. Edit your Web OAuth Client ($CLIENT_ID)."
echo "3. Add to 'Authorized JavaScript origins':"
echo "   👉 $SERVICE_URL"
echo "4. Add to 'Authorized redirect URIs':"
echo "   👉 $SERVICE_URL"
echo "   👉 $SERVICE_URL/auth/google/callback"
echo "5. Save and open $SERVICE_URL"
echo "=============================================================================="
