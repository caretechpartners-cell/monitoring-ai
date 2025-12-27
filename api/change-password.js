import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    return res.status(400).json({ success: false });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // ✅ Auth だけ更新（唯一の正）
    await supabase.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    // ✅ users テーブルはフラグだけ
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
