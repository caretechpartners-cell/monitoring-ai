import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export default async function handler(req, res) {
  const { user_id, new_password } = req.body;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ① Supabase Auth 更新
  await supabase.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  // ② bcrypt hash
  const hash = await bcrypt.hash(new_password, 10);

  // ③ セッショントークン再発行
  const newSessionToken = crypto.randomUUID();

  await supabase
    .from("users")
    .update({
      password_hash: hash,
      password_initialized: true,
      login_session_token: newSessionToken,
    })
    .eq("auth_user_id", user_id);

  return res.json({ success: true });
}
