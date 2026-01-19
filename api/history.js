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

    const auth_user_id = req.body.user_id || req.body.auth_user_id;

    if (!auth_user_id) {
      return res.status(400).json({
        success: false,
        message: "auth_user_id が見つかりません",
      });
    }

    /* ============================
       users lookup（facility以外）
    ============================ */
    let user_db_id = null;

    if (type !== "facility") {
      const { data: user, error } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", auth_user_id)
        .single();

      if (error) {
        console.error("user lookup error:", error);
        return res.status(500).json({
          success: false,
          message: "user lookup failed",
        });
      }

      user_db_id = user.id;
    }

    /* ============================
       INSERT
    ============================ */
    if (action === "insert") {

      if (type === "conference") {
        const { memo, generated_text } = req.body;

        const { data, error } = await supabase
          .from("conf_ai_history")
          .insert([{ user_id: user_db_id, memo, generated_text }])
          .select();

        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      if (type === "facility") {
        const {
          facility_name,
          resident_name,
          monitoring_scene,
          observation,
          special_notes,
          generated_text,
        } = req.body;

        const { data, error } = await supabase
          .from("facility_ai_history")
          .insert([{
            auth_user_id,
            facility_name,
            resident_name,
            monitoring_scene,
            observation,
            special_notes,
            generated_text,
          }])
          .select();

        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }
    }

    /* ============================
       GET
    ============================ */
    if (action === "get") {

      if (type === "conference") {
        const { data, error } = await supabase
          .from("conf_ai_history")
          .select("*")
          .eq("user_id", user_db_id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

       if (type === "monitoring") {
    const { data, error } = await supabase
      .from("monitoring_ai_history")
      .select("*")
      .eq("user_id", user_db_id)   // ★ここが重要
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.status(200).json({ success: true, data });
  }

      if (type === "facility") {
        const { data, error } = await supabase
          .from("facility_ai_history")
          .select("*")
          .eq("auth_user_id", auth_user_id)
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
