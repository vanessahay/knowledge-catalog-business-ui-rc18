# Knowledge Catalog Business Interface + Painel RC 18

Aplicação web baseada no projeto open source
[GoogleCloudPlatform/knowledge-catalog-business-user-interface](https://github.com/GoogleCloudPlatform/knowledge-catalog-business-user-interface)
(base: v1.4.4), com um painel adicional — rota **`/rc18-dashboard`** — que reúne **evidências técnicas** para as
12 dimensões de qualidade da informação da **Resolução Conjunta nº 18, de 28 de novembro de 2025** (Banco Central
do Brasil e Conselho Monetário Nacional), art. 2º, § 2º, incisos I a XII
([texto do normativo](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20Conjunta&numero=18)).

As funcionalidades de catálogo (busca, glossários, navegação por aspectos, produtos de dados e linhagem) são as do
projeto upstream — consulte o README dele para os detalhes.

> **O painel não atesta conformidade regulatória.** A Resolução não define métricas nem níveis mínimos por
> dimensão (o Banco Central do Brasil pode estabelecê-los — art. 10, I e II). Os números são indicadores técnicos
> de apoio à política de qualidade das informações da instituição. A associação de cada indicador a uma dimensão
> é uma escolha deste projeto: valide-a com a área de conformidade antes de usá-la em relatórios.

---

## O que o painel mostra

Todas as leituras são feitas por API, com a identidade configurada (veja [Identidade e permissões](#identidade-e-permissões)).
Nada é preenchido com valores presumidos: o que não foi medido aparece como "sem dados" ou "não medido".

| Inciso | Dimensão | Coleta nesta versão | Indicador | Fonte |
| :-- | :-- | :-- | :-- | :-- |
| I | Acessibilidade | Parcial | % de tabelas do escopo com contatos registrados | Knowledge Catalog — `GetEntry`, aspecto `contacts` |
| II | Acurácia | Automática | % de regras aprovadas (dimensões `ACCURACY` e `VALIDITY`) | Dataplex DataScans |
| III | Adaptabilidade | Sem coletor | — | — |
| IV | Clareza | Parcial | % de colunas com descrição (mais: tabelas com descrição e com o aspecto `overview`) | BigQuery (metadados); Knowledge Catalog |
| V | Comparabilidade | Sem coletor | — | — |
| VI | Completude | Automática | % de regras aprovadas (`COMPLETENESS` e `VOLUME`) | Dataplex DataScans |
| VII | Confiabilidade | Sem coletor | — | — |
| VIII | Consistência | Automática | % de regras aprovadas (`CONSISTENCY` e `UNIQUENESS`) | Dataplex DataScans |
| IX | Integridade | Sem coletor | — | — |
| X | Rastreabilidade | Parcial | % de tabelas do escopo com origem registrada | Data Lineage API — `SearchLinks` |
| XI | Relevância | Parcial | % de tabelas do escopo com consultas nos últimos 30 dias | Knowledge Catalog — aspecto `usage` |
| XII | Tempestividade | Parcial | % de regras aprovadas (`FRESHNESS`), quando existirem; cadência declarada (aspecto `refresh-cadence`) e última modificação apenas como informação | Dataplex DataScans; Knowledge Catalog; BigQuery |

- **Automática**: o indicador é a razão *regras aprovadas / regras executadas* na última execução dos DataScans — o
  mesmo critério do score do Dataplex. Regras configuradas e ainda não executadas ficam fora do cálculo e são
  contadas à parte.
- **Parcial**: o indicador cobre só parte da definição da dimensão; o cartão informa o limite de cada um.
- **Sem coletor**: a dimensão aparece como "não medido automaticamente". Ela passa a ter indicador quando houver
  regras de DataScan marcadas com a dimensão personalizada correspondente (veja abaixo).

O painel tem cinco visões: **12 dimensões**, **Qualidade por tabela** (regras e resultado por DataScan),
**Dados sensíveis** (complementar — não é uma das 12 dimensões), **Rastreabilidade** e **Knowledge Catalog**
(aspectos das entradas e a resposta do método `lookupContext`).

### Escopo

O escopo são as **tabelas do BigQuery com DataScan de qualidade de dados** no projeto configurado
(`GOOGLE_CLOUD_PROJECT_ID`) e na localização escolhida no painel. A Resolução trata das informações prestadas ao
Banco Central do Brasil; cabe à instituição garantir que as tabelas que alimentam essas informações tenham DataScans.

### Como preparar o ambiente para o painel ter o que mostrar

1. **Regras de qualidade** — crie DataScans de qualidade de dados (Dataplex) para as tabelas do escopo.
2. **Dimensões personalizadas** — o Dataplex aceita nomes de dimensão personalizados (maiúsculas, até 30
   caracteres). Regras marcadas com o nome de uma dimensão da Resolução entram no indicador dela:
   `ACESSIBILIDADE`, `ACURACIA`, `ADAPTABILIDADE`, `CLAREZA`, `COMPARABILIDADE`, `COMPLETUDE`, `CONFIABILIDADE`,
   `CONSISTENCIA`, `INTEGRIDADE`, `RASTREABILIDADE`, `RELEVANCIA`, `TEMPESTIVIDADE`. Exemplo de sintaxe em um
   arquivo de especificação de DataScan (a regra é ilustrativa — os testes de cada dimensão são definidos pela
   instituição):

   ```yaml
   rules:
   - dimension: INTEGRIDADE
     name: hash-de-carga-preenchido
     description: Toda linha carregada tem o hash de controle gerado na origem.
     column: hash_carga
     nonNullExpectation: {}
   ```

   Regras com dimensões que o painel não reconhece são listadas como "sem correspondência" e ficam fora dos
   indicadores.
3. **Descrições** — preencha a descrição das tabelas e das colunas no BigQuery (dicionário de dados — art. 3º,
   III, "c").
4. **Contexto de negócio no Knowledge Catalog** — registre nas entradas das tabelas os aspectos `contacts`
   (responsáveis), `overview` (documentação) e, se aplicável, `refresh-cadence`.
5. **Linhagem** — habilite a Data Lineage API no projeto: os serviços integrados (por exemplo, os jobs do
   BigQuery) passam a registrar os elos das execuções seguintes.

### Exportação de evidências

O botão **Baixar evidências (JSON)** salva o que está na tela (dimensões, regras por tabela, rastreabilidade e
dados sensíveis), com data e escopo, para apoiar a elaboração do relatório semestral (art. 3º, V, "b"). A
resposta do `lookupContext` não é incluída.

### Modo de exemplo

O botão **Ver exemplo sintético** mostra dados fictícios, sempre identificados como tal. Eles nunca substituem
dados reais: se uma API falhar, o painel mostra o erro em "diagnósticos" e deixa o indicador vazio.

---

## Identidade e permissões

| Modo | Quem chama as APIs | Quem vê o quê |
| :-- | :-- | :-- |
| OAuth do usuário (`IS_SERVICE_ACCOUNT=false`, padrão) | O token do usuário conectado | Cada pessoa vê o que o próprio IAM permite |
| Conta de serviço (`IS_SERVICE_ACCOUNT=true`) | A conta de serviço do Cloud Run | **Todos** os usuários do aplicativo veem o que a conta de serviço vê |

- No modo conta de serviço, restrinja quem pode usar o aplicativo com `ALLOWED_EMAIL_DOMAINS` (o instalador exige).
- Defina `GOOGLE_OAUTH_CLIENT_ID` no backend para que só sejam aceitos tokens emitidos para o OAuth Client do
  aplicativo (o instalador define).
- No modo OAuth do usuário, as chamadas contam para o projeto do OAuth Client: crie o OAuth Client no mesmo
  projeto do deploy ou habilite as APIs também no projeto dele.
- Os aspectos de perfil de dados e a resposta do `lookupContext` podem conter valores de exemplo dos dados
  (por exemplo, valores mais frequentes de uma coluna). Leve isso em conta ao escolher o modo conta de serviço.

Papéis que o instalador concede à conta de serviço no modo conta de serviço (no modo OAuth do usuário, cada
usuário precisa de acesso equivalente):

| Papel | Uso |
| :-- | :-- |
| `roles/browser` | Leitura do projeto |
| `roles/dataplex.catalogViewer` | Entradas, aspectos e `lookupContext` do Knowledge Catalog |
| `roles/dataplex.viewer` | Recursos do Dataplex (produtos de dados) |
| `roles/dataplex.dataScanDataViewer` | Regras e resultados dos DataScans |
| `roles/bigquery.metadataViewer` | Metadados de tabelas (descrições, Policy Tags) |
| `roles/datalineage.viewer` | Elos e processos da Data Lineage API |
| `roles/dlp.tableDataProfilesReader` | Contagem de perfis do Sensitive Data Protection (opcional) |

O painel RC 18 não consulta os dados das tabelas: lê metadados, resultados de regras e o contexto do catálogo.
A leitura de **dados** das tabelas (amostras do catálogo upstream) exige `roles/bigquery.dataViewer` e
`roles/bigquery.jobUser`, que o instalador não concede.

---

## Instalação no Cloud Run

### Opção 1 — instalador interativo

```bash
git clone https://github.com/vanessahay/knowledge-catalog-business-ui-rc18.git
cd knowledge-catalog-business-ui-rc18
./deploy-gcp.sh
```

Pré-requisitos: `gcloud` autenticado com permissão de administrar o projeto e um **OAuth Client ID** do tipo
*Web application* (https://console.cloud.google.com/auth/clients).

O script pergunta projeto, região, OAuth Client ID, e-mail do administrador e modo de identidade, e então:

1. habilita as APIs (Cloud Run, Cloud Build, Artifact Registry, Resource Manager, BigQuery, Dataplex, Data Lineage
   e Sensitive Data Protection);
2. cria uma conta de serviço dedicada para o runtime (`kc-business-ui-run`) — sem papéis de dados no modo OAuth do
   usuário;
3. cria o repositório no Artifact Registry, constrói a imagem com o Cloud Build e publica o serviço com
   `--max-instances=5`.

Ao final, cadastre a URL do serviço no OAuth Client: em *Authorized JavaScript origins* (`https://SEU-SERVICO.run.app`)
e em *Authorized redirect URIs* (`https://SEU-SERVICO.run.app` e `https://SEU-SERVICO.run.app/auth/google/callback`).

O serviço é publicado com `--allow-unauthenticated` porque o navegador precisa carregar a página de login; as rotas
`/api` exigem um token Google válido. Para restringir também o acesso à página, use `--no-allow-unauthenticated`
com o Identity-Aware Proxy.

### Opção 2 — comandos manuais

```bash
export PROJECT_ID="seu-projeto-gcp"
export REGION="us-central1"
export REPO_NAME="knowledge-catalog-ui-repo"
export SERVICE_NAME="knowledge-catalog-ui"
export CLIENT_ID="seu-client-id.apps.googleusercontent.com"
export ADMIN_EMAIL="admin@sua-empresa.com"
export SA_EMAIL="kc-business-ui-run@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com bigquery.googleapis.com dataplex.googleapis.com \
  datalineage.googleapis.com dlp.googleapis.com --project="$PROJECT_ID"

gcloud iam service-accounts create kc-business-ui-run \
  --display-name="Knowledge Catalog Business UI (runtime)" --project="$PROJECT_ID"

gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker --location="$REGION" --project="$PROJECT_ID"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
gcloud builds submit . --tag "$IMAGE" --project="$PROJECT_ID"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --service-account="$SA_EMAIL" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances=5 \
  --concurrency=80 \
  --timeout=120s \
  --set-env-vars="VITE_API_URL=/api,VITE_API_VERSION=v1,VITE_ADMIN_EMAIL=${ADMIN_EMAIL},VITE_GOOGLE_PROJECT_ID=${PROJECT_ID},VITE_GOOGLE_CLIENT_ID=${CLIENT_ID},VITE_GOOGLE_REDIRECT_URI=/auth/google/callback,VITE_IS_SERVICE_ACCOUNT=false,VITE_FEATURE_REQUEST_ACCESS=false,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},GCP_LOCATION=global,GCP_REGION=global,IS_SERVICE_ACCOUNT=false,GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}" \
  --project="$PROJECT_ID"
```

---

## Execução local (desenvolvimento)

Pré-requisitos: Node.js 20+ e um OAuth Client ID (*Web application*) com `http://localhost:5173` em
*Authorized JavaScript origins* e em *Authorized redirect URIs*.

```bash
npm install
cp .env.example .env                      # frontend
cp backend/.env.example backend/.env.test # backend
```

Edite os dois arquivos com o projeto e o OAuth Client ID. Depois:

```bash
# Terminal 1 — backend (porta 3000)
cd backend && npm install && npm start

# Terminal 2 — frontend (porta 5173), na raiz
npm run dev
```

Com `IS_SERVICE_ACCOUNT=false`, as chamadas usam o token do usuário conectado. Com `IS_SERVICE_ACCOUNT=true`,
usam as Application Default Credentials (`gcloud auth application-default login`).

---

## Rotas do painel RC 18

Todas exigem `Authorization: Bearer <token Google>` e aceitam `location` (uma região ou `global` para todas) e
`demo=true` (dados sintéticos).

| Rota | Conteúdo |
| :-- | :-- |
| `GET /api/v1/rc18/dimensions` | As 12 dimensões: definição literal, estado, indicadores, evidências e limites |
| `GET /api/v1/rc18/data-quality-dimensions` | Regras e resultados por tabela; entradas do Knowledge Catalog; `lookupContext` |
| `GET /api/v1/rc18/lineage-traceability` | Origens, processos e destinos registrados na Data Lineage API |
| `GET /api/v1/rc18/dlp-sensitive-data` | Policy Tags e colunas candidatas pelo nome (visão complementar) |

Falhas de API vêm no campo `diagnostics` de cada resposta.

---

## Testes

```bash
cd backend && npm test               # regras do painel e rotas (sem acesso à nuvem)
npx vitest run src/component/RC18    # painel renderizado com as respostas das rotas (na raiz)
npx vitest run                       # suíte completa do frontend
```

O teste do backend gera as respostas que o teste do frontend renderiza
(`src/component/RC18/__fixtures__/rc18-respostas.json`) e falha se elas ficarem desatualizadas. Para regenerar:
`UPDATE_RC18_FIXTURES=1 npm test` (em `backend/`).

---

## Limites conhecidos

- Um projeto por instalação (`GOOGLE_CLOUD_PROJECT_ID`).
- Até 50 DataScans de qualidade por consulta (cada um aponta para uma tabela); o painel avisa quando a lista é
  truncada.
- `lookupContext`: até 10 entradas por localização.
- Linhagem: primeira página de elos por tabela e até 3 processos por tabela.
- Adaptabilidade, comparabilidade, confiabilidade e integridade não têm coletor nesta versão.
- A visão de dados sensíveis usa Policy Tags (fato) e o nome das colunas (heurística); não inspeciona conteúdo. A
  contagem de perfis do Sensitive Data Protection é por região e abrange todas as tabelas do projeto.

### Estado de validação desta versão

- Validado com um projeto real, no modo OAuth do usuário: leitura dos DataScans, metadados do BigQuery, Data
  Lineage API, entradas do Knowledge Catalog e `lookupContext`, com os resultados conferidos com os do Dataplex.
- Validado com um token Google real: as restrições `GOOGLE_OAUTH_CLIENT_ID` (token emitido para outro aplicativo é
  recusado) e `ALLOWED_EMAIL_DOMAINS` (domínio fora da lista é recusado).
- Dimensões personalizadas: a API do Dataplex aceitou regras com `INTEGRIDADE` e `CONFIABILIDADE` na validação da
  especificação (`CreateDataScan` com `validateOnly=true`) e recusou nomes em minúsculas ou com mais de 30
  caracteres. A leitura do resultado de um DataScan real com dimensão personalizada ainda não foi validada.
- **Ainda não validado de ponta a ponta**: a execução real do instalador `deploy-gcp.sh` (só a sequência de
  comandos foi conferida, com um `gcloud` simulado), o modo conta de serviço e o uso com identidades de privilégio
  mínimo (a validação foi feita com um usuário administrador do projeto).

---

## Configuração opcional (`backend/configData.json`)

Como no projeto upstream, é possível restringir os projetos visíveis e escolher os aspectos exibidos em
*Browse by Aspects* editando `backend/configData.json` antes do build:

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

Deixe `"projects": []` vazio para a descoberta padrão ou informe os IDs dos projetos para restringir o escopo.
