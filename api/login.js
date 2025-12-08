import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    console.log("✅ login API 起動");

    console.log("ENV確認:", {
      url: !!process.env.SUPABASE_URL,
      key: !!process.env.SUPABASE_ANON_KEY,
    });

    return res.status(200).json({
      ok: true,
      env: {
        url: !!process.env.SUPABASE_URL,
        key: !!process.env.SUPABASE_ANON_KEY,
      }
    });

  } catch (err) {
    return res.status(500).json({
      error: "login API crash",
      message: err.message
    });
  }
}
