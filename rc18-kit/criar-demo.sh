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
# Kit RC 18 — demonstração com dados SINTÉTICOS.
#
# Cria, no seu projeto, um conjunto pequeno de dados fictícios e os recursos do Google Cloud
# que tornam mensuráveis no painel RC 18 as dimensões que dependem de evidência produzida pela
# instituição (adaptabilidade, comparabilidade, confiabilidade, integridade e tempestividade),
# além de contatos, documentação, termos de glossário e linhagem para a tabela de exemplo.
#
# O script só cria e atualiza: não apaga nada e pode ser executado mais de uma vez.
# Para remover o que ele cria, use ./remover-demo.sh.
#
# Uso:
#   PROJECT_ID=meu-projeto ./rc18-kit/criar-demo.sh
#
# Variáveis (opcionais, exceto PROJECT_ID quando não há projeto configurado no gcloud):
#   PROJECT_ID          projeto do Google Cloud
#   BQ_LOCATION         localização dos datasets do BigQuery        (padrão: US)
#   DATAPLEX_LOCATION   região do DataScan de qualidade de dados    (padrão: us-central1)
#   GLOSSARY_LOCATION   localização do glossário                    (padrão: global)
#   PREFIX              prefixo dos recursos criados                (padrão: rc18_demo)
#   EXTRA_BQ_LABEL      rótulo adicional nos jobs do BigQuery, no formato chave:valor
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
BQ_LOCATION="${BQ_LOCATION:-US}"
DATAPLEX_LOCATION="${DATAPLEX_LOCATION:-us-central1}"
GLOSSARY_LOCATION="${GLOSSARY_LOCATION:-global}"
PREFIX="${PREFIX:-rc18_demo}"

if [ -z "$PROJECT_ID" ]; then
  echo "Defina PROJECT_ID (ou configure o projeto com: gcloud config set project ...)." >&2
  exit 1
fi
if ! [[ "$PREFIX" =~ ^[a-z][a-z0-9_]{2,30}$ ]]; then
  echo "PREFIX deve ter de 3 a 31 caracteres: letras minúsculas, números e sublinhado." >&2
  exit 1
fi
for cmd in gcloud bq envsubst curl; do
  command -v "$cmd" >/dev/null || { echo "Comando necessário não encontrado: $cmd" >&2; exit 1; }
done

DS="$PREFIX"
DS_ORIGEM="${PREFIX}_origem"
ID_PREFIX="${PREFIX//_/-}"
SCAN_ID="${ID_PREFIX}-posicao-credito"
GLOSSARY_ID="${ID_PREFIX}-glossario"
# As entradas do BigQuery no Knowledge Catalog ficam na localização do dataset, em minúsculas.
ENTRY_LOCATION="$(printf '%s' "$BQ_LOCATION" | tr '[:upper:]' '[:lower:]')"
ENTRY_ID="bigquery.googleapis.com/projects/${PROJECT_ID}/datasets/${DS}/tables/posicao_credito"
ENTRY_NAME="projects/${PROJECT_ID}/locations/${ENTRY_LOCATION}/entryGroups/@bigquery/entries/${ENTRY_ID}"
export PROJECT_ID DS DS_ORIGEM BQ_LOCATION

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

passo() { printf '\n== %s\n' "$*"; }

bq_script() { # arquivo SQL com variáveis ${...}
  local labels=(--label rc18-kit:demo)
  if [ -n "${EXTRA_BQ_LABEL:-}" ]; then labels+=(--label "$EXTRA_BQ_LABEL"); fi
  # A saída do bq (que repete cada comando do script SQL) só é mostrada em caso de erro.
  # shellcheck disable=SC2016  # a lista de variáveis é para o envsubst, não para o shell
  if ! envsubst '${PROJECT_ID} ${DS_ORIGEM} ${DS} ${BQ_LOCATION}' < "$1" |
    bq query --project_id="$PROJECT_ID" --location="$BQ_LOCATION" --use_legacy_sql=false --format=none \
      "${labels[@]}" > "$WORKDIR/bq.log" 2>&1; then
    cat "$WORKDIR/bq.log" >&2
    echo "Falha ao executar $1." >&2
    exit 1
  fi
  echo "$1 executado."
}

