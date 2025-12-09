import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // 必ず service role key
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 決済成功イベント
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const email = session.customer_details.email;

    // Supabase Auth にユーザー作成
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password: generatePassword()
    });

    if (error) {
      console.error("Supabase create user error:", error);
    }
  }

  res.json({ received: true });
}

// 自動パスワード生成
function generatePassword() {
  return Math.random().toString(36).slice(-10);
}

export const config = {
  api: {
    bodyParser: false, // Stripe Webhook では必須
  },
};
