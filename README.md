# Knowledge Catalog Business Interface - v1.4.4 (+ Framework BACEN RC 18/2025)

Uma aplicação web open-source baseada no **[GoogleCloudPlatform/knowledge-catalog-business-user-interface (v1.4.4)](https://github.com/GoogleCloudPlatform/knowledge-catalog-business-user-interface)**, atualizada para as APIs mais recentes do **Google Cloud Knowledge Catalog** (anteriormente Dataplex Universal Catalog) e estendida com o **Painel Plug-and-Play de Governança Regulatória (Resolução Conjunta BACEN nº 18/2025 & LGPD)**.

---

## ✨ Principais Capacidades

1. **Catálogo Corporativo Completo (Upstream `v1.4.4`)**:
   - **Busca Semântica e Estruturada (`SearchEntries`)**: Descoberta de ativos BigQuery, Cloud Storage, Spanner, AlloyDB, Bigtable e Looker respeitando ACLs de origem.
   - **Glossários de Negócio (`Business Glossaries`)**: Carregamento sob demanda de glossários, categorias, termos, sinônimos e ativos vinculados.
   - **Navegação por Aspectos (`Browse by Aspects`)**: Filtragem por Aspect Types e suporte nativo ao novo aspecto de sistema `dataplex-types.global.data-quality-scorecard`.
   - **Data Products (`Produtos de Dados`)**: Visualização consolidada multi-projeto, contratos/SLAs e fluxo de solicitação de acesso (`VITE_FEATURE_REQUEST_ACCESS`).
   - **Linhagem e Insights de Tabelas**: Grafo interativo de linhagem em nível de tabela e coluna.

2. **Painel Plug-and-Play — Framework BACEN RC 18/2025 & LGPD (`/rc18-dashboard`)**:
   - **Visão 1 — Qualidade de Dados (Dataplex Auto DQ & `data-quality-scorecard`)**: Consolidação automática nas dimensões de **Acurácia**, **Completude** e **Consistência** via `DataScanServiceClient` (multi-região automático) e aspectos `data-quality-scorecard`.
   - **Visão 2 — Classificação & Sigilo Bancário (Sensitive Data Protection / Cloud DLP & Policy Tags)**: Leitura de perfis do Cloud DLP (`tableDataProfiles`) e inspeção automática de esquemas e **Policy Tags** de mascaramento dinâmico nas tabelas BigQuery do projeto.
   - **Visão 3 — Rastreabilidade & Linhagem Regulatória (Art. 8º — Data Lineage API)**: Descoberta de processos e elos de linhagem (`listProcesses` e `searchLinks`) ponta a ponta.
   - **Visão 4 — Governança Centralizada (`lookupContext`)**: Integração nativa com o Context Engine do Knowledge Catalog (`POST /v1/projects/*/locations/*:lookupContext`) exibindo metadados e o bundle YAML pronto para agentes de IA.
   - **Fallback Sintético Transparente**: Em projetos recém-criados ainda sem scans/perfis configurados, o painel sinaliza automaticamente o *Modo Referência Sintética* até que os primeiros ativos reais sejam criados.

---

## 🛡️ Permissões IAM no Knowledge Catalog (Modelo Fine-Grained 2026)

Com o desacoplamento de papéis IAM do **Knowledge Catalog**, papéis legados (`roles/viewer`, `roles/owner` ou apenas `roles/dataplex.viewer`) não concedem mais acesso implícito às entradas, aspectos e contextos do catálogo. Conceda aos usuários (modo OAuth) ou à Service Account do Cloud Run (modo Service Account):

| Papel IAM (`Role`) | Finalidade |
| :--- | :--- |
| `roles/dataplex.catalogViewer` | **Obrigatório** — Busca e leitura de Entries, EntryGroups, AspectTypes, Glossários e `lookupContext` no Knowledge Catalog. |
| `roles/dataplex.viewer` | Visualização de Data Products e recursos Dataplex. |
| `roles/dataplex.dataScanDataViewer` | Leitura dos resultados e regras dos DataScans de Qualidade e Perfilamento. |
| `roles/bigquery.metadataViewer` & `roles/bigquery.dataViewer` | Visibilidade de tabelas na busca ACL-aware, Policy Tags e amostras de dados. |
| `roles/bigquery.jobUser` | Execução de consultas de amostra/qualidade quando aplicável. |
| `roles/datalineage.viewer` | Consulta de grafos e processos na API Data Lineage (Onda 2 RC 18). |
| `roles/dlp.reader` | Leitura de perfis de dados sensíveis no Sensitive Data Protection / Cloud DLP (Onda 1 RC 18). |

---

## 🚀 Opção 1: Deploy Automatizado em 1 Comando no Cloud Run (Recomendado)

Qualquer usuário ou organização pode instalar a aplicação completa (Frontend + Backend em container único no Cloud Run) executando o instalador interativo no **Google Cloud Shell** ou terminal local com `gcloud`:

```bash
git clone https://github.com/vanessahay/knowledge-catalog-business-ui-rc18.git
cd knowledge-catalog-business-ui-rc18

chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

O script `deploy-gcp.sh`:
1. Detecta ou solicita o **GCP Project ID**, **Região** (`us-central1`, `southamerica-east1`, etc.) e **Google OAuth Client ID**.
2. Permite escolher entre **Modo OAuth do Usuário (`IS_SERVICE_ACCOUNT=false`)** ou **Modo Service Account (`IS_SERVICE_ACCOUNT=true`)** — criando e atribuindo automaticamente as roles IAM do Knowledge Catalog à Service Account caso o modo `2` seja escolhido.
3. Habilita todas as APIs necessárias (`dataplex`, `bigquery`, `datalineage`, `dlp`, `run`, `cloudbuild`, `artifactregistry`, `cloudresourcemanager`).
4. Constrói a imagem via Cloud Build e publica no Cloud Run com limites seguros de escala (`--max-instances=5`).

Ao final do deploy, adicione a URL gerada do Cloud Run (`https://seu-servico-xyz.run.app`) em **Authorized JavaScript origins** e **Authorized redirect URIs** (`https://seu-servico-xyz.run.app` e `https://seu-servico-xyz.run.app/auth/google/callback`) no seu cliente OAuth em `https://console.cloud.google.com/auth/clients`.

---

## 💻 Opção 2: Executando Localmente (Desenvolvimento)

Idêntico ao fluxo oficial do `GoogleCloudPlatform/knowledge-catalog-business-user-interface`:

### Pré-requisitos
- **Node.js v20+**
- Conta Google Cloud e um **OAuth 2.0 Client ID (Web Application)** configurado em `https://console.cloud.google.com/apis/credentials` com `http://localhost:5173` adicionado em *Authorized JavaScript origins* e *Authorized redirect URIs*.

### Passo 1: Instalar dependências da raiz (Frontend)
```bash
npm install
```

### Passo 2: Configurar variáveis de ambiente (`.env` e `backend/.env.test`)
Copie os templates de exemplo na raiz e na pasta `backend/`:

```bash
cp .env.example .env
cp backend/.env.example backend/.env.test
```

Edite `.env` (raiz):
```ini
VITE_API_URL="http://localhost:3000/api"
VITE_API_VERSION="v1"
VITE_ADMIN_EMAIL="seu-email@sua-empresa.com"
VITE_GOOGLE_PROJECT_ID="seu-projeto-gcp"
VITE_GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
VITE_GOOGLE_REDIRECT_URI="http://localhost:5173"
VITE_IS_SERVICE_ACCOUNT="false"
VITE_FEATURE_REQUEST_ACCESS="false"
```

Edite `backend/.env.test`:
```ini
GOOGLE_CLOUD_PROJECT_ID="seu-projeto-gcp"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"
GCP_LOCATION=global
GCP_REGION=global
IS_SERVICE_ACCOUNT=false
PORT=3000
```
> **Dica**: Com `IS_SERVICE_ACCOUNT=false`, todas as chamadas às APIs do Google Cloud utilizam o token OAuth do usuário logado. Se alterar para `IS_SERVICE_ACCOUNT=true`, execute antes `gcloud auth application-default login`.

### Passo 3: Iniciar o Backend (Terminal 1)
```bash
cd backend
npm install
npm start
```

### Passo 4: Iniciar o Frontend (Terminal 2, na raiz do projeto)
```bash
npm run dev
```
Acesse **`http://localhost:5173`** no navegador.

---

## ⚙️ Configuração Opcional de Projetos e Aspectos (`backend/configData.json`)

Assim como no repositório oficial `GoogleCloudPlatform/knowledge-catalog-business-user-interface` `v1.4.4`, você pode restringir a lista de projetos visíveis ou configurar os tipos de aspectos exibidos em **Browse by Aspects** editando `backend/configData.json` antes do build:

```json
{
  "aspectType": {
    "projects/PROJECT_NUMBER/locations/us-central1/entryGroups/@dataplex/entries/meu_aspect_aspectType": [
      "dominio",
      "classificacao"
    ]
  },
  "assets": {},
  "products": [],
  "projects": []
}
```
- Deixe `"projects": []` vazio para permitir a descoberta padrão nos projetos aos quais o usuário/service account possui acesso, ou informe IDs específicos (`["projeto-dados-1", "projeto-dados-2"]`) para restringir o escopo.

---

## 🛠️ Deploy Manual no Cloud Run (via CLI `gcloud`)

Caso prefira executar os comandos manualmente (sem `deploy-gcp.sh`):

```bash
export PROJECT_ID="seu-projeto-gcp"
export REGION="us-central1"
export REPO_NAME="knowledge-catalog-ui-repo"
export SERVICE_NAME="knowledge-catalog-ui"
export CLIENT_ID="seu-client-id.apps.googleusercontent.com"
export ADMIN_EMAIL="admin@sua-empresa.com"

gcloud config set project "$PROJECT_ID"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudresourcemanager.googleapis.com \
  bigquery.googleapis.com dataplex.googleapis.com datalineage.googleapis.com dlp.googleapis.com

gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker --location="$REGION"

gcloud builds submit . --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

gcloud run deploy "$SERVICE_NAME" \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances=5 \
  --concurrency=80 \
  --timeout=60s \
  --set-env-vars="VITE_API_URL=/api,VITE_API_VERSION=v1,VITE_ADMIN_EMAIL=${ADMIN_EMAIL},VITE_GOOGLE_PROJECT_ID=${PROJECT_ID},VITE_GOOGLE_CLIENT_ID=${CLIENT_ID},VITE_GOOGLE_REDIRECT_URI=/auth/google/callback,VITE_IS_SERVICE_ACCOUNT=false,VITE_FEATURE_REQUEST_ACCESS=false,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},GCP_LOCATION=global,GCP_REGION=global,IS_SERVICE_ACCOUNT=false"
```
