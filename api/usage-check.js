import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ★ service_role 必須
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // --------------------------
    // ユーザー情報取得
    // --------------------------
    const { data: user, error } = await supabase
      .from("users")
      .select("billing_status, trial_start_at, trial_end_at")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        allowed: false,
        reason: "user_not_found",
      });
    }

    const now = new Date();

    // --------------------------
    // 課金状態判定
    // --------------------------
    if (user.billing_status === "active") {
      return res.json({
        allowed: true,
        reason: null,
      });
    }

    if (user.billing_status === "trial") {
      if (!user.trial_end_at) {
        return res.json({
          allowed: false,
          reason: "trial_invalid",
        });
      }

      const trialEnd = new Date(user.trial_end_at);

      if (now <= trialEnd) {
        return res.json({
          allowed: true,
          reason: null,
        });
      }

      // trial 期限切れ
      return res.json({
        allowed: false,
        reason: "trial_expired",
      });
    }

    // それ以外（expired / unpaid / etc）
    return res.json({
      allowed: false,
      reason: "billing_inactive",
    });

  } catch (e) {
    console.error("usage-check error:", e);
    return res.status(500).json({
      allowed: false,
      reason: "server_error",
    });
  }
}
