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

/* ===================== utils ===================== */
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

async function getEmailFromCustomer(customerId) {
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer?.email || null;
  } catch (e) {
    console.error("❌ customers.retrieve failed:", e?.message || e);
    return null;
  }
}

async function detectProductCodeFromCheckout(session) {
  // 1) session.metadata
  if (session?.metadata?.product_code) return session.metadata.product_code;

  // 2) subscription.metadata（Payment Link だとこっちに入ることがある）
  if (session?.subscription) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      if (sub?.metadata?.product_code) return sub.metadata.product_code;
    } catch (e) {
      console.error("❌ subscriptions.retrieve failed:", e?.message || e);
    }
  }

  // 3) line items の price.metadata（retrieve ではなく listLineItems が正解）
  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 1,
      expand: ["data.price"],
    });

    const price = items?.data?.[0]?.price;
    const code = price?.metadata?.product_code || null;
    if (code) return code;

    // 価格IDでマッピングしたい場合はここで分岐（必要なら追加）
    // const priceId = price?.id;
    // if (priceId === process.env.STRIPE_PRICE_MONITORING) return "monitoring";
    // if (priceId === process.env.STRIPE_PRICE_CONFERENCE) return "conference";
  } catch (e) {
    console.error("❌ listLineItems failed:", e?.message || e);
  }

  return null;
}

/* ===================== handler ===================== */
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

      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;

      // email 補完
      let email = session.customer_email || null;
      if (!email) email = await getEmailFromCustomer(customerId);

      if (!email) {
        console.warn("checkout.session.completed: missing email", {
          session_id: session.id,
          customer: customerId,
        });
        return res.status(200).json({ received: true });
      }

      // product_code 検出（壊れないルート）
      let productCode = await detectProductCodeFromCheckout(session);

      // ★ 最後の保険：行追加を止めない（monitoringに倒す）
      if (!productCode) {
        console.error("❌ product_code not found; fallback to monitoring", {
          session_id: session.id,
          metadata: session.metadata,
        });
        productCode = "monitoring";
      }

      const initialStatus = subscriptionId ? "trialing" : "active";

      const { error } = await supabase
        .from("stripe_links")
        .upsert(
          {
            email,
            product_code: productCode,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_subscription_status: initialStatus,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email,product_code" }
        );

      if (error) {
        console.error("❌ stripe_links upsert failed:", error);
      } else {
        console.log("✅ stripe_links upsert OK:", { email, productCode });
      }

      return res.status(200).json({ received: true });
    }

    /* ==========================================
       ② subscription.* 系
       → subscription_id で更新（無ければ作る）
    ========================================== */
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;

      let status = sub.status;
      if (event.type === "customer.subscription.deleted") status = "canceled";

      // まずは既存行を更新
      const { count, error: updErr } = await supabase
        .from("stripe_links")
        .update({
          stripe_subscription_status: status,
          trial_end_at: toIsoOrNull(sub.trial_end),
          current_period_end: toIsoOrNull(sub.current_period_end),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id)
        .select("id", { count: "exact" });

      if (updErr) {
        console.error("❌ stripe_links update failed:", updErr);
      }

      // 行が無い＝checkout より先に subscription が来た / checkout 側が失敗した
      if (count === 0) {
        // email 補完
        const email = await getEmailFromCustomer(sub.customer);

        // product_code 補完：1) subscription.metadata 2) DBで探す 3) fallback
        let productCode = sub?.metadata?.product_code || null;

        if (!productCode) {
          const { data: existing } = await supabase
            .from("stripe_links")
            .select("product_code")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          productCode = existing?.product_code || null;
        }
        if (!productCode) productCode = "monitoring"; // 最後の保険

        if (email) {
          const { error: insErr } = await supabase
            .from("stripe_links")
            .upsert(
              {
                email,
                product_code: productCode,
                stripe_customer_id: sub.customer,
                stripe_subscription_id: sub.id,
                stripe_subscription_status: status,
                trial_end_at: toIsoOrNull(sub.trial_end),
                current_period_end: toIsoOrNull(sub.current_period_end),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "email,product_code" }
            );

          if (insErr) {
            console.error("❌ stripe_links late upsert failed:", insErr);
          } else {
            console.warn("⚠️ created row from subscription event:", {
              email,
              productCode,
              subId: sub.id,
            });
          }
        } else {
          console.warn("⚠️ subscription event but email not found", {
            subId: sub.id,
          });
        }
      }

      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler fatal error:", err);
    // Stripe 再送を防ぐため 200
    return res.status(200).json({ received: true });
  }
}
