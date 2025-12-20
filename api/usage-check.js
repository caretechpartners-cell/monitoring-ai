import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ★ service_role 必須
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        allowed: false,
        reason: "method_not_allowed",
      });
    }

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        allowed: false,
        reason: "user_id_required",
      });
    }

    // --------------------------
    // ユーザー情報取得
    // --------------------------
    const { data: user, error } = await supabase
      .from("users")
      .select(`
        stripe_subscription_status,
        stripe_customer_id,
        stripe_subscription_id,
        trial_end_at,
        current_period_end
      `)
      .eq("auth_user_id", user_id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        allowed: false,
        reason: "user_not_found",
      });
    }

    const status = user.stripe_subscription_status;

    // --------------------------
    // Stripe ステータス判定
    // --------------------------

    // 利用 OK
    if (status === "trialing" || status === "active") {
      return res.json({
        allowed: true,
        reason: null,
      });
    }

    // 支払い失敗系
    if (status === "past_due" || status === "unpaid") {
      return res.json({
        allowed: false,
        reason: "payment_required",
      });
    }

    // 解約
    if (status === "canceled") {
      return res.json({
        allowed: false,
        reason: "subscription_canceled",
      });
    }

    // 未完了（カード未登録など）
    if (status === "incomplete") {
      return res.json({
        allowed: false,
        reason: "subscription_incomplete",
      });
    }

    // それ以外（null / 不正 / 未登録）
    return res.json({
      allowed: false,
      reason: "not_subscribed",
    });

  } catch (e) {
    console.error("usage-check error:", e);
    return res.status(500).json({
      allowed: false,
      reason: "server_error",
    });
  }
}
