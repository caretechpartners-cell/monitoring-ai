import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto"; // ★ セッショントークン生成用

export default async function handler(req, res) {

  console.log("====== LOGIN API START ======");

  if (req.method !== "POST") {
    console.log("❌ Method Not Allowed:", req.method);
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { email, password } = req.body;

    console.log("REQ BODY:", req.body);

    if (!email || !password) {
      console.log("❌ Missing email or password");
      return res.status(400).json({
        success: false,
        message: "メールアドレスとパスワードは必須です",
      });
    }

    // Supabase クライアント
    console.log("🔑 SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
    console.log("🔑 SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // email で users テーブルから取得
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    console.log("FIND USER:", user);
    console.log("SUPABASE ERROR:", error);

    if (error || !user) {
      console.log("❌ User not found");
      return res.status(401).json({
        success: false,
        message: "メールアドレスまたはパスワードが違います",
      });
    }

    console.log("HASH (DB password_hash):", user.password_hash);
    console.log("RAW PASSWORD (input):", password);

    // bcrypt 検証
    const isMatch = await bcrypt.compare(password, user.password_hash);
    console.log("COMPARE RESULT:", isMatch);

    if (!isMatch) {
      console.log("❌ Password mismatch");
      return res.status(401).json({
        success: false,
        message: "メールアドレスまたはパスワードが違います",
      });
    }

    // JST の現在時刻を生成
    const nowJST = new Date(Date.now() + (9 * 60 * 60 * 1000))
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    // ★ セッション用トークンを生成（同時ログイン防止）
    const sessionToken = crypto.randomUUID();
    console.log("NEW SESSION TOKEN:", sessionToken);

    // last_login_at & login_session_token 同時更新
    const { error: updateError } = await supabase
      .from("users")
      .update({
        last_login_at: nowJST,
        login_session_token: sessionToken,  // ★ 追加
      })
      .eq("id", user.id);

    console.log("UPDATE LOGIN TIME ERROR:", updateError);

    console.log("✅ Login success for:", user.email);

    // 成功レスポンス
    return res.status(200).json({
      success: true,
      message: "ログイン成功",
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        status: user.status,
        login_session_token: sessionToken, // ★ 追加
      },
    });

  } catch (err) {
    console.error("❌ LOGIN EXCEPTION:", err);
    return res.status(500).json({
      success: false,
      message: "サーバーエラー",
    });
  }
}
