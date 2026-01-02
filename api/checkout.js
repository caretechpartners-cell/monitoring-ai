import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { user_id, token, product_code } = req.body;

    // ============================
    // ① 必須チェック
    // ============================
    if (!user_id || !token || !product_code) {
      return res.status(400).json({ error: "missing_parameters" });
    }

    // ============================
    // ② auth-guard と同等の認証
    // ============================
    const { data: user, error } = await supabase
      .from("users")
      .select("login_session_token, email")
      .eq("auth_user_id", user_id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "user_not_found" });
    }

    if (user.login_session_token !== token) {
      return res.status(401).json({ error: "session_invalid" });
    }

    const email = user.email;

    // ============================
    // ③ 過去 trial 利用チェック
    // ============================
    const { data: history, error: historyError } = await supabase
      .from("stripe_links")
      .select("id")
      .eq("email", email)
      .eq("product_code", product_code)
      .limit(1);

    if (historyError) {
      throw historyError;
    }

    const hasUsedTrial = history.length > 0;

    // ============================
    // ④ Stripe Checkout Session 作成
    // ============================
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      customer_email: email,

      line_items: [
        {
          price: process.env.STRIPE_PRICE_MONITORING,
          quantity: 1,
        },
      ],

      subscription_data: hasUsedTrial
        ? {}
        : { trial_period_days: 30 },

      metadata: {
        product_code,
        auth_user_id: user_id,
      },

      success_url: `${process.env.BASE_URL}/thanks.html`,
      cancel_url: `${process.env.BASE_URL}/lp.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).json({ error: "checkout_failed" });
  }
}
