import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { action, type } = req.body;

    if (!action || !type) {
      return res.status(400).json({
        success: false,
        message: "action と type は必須です",
      });
    }

    /* ============================
       共通：ユーザー特定
    ============================ */
    const auth_user_id = req.body.user_id || req.body.auth_user_id;

    if (!auth_user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id が見つかりません",
      });
    }

   const { data: user, error: userError } = await supabase
  .from("users")
  .select("id")
  .eq("auth_user_id", auth_user_id)
  .maybeSingle();

if (userError) {
  console.error("user lookup error:", userError);
  return res.status(500).json({
    success: false,
    message: "user lookup failed",
    detail: userError.message,
  });
}

if (!user) {
  return res.status(400).json({
    success: false,
    message: "user not found",
    auth_user_id,
  });
}


    const user_db_id = user.id;

    /* ============================
       INSERT
    ============================ */
    if (action === "insert") {

      if (type === "monitoring") {
        const {
          seikatsu,
          shintai,
          fukuyaku,
          service,
          kibou,
          free_text,
          generated_text,
        } = req.body;

        if (!generated_text) {
          return res.status(400).json({
            success: false,
            message: "generated_text is required",
          });
        }

        const { data, error } = await supabase
          .from("ai_history")
          .insert([
            {
              user_id: user_db_id,
              seikatsu,
              shintai,
              fukuyaku,
              service,
              kibou,
              free_text,
              generated_text,
            },
          ])
          .select();

        if (error) throw error;

        return res.status(200).json({ success: true, data });
      }

      if (type === "conference") {
        const { memo, generated_text } = req.body;

        if (!generated_text) {
          return res.status(400).json({
            success: false,
            message: "generated_text is required",
          });
        }

        const { data, error } = await supabase
          .from("conf_ai_history")
          .insert([
            {
              user_id: user_db_id,
              memo,
              generated_text,
            },
          ])
          .select();

        if (error) throw error;

        return res.status(200).json({ success: true, data });
      }
    }

    /* ============================
       GET
    ============================ */
    if (action === "get") {

      if (type === "monitoring") {
        const { data, error } = await supabase
          .from("ai_history")
          .select("*")
          .eq("user_id", user_db_id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        return res.status(200).json({ success: true, data });
      }

      if (type === "conference") {
        const { data, error } = await supabase
          .from("conf_ai_history")
          .select("*")
          .eq("user_id", user_db_id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        return res.status(200).json({ success: true, data });
      }
    }

    return res.status(400).json({
      success: false,
      message: "invalid action or type",
    });

  } catch (err) {
    console.error("history.js error:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
    });
  }
}
