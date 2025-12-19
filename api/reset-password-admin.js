import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generatePassword() {
  return Math.random().toString(36).slice(-10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { user_id, email } = req.body;
  if (!user_id || !email) {
    return res.status(400).json({ error: "user_id and email required" });
  }

  // ① 新しい一時PW
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

  // ④ users テーブル更新
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
