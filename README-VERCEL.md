# Bot de Velas IA - Backend na Vercel (com KV)

Este projeto foi preparado para o **André** rodar o backend de IA do Bot de Velas **100% na nuvem (Vercel)**,
usando:

- **Funções serverless** em `/api`
- **Vercel KV (Redis)** para:
  - guardar as configurações (`/api/config`)
  - guardar o histórico dos sinais (`/api/analisar-velas`)
- **OpenAI API** para a inteligência de leitura das velas

---

## Rotas

- `GET /api/status`
  - Usado pela extensão para checar se o backend está vivo.

- `GET /api/config`
  - Retorna a configuração atual (timeframe, % acerto, camadas, etc).

- `POST /api/config` (JSON)
  - Atualiza a configuração. Exemplo de body:

  ```json
  {
    "timeframe": "M5",
    "acerto": 80,
    "camadas": 3,
    "analises": 5,
    "modo": "auto"
  }
  ```

- `POST /api/analisar-velas` (JSON)
  - Recebe velas + config e retorna o sinal da IA.
  - Exemplo de body:

  ```json
  {
    "velas": [
      { "open": 1.2345, "close": 1.2360, "high": 1.2370, "low": 1.2330, "volume": 1000 },
      { "open": 1.2360, "close": 1.2350, "high": 1.2380, "low": 1.2340, "volume": 900 }
    ],
    "config": {
      "timeframe": "M1",
      "acerto": 80,
      "camadas": 3,
      "analises": 5,
      "modo": "manual"
    }
  }
  ```

  - Resposta (exemplo):

  ```json
  {
    "ok": true,
    "sinal": {
      "acao": "compra",
      "confianca": 82.3,
      "comentario": "Tendência de alta com retração leve, boa região de suporte.",
      "segundosAntesEntrada": 10
    },
    "configAtual": { "...": "..." }
  }
  ```

---

## Como subir na Vercel

1. Crie um repositório no GitHub e envie estes arquivos.
2. No painel da Vercel:
   - Clique em **Add New → Project**
   - Importe o repositório do GitHub
3. Em **Environment Variables**, adicione:

   - `OPENAI_API_KEY` → sua chave da OpenAI
   - As variáveis criadas automaticamente pela integração **Vercel KV** (KV_URL, KV_REST_API_URL, etc).

4. Adicione a integração **Vercel KV** ao projeto:
   - No painel da Vercel: `Storage → KV → Link` ao seu projeto.

5. Deploy.

Ao finalizar, você terá uma URL parecida com:

```
https://SEU-PROJETO.vercel.app
```

As rotas ficarão:

- `https://SEU-PROJETO.vercel.app/api/status`
- `https://SEU-PROJETO.vercel.app/api/config`
- `https://SEU-PROJETO.vercel.app/api/analisar-velas`

Use **essa URL** na sua extensão do Chrome no campo **"URL do backend"**.
