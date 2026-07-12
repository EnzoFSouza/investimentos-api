# Investimentos API

API REST para gerenciamento de carteira de investimentos pessoais. Desenvolvida com foco em solidez arquitetural. O objetivo é ter um backend bem estruturado que sirva como base para múltiplos projetos frontend independentes, sem duplicação de lógica.

## Motivação

Em vez de criar um backend acoplado a cada projeto de interface, esta API centraliza toda a lógica de autenticação, persistência e cálculos financeiros em um único serviço. Frontends em React, HTML/CSS/JS ou outra tecnologia consomem as mesmas rotas, as mudanças no backend refletem automaticamente em todos os clientes.

## Stack

- **Node.js** com **Express 5**
- **SQLite** via `better-sqlite3`
- **JWT** em cookie `httpOnly` para autenticação
- **bcrypt** para hash de senhas
- **dotenv** para variáveis de ambiente

## Modelagem do banco de dados

```
usuarios
├── id           INTEGER PK AUTOINCREMENT
├── nome         TEXT NOT NULL
├── email        TEXT NOT NULL UNIQUE
├── senha_hash   TEXT NOT NULL
└── criado_em    TEXT DEFAULT datetime('now')

ativos
├── id           INTEGER PK AUTOINCREMENT
├── nome         TEXT NOT NULL UNIQUE   ← ticker (ex: WEGE3)
├── tipo         TEXT NOT NULL          ← ação, FII, criptomoeda
└── preco_atual  REAL NOT NULL

aportes
├── id             INTEGER PK AUTOINCREMENT
├── usuario_id     INTEGER FK → usuarios(id) ON DELETE CASCADE
├── ativo_id       INTEGER FK → ativos(id)   ON DELETE RESTRICT
├── quantidade     REAL NOT NULL
├── preco_unitario REAL NOT NULL
└── data           TEXT NOT NULL
```

**Decisões de modelagem:**

`ON DELETE CASCADE` em `aportes.usuario_id` — ao deletar um usuário, todos os seus aportes são removidos automaticamente, evitando dados órfãos.

`ON DELETE RESTRICT` em `aportes.ativo_id` — impede a remoção de um ativo que ainda possui aportes vinculados, protegendo a integridade histórica dos dados.

A tabela `ativos` é global (compartilhada entre usuários), enquanto `aportes` é individual, ou seja, cada usuário tem seu próprio histórico de compras sobre os ativos disponíveis.

## Autenticação

JWT armazenado em cookie `httpOnly`, assim o token nunca é acessível via JavaScript no navegador, reduzindo superfície de ataque contra XSS. O cookie é enviado automaticamente pelo navegador em todas as requisições para a API.

O middleware `autenticar` valida o token em todas as rotas protegidas antes de processar a requisição.

## Rotas

### Públicas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/ping` | Verifica se o servidor está no ar |
| POST | `/api/registro` | Cria uma nova conta de usuário |
| POST | `/api/login` | Autentica e emite o cookie JWT |
| POST | `/api/logout` | Remove o cookie JWT |

### Protegidas (requerem autenticação)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/eu` | Retorna os dados do usuário logado |
| GET | `/api/ativos` | Lista os ativos em que o usuário tem aportes |
| GET | `/api/carteira` | Retorna o patrimônio total da carteira |
| GET | `/api/carteira/resumo` | Retorna todos os ativos com resumo financeiro completo |
| GET | `/api/resumo/:ativo_id` | Retorna o resumo financeiro de um ativo específico |
| GET | `/api/aportes` | Lista todos os aportes do usuário |
| POST | `/api/aportes` | Registra um aporte por `ativo_id` |
| POST | `/api/aportes/ticker` | Registra um aporte pelo nome do ticker |
| DELETE | `/api/aportes/:id` | Remove um aporte do usuário |

### Exemplo de resposta — `GET /api/carteira/resumo`

```json
{
  "ativos": [
    {
      "id": 1,
      "nome": "PETR4",
      "tipo": "ação",
      "preco_atual": 38.50,
      "quantidade_total": 10,
      "total_investido": 385.00,
      "valor_atual": 385.00,
      "lucro_prejuizo": 0.00
    }
  ],
  "patrimonio_total": 385.00
}
```

## Ativos disponíveis (seed)

O banco é populado via `seed.js` com os seguintes ativos iniciais:

| Ticker | Tipo | Preço inicial |
|--------|------|---------------|
| PETR4 | Ação | R$ 38,50 |
| VALE3 | Ação | R$ 61,20 |
| ITUB4 | Ação | R$ 32,10 |
| MXRF11 | FII | R$ 10,15 |
| HGLG11 | FII | R$ 162,30 |
| BTC | Criptomoeda | R$ 350.000,00 |

## Como executar

**1. Instalar dependências:**
```bash
npm install
```

**2. Configurar variáveis de ambiente:**
```bash
cp .env.example .env
```

Edite o `.env` com os valores:
```
JWT_SECRET=sua_chave
PORT=3000
```

**3. Popular o banco com os ativos iniciais:**
```bash
node seed.js
```

**4. Iniciar o servidor:**
```bash
# Desenvolvimento (com hot-reload)
npm run dev

# Produção
npm start
```

O servidor sobe em `http://localhost:3000`.

## Estrutura do projeto

```
investimentos-api/
├── database.js     ← configuração do SQLite e todas as funções de acesso ao banco
├── server.js       ← definição das rotas e middlewares Express
├── seed.js         ← script para popular o banco com ativos iniciais
├── carteira.db     ← arquivo do banco SQLite (não commitado)
├── .env            ← variáveis de ambiente (não commitado)
├── .env.example    ← template das variáveis necessárias
└── package.json
```

## Frontends que consomem esta API

- **[Dashboard React](https://github.com/EnzoFSouza/Dashboard-Acoes-React)** — interface em React + Tailwind CSS com autenticação, visualização de carteira e registro de aportes.
- **[Plataforma HTML/CSS/JS](https://github.com/EnzoFSouza/MVP-Site-Investimentos)** — versão anterior da interface, desenvolvida sem frameworks.

## Variáveis de ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `JWT_SECRET` | Chave para assinar os tokens JWT | Sim |
| `PORT` | Porta do servidor (padrão: 3000) | Não |
| `NODE_ENV` | Ambiente (`production` ativa cookie `secure`) | Não |