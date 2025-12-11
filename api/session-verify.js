import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("====== SESSION VERIFY API START ======");

  if (req.method !== "POST") {
    console.log("❌ Method Not Allowed:", req.method);
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const { user_id, token } = req.body;

    console.log("REQ BODY:", req.body);

    if (!user_id || !token) {
      console.log("❌ Missing user_id or token");
      return res.status(400).json({
        success: false,
        message: "user_id と token は必須です",
      });
    }

    // Supabase クライアント
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // DB に登録されているトークンを取得
    const { data: user, error } = await supabase
      .from("users")
      .select("login_session_token")
      .eq("id", user_id)
      .single();

    console.log("FIND USER:", user);
    console.log("SUPABASE ERROR:", error);

    if (error || !user) {
      console.log("❌ User not found");
      return res.status(401).json({
        success: false,
        message: "ユーザーが存在しません",
      });
    }

    // トークン一致判定
    if (user.login_session_token !== token) {
      console.log("❌ Session token mismatch");
      return res.status(401).json({
        success: false,
        message: "セッションが無効です（別端末でログインされた可能性）",
      });
    }

    console.log("✅ SESSION VALID");
    return res.status(200).json({
      success: true,
      message: "セッション有効",
    });

  } catch (err) {
    console.error("❌ SESSION VERIFY EXCEPTION:", err);
    return res.status(500).json({
      success: false,
      message: "サーバーエラー",
    });
  }
}
