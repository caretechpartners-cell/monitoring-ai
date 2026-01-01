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
  let email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email ||
    null;

  if (!email && session.customer) {
    try {
      const customer = await stripe.customers.retrieve(session.customer);
      email = customer?.email || null;
    } catch (e) {
      console.warn("customer retrieve failed", e);
    }
  }

  return email;
}

async function resolveProductCode(session) {
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(
      session.id,
      { expand: ["data.price.product"] }
    );

    const product =
      lineItems.data[0]?.price?.product;

    return (
      session.metadata?.product_code ||
      product?.metadata?.product_code ||
      null
    );
  } catch (e) {
    console.error("line_items resolve failed", e);
    return null;
  }
}


/* =========================
   handler
========================= */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"];
  let event;

  const rawBody = await getRawBody(req);

  try {
    // ① まず本番 Webhook secret で検証
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET_LIVE
    );
  } catch (errLive) {
    try {
      // ② ダメならテスト Webhook secret で検証
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET_TEST
      );
    } catch (errTest) {
      console.error("❌ Signature verification failed (live & test)", {
        liveError: errLive?.message,
        testError: errTest?.message,
      });
      return res.status(400).send("Webhook Error");
    }
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
  const productCode = await resolveProductCode(session);

  if (!email || !productCode) {
    console.error("missing email or product_code", {
      email,
      productCode,
      session_id: session.id,
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
    { onConflict: "email,product_code" }
  );

// checkout.session.completed 内
await supabase
  .from("users")
  .update({ stripe_customer_id: customerId })
  .eq("email", email);


  if (error) {
    console.error("❌ stripe_links upsert failed", error);
  } else {
    console.log("✅ stripe_links row created", {
      email,
      productCode,
      subscriptionId,
    });
  }

  return res.status(200).json({ received: true });
}

/* ==========================================
   ② subscription.* 系
   → created / updated の両方で trial_end を保存
========================================== */
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

  const updatePayload = {
    stripe_subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  // ✅ trial_end が入っていれば created / updated どちらでも保存
  if (sub.trial_end) {
    updatePayload.trial_end_at = toIsoOrNull(sub.trial_end);
  }

  if (sub.current_period_end) {
    updatePayload.current_period_end = toIsoOrNull(sub.current_period_end);
  }

  const { error } = await supabase
    .from("stripe_links")
    .update(updatePayload)
    .eq("stripe_subscription_id", sub.id);

  if (error) {
    console.error("❌ stripe_links update failed", {
      subscription_id: sub.id,
      error,
    });
  } else {
    console.log("✅ stripe_links updated", {
      subscription_id: sub.id,
      status,
      trial_end: sub.trial_end,
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
