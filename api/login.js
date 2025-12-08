import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
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

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ✅ email でユーザー取得
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: "メールアドレスまたはパスワードが違います",
      });
    }

    // ✅ bcrypt でハッシュ照合
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "メールアドレスまたはパスワードが違います",
      });
    }

    // ✅ 最終ログイン更新
    await supabase
      .from("users")
      .update({ last_login_at: new Date() })
      .eq("id", user.id);

    return res.status(200).json({
      success: true,
      message: "ログイン成功",
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        status: user.status,
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
