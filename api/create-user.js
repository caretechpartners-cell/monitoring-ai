import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { email, plan, users, user_name, phone } = req.body;

  // ① 一時パスワード生成
  const password = Math.random().toString(36).slice(-10);

  // ② Supabase Auth ユーザー作成
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  const userId = authData.user.id; // ← AuthのUUID

  // ③ public.users にも登録（id に Auth の UUID を入れる）
  const { error: insertError } = await supabase
    .from("users")
    .insert({
      id: userId,            // ← これが無いと login.html で参照不可
      email: email,
      user_name: user_name || null,
      phone: phone || null,
      plan: plan,
      status: "active",
      corp_user_limit: users,
      temporary_pass: password, // ← 任意（管理用）
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      purchased_at: new Date().toISOString()
    });

  if (insertError) {
    return res.status(400).json({
      error: "INSERT failed: " + insertError.message,
      detail: insertError
    });
  }

  // ④ 返却
  return res.json({
    success: true,
    message: "ユーザーが作成されました",
    email,
    temporaryPassword: password,
    supabaseUserId: userId
  });
}
