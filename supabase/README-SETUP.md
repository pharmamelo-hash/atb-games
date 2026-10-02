# Login e assinatura no ATB Games — passo a passo

Isso liga três peças: **Supabase** (contas e banco de dados), **Stripe**
(cobrança recorrente) e o próprio jogo (`config.js`). Nenhuma chave secreta
entra no código do jogo — só a `anon key` do Supabase, que é pública por
natureza e protegida pelas regras do banco (RLS).

Modos gratuitos: **Batalha** e **Quiz**.
Modos de assinante: **Memória**, **Fuga da Colônia**, **Encaixe de Classes**
e **Enciclopédia**.

---

## 1) Criar o projeto no Supabase

1. Acesse **supabase.com** → **Start your project** → entre com GitHub (a
   mesma conta `pharmamelo-hash` já serve).
2. **New project** → escolha um nome (ex.: `atb-games`), uma senha forte
   para o banco (guarde em local seguro, não precisa me enviar) e a região
   mais próxima (ex.: South America / São Paulo, se disponível).
3. Espere uns 2 minutos até o projeto ficar pronto.
4. No menu lateral → **SQL Editor** → **New query** → abra o arquivo
   `supabase/schema.sql` deste repositório, copie todo o conteúdo, cole lá
   e clique **Run**. Isso cria a tabela de perfis e as regras de segurança.
5. No menu lateral → **Authentication** → **Providers** → confirme que
   **Email** está habilitado (vem ligado por padrão).
   - Em **Authentication → Settings**, você decide se quer exigir
     confirmação por e-mail antes do primeiro login (recomendado manter
     ligado).
6. No menu lateral → **Settings → API**. Copie dois valores:
   - **Project URL** (algo como `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** (uma chave longa, começando geralmente com `eyJ...`)
   
   Me envie esses dois valores (são seguros para compartilhar — não dão
   acesso a nada sozinhos) e eu preencho o `config.js` do jogo.

---

## 2) Criar o produto de assinatura no Stripe

1. Acesse **stripe.com** → crie uma conta (ou entre, se já tiver).
2. Ative o modo **Test** primeiro (chave no canto superior direito) para
   testarmos sem cobrar cartão de verdade. Repetimos tudo em modo **Live**
   quando estiver pronto para vender de verdade.
3. **Product catalog → Add product**: nome (ex.: "Games @pharmamelo —
   Assinatura"), preço recorrente (ex.: R$ 19,90/mês), moeda BRL.
4. Salve e abra o produto criado → copie o **Price ID** (começa com
   `price_...`). Me envie esse valor.
5. **Developers → API keys**: copie a **Secret key** (`sk_test_...` em modo
   teste, depois `sk_live_...` em modo real). **Não me envie por aqui** —
   veja o passo 4 abaixo, ela vai direto nos secrets da função, pelo
   próprio painel do Supabase.

---

## 3) Publicar as Edge Functions (o "servidor" do jogo)

As duas funções já estão prontas em `supabase/functions/`. Forma mais
simples, sem precisar instalar nada no seu computador: pelo próprio painel.

1. No Supabase → **Edge Functions** → **Deploy a new function**.
2. Crie uma função chamada `create-checkout-session` e cole o conteúdo de
   `supabase/functions/create-checkout-session/index.ts`.
3. Crie outra chamada `stripe-webhook` e cole o conteúdo de
   `supabase/functions/stripe-webhook/index.ts`.
4. Para a função `stripe-webhook`, procure a opção **Enforce JWT
   verification** e **desligue** (ela é chamada pelo Stripe, não por um
   usuário logado — a segurança vem da assinatura do Stripe, verificada no
   próprio código).
5. Em **Edge Functions → Secrets** (segredos compartilhados por todas as
   funções do projeto), adicione:
   - `STRIPE_SECRET_KEY` → a chave secreta do Stripe (passo 2.5)
   - `STRIPE_PRICE_ID` → o Price ID do passo 2.4
   - `STRIPE_WEBHOOK_SECRET` → veja o passo 4 abaixo (vem depois de criar o
     webhook no Stripe)
   
   (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já ficam disponíveis
   automaticamente, não precisa cadastrar.)

> Se preferir, também dá para fazer isso via linha de comando
> (`supabase functions deploy create-checkout-session`), usando a Supabase
> CLI — me avise que eu te guio por esse caminho também.

---

## 4) Conectar o Stripe à função do webhook

1. Copie a URL pública da função `stripe-webhook`: no painel, ela aparece
   como algo como
   `https://xxxxxxxxxxxx.supabase.co/functions/v1/stripe-webhook`.
2. No Stripe → **Developers → Webhooks → Add endpoint** → cole essa URL.
3. Em **Select events**, marque:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Salve. O Stripe mostra um **Signing secret** (`whsec_...`) — copie e
   cadastre como o secret `STRIPE_WEBHOOK_SECRET` da função (volte ao passo
   3.5 no Supabase).

---

## 5) Preencher o `config.js` do jogo

Edite (ou me peça para editar) `config.js` na raiz do projeto com os
valores reais:

```js
window.ATB_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
  FUNCTIONS_URL: "https://xxxxxxxxxxxx.supabase.co/functions/v1",
  STRIPE_PRICE_ID: "price_xxxxxxxxxxxx",
};
```

Assim que isso tiver valores reais, o botão "Entrar" aparece no cabeçalho
do jogo e os modos de assinante passam a pedir login + assinatura ativa.
Enquanto os campos estiverem vazios (como estão agora), o jogo continua
funcionando exatamente como hoje — nada fica bloqueado.

---

## 6) Testar antes de ir ao ar

1. Com o Stripe em modo **Test**, abra o jogo, crie uma conta, clique em um
   modo de assinante → "Assinar agora" → finalize o checkout usando um
   [cartão de teste do Stripe](https://stripe.com/docs/testing), ex.:
   `4242 4242 4242 4242`, validade futura qualquer, CVC qualquer.
2. Volte ao jogo: em alguns segundos o modo deve destravar (o jogo
   reconsulta sua assinatura automaticamente ao voltar do checkout).
3. Confira no Supabase → **Table Editor → profiles** se a linha do seu
   usuário mudou `subscription_status` para `active`.
4. Quando tudo estiver funcionando, troque as chaves do Stripe (produto,
   price ID, secret key, webhook) para o modo **Live** e repita os passos
   2–4 com os valores de produção.

---

## O que é seguro e o que nunca deve ser compartilhado

| Pode ficar público (no `config.js`, no GitHub) | NUNCA pode aparecer no jogo ou no GitHub |
|---|---|
| Supabase **anon key** | Supabase **service_role key** |
| Supabase Project URL | Stripe **secret key** (`sk_...`) |
| Stripe **Price ID** | Stripe **webhook signing secret** (`whsec_...`) |

As chaves da coluna da direita só existem como **secrets das Edge
Functions**, dentro do painel do Supabase — nunca em um arquivo do
repositório. É assim que a "gerência de login e informações da conta" fica
seguro mesmo com o restante do jogo sendo um site público e de código
aberto.
