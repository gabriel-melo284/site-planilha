# Agenda

Um app web (PWA) que junta numa tela só:

- **Trabalho**: as reuniões do seu **Outlook**, que entram sozinhas pelo calendário publicado (ICS). Ninguém precisa mudar nada: quem te convida continua usando o Outlook.
- **Vida pessoal**: os compromissos do seu **Google Agenda**, com leitura e escrita, e você escolhe quais agendas aparecem.
- **Demandas**: as tarefas do **Google Tasks**, com prazo, e você pode **reservar horário no calendário** para elas.

Funciona no computador e no celular (dá para instalar na tela inicial), com tema claro ou escuro.

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Hoje** | Resumo do dia: próximo compromisso com contagem regressiva e botão **Entrar na reunião** (Teams/Meet/Zoom), agenda do dia, prévia de amanhã, demandas que vencem hoje ou já atrasaram, e conflitos dos próximos 7 dias |
| **Calendário** | Visões **Dia**, **Semana**, **Mês** e **Lista**. Clique num horário vazio para criar um compromisso, ou arraste (no computador) para escolher o intervalo. No celular, deslize para os lados para trocar de período |
| **Conflitos** | Aviso quando um compromisso pessoal bate com uma reunião do trabalho, tanto no calendário quanto na hora de criar |
| **Criar** | Um único botão **+ Novo** (canto superior, em todas as abas) com título, **data, início e fim**. Ative **É uma demanda** para que o item também apareça na aba Demandas, com opção de concluir. Tem também **Sugerir horário livre** |
| **Demandas** | Resumo (atrasadas, hoje, próximas, concluídas), filtro Pendentes/Concluídas, várias listas e conclusão com um toque. Cada demanda mostra o dia e o horário. As que têm horário viram um bloco no calendário (Google Agenda), ligado à tarefa no Google Tasks |
| **Busca** | Na visão Lista, procura compromissos e demandas nos últimos 60 dias e nos próximos 6 meses |
| **Lembretes** | Aviso antes dos compromissos e um resumo diário das demandas, enquanto o app estiver aberto (mesmo em segundo plano) |
| **Sincronização** | Automática a cada X minutos, ao voltar para o app e ao reconectar à internet. Funciona offline com o último dado baixado |
| **Vários dispositivos** | Um link de configuração leva a conexão (ponte + Google) do computador para o celular |
| **Atalhos** | `T` hoje · `D` dia · `S` semana · `M` mês · `L` lista · `←` `→` navegar · `N` novo · `Esc` fechar |
| **Demonstração** | Botão **Ver demonstração** para experimentar com dados fictícios, sem configurar nada |

### Como funciona

```
 Outlook (trabalho) ──ICS──┐
                           ▼
                   Cloudflare Worker  ◄── guarda o link ICS e o segredo do Google
                   (a "ponte")
                           ▲
 Google Agenda/Tasks ◄─────┼──────── App Agenda (GitHub Pages, no seu navegador)
   (API, com login)        │
```

- O app é só HTML, CSS e JavaScript, sem servidor próprio, e fica hospedado de graça no GitHub Pages.
- A **ponte** (um Cloudflare Worker gratuito) existe por dois motivos: o navegador não consegue ler o link do Outlook direto (bloqueio CORS), e o login do Google precisa de um segredo que não pode ficar no código público.
- Seus dados **não** ficam no código nem no GitHub. Ficam no Outlook, no Google e no cache do seu navegador.

---

## Configuração (cerca de 20 minutos, só uma vez)

### 1. Publicar o app no GitHub Pages

1. Junte este branch ao `main` (abra e aprove o Pull Request).
2. No GitHub, abra o repositório e vá em **Settings → Pages → Build and deployment → Source** e escolha **GitHub Actions**.
3. A cada push no `main`, o workflow roda os testes e publica o app. O endereço fica assim:
   **`https://gabriel-melo284.github.io/site-planilha/`**

> Abra o endereço e clique em **Ver demonstração** para conferir que está tudo no ar.

### 2. Pegar o link ICS do Outlook

1. Abra o **Outlook na Web** (outlook.office.com) com a conta do trabalho.
2. Vá em **Configurações (⚙️) → Calendário → Calendários compartilhados**.
3. Em **Publicar um calendário**, escolha **Calendário** e a permissão **Pode exibir todos os detalhes**, depois clique em **Publicar**.
4. Copie o **link ICS** (termina em `.ics`).

> Algumas empresas desativam essa opção. Se ela não aparecer, peça à TI para liberar a "publicação de calendário".
> Com a permissão "Pode exibir somente disponibilidade", as reuniões aparecem só como "Ocupado", sem título.
> Trate o link como uma senha, porque quem tem o link vê a sua agenda. Ele fica guardado só na ponte, nunca no app.

### 3. Criar o login do Google (Google Cloud)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) e crie um projeto (por exemplo, "Agenda").
2. Em **APIs e serviços → Biblioteca**, ative a **Google Calendar API** e a **Google Tasks API**.
3. Em **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform"):
   - Tipo **Externo**, com o nome do app "Agenda" e o seu e-mail.
   - Em **Público-alvo**, clique em **Publicar app** para colocá-lo **Em produção**. No modo "Teste", o Google desconecta a cada 7 dias. Como o app é só seu, não precisa passar por verificação: no primeiro login vai aparecer "O Google não verificou este app", e você clica em **Avançado → Acessar Agenda**.
