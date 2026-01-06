// ================================
// 実地指導チェックリストAI
// generate-checklist.js
// ================================

// --------------------------------
// 質問セット定義（第27条の2のみ完成）
// --------------------------------
window.CHECKLIST_QUESTIONS = [
  {
    section: "第27条の2（虐待防止）",
    critical: true,
    questions: [
      {
        id: "abuse_policy",
        text: "虐待防止のための指針を文書で整備していますか？",
        feedback: {
          yes: "🟢 指針が整備されていれば概ね問題ありません。最終改訂日と事業所名の記載を確認してください。",
          no: "🔴 指針の未整備は重大な指摘につながります。事業所名・責任者・対応手順を明記した文書を作成してください。",
          unknown: "🟡 指針の有無を至急確認してください。実地指導では即時提示を求められます。"
        },
        documents: [
          "虐待防止のための指針",
          "最終改訂日が分かる記録"
        ]
      },
      {
        id: "abuse_training",
        text: "虐待防止に関する研修を定期的に実施し、記録を残していますか？",
        feedback: {
          yes: "🟢 研修実施と記録が確認できれば問題ありません。",
          no: "🔴 研修未実施・記録なしは高確率で指摘されます。日時・参加者・内容を記録してください。",
          unknown: "🟡 研修記録の有無を確認してください。口頭実施のみでは不十分です。"
        },
        documents: [
          "虐待防止研修の実施記録",
          "研修資料"
        ]
      },
      {
        id: "abuse_committee",
        text: "虐待防止のための委員会を設置し、定期的に開催していますか？",
        feedback: {
          yes: "🟢 委員会の設置・開催実績が確認できれば概ね良好です。",
          no: "🔴 委員会未設置・未開催は重点指摘事項です。議事録を整備してください。",
          unknown: "🟡 委員会の開催状況を確認してください。名称が異なっても記録が必要です。"
        },
        documents: [
          "虐待防止委員会の議事録"
        ]
      },
      {
        id: "abuse_manager",
        text: "虐待防止の担当者を定め、役割を明確にしていますか？",
        feedback: {
          yes: "🟢 担当者が明確であれば問題ありません。",
          no: "🔴 担当者未設定は指摘対象です。文書で明確にしてください。",
          unknown: "🟡 指針や運営規程内の記載を確認してください。"
        },
        documents: [
          "虐待防止担当者の選任記録"
        ]
      }
    ]
  }
];

// --------------------------------
// 判定ロジック（第27条の2専用）
// --------------------------------
window.evaluateChecklist = function (answers) {
  const section = window.CHECKLIST_QUESTIONS[0];
  let riskCount = 0;

  const questionResults = section.questions.map(q => {
    const ans = answers[q.id] || "unknown";
    if (ans !== "yes") riskCount++;

    return {
      text: q.text,
      answer: ans,
      feedback: q.feedback[ans],
      documents: q.documents
    };
  });

  let riskLevel = "🟢 概ね良好";
  if (riskCount >= 2) riskLevel = "🔴 要注意（重点確認）";
  else if (riskCount === 1) riskLevel = "🟡 要確認";

  return [{
    section: section.section,
    riskLevel,
    questions: questionResults,
    summary:
      riskLevel.startsWith("🔴")
        ? "虐待防止は実地指導で最も重点的に確認されます。未整備項目は必ず事前対応してください。"
        : riskLevel.startsWith("🟡")
        ? "一部確認不足があります。書類と実施状況を整理しておきましょう。"
        : "大きな問題は見られません。"
  }];
};
