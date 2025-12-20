import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
        stripe_subscription_id
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
    // Stripe 課金状態判定
    // --------------------------
    if (status === "trialing" || status === "active") {
      return res.status(200).json({
        allowed: true,
        reason: null,
      });
    }

    // --------------------------
    // 利用不可ステータス
    // --------------------------
    return res.status(200).json({
      allowed: false,
      reason: status || "subscription_inactive",
    });

  } catch (err) {
    console.error("usage-check error:", err);
    return res.status(500).json({
      allowed: false,
      reason: "server_error",
    });
  }
}