4. Em **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **URIs de redirecionamento autorizados**: `https://gabriel-melo284.github.io/site-planilha/` (com a barra no final). Para testar no seu computador, adicione também `http://localhost:8080/`.
5. Copie o **ID do cliente** e a **chave secreta do cliente**.

### 4. Criar a ponte (Cloudflare Worker)

1. Crie uma conta gratuita em [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Vá em **Workers e Pages → Criar → Worker**, dê o nome `agenda-ponte` e clique em **Implantar**.
3. Clique em **Editar código**, apague o conteúdo, cole todo o arquivo [`worker/worker.js`](worker/worker.js) e clique em **Implantar**.
4. Em **Configurações → Variáveis e segredos**, adicione:

   | Nome | Tipo | Valor |
   | --- | --- | --- |
   | `ACCESS_KEY` | Segredo | Uma senha longa inventada por você (ex.: 32 letras e números aleatórios) |
   | `ICS_URL` | Segredo | O link ICS do Outlook (passo 2). Para mais de um calendário, separe os links por vírgula |
   | `GOOGLE_CLIENT_ID` | Texto | O ID do cliente (passo 3) |
   | `GOOGLE_CLIENT_SECRET` | Segredo | A chave secreta do cliente (passo 3) |
   | `ALLOWED_ORIGINS` | Texto | `https://gabriel-melo284.github.io` (para testar no computador: `https://gabriel-melo284.github.io,http://localhost:8080`) |

5. Copie o endereço do Worker, algo como `https://agenda-ponte.SEU-NOME.workers.dev`.

> **Alternativa (recomendada no celular): conectar o Worker ao GitHub.** Em **Workers e Pages → Criar → Importar um repositório**, escolha `site-planilha`, com branch de produção `main`, caminho raiz `/` e comando de implantação `npx wrangler deploy`. A Cloudflare usa o [`wrangler.toml`](wrangler.toml) da raiz e publica a ponte sozinha a cada atualização do `main`. O campo `name` desse arquivo precisa ser igual ao nome do Worker no painel. As variáveis e os segredos continuam sendo cadastrados no painel, como na tabela acima.

### 5. Conectar o app

1. Abra o app e vá em **Ajustes**.
2. Em **Conexão**, preencha a **URL da ponte** e a **Chave de acesso** (a `ACCESS_KEY`) e clique em **Salvar e testar**. Os três indicadores devem ficar verdes.
3. Clique em **Conectar Google** e autorize.
4. Escolha as agendas que vão aparecer, a agenda padrão para novos compromissos e a lista padrão das demandas.
5. (Opcional) Em **Lembretes**, ative os avisos.

### 6. No celular

1. No computador, em **Ajustes → Outros dispositivos**, clique em **Copiar link de configuração** e mande o link para você mesmo.
2. No celular, abra o app e instale na tela inicial:
   - **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.
   - **Android (Chrome):** menu ⋮ → **Instalar app**.
3. Abra o app instalado, vá em **Ajustes → Outros dispositivos**, cole o link e toque em **Importar**. Pronto: a ponte e o Google já ficam conectados.

---

## Bom saber

- **Reuniões do Outlook são somente leitura.** Para aceitar, recusar ou remarcar, use o Outlook, e a mudança aparece aqui na próxima sincronização.
- **Atraso do Outlook:** a Microsoft atualiza o calendário publicado com um pequeno atraso, normalmente de alguns minutos. Uma reunião recém-marcada pode demorar um pouco para aparecer.
- **Lembretes** funcionam com o app aberto, mesmo em segundo plano. Os avisos do próprio Outlook e do Google Agenda continuam funcionando normalmente. No iPhone, só funcionam com o app instalado na tela inicial.
- **Ocorrências recorrentes** do Google: editar ou excluir pelo app afeta só aquela ocorrência.
- **Privacidade:** a chave de acesso e o token do Google ficam só no navegador de cada dispositivo. **Ajustes → Apagar dados deste navegador** remove tudo dali, sem apagar nada do Outlook ou do Google.

## Desenvolvimento

```bash
npm start      # servidor local em http://localhost:8080
npm test       # testes (leitura do ICS, ponte, conflitos, horários livres)
```

Não há etapa de build: o código fica em `index.html`, `css/` e `js/` (módulos ES). A biblioteca [ical.js](https://github.com/kewisch/ical.js) (MPL-2.0) vem incluída em `js/vendor/`.

```
index.html, manifest.webmanifest, sw.js   app e PWA
css/app.css                               visual (claro/escuro, responsivo)
js/app.js                                 navegação, eventos, sincronização
js/data.js                                junta Outlook + Google + Tasks
js/outlook.js                             leitura do ICS e recorrências
js/google.js                              login OAuth (PKCE) e APIs do Google
js/demo.js                                modo demonstração
js/views/                                 telas (hoje, dia/semana, mês, lista, demandas, ajustes, formulários)
worker/worker.js, wrangler.toml           ponte (Cloudflare Worker)
tests/                                    testes automatizados (node --test)
```
