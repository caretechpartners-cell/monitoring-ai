import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ valid: false });
    }

    const { user_id, token } = req.body;

    if (!user_id || !token) {
      return res.status(200).json({ valid: false });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ✅ users.id で検索する（ここが修正点）
    const { data: user, error } = await supabase
      .from("users")
      .select("login_session_token")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(200).json({ valid: false });
    }

    // 🔐 同時ログイン防止のコア判定
    if (user.login_session_token !== token) {
      return res.status(200).json({ valid: false });
    }

    // 問題なし
    return res.status(200).json({ valid: true });

  } catch (err) {
    console.error("session-verify error:", err);
    return res.status(200).json({ valid: false });
  }
}
