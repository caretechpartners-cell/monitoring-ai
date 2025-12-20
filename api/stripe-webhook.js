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
  // =========================================
  // ① Checkout 完了（最初の紐付け）
  // =========================================
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Payment Link 経由でも必ず入る
    const email = session.customer_email;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!email || !customerId) {
      console.warn("checkout.session.completed: missing email or customer");
      return res.status(200).json({ received: true });
    }

    const { error } = await supabase
      .from("users")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      })
      .eq("email", email);

    if (error) {
      console.error("Supabase update (checkout) failed:", error);
    }

    // ★ ここで return してOK（他の処理に行かせない）
    return res.status(200).json({ received: true });
  }

// =========================================
// ② subscription 作成・更新・削除
// =========================================
if (
  event.type === "customer.subscription.created" ||
  event.type === "customer.subscription.updated" ||
  event.type === "customer.subscription.deleted"
) {
  const sub = event.data.object;

  const customer = await stripe.customers.retrieve(sub.customer);
  const email = customer.email;

  if (!email) {
    console.warn("subscription event: customer.email not found");
    return res.status(200).json({ received: true });
  }

  // ✅ status を先に確定
  let status = sub.status;
  if (event.type === "customer.subscription.deleted") {
    status = "canceled";
  }

  const updateData = {
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    stripe_subscription_status: status, // trialing / active / canceled
    trial_end_at: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("users")
    .update(updateData)
    .eq("email", email);

  if (error) {
    console.error("Supabase update (subscription) failed:", error);
  }
}
  return res.status(200).json({ received: true });
} catch (err) {
  console.error("❌ Webhook handler error:", err);
  return res.status(500).send("Internal Server Error");
}

}
