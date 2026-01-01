export const config = {
  runtime: "nodejs",
};

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
    return res.status(405).json({
      success: false,
      reason: "POST_only",
    });
  }

  const { action = "get" } = req.body;

  try {
/* =====================================================
   👤 ① ユーザー情報取得（status.html が使う）
===================================================== */
if (action === "get") {
  const { email, user_id } = req.body;

  let user;

  // ✅ auth_user_id 優先
  if (user_id) {
    const { data, error } = await supabase
      .from("users")
      .select(`
        id,
        auth_user_id,
        email,
        user_name,
        plan,
        corp_user_limit,
        stripe_customer_id
      `)
      .eq("auth_user_id", user_id)
      .single();

    if (error || !data) {
      return res.json({
        success: false,
        reason: "user_not_found",
        detail: error?.message || null,
      });
    }

    user = data;
  }
  // ✅ 後方互換：email
  else if (email) {
    const { data, error } = await supabase
      .from("users")
      .select(`
        id,
        auth_user_id,
        email,
        user_name,
        plan,
        corp_user_limit,
        stripe_customer_id
      `)
      .eq("email", email)
      .single();

    if (error || !data) {
      return res.json({
        success: false,
        reason: "user_not_found",
        detail: error?.message || null,
      });
    }

    user = data;
  } else {
    return res.json({
      success: false,
      reason: "email_or_user_id_required",
    });
  }

  // ✅ stripe_links は email で取得（これが正解）
  const { data: links } = await supabase
    .from("stripe_links")
    .select("product_code, stripe_subscription_status, trial_end_at")
    .eq("email", user.email);

  return res.json({
    success: true,
    user: {
      ...user,
      products: links || [],
    },
  });
}

    /* =====================================================
       💳 ② Stripe Customer Portal
    ===================================================== */
    if (action === "portal") {
      const { user_id } = req.body;

      const { data: user } = await supabase
        .from("users")
        .select("email, stripe_customer_id")
        .eq("auth_user_id", user_id)
        .single();

      let customerId = user?.stripe_customer_id;

// 保険：stripe_links から補完（複数行前提）
if (!customerId && user?.email) {
  const { data: links, error } = await supabase
    .from("stripe_links")
    .select("stripe_customer_id")
    .eq("email", user.email)
    .not("stripe_customer_id", "is", null)
    .limit(1);

  if (error) {
    console.error("stripe_links lookup error:", error);
  }

  if (links && links.length > 0) {
    customerId = links[0].stripe_customer_id;
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
       📋 ③ ユーザー一覧
    ===================================================== */
    if (action === "list") {
      if (!isAdmin(req)) {
        return res.status(401).json({
          error: "unauthorized_admin",
        });
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.json({ users: data });
    }

    /* =====================================================
       🧑‍💼 ④ 管理者：ユーザー作成
    ===================================================== */
    if (action === "create-user") {
      if (!isAdmin(req)) {
        return res.status(401).json({
          error: "unauthorized_admin",
        });
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
        return res.status(400).json({
          error: authError.message,
        });
      }

      const userId = authData.user.id;

      const { error: insertError } = await supabase
        .from("users")
        .insert({
          auth_user_id: userId,
          email,
          user_name,
          plan,
          corp_user_limit: Number(users),
          password_hash,
          phone,
          password_initialized: false,
        });

      if (insertError) {
        return res.status(500).json({
          error: "users_insert_failed",
          detail: insertError.message,
        });
      }

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
        return res.status(401).json({
          error: "unauthorized_admin",
        });
      }

      const { email } = req.body;

      const { data: user } = await supabase
        .from("users")
        .select("auth_user_id")
        .eq("email", email)
        .single();

      const user_id = user.auth_user_id;
      const newPassword = generatePassword();

      await supabase.auth.admin.updateUserById(user_id, {
        password: newPassword,
      });

      const password_hash = await bcrypt.hash(newPassword, 10);

      await supabase
        .from("users")
        .update({
          password_hash,
          password_initialized: false,
          updated_at: new Date().toISOString(),
        })
        .eq("auth_user_id", user_id);

      return res.json({
        success: true,
        temporaryPassword: newPassword,
      });
    }

    /* =====================================================
       🧩 ⑦ 管理者：プロダクト付与
    ===================================================== */
    if (action === "grant-product") {
      if (!isAdmin(req)) {
        return res.status(401).json({ error: "unauthorized_admin" });
      }

      const { email, product_code } = req.body;

      const now = new Date();
      const trialEnd =
        product_code === "conference"
          ? new Date(now.getTime() + 14 * 86400000)
          : null;

      await supabase
        .from("stripe_links")
        .upsert(
          {
            email,
            product_code,
            stripe_subscription_status: trialEnd ? "trialing" : "active",
            trial_end_at: trialEnd ? trialEnd.toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email,product_code" }
        );

      return res.json({
        success: true,
        email,
        product_code,
        trial_end_at: trialEnd,
      });
    }

    /* =====================================================
       📜 ⑥ 生成履歴取得
    ===================================================== */
    if (action === "get-history") {
      const { user_id } = req.body;

      const { data } = await supabase
        .from("ai_history")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });

      return res.json({
        success: true,
        data,
      });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    return res.status(500).json({
      error: "system_error",
      detail: String(err?.message || err),
    });
  }
}
