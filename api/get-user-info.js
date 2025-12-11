// /api/get-user-info.js

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // POST 以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "email は必須です",
    });
  }

  try {
    // Supabase クライアント
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log("🔍 Fetching user info for:", email);

    // users テーブルからメールで検索
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !data) {
      console.log("❌ USER NOT FOUND:", error);
      return res.status(404).json({
        success: false,
        message: "ユーザーが見つかりません",
      });
    }

    console.log("✅ USER FOUND:", data);

    return res.status(200).json({
      success: true,
      user: data,
    });

  } catch (err) {
    console.error("❌ API ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "サーバーエラー",
    });
  }
}
