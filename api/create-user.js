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

  // ① パスワード生成
  const password = Math.random().toString(36).slice(-10);

  // ② Authユーザー作成
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  const userId = authData.user.id;

  // ③ public.users に追加
  const { error: insertError } = await supabase
    .from("users")
    .insert({
      email,
      user_name,
      phone,
      plan,
      status: "active",
      corp_user_limit: users,
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

  return res.json({
    message: "ユーザーが作成されました",
    email,
    temporaryPassword: password,
    supabaseUserId: userId
  });
}
