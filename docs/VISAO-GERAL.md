# Grifo: visão geral

> Documento em português, escrito para o dono do projeto entender o que existe. É a exceção à regra "docs em inglês". As fontes da verdade continuam sendo `docs/adr/` (por quê), `docs/specs/` (o quê) e o código. Estado em 27/11/2026, depois do PR #21.

## 1. O que é o Grifo
Você importa **PDFs** de uma **matéria**, **marca trechos** e dá a cada marcação uma **categoria**. As marcações viram um **resumo em árvore**, as **definições** viram **flashcards**, e no fim você exporta o resumo em PDF e os flashcards para o Anki. Os nomes oficiais estão em [`specs/glossary.md`](specs/glossary.md).

## 2. Estado atual: o que existe e o que falta
O projeto é, hoje, **só o servidor**. Não há nenhuma tela.

```mermaid
flowchart LR
  classDef ok fill:#d4f4dd,stroke:#2e7d32,color:#000
  classDef wip fill:#fff3c4,stroke:#b58900,color:#000
  classDef todo fill:#f8d7da,stroke:#b02a37,color:#000

  subgraph Servidor
    A[Conta: cadastro, e-mail, login, reset, apagar]:::ok
    B[Dados: matérias, documentos, categorias, marcações, resumo, flashcards]:::ok
    C[Sincronização push/pull]:::ok
    D[Lixeira e restauração]:::ok
    E[Upload de PDF e validação]:::ok
    F[Antivírus ClamAV]:::ok
    G[Purge: apagar de vez após 30 dias]:::wip
    H[Checagem de integridade dos arquivos]:::todo
    I[Exportar resumo em PDF]:::todo
    J[Exportar flashcards .apkg]:::todo
    K[Tempo real entre abas SSE]:::todo
    L[Login com Google]:::todo
  end

  subgraph Navegador
    M[Login e cadastro]:::todo
    N[Lista de matérias e documentos]:::todo
    O[Leitor de PDF e marcações]:::todo
    P[Editor do resumo]:::todo
    Q[Flashcards e estudo]:::todo
    R[Armazenamento local IndexedDB e fila offline]:::todo
  end
```

Legenda: verde = pronto e testado no `main`; amarelo = em andamento; vermelho = não começou.

## 3. As peças e como se falam

```mermaid
flowchart TB
  U([Navegador do usuário]):::future
  subgraph Docker
    WEB[apps/web<br/>Next.js: site e API]
    WRK[apps/worker<br/>tarefas em segundo plano]
    PG[(Postgres<br/>todos os dados)]
    S3[(S3 / SeaweedFS<br/>arquivos PDF)]
    AV[ClamAV<br/>antivírus]
    MAIL[Mailpit<br/>e-mails de teste]
    GOT[Gotenberg<br/>HTML para PDF]:::future
  end

  U -- "HTTP: login, sync, upload" --> WEB
  U -. "PUT do PDF direto, com URL assinada" .-> S3
  WEB --> PG
  WEB -- "gera URL assinada" --> S3
  WEB -- "enfileira jobs (no Postgres)" --> PG
  WRK -- "busca jobs" --> PG
  WRK -- "lê o PDF" --> S3
  WRK -- "envia o arquivo para escanear" --> AV
  WRK -- "envia e-mails" --> MAIL
  WRK -. "futuro: resumo em PDF" .-> GOT

  classDef future stroke-dasharray: 5 5,fill:#f4f4f4,color:#000
```

Linhas pontilhadas e caixas tracejadas ainda não existem ou ainda não são usadas. A fila de jobs é o próprio Postgres (Graphile Worker), por isso não há Redis.

## 4. Como o código está organizado

```mermaid
flowchart TB
  WEB[apps/web<br/>composition.ts liga tudo]
  WRK[apps/worker]
  subgraph modules[packages/modules: um assunto por pasta]
    ID[identity<br/>conta e login]
    LIB[library<br/>matérias, documentos, arquivos]
    ANN[annotation<br/>marcações e categorias]
    OUT[outline<br/>resumo em árvore]
    STU[study<br/>flashcards]
    EXP[export<br/>PDF e .apkg]
  end
  PLAT[packages/platform<br/>banco, sync, lixeira, fila, storage, erros]

  WEB --> modules
  WRK --> modules
  modules --> PLAT
  OUT -. "pergunta por porta: o documento existe?" .-> LIB
  ANN -. "pergunta por porta" .-> LIB
  STU -. "pergunta por porta" .-> OUT
```

Regras que mantêm isso arrumado: um módulo só importa outro pelo pacote raiz; cada módulo é dono de um schema do Postgres, sem consulta ou chave estrangeira entre schemas; a lógica de negócio fica nos módulos e as rotas só traduzem HTTP.

## 5. O modelo de dados

