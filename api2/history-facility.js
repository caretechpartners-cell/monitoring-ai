import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        message: "action is required",
      });
    }

    /* ============================
       auth_user_id（必須）
    ============================ */
    const auth_user_id = req.body.auth_user_id || req.body.user_id;

    if (!auth_user_id) {
      return res.status(400).json({
        success: false,
        message: "auth_user_id is required",
      });
    }

    /* ============================
       INSERT
    ============================ */
    if (action === "insert") {
      const {
        facility_name,
        resident_name,
        monitoring_scene,
        observation,
        special_notes,
        generated_text,
      } = req.body;

      if (!generated_text) {
        return res.status(400).json({
          success: false,
          message: "generated_text is required",
        });
      }

      const { data, error } = await supabase
        .from("facility_ai_history")
        .insert([
          {
            auth_user_id,
            facility_name,
            resident_name,
            monitoring_scene,
            observation,
            special_notes,
            generated_text,
          },
        ])
        .select();

      if (error) {
        console.error("facility insert error:", error);
        throw error;
      }

      return res.status(200).json({
        success: true,
        data,
      });
    }

    /* ============================
       GET
    ============================ */
    if (action === "get") {
      const { data, error } = await supabase
        .from("facility_ai_history")
        .select("*")
        .eq("auth_user_id", auth_user_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("facility get error:", error);
        throw error;
      }

      return res.status(200).json({
        success: true,
        data,
      });
    }

    return res.status(400).json({
      success: false,
      message: "invalid action",
    });

  } catch (err) {
    console.error("history-facility.js error:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
    });
  }
}
