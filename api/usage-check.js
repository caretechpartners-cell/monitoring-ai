import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ allowed: false });
    }

    const { user_id } = req.body;
    if (!user_id) {
      return res.status(200).json({
        allowed: false,
        reason: "user_id_required",
      });
    }

    // ✅ users.id で取得
    const { data: user, error } = await supabase
      .from("users")
      .select("stripe_subscription_status")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(200).json({
        allowed: false,
        reason: "user_not_found",
      });
    }

    const status = user.stripe_subscription_status;

    // 🔴 まだWebhook未反映
    if (!status) {
      return res.status(200).json({
        allowed: false,
        reason: "payment_required",
      });
    }

    // ✅ 利用OK条件
    if (status === "trialing" || status === "active") {
      return res.status(200).json({
        allowed: true,
        reason: null,
      });
    }

    // 🔴 解約
    if (status === "canceled") {
      return res.status(200).json({
        allowed: false,
        reason: "subscription_canceled",
      });
    }

    // 🔴 支払い不備など
    return res.status(200).json({
      allowed: false,
      reason: "payment_required",
    });

  } catch (err) {
    console.error("usage-check error:", err);
    return res.status(200).json({
      allowed: false,
      reason: "system_error",
    });
  }
}
