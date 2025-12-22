import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import bcrypt from "bcryptjs";

/* ===============================
   初期化
================================ */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

/* ===============================
   共通ユーティリティ
================================ */
function generatePassword() {
  return Math.random().toString(36).slice(-10);
}

function isAdmin(req) {
  const adminKey = req.headers["x-admin-key"];
  return adminKey && adminKey === process.env.ADMIN_SECRET_KEY;
}

/* ===============================
   user.js 統合ハンドラ
================================ */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, reason: "POST_only" });
  }

  const { action = "get" } = req.body;

  try {
    /* =====================================================
       👤 ① ユーザー情報取得（旧 get-user-info）
       ===================================================== */
    if (action === "get") {
      const { user_id } = req.body;

      if (!user_id) {
        return res.json({ success: false, reason: "user_id_required" });
      }

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
        return res.json({ success: false, reason: "user_not_found" });
      }

      return res.json({ success: true, user });
    }

    /* =====================================================
       💳 ② Stripe Customer Portal
       ===================================================== */
    if (action === "portal") {
      const { user_id } = req.body;

      const { data: user } = await supabase
        .from("users")
        .select("email, stripe_customer_id")
        .eq("id", user_id)
        .single();

      let customerId = user?.stripe_customer_id;

      // 保険：stripe_links から補完
      if (!customerId && user?.email) {
        const { data: link } = await supabase
          .from("stripe_links")
          .select("stripe_customer_id")
          .eq("email", user.email)
          .single();

        if (link?.stripe_customer_id) {
          customerId = link.stripe_customer_id;
        }
      }

      if (!customerId) {
        return res.json({
          success: false,
          reason: "stripe_customer_not_found",
        });
      }

      const origin =
        process.env.APP_URL ||
        req.headers.origin ||
        "https://YOUR_DOMAIN_HERE";

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/app.html`,
      });

      return res.json({
        success: true,
        url: session.url,
      });
    }

    /* =====================================================
       📋 ③ ユーザー一覧（旧 list-users）
       ===================================================== */
    if (action === "list") {
      if (!isAdmin(req)) {
        return res.status(401).json({ error: "unauthorized_admin" });
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({ users: data });
    }

    /* =====================================================
       🧑‍💼 ④ 管理者：ユーザー作成（旧 admin.js）
       ===================================================== */
    if (action === "create-user") {
      if (!isAdmin(req)) {
        return res.status(401).json({ error: "unauthorized_admin" });
      }

      const { email, plan, users, user_name, phone } = req.body;

      const rawPassword = generatePassword();
      const password_hash = await bcrypt.hash(rawPassword, 10);

      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          password: rawPassword,
        });

      if (authError) {
        return res.status(400).json({ error: authError.message });
      }

      const userId = authData.user.id;

      await supabase.from("users").insert({
        auth_user_id: userId,
        email,
        user_name,
        phone,
        plan,
        status: "active",
        corp_user_limit: Number(users),
        password_hash,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return res.json({
        success: true,
        email,
        temporaryPassword: rawPassword,
      });
    }

    /* =====================================================
       🔑 ⑤ 管理者：パスワード再発行
       ===================================================== */
    if (action === "reset-password") {
      if (!isAdmin(req)) {
        return res.status(401).json({ error: "unauthorized_admin" });
      }

      const { user_id, email } = req.body;
      const newPassword = generatePassword();

      await supabase.auth.admin.updateUserById(user_id, {
        password: newPassword,
      });

      const password_hash = await bcrypt.hash(newPassword, 10);

      await supabase
        .from("users")
        .update({
          password_hash,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email);

      return res.json({
        success: true,
        temporaryPassword: newPassword,
      });
    }

    /* =====================================================
       ❌ 未対応
       ===================================================== */
    return res.status(400).json({ error: "unknown_action" });

  } catch (err) {
    console.error("user.js error:", err);
    return res.status(500).json({ error: "system_error" });
  }
}
