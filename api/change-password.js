export const config = {
  runtime: "nodejs",
};

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    return res.status(400).json({ success: false });
  }

  try {
    // ① Supabase Auth のパスワード更新
    await supabase.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    // ② users テーブル側も更新（初回フラグ）
    const password_hash = await bcrypt.hash(new_password, 10);

    await supabase
      .from("users")
      .update({
        password_hash,
        password_initialized: true,
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", user_id);

    return res.json({ success: true });
  } catch (err) {
    console.error("change-password error:", err);
    return res.status(500).json({ success: false });
  }
}
