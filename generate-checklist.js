// ================================
// 実地指導チェックリストAI
// generate-checklist.js
// ================================

const ANSWER_LABEL = {
  yes: "はい",
  no: "いいえ",
  unknown: "わからない"
};

window.CHECKLIST_QUESTIONS = [
  {
    section: "第27条の2（虐待防止）",
    critical: true,

    judgment: {
      red: {
        threshold: 2,
        summary: "虐待防止は実地指導で最も重点的に確認されます。未整備項目は必ず事前に是正してください。"
      },
      yellow: {
        threshold: 1,
        summary: "虐待防止体制に一部確認不足があります。指針・研修・委員会の記録を整理しておきましょう。"
      },
      green: {
        summary: "虐待防止体制は概ね整備されています。"
      }
    },

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
  },

  {
    section: "第4条（内容及び手続の説明・同意）",
    critical: false,

    judgment: {
      red: {
        threshold: 2,
        summary: "重要事項説明や同意に不備がある場合、実地指導で必ず指摘されます。署名・説明記録を重点的に確認してください。"
      },
      yellow: {
        threshold: 1,
        summary: "説明・同意の記録に一部不安があります。契約時書類の整合性を確認しておきましょう。"
      },
      green: {
        summary: "重要事項説明および同意は適切に行われています。"
      }
    },

    questions: [
      {
        id: "04_policy",
        text: "重要事項説明書を交付し、利用者または家族へ説明していますか？",
        feedback: {
          yes: "🟢 説明・交付が確認できれば問題ありません。",
          no: "🔴 説明・交付なしは指摘対象です。初回契約時の対応を見直してください。",
          unknown: "🟡 説明書の控えや署名の有無を確認してください。"
        },
        documents: ["重要事項説明書（署名付き）"]
      },
      {
        id: "04_consent",
        text: "説明内容について、文書で同意を得ていますか？",
        feedback: {
          yes: "🟢 文書同意があれば安心です。",
          no: "🔴 口頭同意のみは不十分です。署名欄を設けてください。",
          unknown: "🟡 契約書・同意書を確認してください。"
        },
        documents: ["利用契約書", "同意書"]
      }
    ]
  },

  {
    section: "第13条（指定居宅介護支援の具体的取扱方針）",
    critical: false,

    judgment: {
      red: {
        threshold: 2,
        summary: "アセスメントやモニタリングの未実施・未記録は重点指摘事項です。実務記録を早急に見直してください。"
      },
      yellow: {
        threshold: 1,
        summary: "支援経過やモニタリングの記録に一部不足があります。記録内容を整理しておきましょう。"
      },
      green: {
        summary: "居宅介護支援の実務は適切に行われています。"
      }
    },

    questions: [
      {
        id: "13_assessment",
        text: "利用者宅を訪問し、面接によるアセスメントを行っていますか？",
        feedback: {
          yes: "🟢 訪問・面接記録があれば問題ありません。",
          no: "🔴 訪問なしのアセスメントは指摘されやすい点です。",
          unknown: "🟡 支援経過記録を確認してください。"
        },
        documents: ["アセスメント記録"]
      },
      {
        id: "13_monitoring",
        text: "月1回以上のモニタリングを行い、記録していますか？",
        feedback: {
          yes: "🟢 定期的な記録があれば安心です。",
          no: "🔴 未実施・未記録は重点指摘事項です。",
          unknown: "🟡 モニタリング記録の有無を確認してください。"
        },
        documents: ["モニタリング記録"]
      }
    ]
  },

  {
    section: "第18条（運営規程）",
    critical: false,

    judgment: {
      red: {
        threshold: 2,
        summary: "運営規程の未整備や内容不一致は必ず指摘されます。早急に現状に合わせて修正してください。"
      },
      yellow: {
        threshold: 1,
        summary: "運営規程の更新状況に一部不安があります。最終改訂日を確認してください。"
      },
      green: {
        summary: "運営規程は現行体制に沿って整備されています。"
      }
    },

    questions: [
      {
        id: "18_exists",
        text: "運営規程を整備していますか？",
        feedback: {
          yes: "🟢 運営規程が整備されていれば問題ありません。",
          no: "🔴 未整備は必ず指摘されます。早急に作成してください。",
          unknown: "🟡 ファイルの有無を確認してください。"
        },
        documents: ["運営規程"]
      },
      {
        id: "18_update",
        text: "運営規程は最新の法令・体制に合っていますか？",
        feedback: {
          yes: "🟢 更新日が新しければ安心です。",
          no: "🔴 古い内容のままでは指摘されやすいです。",
          unknown: "🟡 最終改訂日を確認してください。"
        },
        documents: ["運営規程（改訂履歴）"]
      }
    ]
  },

  {
    section: "その他の確認事項（形式・体制）",
    level: "C",
    bulk: true,
    critical: false,

    judgment: {
      red: {
        threshold: 3,
        summary: "複数の形式的要件に未確認事項があります。実地指導ではまとめて指摘される可能性があります。"
      },
      yellow: {
        threshold: 1,
        summary: "一部の形式的要件に確認不足があります。"
      },
      green: {
        summary: "形式的な体制・書類は概ね整備されています。"
      }
    },

    questions: [
      { id: "c_notice", text: "必要な掲示物を掲示していますか？", documents: ["掲示物"] },
      { id: "c_staffing", text: "勤務体制表を作成していますか？", documents: ["勤務体制表"] },
      { id: "c_manager", text: "管理者を選任していますか？", documents: ["管理者選任記録"] },
      { id: "c_disaster", text: "災害対応マニュアルを整備していますか？", documents: ["災害対応マニュアル"] },
      { id: "c_hygiene", text: "衛生管理記録を整備していますか？", documents: ["衛生管理記録"] },
      { id: "c_training", text: "研修記録を残していますか？", documents: ["研修実施記録"] }
    ]
  }
];
