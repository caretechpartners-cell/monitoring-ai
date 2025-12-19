import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const {
    email,
    plan,
    users,
    user_name,
    phone,
    billing_status,
    trial_start_at,
    trial_end_at
  } = req.body;

  // ① ランダムパスワード作成
  const rawPassword = Math.random().toString(36).slice(-10);

  // ② bcrypt ハッシュ化
  const password_hash = await bcrypt.hash(rawPassword, 10);

  // ③ Supabase Authユーザー作成
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

  // ④ public.users に保存（ここが重要）
  const insertData = {
    auth_user_id: userId,
    email,
    user_name,
    phone,
    plan,
    status: "active",
    corp_user_limit: users,
    password_hash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    purchased_at: new Date().toISOString(),
  };

  // 👇 オプション項目は条件付きで追加
  if (billing_status) insertData.billing_status = billing_status;
  if (trial_start_at) insertData.trial_start_at = trial_start_at;
  if (trial_end_at) insertData.trial_end_at = trial_end_at;

  const { error: insertError } = await supabase
    .from("users")
    .insert(insertData);

  if (insertError) {
    return res.status(400).json({
      error: "INSERT failed: " + insertError.message,
      detail: insertError
    });
  }

  return res.json({
    message: "ユーザーが作成されました",
    email,
    temporaryPassword: rawPassword,
    supabaseUserId: userId
  });
}
