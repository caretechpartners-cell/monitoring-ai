import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  const { data, error } = await supabase
    .from("stripe_links")
    .select("product_code, stripe_subscription_status")
    .eq("email", email)
    .in("stripe_subscription_status", ["active", "trialing"]);

  if (error) {
    return res.status(500).json({ error: "db error" });
  }

  const hasFacility = data.some(
    row => row.product_code === "facility_monitoring"
  );

  res.json({
    app: hasFacility ? "facility" : "home"
  });
}
