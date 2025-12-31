// /api/product-guard.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      reason: "method_not_allowed",
    });
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

    // email × product_code で 1 レコード取得
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

    // レコードが存在しない = 一度も付与されていない
    if (!data) {
      return res.status(200).json({
        ok: false,
        reason: "not_granted",
      });
    }

    const now = new Date();

    /* =====================================================
       ① trial_end_at が未来 → 無条件で使用OK
       （トライアル中・解約後トライアル継続を含む）
    ===================================================== */
    if (data.trial_end_at && new Date(data.trial_end_at) >= now) {
      return res.status(200).json({
        ok: true,
        mode: "trial",
        trial_end_at: data.trial_end_at,
      });
    }

/* =====================================================
   ①-0 trialing かつ trial_end_at 未設定
   （trial開始直後の正常状態）
===================================================== */
if (
  data.stripe_subscription_status === "trialing" &&
  !data.trial_end_at
) {
  return res.status(200).json({
    ok: true,
    mode: "trial",
  });
}

    /* =====================================================
       ② 本契約中（active）
       - current_period_end が未来 or 未設定
    ===================================================== */
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

    /* =====================================================
       ③ それ以外は使用不可
       （trial終了・解約済み・期限切れ）
    ===================================================== */
    return res.status(200).json({
      ok: false,
      reason: "expired",
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
