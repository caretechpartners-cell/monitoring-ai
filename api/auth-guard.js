import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        valid: false,
        allowed: false,
        reason: "method_not_allowed",
      });
    }

    const { user_id, token } = req.body;

    if (!user_id || !token) {
      return res.status(200).json({
        valid: false,
        allowed: false,
        reason: "user_id_or_token_required",
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // users 取得（email を必ず含める）
    const { data: user, error } = await supabase
      .from("users")
      .select("login_session_token, stripe_subscription_status, email, stripe_customer_id")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(200).json({
        valid: false,
        allowed: false,
        reason: "user_not_found",
      });
    }

    // セッション確認
    if (user.login_session_token !== token) {
      return res.status(200).json({
        valid: false,
        allowed: false,
        reason: "session_invalid",
      });
    }

    const status = user.stripe_subscription_status;

    // -------------------------
    // Webhook 未反映（暫定）
    // -------------------------
    if (!status && user.stripe_customer_id) {
  const { data: link } = await supabase
    .from("stripe_links")
    .select("stripe_subscription_status")
    .eq("stripe_customer_id", user.stripe_customer_id)
    .maybeSingle();

    if (
    link?.stripe_subscription_status === "trialing" ||
    link?.stripe_subscription_status === "active"
  ) {
    return res.status(200).json({
      valid: true,
      allowed: true,
      reason: null,
    });
  }

      return res.status(200).json({
        valid: true,
        allowed: false,
        reason: "payment_required",
      });
    }

    // -------------------------
    // 通常判定
    // -------------------------
    if (status === "trialing" || status === "active") {
      return res.status(200).json({
        valid: true,
        allowed: true,
        reason: null,
      });
    }

    if (status === "canceled") {
      return res.status(200).json({
        valid: true,
        allowed: false,
        reason: "subscription_canceled",
      });
    }

    return res.status(200).json({
      valid: true,
      allowed: false,
      reason: "payment_required",
    });

  } catch (err) {
    console.error("auth-guard error:", err);
    return res.status(200).json({
      valid: false,
      allowed: false,
      reason: "system_error",
    });
  }
}
