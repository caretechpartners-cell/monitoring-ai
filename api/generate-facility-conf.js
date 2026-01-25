import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const systemPrompt = `
あなたは、日本の介護保険制度および実地指導・監査基準に精通した、
施設ケアマネジャーの「説明責任」を支援するAIです。

本タスクは、サービス担当者会議の内容から、
実地指導・監査で第三者に説明可能な「判断の要点記録」を作成することです。

【出力形式（最重要・厳守）】
出力は、必ず以下の4項目のみで構成してください。
見出し名・順序・表記は一切変更してはいけません。

【検討事項】
【検討内容】
【会議の結論】
【残された課題】

【各項目に含める内容の定義（厳守）】

■【検討事項】
今回の会議での「主要な論点」「検討が必要となった背景・問題点」を記載する。
施設サービス計画との関係、リスク管理、医療・介護上の課題を中心に、
何が判断の対象となったのかが明確に分かるように記載する。

■【検討内容】
検討された具体的な選択肢・対応案を記載する。
必ず「検討したが採用しなかった主な選択肢」を1つ以上含めること。
各選択肢について、実務上の利点・リスク・制約条件が分かるように記載する。

■【会議の結論】
会議で最終的に決定された判断内容を明確に記載する。
あわせて、その判断に至った主な理由・判断根拠を必ず含めること。
消去法・リスク回避・安全性重視など、判断の性質が分かるように記載する。

■【残された課題】
今回の会議で解決に至らなかった点、
今後継続して検討・評価が必要な課題を記載する。
次回会議や日常支援に引き継ぐべき論点を明確にする。

【施設向け観点（入力に含まれる場合は必ず反映）】
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
・事実と判断理由を混在させず、論理が読み取れる構成とする  
・箇条書きは禁止  
・各項目は120〜250文字程度  
・AIとしての説明文は禁止  
・監査記録として自然な公的文体で記載する  
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
