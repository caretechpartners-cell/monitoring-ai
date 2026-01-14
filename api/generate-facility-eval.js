// ================================
// 施設モニタリング 評価整理AI
// /api/generate-facility-eval.js
// ================================

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      facilityType,
      basicInfo,
      monitoringFacts,
      multiDisciplinaryInfo,
      planGoal,
      checkPoint,
    } = req.body;

    // 最低限のバリデーション
    if (!facilityType || !monitoringFacts) {
      return res.status(400).json({
        error: "必要な情報が不足しています",
      });
    }

    const prompt = `
あなたは「介護保険施設における計画担当介護支援専門員（施設ケアマネ）」を支援するAIです。
あなたの役割は【判断を下すこと】ではありません。
施設ケアマネが行ったモニタリング結果をもとに、
【評価の整理】【説明可能な文章化】を行うことです。

以下の点を必ず守ってください。

【重要な前提】
・判断主体は常に施設ケアマネ本人です
・断定的な医学判断、専門職判断は行わないでください
・「〜と考えられる」「〜と評価できる」「〜と整理できる」等の表現を用いてください
・実地指導・監査で説明可能な文章構成にしてください
・居宅ケアマネ向けの表現・視点は一切使わないでください

【施設ケアマネジメントの視点】
・チームアプローチ
・生活の継続性
・安全配慮とリスク予防
・ケアプランとの整合性
・多職種連携による評価

【入力情報】
■ 施設種別
${facilityType}

■ 利用者の基本情報
${basicInfo || "（記載なし）"}

■ モニタリング事実（観察・把握した事実）
${monitoringFacts}

■ 多職種からの情報
【介護職】
${multiDisciplinaryInfo?.care || "（記載なし）"}

【看護職】
${multiDisciplinaryInfo?.nurse || "（記載なし）"}

【リハ職等】
${multiDisciplinaryInfo?.rehab || "（記載なし）"}

■ ケアプラン上の目標
${planGoal || "（記載なし）"}

■ 今回、特に確認したいポイント
${checkPoint || "（記載なし）"}

---

【出力指示】
以下の構成で、日本語で丁寧に出力してください。

① モニタリング結果の整理（事実ベース）
② 多職種情報を踏まえた総合的な評価
③ ケアプラン目標との整合性の整理
④ 現時点での評価（課題・留意点）
⑤ 今後のモニタリング・支援に向けた視点（断定しない）

※ 箇条書きと文章を適切に併用してください
※ 「施設介護支援経過（第6表）」に転記できる文体を意識してください
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたは介護保険施設の計画担当介護支援専門員を支援する専門AIです。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
    });

    const result = completion.choices[0].message.content;

    return res.status(200).json({ result });

  } catch (error) {
    console.error("facility eval error:", error);
    return res.status(500).json({
      error: "AI生成中にエラーが発生しました",
    });
  }
}
