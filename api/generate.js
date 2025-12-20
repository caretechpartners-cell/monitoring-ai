import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 未ログイン用無料制限
const freeUsageMap = {};
const FREE_LIMIT = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, user_id } = req.body;
    let userIP = null;

    // ----------------------------
    // 未ログインユーザーのみ制限
    // ----------------------------
    if (!user_id) {
      userIP =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "unknown";

      const currentCount = freeUsageMap[userIP] || 0;

      if (currentCount >= FREE_LIMIT) {
        return res.status(403).json({
          error: "free_limit_exceeded",
        });
      }

      freeUsageMap[userIP] = currentCount + 1;
    }

    const systemPrompt = `
あなたは日本の介護保険制度に精通した、実務特化型のケアマネジャー支援AIです。
以下のルールを必ず厳守し、実地指導・監査に耐える正式なモニタリング記録のみを出力してください。

【絶対ルール】
・主観表現は禁止（感想・印象・推測は書かない）
・断定口調、事実ベース
・5W1Hを必ず意識
・医療行為・診断行為は禁止
・200〜350文字
・箇条書きは禁止（文章形式で記載）

【出力形式（必須）】
以下①〜⑤を【見出し付き】で必ず出力すること。
見出し名は【】で囲み、順番を厳守すること。

【① 身体・精神・生活面の変化】
【② リスク評価】
【③ 支援（サービス）内容の妥当性】
【④ 総合評価】
【⑤ 今後の方針】

【各項目の注意点】

■ ① 身体・精神・生活面の変化  
身体状況、精神・認知面、日常生活動作・生活リズムの変化を、入力情報をもとに事実として整理すること。

■ ② リスク評価  
以下の観点を「明示せずに」必ず内部的に考慮したうえで文章化すること。
・転倒リスク
・服薬管理上のリスク
・認知機能低下に伴うリスク
・虐待・セルフネグレクト等のリスク  
※ 問題がない場合も「大きなリスクは認められていない」等の形で必ず言及すること。

■ ③ 支援（サービス）内容の妥当性  
現在のサービス内容が、利用者の状態・生活状況・課題に対して適切であるかを制度的観点から評価すること。

■ ④ 総合評価  
全体を俯瞰し、現状の支援体制が安定しているか、課題が整理されているかを簡潔にまとめること。

■ ⑤ 今後の方針  
今後の支援継続方針を簡潔に記載すること。
あわせて、必ず「次回モニタリング時期」を明示すること。

【次回モニタリング時期の記載ルール】
・入力データ内に具体的な日付の記載がある場合は、その日付をそのまま用いること。
・入力データ内に日付の記載がない場合は、以下の文言を必ずそのまま出力すること。

「次回モニタリングは〇〇年△△月□□日とする。」

・具体的な年月日をAIが推測・補完することは禁止。

・「約〇か月後」「目安として」「予定」等の曖昧な表現は禁止。

【入力データ】
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });

    const result = response.choices[0].message.content;

    const responseBody = { result };

    // 未ログイン時のみ remaining を返す
    if (userIP) {
      responseBody.remaining = FREE_LIMIT - freeUsageMap[userIP];
    }

    return res.status(200).json(responseBody);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "生成エラー" });
  }
}