# ── 1. Dados sintéticos ───────────────────────────────────────────────────────────────────────
passo "1/5 Dados sintéticos no BigQuery (${PROJECT_ID}: ${DS_ORIGEM} e ${DS}, em ${BQ_LOCATION})"
bq_script sql/01_dados_demo.sql
bq_script sql/02_revisoes_demo.sql

# ── 2. Regras de qualidade marcadas com as dimensões da Resolução ─────────────────────────────
passo "2/5 DataScan de qualidade de dados ${SCAN_ID} (${DATAPLEX_LOCATION})"
# shellcheck disable=SC2016
envsubst '${PROJECT_ID} ${DS}' < regras/rc18-regras-demo.yaml > "$WORKDIR/regras.yaml"
if gcloud dataplex datascans describe "$SCAN_ID" --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" >/dev/null 2>&1; then
  gcloud dataplex datascans update data-quality "$SCAN_ID" \
    --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" \
    --data-quality-spec-file="$WORKDIR/regras.yaml" >/dev/null
  echo "DataScan já existia: regras atualizadas."
else
  gcloud dataplex datascans create data-quality "$SCAN_ID" \
    --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" \
    --data-source-resource="//bigquery.googleapis.com/projects/${PROJECT_ID}/datasets/${DS}/tables/posicao_credito" \
    --data-quality-spec-file="$WORKDIR/regras.yaml" \
    --on-demand=true \
    --display-name="RC 18 — demonstração (posição de crédito)" \
    --description="Kit RC 18: regras de exemplo marcadas com as dimensões da Resolução Conjunta nº 18/2025. Dados sintéticos." \
    --labels=rc18-kit=demo >/dev/null
  echo "DataScan criado."
fi

JOB_NAME="$(gcloud dataplex datascans run "$SCAN_ID" --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" --format='value(job.name)')"
JOB_ID="${JOB_NAME##*/}"
echo "Execução iniciada: ${JOB_ID}"
STATE=""
for _ in $(seq 1 60); do
  STATE="$(gcloud dataplex datascans jobs describe "$JOB_ID" --datascan="$SCAN_ID" \
    --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" --format='value(state)')"
  case "$STATE" in
    SUCCEEDED) break ;;
    FAILED | CANCELLED)
      echo "A execução do DataScan terminou em ${STATE}. Veja: gcloud dataplex datascans jobs describe ${JOB_ID} --datascan=${SCAN_ID} --location=${DATAPLEX_LOCATION} --project=${PROJECT_ID}" >&2
      exit 1
      ;;
  esac
  sleep 10
done
if [ "$STATE" != "SUCCEEDED" ]; then
  echo "A execução do DataScan não terminou em 10 minutos (estado: ${STATE:-desconhecido})." >&2
  exit 1
fi
echo "Execução concluída."

# ── 3. Contatos e documentação na entrada da tabela (Knowledge Catalog) ───────────────────────
passo "3/5 Contatos e documentação da tabela no Knowledge Catalog (${ENTRY_LOCATION})"
ENTRY_FOUND=""
for _ in $(seq 1 30); do
  if gcloud dataplex entries describe "$ENTRY_ID" --entry-group=@bigquery \
    --project="$PROJECT_ID" --location="$ENTRY_LOCATION" >/dev/null 2>&1; then
    ENTRY_FOUND=1
    break
  fi
  sleep 10
done
if [ -z "$ENTRY_FOUND" ]; then
  echo "A entrada da tabela ainda não apareceu no catálogo. Rode o script de novo em alguns minutos." >&2
  exit 1
fi
gcloud dataplex entries update "$ENTRY_ID" --entry-group=@bigquery \
  --project="$PROJECT_ID" --location="$ENTRY_LOCATION" \
  --update-aspects=catalogo/aspectos-posicao-credito.json >/dev/null
echo "Aspectos contacts e overview gravados."

# ── 4. Glossário de negócios ──────────────────────────────────────────────────────────────────
passo "4/5 Glossário ${GLOSSARY_ID} (${GLOSSARY_LOCATION})"
GLOSSARY_NAME="projects/${PROJECT_ID}/locations/${GLOSSARY_LOCATION}/glossaries/${GLOSSARY_ID}"
if gcloud dataplex glossaries describe "$GLOSSARY_ID" --project="$PROJECT_ID" --location="$GLOSSARY_LOCATION" >/dev/null 2>&1; then
  echo "Glossário já existia."
