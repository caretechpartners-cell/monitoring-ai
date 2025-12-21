import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false });
    }

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(200).json({
        success: false,
        reason: "user_id_required",
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: user, error } = await supabase
      .from("users")
      .select(`
        id,
        email,
        user_name,
        plan,
        corp_user_limit,
        last_login_at,
        purchased_at
      `)
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(200).json({
        success: false,
        reason: "user_not_found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });

  } catch (err) {
    console.error("get-user-info error:", err);
    return res.status(200).json({
      success: false,
      reason: "system_error",
    });
  }
}
