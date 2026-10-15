// Configuração pública do jogo. Só entram aqui dados SEGUROS para ficar no
// código-fonte: a chave "publishable" do Supabase é pública por design (a
// proteção está nas regras RLS do banco). NUNCA coloque aqui a chave
// secret/service_role nem o segredo do webhook da Cakto.
window.ATB_CONFIG = {
  SUPABASE_URL: "https://sqoggtqycsgxfakpfwqe.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_IgelQgOCcZfZl81OkGJHnA_91ec4nDV",
  CAKTO_CHECKOUT_URL: "https://pay.cakto.com.br/35p2h6i_1208191",
  DEMOS_PER_GAME: 3,
};
