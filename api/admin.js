import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===============================
   共通ユーティリティ
================================ */

function generatePassword() {
  return Math.random().toString(36).slice(-10);
}

/* ===============================
   admin.js 統合ハンドラ
================================ */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

const adminKey = req.headers["x-admin-key"];

if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
  return res.status(401).json({
    error: "unauthorized_admin",
  });
}

  const { action } = req.body;

  if (!action) {
    return res.status(400).json({ error: "action is required" });
  }

  try {
    /* =====================================================
       🧑‍💼 ① ユーザー新規作成（旧 create-user.js）
       ===================================================== */
    if (action === "create-user") {
      const {
        email,
        plan,
        users,
        user_name,
        phone,
        billing_status,
        trial_start_at,
        trial_end_at,
      } = req.body;

      if (!email || !user_name || !plan || !users) {
  return res.status(400).json({
    error: "missing_parameters",
  });
}

      // ① 一時パスワード生成
      const rawPassword = generatePassword();

      // ② bcrypt
      const password_hash = await bcrypt.hash(rawPassword, 10);

      // ③ Supabase Auth 作成
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          password: rawPassword,
        });

      if (authError) {
        return res.status(400).json({ error: authError.message });
      }

      const userId = authData.user.id;

      // ④ users テーブル保存
      const insertData = {
        auth_user_id: userId,
        email,
        user_name,
        phone,
        plan,
        status: "active",
        corp_user_limit: Number(users),
        password_hash,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        purchased_at: new Date().toISOString(),
      };

      if (billing_status) insertData.billing_status = billing_status;
      if (trial_start_at) insertData.trial_start_at = trial_start_at;
      if (trial_end_at) insertData.trial_end_at = trial_end_at;

      const { error: insertError } = await supabase
        .from("users")
        .insert(insertData);

      if (insertError) {
        return res.status(400).json({
          error: "INSERT failed",
          detail: insertError.message,
        });
      }

      return res.json({
        message: "ユーザーが作成されました",
        email,
        temporaryPassword: rawPassword,
        supabaseUserId: userId,
      });
    }

    /* =====================================================
       🔑 ② パスワード再発行（旧 reset-password-admin.js）
       ===================================================== */
    if (action === "reset-password") {
      const { user_id, email } = req.body;

      if (!user_id || !email) {
        return res.status(400).json({
          error: "user_id and email required",
        });
      }

      // ① 新PW
      const newPassword = generatePassword();

      // ② Supabase Auth 更新
      const { error: authError } =
        await supabase.auth.admin.updateUserById(user_id, {
          password: newPassword,
        });

      if (authError) {
        return res.status(400).json({ error: authError.message });
      }

      // ③ bcrypt
      const password_hash = await bcrypt.hash(newPassword, 10);

      // ④ users 更新
      const { error: updateError } = await supabase
        .from("users")
        .update({
          password_hash,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email);

      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }

      return res.json({
        message: "パスワードを再発行しました",
        email,
        temporaryPassword: newPassword,
      });
    }

    /* =====================================================
       💳 ③ 課金ステータス変更（旧 admin-update-billing.js）
       ===================================================== */
      if (action === "update-billing") {
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

      // trial の場合
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
      } else {
        updateData.trial_start_at = null;
        updateData.trial_end_at = null;
      }

      // users 更新
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

      // 監査ログ
      await supabase.from("admin_billing_logs").insert({
        auth_user_id,
        new_billing_status: billing_status,
        trial_days: billing_status === "trial" ? trial_days : null,
        reason,
        executed_at: now.toISOString(),
      });

      return res.status(200).json({
        success: true,
        updated_user: data,
      });
    }

    /* =====================================================
       ❌ 未対応 action
       ===================================================== */
    return res.status(400).json({
      error: "unknown_action",
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "internal_server_error",
    });
  }
}
