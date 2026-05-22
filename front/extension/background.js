console.log("background.jsが読み込まれました");

// 重複排除のためのMap（整形済みのデータを格納する）
let uniqueMessageMap = new Map();
let flushIntervalId = null;
const FLUSH_INTERVAL_MS = 5000; // 5秒

/**
 * 特殊な形式のbodyからHTMLをパースし、純粋なテキストを取り出す関数
 * @param {any} body - メッセージのbody
 * @returns {string} - 抽出されたテキスト
 */
function extractCleanText(body) {
  if (!body) return "";
  
  let targetStr = body;

  // HTMLタグを除去し、改行や不要なエスケープ文字列をクリーンアップ
  let cleanText = targetStr
    .replace(/<[^>]*>/g, ' ')               // HTMLタグをスペースに置換
    .replace(/\\r\\n|\\n|\r|\n/g, ' ')      // 改行コードの除去
    .replace(/\\"/g, '"')                   // エスケープされたダブルクォーテーションの復元
    .replace(/\s+/g, ' ')                   // 連続するスペースを1つに集約
    .trim();

  return cleanText;
}

/**
 * 送信するべき重要なデータか判定する関数
 */
function isMeaningfulData(message) {
  if (!message || !message.body) return false;

  const blockUrls = [
    'play.google.com/log',
    'chrome-extension://',
    'batchexecute'
  ];
  if (message.url && blockUrls.some(url => message.url.includes(url))) {
    return false;
  }

  // クリーンなテキストを取り出して判定
  const textContent = extractCleanText(message.body);

  // ひらがな・カタカナ・漢字が「5文字以上」連続しているかチェック
  const hasActualJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{5,}/.test(textContent);
  if (!hasActualJapanese) return false;

  // システム系のゴミキーワードが含まれる場合は弾く
  const garbageKeywords = ['eventtype', 'browserlanguage', 'requestid', 'polaroid', 'awsui'];
  if (garbageKeywords.some(keyword => textContent.toLowerCase().includes(keyword))) {
    return false;
  }

  return true;
}

/**
 * 5秒ごとにプールされたデータを評価して、Djangoサーバーへ一括POST送信する関数
 */
function startFlushTimer() {
  if (flushIntervalId) return;

  flushIntervalId = setInterval(() => {
    if (uniqueMessageMap.size === 0) return;

    // 整形済みの綺麗なデータ配列を取り出す
    const currentBatch = Array.from(uniqueMessageMap.values());
    uniqueMessageMap.clear();

    const DJANGO_ENDPOINT = "https://d3jiguo628m5ch.cloudfront.net/instruments/";

    console.log(currentBatch)
    const payload = currentBatch[currentBatch.length-1] // ← ここにパース＆結合済みの綺麗なデータが入る

    console.log(payload)

    fetch(DJANGO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        console.warn(`【DRMaker送信エラー】ステータス: ${response.status}`);
      } else {
        console.log(`【DRMaker】5秒間の整形済みデータ（${payload.count}件）を送信しました。`);
      }
    })
    .catch(err => {
      console.error("【DRMakerネットワークエラー】:", err);
    });

  }, FLUSH_INTERVAL_MS);
}

// メッセージ受信処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMeaningfulData(message)) {
    return;
  }

  // 💡 【ここが肝】生データを Django が扱いやすいフラットなオブジェクトに整形
  const cleanText = extractCleanText(message.body);
  
  const formattedMessage = {
    type: message.type,
    method: message.method || "POST",
    url: message.url,
    timestamp: message.timestamp || new Date().toLocaleTimeString('ja-JP', { hour12: false }),
    // 不正な配列形式のbodyを、パースした綺麗な日本語テキストに置き換え
    body: cleanText 
  };

  // 重複チェック用のキー（整形後のテキストやURLをベースにする）
  const messageKey = JSON.stringify({
    type: formattedMessage.type,
    url: formattedMessage.url,
    body: formattedMessage.body
  });

  if (!uniqueMessageMap.has(messageKey)) {
    uniqueMessageMap.set(messageKey, formattedMessage);
  }

  startFlushTimer();
});