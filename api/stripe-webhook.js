import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toIsoOrNull(unixSec) {
  return unixSec ? new Date(unixSec * 1000).toISOString() : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send("Webhook Error");
  }

  try {
    /* =====================================================
       ① checkout.session.completed
       → product ごとの行を作る（email × product_code）
    ===================================================== */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const email = session.customer_email || null;
      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;

      if (!email) {
        console.warn("checkout.session.completed: missing email", {
          session_id: session.id,
        });
        return res.status(200).json({ received: true });
      }

      const productCode =
        session.metadata?.product_code || "monitoring";

      const { error } = await supabase
        .from("stripe_links")
        .upsert(
          {
            email,
            product_code: productCode,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email,product_code" }
        );

      if (error) {
        console.error("❌ stripe_links upsert failed:", error);
      }

      return res.status(200).json({ received: true });
    }

    /* =====================================================
       ② subscription.* 系
       → 既存行を subscription_id で更新するだけ
    ===================================================== */
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;

      let status = sub.status;
      if (event.type === "customer.subscription.deleted") {
        status = "canceled";
      }

      const { error } = await supabase
        .from("stripe_links")
        .update({
          stripe_subscription_status: status,
          trial_end_at: toIsoOrNull(sub.trial_end),
          current_period_end: toIsoOrNull(sub.current_period_end),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);

      if (error) {
        console.error("❌ stripe_links update failed:", error);
      }

      return res.status(200).json({ received: true });
    }

    // その他イベントは無視
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(200).json({ received: true });
  }
}
