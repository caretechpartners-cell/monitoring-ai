// /api/product-guard.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  try {
    const { email, product_code } = req.body;

    if (!email || !product_code) {
      return res.status(400).json({
        ok: false,
        reason: "missing_param",
        message: "email と product_code は必須です",
      });
    }

    // stripe_links を email × product_code で取得
    const { data, error } = await supabase
      .from("stripe_links")
      .select(
        `
        stripe_subscription_status,
        trial_end_at,
        current_period_end
      `
      )
      .eq("email", email)
      .eq("product_code", product_code)
      .maybeSingle();

    if (error) {
      console.error("product-guard lookup error:", error);
      return res.status(500).json({
        ok: false,
        reason: "db_error",
      });
    }

    // レコードが無い = 未購入
    if (!data) {
      return res.status(200).json({
        ok: false,
        reason: "not_purchased",
      });
    }

    const now = new Date();

    // trialing 判定
    if (data.stripe_subscription_status === "trialing") {
      if (!data.trial_end_at || new Date(data.trial_end_at) > now) {
        return res.status(200).json({
          ok: true,
          status: "trialing",
        });
      }
    }

    // active 判定
    if (data.stripe_subscription_status === "active") {
      if (!data.current_period_end || new Date(data.current_period_end) > now) {
        return res.status(200).json({
          ok: true,
          status: "active",
        });
      }
    }

    // それ以外（期限切れ・キャンセル）
    return res.status(200).json({
      ok: false,
      reason: "expired_or_canceled",
      status: data.stripe_subscription_status,
    });
  } catch (err) {
    console.error("product-guard fatal error:", err);
    return res.status(500).json({
      ok: false,
      reason: "server_error",
    });
  }
}
