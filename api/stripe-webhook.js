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
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

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
    // ============================
    // ① checkout.session.completed
    // （Payment Link の入口）
    // ============================
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const email = session.customer_email || null;
      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;

      // email が取れないと紐付けできないのでログ出して終了
      if (!email) {
        console.warn("checkout.session.completed: missing email", {
          id: session.id,
          customer: customerId,
        });
        return res.status(200).json({ received: true });
      }

      // stripe_links に upsert（users がまだ無くてもOK）
 const productCode =
  session.metadata?.product_code || "monitoring";
     const { error } = await supabase.from("stripe_links").upsert(
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
        console.error("❌ stripe_links upsert failed:", { email, error });
      }

      return res.status(200).json({ received: true });
    }

    // ============================
    // ② subscription.* 系
    // （trialing/active/canceled を確定させる）
    // ============================
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;

      // customer から email を取る（subscription には email が入ってないため）
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer?.email || null;

      if (!email) {
        console.warn("subscription event: missing customer.email", {
          customer: sub.customer,
          sub: sub.id,
          type: event.type,
        });
        return res.status(200).json({ received: true });
      }

      let status = sub.status;
      if (event.type === "customer.subscription.deleted") status = "canceled";

      const { error } = await supabase.from("stripe_links").upsert(
  {
    email,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    stripe_subscription_status: status,
    trial_end_at: toIsoOrNull(sub.trial_end),
    current_period_end: toIsoOrNull(sub.current_period_end),
    updated_at: new Date().toISOString(),
  },
  { onConflict: "email" } // ← ここも戻す
);



      if (error) {
        console.error("❌ stripe_links upsert failed:", { email, error });
      }

      return res.status(200).json({ received: true });
    }

    // その他イベントは無視
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // Stripe は 500 だと再送し続けるので、原則 200 で返す
    return res.status(200).json({ received: true });
  }
}
