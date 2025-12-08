import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ 無料回数管理（簡易）
const freeUsageMap = {};
const FREE_LIMIT = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userIP =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown";

    const currentCount = freeUsageMap[userIP] || 0;

    if (currentCount >= FREE_LIMIT) {
      return res.status(403).json({ error: "無料回数終了" });
    }

    freeUsageMap[userIP] = currentCount + 1;

    const userText = req.body.text;

    const systemPrompt = `
あなたは日本の介護保険制度に精通した、実務特化型のケアマネジャー支援AIです。
以下のルールを必ず厳守して、**実地指導・監査に耐える正式なモニタリング記録のみを出力してください。**

【絶対ルール】
・主観表現は禁止
・断定口調、事実ベース
・5W1Hを必ず意識
・医療行為は禁止
・200〜350文字

【必須構成】
① 総合評価  
② 身体・精神・生活面の変化  
③ リスク評価  
④ 支援内容の妥当性  
⑤ 今後の方針  

【入力データ】
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    });

    const result = response.choices[0].message.content;

    res.json({
      result,
      remaining: FREE_LIMIT - freeUsageMap[userIP],
    });

  } catch (error) {
    res.status(500).json({ error: "生成エラー" });
  }
}
