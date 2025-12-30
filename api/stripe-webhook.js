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

/* =========================
   utils
========================= */
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

async function resolveEmailFromSession(session) {
  // ✅ 最優先：今回あなたのイベントで実際に入っていた場所
  let email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email || // 念のため
    null;

  // 保険：customer から引く（入ってない場合もある）
  if (!email && session.customer) {
    try {
      const customer = await stripe.customers.retrieve(session.customer);
      email = customer?.email || null;
    } catch (e) {
      console.warn("customer retrieve failed", {
        customer: session.customer,
        error: String(e?.message || e),
      });
    }
  }

  return email;
}

/* =========================
   handler
========================= */
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
    /* ==========================================
       ① checkout.session.completed
       → email × product_code の行を作る
    ========================================== */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const email = await resolveEmailFromSession(session);
      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;

      const productCode = session.metadata?.product_code || null;

      if (!email) {
        console.error("❌ email missing (session)", {
          session_id: session.id,
          customer: customerId,
          customer_email: session.customer_email,
          customer_details: session.customer_details,
        });
        return res.status(200).json({ received: true });
      }

      if (!productCode) {
        console.error("❌ product_code missing in session.metadata", {
          session_id: session.id,
          metadata: session.metadata,
        });
        return res.status(200).json({ received: true });
      }

      const { error } = await supabase
        .from("stripe_links")
        .insert(
          {
            email,
            product_code: productCode,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            // 初期値。後続の subscription.* で確定させる
            stripe_subscription_status: subscriptionId ? "trialing" : "active",
            updated_at: new Date().toISOString(),
          });

      if (error) {
        console.error("❌ stripe_links upsert failed:", {
          email,
          productCode,
          error,
        });
      } else {
        console.log("✅ stripe_links upsert ok:", {
          email,
          productCode,
          subscriptionId,
        });
      }

      return res.status(200).json({ received: true });
    }

    /* ==========================================
       ② subscription.* 系
       → subscription_id で既存行を更新
    ========================================== */
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;

      let status = sub.status;
      if (event.type === "customer.subscription.deleted") status = "canceled";

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
        console.error("❌ stripe_links update failed:", { sub_id: sub.id, error });
      }

      if (!count) {
        // checkout行が作れなかった/順序が逆だった等
        console.warn("⚠️ stripe_links row not found for subscription_id", {
          subscription_id: sub.id,
          status,
        });
      } else {
        console.log("✅ stripe_links updated:", {
          subscription_id: sub.id,
          status,
        });
      }

      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler fatal error:", err);
    return res.status(200).json({ received: true });
  }
}
