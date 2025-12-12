import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 会議録 AI の無料回数（モニタリングとは別カウント）
const freeUsageMapConf = {};
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

    const current = freeUsageMapConf[userIP] || 0;
    if (current >= FREE_LIMIT) {
      return res.status(403).json({ error: "無料回数終了" });
    }
    freeUsageMapConf[userIP] = current + 1;

    const memo = req.body.memo || req.body.text;
    if (!memo) {
      return res.status(400).json({ error: "メモがありません" });
    }

    /* --------------------------------------------------
       会議録専用プロンプト
    -------------------------------------------------- */
    const systemPrompt = `
あなたは日本の介護保険制度に精通したケアマネ業務AIです。
以下のメモをもとに「サービス担当者会議録」を構造化して作成してください。

【構成（必須）】
【議題・検討した項目】
（箇条書き）

【検討内容】
（詳細説明）

【結論・今後の支援方針】
（決定事項）

【残された課題】
（未解決の課題）

出力形式は必ずこの構成でお願いします。
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: memo }
      ]
    });

    const result = response.choices[0].message.content;

    return res.status(200).json({
      result,
      remaining: FREE_LIMIT - freeUsageMapConf[userIP],
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "生成エラー", detail: err.message });
  }
}
