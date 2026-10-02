// ========================================================================
// Games @pharmamelo · Antimicrobianos — configuração pública
// ------------------------------------------------------------------------
// Só ficam aqui informações que são SEGURAS para aparecer no código-fonte:
// a "anon key" do Supabase é pública por design (protegida pelas regras
// de RLS do banco, não por estar escondida) e o Price ID do Stripe é só
// um identificador de produto, não dá acesso a nada sozinho.
//
// NUNCA coloque aqui: a service_role key do Supabase, a chave secreta do
// Stripe (sk_...) ou o webhook signing secret (whsec_...). Essas ficam só
// como "secrets" das Edge Functions, dentro do painel do Supabase.
//
// Depois de criar seu projeto no Supabase e seu produto no Stripe, troque
// os valores abaixo pelos reais (veja supabase/README-SETUP.md).
// ========================================================================
window.ATB_CONFIG = {
  SUPABASE_URL: "", // ex.: "https://xxxxxxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "", // Settings → API → Project API keys → anon public
  FUNCTIONS_URL: "", // normalmente "https://xxxxxxxxxxxx.supabase.co/functions/v1"
  STRIPE_PRICE_ID: "", // Stripe → Product catalog → seu produto → Pricing → price_...
};
