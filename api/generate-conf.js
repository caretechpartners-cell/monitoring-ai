import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 無料回数（IP制限）
const freeUsageMap = {};
const FREE_LIMIT = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ----------------------------
    // IP別 回数カウント
    // ----------------------------
    const userIP =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown";

    const currentCount = freeUsageMap[userIP] || 0;

    if (currentCount >= FREE_LIMIT) {
      return res.status(403).json({ error: "無料回数終了" });
    }

    freeUsageMap[userIP] = currentCount + 1;

    // ----------------------------
    // ユーザー入力
    // ----------------------------
    const memoText = req.body.text;

    if (!memoText) {
      return res.status(400).json({ error: "text がありません" });
    }

    // ----------------------------
    // システムプロンプト
    // ----------------------------
    const systemPrompt = `
あなたは日本の介護保険制度に精通した、実務特化型のケアマネジャー支援AIです。

これは「サービス担当者会議録（議事録）」を作成するための補助AIです。

以下のルールを必ず厳守して、実地指導・監査に耐える正式な議事録文章のみを出力してください。

【絶対ルール】
・主観表現は禁止
・断定口調、事実ベースで記載
・5W1Hを必ず明確化
・医療行為は記載しない
・1段落 200〜350文字で文章を構成

【必須構成】
① 会議の目的と概要  
② 利用者の状態と課題  
③ 各サービス提供者からの報告  
④ リスク評価  
⑤ 支援方針（今後の方針）

【入力データ】
（以下はメモ書きです。文章を構成し直してください）
`;

    // ----------------------------
    // OpenAI API 呼び出し
    // ----------------------------
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: memoText },
      ],
    });

    const resultText = response.choices[0].message.content;

    // ----------------------------
    // 正常レスポンス
    // ----------------------------
    res.status(200).json({
      result: resultText,
      remaining: FREE_LIMIT - freeUsageMap[userIP],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "生成エラー", detail: error.message });
  }
}
