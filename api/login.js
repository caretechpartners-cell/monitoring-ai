import { createClient } from "@supabase/supabase-js";

/**
 * Vercel Serverless Function
 * POST /api/login
 */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // ✅ CORS対策
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "メールアドレスとパスワードは必須です",
      });
    }

    // ✅ Supabase users テーブル検索
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !data) {
      return res.status(401).json({
        success: false,
        message: "メールアドレスが見つかりません",
      });
    }

    // ✅ パスワード照合（今は平文一致）
    if (data.password !== password) {
      return res.status(401).json({
        success: false,
        message: "パスワードが違います",
      });
    }

    // ✅ ログイン成功
    return res.status(200).json({
      success: true,
      message: "ログイン成功",
      user: {
        email: data.email,
        plan: data.plan,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "サーバーエラー",
    });
  }
}
