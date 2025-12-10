import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import crypto from "crypto";
import { NextResponse } from "next/server";

// ⭐ Webhook が Edge Runtime で動かないのを防ぐ
export const runtime = "nodejs";

// Stripe / Supabase / Resend 初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return new NextResponse(`Webhook error: ${err.message}`, { status: 400 });
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

    // 仮パスワード生成
    const tempPassword = crypto.randomUUID();

    // Supabase Auth ユーザー作成（重複しても OK）
    await supabase.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
    });

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

    // ----------------------------
    // ⭐ Resend：ログイン案内メール送信
    // ----------------------------
    try {
      await resend.emails.send({
        from: "やさしいモニタリングAI <no-reply@yourdomain.com>",
        to: email,
        subject: "【やさしいモニタリングAI】ご購入ありがとうございます｜ログイン情報のご案内",
        html: `
          <p>${userName} 様</p>

          <p>この度は「やさしいモニタリングAI（会員版）」をご購入いただきありがとうございます。</p>

          <p>以下がログイン情報となります。</p>

          <p><b>■ ログインURL</b><br>
          https://YOUR_DOMAIN/login.html</p>

          <p><b>■ ID（メールアドレス）</b><br>
          ${email}</p>

          <p><b>■ 仮パスワード</b><br>
          ${tempPassword}</p>

          <p>※ログイン後、必ずパスワード変更をお願いいたします。</p>

          <p>今後ともよろしくお願いいたします。</p>
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
      console.error("❌ Error updating user cancel status:", error);
    } else {
      console.log("🟠 User canceled subscription:", customerId);
    }
  }

  return NextResponse.json({ received: true });
}
