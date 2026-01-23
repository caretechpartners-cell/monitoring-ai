import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const systemPrompt = `
あなたは、日本の介護保険制度および実地指導・監査基準に精通した、
施設ケアマネジャーの「説明責任」を支援するAIです。

本タスクは、サービス担当者会議の内容から、

・今回の会議での主要な論点  
・検討した選択肢  
・最終的な判断内容  
・その判断に至った理由  
・今後の継続課題  

を整理し、
「実地指導・監査で、第三者に説明できる記録」
として要点化することです。

【前提（重要）】
・入力は、会議で実際に共有・確認された事実、判断材料、選択肢、結論のみです  
・会話の再現ではなく、「判断の構造化」を目的とします  
・施設サービス計画との整合性、多職種連携、リスク管理の観点を重視してください  

【施設向け観点（必ず意識）】
以下の視点が、入力に含まれている場合は必ず反映してください。

・施設サービス計画との整合性  
・医師・看護職・介護職等の役割分担  
・医療連携・健康管理上の判断  
・事故防止・リスク管理上の判断  
・利用者および家族への説明内容  

【絶対ルール】
・主観的表現は禁止  
・推測による補完は禁止  
・入力に記載のない事項は補完せず、「記載なし」「会議記録上確認できず」等と明示する  
・一般論・制度解説・理想論は禁止  
・会議で実際に確認された事実・判断理由のみを用いる  
・事実と判断理由を明確に分けて記載する  
・「なぜその結論か」が必ず読み取れる構成とする  
・見出し名の変更・言い換えは禁止
・見出し文言は、必ず以下の5つをそのまま使用すること。出力形式厳守。

【主要な論点】
【検討した選択肢】
【最終的な判断】
【判断理由】
【今後の課題】

【文章表現ルール】
・各項目は120〜250文字程度  
・箇条書きは禁止  
・AIとしての説明文は禁止  
・監査記録として自然な公的文体で記載する  

【重要補足ルール】
・必ず「他に検討したが採用しなかった選択肢」も含めること
・なぜそれらを採用しなかったのかを、簡潔に記載すること
・最終判断が「消去法」や「リスク回避」に基づく場合は、その点を明示すること
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

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: memo }
      ],
      temperature: 0.2
    });

    const result = completion.choices[0].message.content;

    res.status(200).json({ result });

  } catch (err) {
    console.error("generate-conf error:", err);
    res.status(500).json({
      error: "AI生成中にエラーが発生しました",
      detail: err.message
    });
  }
}
