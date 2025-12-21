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

    // ✅ users.id で統一取得（1回だけ）
    const { data: user, error } = await supabase
      .from("users")
      .select("login_session_token, stripe_subscription_status")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(200).json({
        valid: false,
        allowed: false,
        reason: "user_not_found",
      });
    }

    // =========================
    // 🔐 session-verify.js 相当
    // =========================
    if (user.login_session_token !== token) {
      return res.status(200).json({
        valid: false,
        allowed: false,
        reason: "session_invalid",
      });
    }

    // =========================
    // 💳 usage-check.js 相当
    // =========================
    const status = user.stripe_subscription_status;

    // Webhook未反映
    if (!status) {
      return res.status(200).json({
        valid: true,
        allowed: false,
        reason: "payment_required",
      });
    }

    // 利用OK
    if (status === "trialing" || status === "active") {
      return res.status(200).json({
        valid: true,
        allowed: true,
        reason: null,
      });
    }

    // 解約
    if (status === "canceled") {
      return res.status(200).json({
        valid: true,
        allowed: false,
        reason: "subscription_canceled",
      });
    }

    // その他（支払い不備など）
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
