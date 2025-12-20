import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ allowed: false, reason: "method_not_allowed" });
    }

    const { user_id } = req.body;
    if (!user_id) {
      return res.json({ allowed: false, reason: "not_logged_in" });
    }

    // 🔑 users.id で検索（ここが超重要）
    const { data: user, error } = await supabase
      .from("users")
      .select("stripe_subscription_status")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.json({ allowed: false, reason: "user_not_found" });
    }

    const status = user.stripe_subscription_status;

    // ✅ 利用可能
    if (status === "trialing" || status === "active") {
      return res.json({ allowed: true });
    }

    // ❌ 支払い未完了
    if (status === "incomplete" || status === "past_due") {
      return res.json({ allowed: false, reason: "payment_required" });
    }

    // ❌ 解約
    if (status === "canceled") {
      return res.json({ allowed: false, reason: "subscription_canceled" });
    }

    return res.json({ allowed: false, reason: "billing_inactive" });

  } catch (err) {
    console.error("usage-check error:", err);
    return res.json({ allowed: false, reason: "system_error" });
  }
}
