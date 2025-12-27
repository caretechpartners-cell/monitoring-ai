import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const { email, password } = req.body;

  // 管理用（users更新）
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 認証用（ログイン判定）
  const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // users テーブル取得
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (!user) {
    return res.status(401).json({ success: false });
  }

  // ✅ Authでログイン判定（ここが最重要）
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

  return res.json({
  success: true,
  user: {
    id: user.auth_user_id,
    email: user.email,
    password_initialized: true, // ★ 強制的に true を返す
    login_session_token: token,
  },
});
}