else
  gcloud dataplex glossaries create "$GLOSSARY_ID" --project="$PROJECT_ID" --location="$GLOSSARY_LOCATION" \
    --display-name="RC 18 — glossário de demonstração" \
    --description="Kit RC 18: definições padronizadas dos conceitos usados nas informações de demonstração. Conteúdo fictício." \
    --labels=rc18-kit=demo >/dev/null
  echo "Glossário criado."
fi

criar_termo() { # id, nome, descrição
  if gcloud dataplex glossaries terms describe "$1" --glossary="$GLOSSARY_ID" \
    --project="$PROJECT_ID" --location="$GLOSSARY_LOCATION" >/dev/null 2>&1; then
    echo "Termo $1 já existia."
  else
    gcloud dataplex glossaries terms create "$1" --glossary="$GLOSSARY_ID" \
      --project="$PROJECT_ID" --location="$GLOSSARY_LOCATION" \
      --parent="$GLOSSARY_NAME" --display-name="$2" --description="$3" >/dev/null
    echo "Termo $1 criado."
  fi
}
criar_termo saldo-devedor "Saldo devedor" "Valor devido pelo cliente na data-base, na moeda da operação, sem dedução de provisões."
criar_termo data-base "Data-base" "Último dia do mês a que a posição se refere."

# ── 5. Vínculo das colunas com os termos (entry links do tipo "definition") ───────────────────
passo "5/5 Vínculo das colunas com os termos do glossário"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
TOKEN="$(gcloud auth print-access-token)"

vincular() { # coluna, termo
  local link_id="${ID_PREFIX}-$2"
  # A entrada de um termo de glossário usa o NÚMERO do projeto.
  local term_entry="projects/${PROJECT_NUMBER}/locations/${GLOSSARY_LOCATION}/entryGroups/@dataplex/entries/projects/${PROJECT_NUMBER}/locations/${GLOSSARY_LOCATION}/glossaries/${GLOSSARY_ID}/terms/$2"
  cat > "$WORKDIR/link.json" <<EOF
{
  "entryLinkType": "projects/dataplex-types/locations/global/entryLinkTypes/definition",
  "entryReferences": [
    {"name": "${ENTRY_NAME}", "path": "Schema.$1", "type": "SOURCE"},
    {"name": "${term_entry}", "type": "TARGET"}
  ]
}
EOF
  local code
  code="$(curl -sS -o "$WORKDIR/resposta.json" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-goog-user-project: ${PROJECT_ID}" \
    -H 'Content-Type: application/json' \
    --data-binary "@$WORKDIR/link.json" \
    "https://dataplex.googleapis.com/v1/projects/${PROJECT_ID}/locations/${ENTRY_LOCATION}/entryGroups/@bigquery/entryLinks?entryLinkId=${link_id}")"
  case "$code" in
    200) echo "Coluna $1 vinculada ao termo $2." ;;
    409) echo "Vínculo da coluna $1 com o termo $2 já existia." ;;
    *)
      echo "Falha ao vincular a coluna $1 ao termo $2 (HTTP ${code}):" >&2
      cat "$WORKDIR/resposta.json" >&2
      exit 1
      ;;
  esac
}
vincular valor_saldo saldo-devedor
vincular data_base data-base

SCORE="$(gcloud dataplex datascans describe "$SCAN_ID" --project="$PROJECT_ID" --location="$DATAPLEX_LOCATION" \
  --view=full --format='value(dataQualityResult.score)' 2>/dev/null || true)"

cat <<EOF

Pronto. Recursos da demonstração no projeto ${PROJECT_ID}:
  BigQuery ........... datasets ${DS_ORIGEM} e ${DS} (${BQ_LOCATION})
  Dataplex ........... DataScan ${SCAN_ID} (${DATAPLEX_LOCATION}) — regras aprovadas: ${SCORE:-ver no console}%
  Knowledge Catalog .. contatos e documentação na entrada de ${DS}.posicao_credito
                       glossário ${GLOSSARY_ID} (${GLOSSARY_LOCATION}) e 2 colunas vinculadas

Abra o painel RC 18 (/rc18-dashboard) e clique em "Atualizar". A origem registrada da tabela (cartão
Rastreabilidade e etiqueta Linhagem) aparece alguns minutos depois da criação (registro da Data Lineage API).
Parte das regras reprova de propósito — veja "Resultado esperado" em rc18-kit/README.md.
EOF
