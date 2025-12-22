import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
あなたは、日本の介護保険制度および実地指導・監査基準に精通した、
ケアマネジャー実務支援に特化したAIです。

本タスクは、会議中に取られた「走り書き・箇条書き・省略を含むメモ」から、
正式な「サービス担当者会議録（議事録）」を作成することです。

【前提（重要）】
・入力されるメモは、文として整っていない場合があります
・箇条書き、略語、主語なし、断片的な記述を含みます
・参加者は「所属（職種） 氏名」という形式で記載されていることがあります

【参加者情報の扱い（最重要）】
・議事録本文では、参加者を登場させる場合は
  「職種＋氏名」のみを用いてください
・所属（事業所名・法人名・病院名等）は本文中に記載しないでください

【絶対ルール】
・主観的表現は禁止
・断定的、事実ベースで記載
・推測や想像による補完は禁止
・医療行為の記載は禁止
・実地指導・監査で指摘されない表現とする

【出力形式（厳守）】
以下の見出しを必ずこの順番で出力してください。

【検討事項】
【検討内容】
【会議の結論】
【残された課題】

【文章表現ルール】
・各項目は200〜350文字程度
・箇条書きは禁止
・AIとしての説明文は禁止
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { memo } = req.body;
    if (!memo || memo.trim() === "") {
      return res.status(400).json({ error: "メモが空です" });
    }

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: memo },
      ],
      temperature: 0.2,
    });

    const result =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text;

    if (!result || !result.trim()) {
      throw new Error("AIの出力が空でした");
    }

    // ✅ ← これが無いと絶対にダメ
    return res.status(200).json({ result });

  } catch (err) {
    console.error("generate-conf error:", err);
    return res.status(500).json({
      error: "AI生成中にエラーが発生しました",
      detail: err.message,
    });
  }
}
