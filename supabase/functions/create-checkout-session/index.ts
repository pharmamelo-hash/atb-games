// Edge Function: create-checkout-session
// Chamada pelo navegador (com o token do usuário logado) para abrir o
// checkout de assinatura no Stripe. Nunca expõe a chave secreta do Stripe
// — ela vive só aqui, como "secret" da função (Supabase → Edge Functions →
// Secrets), e nunca chega ao código-fonte do jogo.
//
// Segredos esperados (definidos como secrets da função, não aqui no código):
//   STRIPE_SECRET_KEY        — chave secreta do Stripe (sk_live_... / sk_test_...)
//   STRIPE_PRICE_ID          — id do preço recorrente criado no Stripe (price_...)
//   SUPABASE_URL              — já fica disponível automaticamente
//   SUPABASE_SERVICE_ROLE_KEY — já fica disponível automaticamente

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Faça login antes de assinar." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente "anon" com o token do usuário anexado, só para identificar
    // quem está chamando (não dá acesso a nada além do próprio usuário).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida, faça login novamente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    // Cliente com a service role (chave secreta) só para ler/gravar o
    // próprio perfil do usuário já identificado acima — nunca exposto ao navegador.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const body = await req.json().catch(() => ({}));
    const origin = body.origin || req.headers.get("origin") || "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
      success_url: `${origin}/?assinatura=sucesso`,
      cancel_url: `${origin}/?assinatura=cancelada`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Não foi possível iniciar o checkout." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