```mermaid
erDiagram
  USER ||--o{ SUBJECT : possui
  SUBJECT ||--o{ DOCUMENT : contem
  STORED_FILE ||--o{ DOCUMENT : "bytes de"
  DOCUMENT ||--o{ HIGHLIGHT : tem
  CATEGORY ||--o{ HIGHLIGHT : classifica
  DOCUMENT ||--o{ OUTLINE_NODE : tem
  HIGHLIGHT ||--o| OUTLINE_NODE : "origina (id derivado)"
  OUTLINE_NODE ||--o| FLASHCARD : "definição vira"
  USER ||--o{ EXPORT : pede

  SUBJECT {
    uuid id
    string name
  }
  DOCUMENT {
    uuid id
    string title
    string status
    int pageCount
    json riskFlags
    string rejectCode
  }
  STORED_FILE {
    uuid id
    string sha256
    int sizeBytes
    string storageKey
  }
  HIGHLIGHT {
    uuid id
    int pageIndex
    json rects
    json quote
  }
  CATEGORY {
    uuid id
    string name
    string color
    string role
  }
  OUTLINE_NODE {
    uuid id
    string role
    string text
  }
  FLASHCARD {
    uuid id
    string front
    string back
  }
```

Toda linha tem `owner_id` e o banco só deixa cada usuário ver as próprias (RLS). Apagar nunca apaga de verdade na hora: marca `deleted_at`.

## 6. Ciclo de vida de um documento

```mermaid
stateDiagram-v2
  [*] --> UPLOADED: início do upload
  UPLOADED --> VALIDATING: confirmar (arquivo chegou)
  VALIDATING --> READY: PDF válido
  VALIDATING --> REJECTED: não é PDF, tem senha ou falhou
  READY --> QUARANTINED: antivírus achou malware
  REJECTED --> [*]
  QUARANTINED --> [*]
  READY --> [*]: só READY abre no leitor
```

## 7. Fluxo de um upload de PDF

```mermaid
sequenceDiagram
  actor U as Navegador
  participant W as web (API)
  participant DB as Postgres
  participant S as S3
  participant K as worker
  participant C as ClamAV

  U->>W: POST /api/documents/uploads (hash, tamanho, matéria)
  W->>DB: cria documento UPLOADED e registro do arquivo
  W-->>U: URL assinada (ou nula se o arquivo já existe)
  U->>S: PUT do PDF (o S3 confere o hash)
  U->>W: POST /api/documents/{id}/confirm
  W->>S: o objeto existe e tem o tamanho certo?
  W->>DB: VALIDATING + enfileira document.validate
  K->>DB: pega o job
  K->>S: lê o PDF
  K->>K: confere assinatura, páginas, senha, conteúdo ativo
  K->>DB: READY ou REJECTED + enfileira document.deepScan
  K->>S: lê o PDF
  K->>C: envia para escanear
  C-->>K: limpo ou malware
  K->>DB: segue READY ou vira QUARANTINED
  U->>W: GET /api/sync/pull (vê o novo status)
```

## 8. Fluxo de sincronização

```mermaid
sequenceDiagram
  actor U as Navegador (futuro)
  participant W as web
  participant DB as Postgres

  Note over U: toda edição vai primeiro para o IndexedDB e para uma fila local
  U->>W: POST /api/sync/push (mutações com id)
  loop cada mutação, uma transação
    W->>DB: já processada? aplica e registra no log de mudanças
  end
  W-->>U: applied / duplicate / rejected + cursor
  U->>W: GET /api/sync/pull?since=cursor
  W->>DB: mudanças depois do cursor, uma por entidade
  W-->>U: dados novos e "tombstones" de apagados
```

Cada mutação tem um id e é aplicada no máximo uma vez, então reenviar depois de uma queda de rede é seguro.

## 9. A lixeira

```mermaid
stateDiagram-v2
  [*] --> Viva
  Viva --> NaLixeira: apagar (deleted_at)
  NaLixeira --> Viva: restaurar em até 30 dias
  NaLixeira --> Apagada: purge diário depois de 30 dias
  Apagada --> [*]
```

Uma linha apagada fica invisível e somente leitura. Os filhos apagados em cascata voltam junto com o item que os apagou.

## 10. Onde está cada coisa

| Quero entender | Olhe em |
| --- | --- |
| O que o produto faz, por assunto | `docs/specs/<assunto>/` |
| Por que uma decisão foi tomada | `docs/adr/` (38 decisões) |
| O que ainda está em aberto | `docs/pending/` |
| Os nomes oficiais | `docs/specs/glossary.md` |
| As regras para quem programa | `CLAUDE.md` na raiz e em cada app e módulo |
| Como rodar | `docker compose up -d` e `pnpm dev` (só a API responde; não há tela) |

## 11. Perguntas frequentes
- **Preciso de chave do Google?** Não. Cadastro e login funcionam com e-mail e senha. O login com Google nunca foi implementado.
- **Onde ficam os arquivos nos testes locais?** No SeaweedFS, um contêiner do próprio Docker. Não há nuvem nem custo.
- **Por que há tanta estrutura sem tela?** O servidor foi feito antes do navegador, por decisão do projeto. O próximo passo natural é uma fatia visível de ponta a ponta.
