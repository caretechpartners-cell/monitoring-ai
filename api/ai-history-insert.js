import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("====== AI HISTORY INSERT API START ======");
  console.log("METHOD:", req.method);
  console.log("HEADERS:", req.headers);

  if (req.method !== "POST") {
    console.log("❌ Method Not Allowed:", req.method);
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    console.log("RAW BODY:", req.body);

    const {
      user_id,
      seikatsu,
      shintai,
      fukuyaku,
      service,
      kibou,
      free_text,
      generated_text
    } = req.body;

    console.log("REQ BODY (DESTRUCTURED):", {
      user_id,
      seikatsu,
      shintai,
      fukuyaku,
      service,
      kibou,
      free_text,
      generated_text
    });

    if (!user_id || !generated_text) {
      console.log("❌ Missing user_id or generated_text");
      return res.status(400).json({
        success: false,
        message: "user_id と generated_text は必須です",
      });
    }

    // Supabase クライアント
    console.log("ENV SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
    console.log("ENV SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log("🔍 INSERT START");

// ★ auth_user_id → users.id を取得する
const { data: user, error: userError } = await supabase
  .from("users")
  .select("id")
  .eq("auth_user_id", user_id)
  .single();

if (userError || !user) {
  return res.status(400).json({
    success: false,
    message: "user not found in users table",
  });
}


    // INSERT
    const { data, error } = await supabase
      .from("ai_history")
      .insert([
        {
      user_id: user.id, // ★ ここが唯一の正解
          seikatsu,
          shintai,
          fukuyaku,
          service,
          kibou,
          free_text,
          generated_text
        }
      ])
      .select();

    console.log("INSERT RESULT:", data);
    console.log("INSERT ERROR:", error);

    if (error) {
      console.log("❌ INSERT ERROR OCCURRED");
      return res.status(500).json({
        success: false,
        message: "DB INSERT ERROR",
        error: error.message,
      });
    }

    console.log("🎉 INSERT SUCCESS:", data);

    return res.status(200).json({
      success: true,
      message: "保存成功",
      item: data[0],
    });

  } catch (err) {
    console.error("❌ AI HISTORY INSERT EXCEPTION:", err);
    return res.status(500).json({
      success: false,
      message: "サーバーエラー",
    });
  }
}
