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

/* =====================================================
   utils
===================================================== */
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

/* =====================================================
   handler
===================================================== */
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
       → email × product_code の行を必ず作る
    ===================================================== */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

console.log("SESSION METADATA", session.metadata);
console.log("SESSION", JSON.stringify(session, null, 2));

      let email = session.customer_email || null;
      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;

if (!subscriptionId) {
  console.warn("checkout completed but subscription not yet created", {
    session_id: session.id,
  });
}

      // Payment Link では email が取れないことがあるため補完
      if (!email && customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        email = customer?.email || null;
      }

      if (!email) {
        console.warn("checkout.session.completed: missing email", {
          session_id: session.id,
          customer: customerId,
        });
        return res.status(200).json({ received: true });
      }

      // ★ product_code は metadata からのみ取得
// Checkout Session を expand 付きで再取得
const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
  expand: ["line_items.data.price"],
});

const productCode =
  fullSession.metadata?.product_code ||
  fullSession.subscription_details?.metadata?.product_code ||
  fullSession.line_items?.data?.[0]?.price?.metadata?.product_code ||
  null;

if (!productCode) {
  console.error("❌ product_code missing after expand", {
    session_id: session.id,
    metadata: fullSession.metadata,
  });
  return res.status(200).json({ received: true });
}


      const { error } = await supabase
  .from("stripe_links")
  .upsert(
    {
      email,
      product_code: productCode,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_subscription_status: subscriptionId ? "trialing" : "active",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "email,product_code",
    }
  );


      if (error) {
        console.error("❌ stripe_links upsert failed:", error);
      }

      return res.status(200).json({ received: true });
    }

    /* =====================================================
       ② subscription.* 系
       → subscription_id で既存行を更新するだけ
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

      const { count, error } = await supabase
        .from("stripe_links")
        .update({
          stripe_subscription_status: status,
          trial_end_at: toIsoOrNull(sub.trial_end),
          current_period_end: toIsoOrNull(sub.current_period_end),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id)
        .select("id", { count: "exact" });

      if (error) {
        console.error("❌ stripe_links update failed:", error);
      }

      // checkout より先に subscription イベントが来た場合
      if (count === 0) {
        console.warn("⚠️ subscription event before checkout row", {
          subscription_id: sub.id,
          status,
        });
      }

      return res.status(200).json({ received: true });
    }

    // その他イベントは無視
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler fatal error:", err);
    // Stripe 再送を防ぐため必ず 200
    return res.status(200).json({ received: true });
  }
}
