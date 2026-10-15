# Login, demos e pagamento (Supabase + Cakto)

O jogo já está ligado ao projeto Supabase `sqoggtqycsgxfakpfwqe` (URL e chave
*publishable* em `config.js` — são públicas por design). Falta só preparar o
banco e o e-mail:

## 1) Rodar o banco (1 vez)
Supabase → **SQL Editor → New query** → cole todo o `supabase/schema.sql` → **Run**.
Cria perfis, demos (3 por jogo), progresso, ranking e as regras de segurança
(o usuário NÃO consegue se dar acesso pago sozinho).

## 2) Código de confirmação por e-mail
- **Authentication → Providers → Email**: deixe **Confirm email** LIGADO.
- **Authentication → Email Templates → Confirm signup**: troque o corpo para
  mostrar o código, por exemplo:
  `<h2>Seu código</h2><p>Digite no jogo: <b>{{ .Token }}</b></p>`
  (sem `{{ .Token }}` o e-mail vai só com link, e o jogo pede código).
- **Authentication → Sign In / Providers**: tamanho do código = 6 (padrão).
- O e-mail padrão do Supabase tem limite baixo (poucos envios por hora).
  Para valer em produção, configure um SMTP próprio em **Project Settings →
  Authentication → SMTP** (Resend, Brevo, etc.).

## 3) Site URL
**Authentication → URL Configuration → Site URL**: o endereço do jogo no GitHub Pages.

## 4) Cakto (passo seguinte)
O botão "Pagar e liberar" abre `CAKTO_CHECKOUT_URL` (em `config.js`). O acesso só
é liberado quando `profiles.subscription_status = 'active'`, o que só o servidor
consegue gravar. Depois de concluir os passos acima, criamos o webhook da Cakto
(Edge Function que confere o segredo, grava em `payments` e ativa o perfil
pelo e-mail da compra). Se alguém pagar antes de criar a conta, o pagamento
fica em `payments` e a conta já nasce liberada.

## Limites conhecidos
- Pontuação vem do navegador: dá para fraudar o ranking com ferramentas de
  desenvolvedor. Aceitável para ranking recreativo; validar no servidor só
  se virar competição com prêmio.
- Esqueci a senha ainda não existe na tela.
