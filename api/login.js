const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  try {
    res.status(200).json({
      ok: true,
      message: "✅ login API is alive",
    });
  } catch (err) {
    res.status(500).json({
      error: "Server crashed",
      detail: err.message,
    });
  }
};
