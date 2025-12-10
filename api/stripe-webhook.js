import { buffer } from "micro";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import crypto from "crypto";

// ⭐ Next.js API Routes で raw body を扱う設定
export const config = {
  api: {
    bodyParser: false,
  },
};

// ===============================
// Stripe / Supabase / Resend 初期化
// ===============================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

// ===============================
// メインハンドラー
// ===============================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ============================
  // ① checkout.session.completed
  // ============================
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const email = session.customer_details.email;
    const userName = session.customer_details.name;
    const phone = session.customer_details.phone;
    const customerId = session.customer;
    const purchasedAt = new Date(session.created * 1000);

    let nextBilling = null;

    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );
      nextBilling = new Date(subscription.current_period_end * 1000);
    }

    // 既存ユーザー確認
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    // ランダムパスワード生成
    const tempPassword = crypto.randomUUID();

    // Supabase Auth ユーザー作成（重複しても OK）
    await supabase.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
    });

    // 既存 → UPDATE / 初回 → INSERT
    if (existingUser) {
      await supabase
        .from("users")
        .update({
          stripe_customer_id: customerId,
          purchased_at: purchasedAt.toISOString(),
          next_billing_at: nextBilling ? nextBilling.toISOString() : null,
          user_name: userName,
          phone: phone,
          status: "active",
        })
        .eq("email", email);
    } else {
      await supabase.from("users").insert({
        email: email,
        stripe_customer_id: customerId,
        purchased_at: purchasedAt.toISOString(),
        next_billing_at: nextBilling ? nextBilling.toISOString() : null,
        user_name: userName,
        phone: phone,
        status: "active",
      });
    }

    console.log("🟢 User added/updated after purchase:", email);

    // ------------------------
    // Resend：ログイン案内メール
    // ------------------------
    try {
      await resend.emails.send({
        from: "やさしいモニタリングAI <no-reply@yourdomain.com>",
        to: email,
        subject: "【やさしいモニタリングAI】ご購入ありがとうございます｜ログイン情報のご案内",
        html: `
            <p>${userName} 様</p>
            <p>この度はご購入ありがとうございます。</p>
            <p><b>■ ログインURL</b><br>https://YOUR_DOMAIN/login.html</p>
            <p><b>■ ID（メールアドレス）</b><br>${email}</p>
            <p><b>■ 仮パスワード</b><br>${tempPassword}</p>
            <p>※ログイン後はパスワード変更をお願いします。</p>
        `,
      });

      console.log("📧 Login info email sent to:", email);
    } catch (error) {
      console.error("❌ Resend email error:", error);
    }
  }

  // ============================
  // ② customer.subscription.deleted
  // ============================
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    console.log("⚠️ Subscription cancelled:", customerId);

    const { error } = await supabase
      .from("users")
      .update({
        status: "canceled",
        next_billing_at: null,
      })
      .eq("stripe_customer_id", customerId);

    if (error) {
      console.error("❌ Error updating cancel status:", error);
    } else {
      console.log("🟠 User canceled subscription:", customerId);
    }
  }

  return res.json({ received: true });
}
