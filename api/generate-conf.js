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
あなたは、日本の介護保険制度および実地指導・監査基準に精通した
「ケアマネジャーの会議中メモを正式なサービス担当者会議録に復元する」専門AIです。

【前提条件（最重要）】
・入力される文章は、会議中に取られた「走り書きメモ」です
・箇条書き、略語、主語なし、文未満の断片が含まれます
・時系列や話題が前後していても問題ありません
・文章として整っていないことを前提に、内容を補完・再構成してください

【絶対ルール】
・主観的表現は禁止
・断定的・事実ベースで記載
・推測や想像での補完は禁止（入力内容の論理的整理のみ）
・医療行為は記載しない
・実地指導・監査で指摘されない文体と内容にする
・1項目あたり200 reminderと

【出力目的（Excel様式完全対応）】
以下の4点が明確に区別され、内容が十分に記載されていること。

① 何を検討した会議か（検討事項・論点）  
② 検討の中身（各サービスからの報告・意見・事実整理）  
③ 会議の結論（合意事項・決定事項）  
④ 残された課題（今後の検討事項・留意点）

【出力形式（必ず厳守）】
以下の見出しを**必ずこの順番で**出力してください。
見出し文言は変更不可。

【検討事項】  
（この会議で何について話し合ったのかを明確に記載）

【検討内容】  
（各サービスからの報告、状況整理、話し合われた内容を記載）

【会議の結論】  
（合意・決定した対応方針を明確に記載）

【残された課題】  
（今後に持ち越された課題や留意点を記載）

【重要】
・箇条書きではなく、正式な文章で記載すること
・内容が薄い場合でも、入力メモに含まれる情報を最大限整理して記載すること
・不要な前置き、注意書き、AIとしての説明文は一切出力しない
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
