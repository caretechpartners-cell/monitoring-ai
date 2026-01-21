// /api/access-guard.js
import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "nodejs",
};

/* ===============================
   初期化
================================ */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===============================
   統合ハンドラ
================================ */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
    });
  }

  const { action } = req.body;

  try {
    /* =====================================================
       ① auth-guard 相当
       action: "auth-guard"
    ===================================================== */
    if (action === "auth-guard") {
      const { user_id, token } = req.body;

      if (!user_id || !token) {
        return res.status(200).json({
          valid: false,
          allowed: false,
          reason: "user_id_or_token_required",
        });
      }

      // users 取得（email を必ず含める）
      const { data: user, error } = await supabase
        .from("users")
        .select(
          "login_session_token, stripe_subscription_status, email, stripe_customer_id"
        )
        .eq("auth_user_id", user_id)
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
      if (!status) {
        const { data: link } = await supabase
          .from("stripe_links")
          .select("stripe_subscription_status")
          .eq("email", user.email)
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
    }

    /* =====================================================
       ② product-guard 相当
       action: "product-guard"
    ===================================================== */
    if (action === "product-guard") {
      const { email, product_code } = req.body;

      if (!email || !product_code) {
        return res.status(400).json({
          ok: false,
          reason: "missing_param",
          message: "email と product_code は必須です",
        });
      }

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
        console.error("product-guard db error:", error);
        return res.status(500).json({
          ok: false,
          reason: "db_error",
        });
      }

      // 一度も付与されていない
      if (!data) {
        return res.status(200).json({
          ok: false,
          reason: "not_granted",
        });
      }

      const now = new Date();

      /* ① trial_end_at が未来 */
      if (data.trial_end_at && new Date(data.trial_end_at) >= now) {
        return res.status(200).json({
          ok: true,
          mode: "trial",
          trial_end_at: data.trial_end_at,
        });
      }

      /* ①-0 trialing かつ trial_end_at 未設定 */
      if (
        data.stripe_subscription_status === "trialing" &&
        !data.trial_end_at
      ) {
        return res.status(200).json({
          ok: true,
          mode: "trial",
        });
      }

      /* ② active */
      if (data.stripe_subscription_status === "active") {
        if (
          !data.current_period_end ||
          new Date(data.current_period_end) >= now
        ) {
          return res.status(200).json({
            ok: true,
            mode: "active",
          });
        }
      }

      /* ③ 使用不可 */
      return res.status(200).json({
        ok: false,
        reason: "expired",
        status: data.stripe_subscription_status,
      });
    }

    /* =====================================================
       ③ resolve-app 相当
       action: "resolve-app"
    ===================================================== */
    if (action === "resolve-app") {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "email required" });
      }

      const { data, error } = await supabase
        .from("stripe_links")
        .select("product_code, stripe_subscription_status")
        .eq("email", email)
        .in("stripe_subscription_status", ["active", "trialing"]);

      if (error) {
        return res.status(500).json({ error: "db error" });
      }

      const hasFacility = data.some(
        row => row.product_code === "facility_monitoring"
      );

      return res.json({
        app: hasFacility ? "facility" : "home",
      });
    }

    /* =====================================================
       未知 action
    ===================================================== */
    return res.status(400).json({
      error: "unknown_action",
    });

  } catch (err) {
    console.error("access-guard fatal error:", err);
    return res.status(500).json({
      error: "system_error",
      detail: String(err?.message || err),
    });
  }
}
