import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { email, plan, users } = req.body;

  // Supabaseにユーザーを作成（パスワード自動生成）
  const password = Math.random().toString(36).slice(-10);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { plan, users }
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({
    message: "ユーザーが作成されました",
    email,
    temporaryPassword: password,
    supabaseUserId: data.user?.id
  });
}
