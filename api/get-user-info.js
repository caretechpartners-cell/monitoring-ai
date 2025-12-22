import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false });
    }

    const { user_id, action } = req.body;

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

    // まず users を取得（既存仕様を維持しつつ必要項目を追加）
    const { data: user, error } = await supabase
      .from("users")
      .select(`
        id,
        email,
        user_name,
        plan,
        corp_user_limit,
        last_login_at,
        created_at,
        trial_end_at,
        stripe_customer_id
      `)
      .eq("id", user_id)
      .single();

    if (error || !user) {
      return res.status(200).json({
        success: false,
        reason: "user_not_found",
      });
    }

    // ----------------------------
    // ✅ Customer Portal URL 発行モード
    // ----------------------------
    if (action === "portal") {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
      });

      let customerId = user.stripe_customer_id;

      // usersに無い場合の保険：stripe_links を email で探す
      if (!customerId && user.email) {
        const { data: link } = await supabase
          .from("stripe_links")
          .select("stripe_customer_id")
          .eq("email", user.email)
          .single();

        if (link?.stripe_customer_id) customerId = link.stripe_customer_id;
      }

      if (!customerId) {
        return res.status(200).json({
          success: false,
          reason: "stripe_customer_not_found",
        });
      }

      // return_url（戻り先）
      const origin =
        process.env.APP_URL ||
        req.headers.origin ||
        "https://YOUR_DOMAIN_HERE"; // 念のため保険（必ず本番ではAPP_URL推奨）

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/status.html`,
      });

      return res.status(200).json({
        success: true,
        url: session.url,
      });
    }

    // ----------------------------
    // ✅ 既存：ユーザー情報を返すモード（そのまま）
    // ----------------------------
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
