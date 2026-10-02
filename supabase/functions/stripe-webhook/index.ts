// Edge Function: stripe-webhook
// Recebe eventos do Stripe diretamente (não do navegador) e atualiza o
// status de assinatura do usuário. É a ÚNICA rota que grava
// subscription_status — o navegador nunca tem permissão para isso (RLS).
//
// Depois de publicar esta função, registre a URL dela no Stripe:
// Stripe → Developers → Webhooks → Add endpoint → cole a URL da função
// → selecione os eventos: checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted,
// invoice.payment_failed. O Stripe te dá um "Signing secret" (whsec_...):
// salve como secret STRIPE_WEBHOOK_SECRET desta função.
//
// Esta função precisa ter a verificação de JWT do Supabase DESLIGADA
// (verify_jwt = false em supabase/config.toml), porque quem chama é o
// Stripe, não um usuário logado — a autenticidade vem da assinatura
// STRIPE_WEBHOOK_SECRET, verificada abaixo, não de um token Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14?target=deno";

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("Assinatura inválida:", err);
    return new Response("Assinatura inválida", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  async function setStatusByCustomer(
    customerId: string,
    fields: Record<string, unknown>
  ) {
    const { error } = await admin
      .from("profiles")
      .update(fields)
      .eq("stripe_customer_id", customerId);
    if (error) console.error("Falha ao atualizar perfil:", error);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string | null;
      await setStatusByCustomer(customerId, {
        subscription_status: "active",
        stripe_subscription_id: subscriptionId,
      });
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status; // active | trialing | past_due | canceled | unpaid ...
      await setStatusByCustomer(sub.customer as string, {
        subscription_status: status,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setStatusByCustomer(sub.customer as string, {
        subscription_status: "canceled",
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        await setStatusByCustomer(invoice.customer as string, {
          subscription_status: "past_due",
        });
      }
      break;
    }
    default:
      // outros eventos são ignorados de propósito
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
