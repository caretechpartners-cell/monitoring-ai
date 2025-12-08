import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "未入力の項目があります" });
  }

  try {
    // ✅ Supabase users テーブル照合
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: "メールアドレスが存在しません" });
    }

    // ✅ パスワード照合（まずは平文で運用）
    if (data.password_hash !== password) {
      return res.status(401).json({ error: "パスワードが違います" });
    }

    // ✅ ログイン成功
    return res.status(200).json({
      success: true,
      user: {
        email: data.email,
        plan: data.plan,
        status: data.status,
      },
    });

  } catch (err) {
    return res.status(500).json({ error: "サーバーエラー" });
  }
}
