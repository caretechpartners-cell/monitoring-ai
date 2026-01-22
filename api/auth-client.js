import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const { action } = req.body;

  // 管理用（users更新・admin操作）
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 認証用（ログイン判定専用）
  const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // ============================
  // 🔑 ログイン処理（旧 login.js）
  // ============================
  if (action === "login") {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false });
    }

    // users テーブル取得
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (!user) {
      return res.status(401).json({ success: false });
    }

    // ✅ Authでログイン判定（唯一の正）
    const { error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ success: false });
    }

    // セッション更新
    const token = crypto.randomUUID();

    await supabase
      .from("users")
      .update({
        login_session_token: token,
        last_login_at: new Date().toISOString(),
      })
      .eq("auth_user_id", user.auth_user_id);

    console.log("LOGIN password_initialized =", user.password_initialized);

    return res.json({
      success: true,
      user: {
        id: user.auth_user_id,
        db_id: user.id,
        email: user.email,
        password_initialized: user.password_initialized,
        login_session_token: token,
      },
    });
  }

  // ===================================
  // 🔒 パスワード変更処理（旧 change-password.js）
  // ===================================
  if (action === "change_password") {
    const { user_id, new_password } = req.body;

    if (!user_id || !new_password) {
      return res.status(400).json({ success: false });
    }

    try {
      // ✅ Auth だけ更新（唯一の正）
      await supabase.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      // ✅ users テーブルはフラグだけ更新
      await supabase
        .from("users")
        .update({
          password_initialized: true,
          updated_at: new Date().toISOString(),
        })
        .eq("auth_user_id", user_id);

      return res.json({ success: true });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false });
    }
  }

  // 不正な action
  return res.status(400).json({ success: false });
}
