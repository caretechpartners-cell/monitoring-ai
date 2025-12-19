import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    /* ===============================
       🔐 ① 管理者キー検証
       =============================== */
    const adminKey = req.headers["x-admin-key"];

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(401).json({
        error: "unauthorized_admin",
      });
    }

    /* ===============================
       ② 入力チェック
       =============================== */
    const {
      auth_user_id,
      billing_status,
      trial_days,
      reason,
    } = req.body;

    if (!auth_user_id || !billing_status || !reason) {
      return res.status(400).json({
        error: "missing_parameters",
      });
    }

    const now = new Date();

    const updateData = {
      billing_status,
      updated_at: now.toISOString(),
    };

    // trial の場合は日付を再計算
    if (billing_status === "trial") {
      if (!trial_days || Number(trial_days) <= 0) {
        return res.status(400).json({
          error: "trial_days_required",
        });
      }

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + Number(trial_days));

      updateData.trial_start_at = now.toISOString();
      updateData.trial_end_at = trialEnd.toISOString();
    }

    // trial 以外は trial 日付をクリア
    if (billing_status !== "trial") {
      updateData.trial_start_at = null;
      updateData.trial_end_at = null;
    }

    /* ===============================
       ③ users テーブル更新
       =============================== */
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("auth_user_id", auth_user_id)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({
        error: "update_failed",
        detail: error?.message,
      });
    }

    /* ===============================
       ④ 監査ログ保存（超重要）
       =============================== */
    await supabase.from("admin_billing_logs").insert({
      auth_user_id,
      new_billing_status: billing_status,
      trial_days: billing_status === "trial" ? trial_days : null,
      reason,
      executed_at: now.toISOString(),
    });

    /* ===============================
       ⑤ 正常終了
       =============================== */
    return res.status(200).json({
      success: true,
      updated_user: data,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "internal_server_error",
    });
  }
}
