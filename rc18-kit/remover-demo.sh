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
# Kit RC 18 — remove o que ./criar-demo.sh criou.
#
# ATENÇÃO: apaga de forma definitiva os datasets ${PREFIX} e ${PREFIX}_origem (com todas as
# tabelas), o DataScan, o glossário e os vínculos da demonstração. Use as MESMAS variáveis
# usadas na criação. O script pede confirmação digitada antes de apagar.
#
# Uso:
#   PROJECT_ID=meu-projeto ./rc18-kit/remover-demo.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
BQ_LOCATION="${BQ_LOCATION:-US}"
DATAPLEX_LOCATION="${DATAPLEX_LOCATION:-us-central1}"
GLOSSARY_LOCATION="${GLOSSARY_LOCATION:-global}"
PREFIX="${PREFIX:-rc18_demo}"

if [ -z "$PROJECT_ID" ]; then
  echo "Defina PROJECT_ID." >&2
  exit 1
fi
if ! [[ "$PREFIX" =~ ^[a-z][a-z0-9_]{2,30}$ ]]; then
  echo "PREFIX inválido." >&2
  exit 1
fi

DS="$PREFIX"
DS_ORIGEM="${PREFIX}_origem"
ID_PREFIX="${PREFIX//_/-}"
SCAN_ID="${ID_PREFIX}-posicao-credito"
GLOSSARY_ID="${ID_PREFIX}-glossario"
ENTRY_LOCATION="$(printf '%s' "$BQ_LOCATION" | tr '[:upper:]' '[:lower:]')"

cat <<EOF
Serão APAGADOS do projeto ${PROJECT_ID}:
  - datasets do BigQuery ${DS} e ${DS_ORIGEM}, com todas as tabelas
  - DataScan ${SCAN_ID} (${DATAPLEX_LOCATION})
  - vínculos ${ID_PREFIX}-saldo-devedor e ${ID_PREFIX}-data-base (${ENTRY_LOCATION})
  - glossário ${GLOSSARY_ID} (${GLOSSARY_LOCATION}) e seus termos

Para confirmar, digite o ID do projeto:
EOF
read -r CONFIRMACAO
if [ "$CONFIRMACAO" != "$PROJECT_ID" ]; then
  echo "Confirmação não confere. Nada foi apagado."
  exit 1
fi

tentar() { "$@" || echo "  (não removido — talvez já não exista)"; }

echo "== Vínculos com termos do glossário"
TOKEN="$(gcloud auth print-access-token)"
for link in "${ID_PREFIX}-saldo-devedor" "${ID_PREFIX}-data-base"; do
  curl -sS -o /dev/null -w "  ${link}: HTTP %{http_code}\n" -X DELETE \
    -H "Authorization: Bearer ${TOKEN}" -H "x-goog-user-project: ${PROJECT_ID}" \
    "https://dataplex.googleapis.com/v1/projects/${PROJECT_ID}/locations/${ENTRY_LOCATION}/entryGroups/@bigquery/entryLinks/${link}"
done

echo "== Glossário"
for termo in saldo-devedor data-base; do
  tentar gcloud dataplex glossaries terms delete "$termo" --glossary="$GLOSSARY_ID" \
    --project="$PROJECT_ID" --location="$GLOSSARY_LOCATION" --quiet
done
tentar gcloud dataplex glossaries delete "$GLOSSARY_ID" --project="$PROJECT_ID" --location="$GLOSSARY_LOCATION" --quiet

echo "== DataScan"
tentar gcloud dataplex datascans delete "$SCAN_ID" --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" --quiet

echo "== Datasets do BigQuery"
tentar bq rm -r -f --dataset "${PROJECT_ID}:${DS}"
tentar bq rm -r -f --dataset "${PROJECT_ID}:${DS_ORIGEM}"

echo "Concluído."
