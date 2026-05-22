(function() {
  console.log("【DRMaker】監視開始 [10秒全トリガー完全統合＆重複・包含排除有効 ➡ Djangoサーバー自動転送]");

  // Djangoサーバーのエンドポイント設定（末尾のスラッシュは必須）
  const DJANGO_ENDPOINT = "https://d3jiguo628m5ch.cloudfront.net/instruments/";

  // 10秒間に検知した「すべての単語・文章」を蓄積する配列
  let globalTextPool = [];
  
  // 10秒ごとのインターバルタイマーID
  let intervalId = null;
  const ACCUMULATE_MS = 10000; // 10秒

  // 前回「最終的に送信（出力）した」データの一意なキー
  let lastSentKey = "";

  // 1. データ抽出・フィルタリングの集約
  function filterMeaningfulText(data) {
    if (!data) return null;
    let str = typeof data === 'object' ? JSON.stringify(data) : String(data);
    try { str = decodeURIComponent(str); } catch (_) {}

    const matches = str.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u30FC、。！？]+/g);
    if (!matches) return null;

    const garbage = ['batchexecute', 'rpcids', 'f_req', 'generic', 'adaptive', 'enabled', 'true', 'false', 'null', 'undefined', 'proto', 'chromesetting', 'device', 'background', 'content-type', 'application/json'];
    const clean = matches.map(t => t.trim()).filter(t => 
      t.length >= 2 && 
      !garbage.some(g => t.toLowerCase().includes(g)) && 
      !(/^[a-zA-Z0-9_\-]{15,}$/.test(t) && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(t))
    );
    return clean.length ? clean : null;
  }

  // 2. 蓄積された全文字列から「重複」と「包含関係」を排除して1つにまとめる関数
  function optimizeTextPool(rawTexts) {
    const uniqueRaw = Array.from(new Set(rawTexts));
    uniqueRaw.sort((a, b) => b.length - a.length);

    const optimized = [];
    for (const text of uniqueRaw) {
      const isContained = optimized.some(longerText => longerText.includes(text));
      if (!isContained) {
        optimized.push(text);
      }
    }
    return optimized;
  }

  // 3. 10秒ごとにプールされたデータを評価して、DjangoサーバーへPOST送信するコアシステム
  function startFlushTimer() {
    if (intervalId) return;

    intervalId = setInterval(() => {
      if (globalTextPool.length === 0) return;

      const currentPool = [...globalTextPool];
      globalTextPool = [];

      // 【ステップ1】 10秒間の全データを一斉に包含・重複排除する
      const finalTexts = optimizeTextPool(currentPool);
      if (finalTexts.length === 0) return;

      // 【ステップ2】 変更チェック用のキーを生成
      const currentSentKey = finalTexts.join('||');

      // 前回送信したデータと全く同じなら、送信を拒否する
      if (currentSentKey === lastSentKey) {
        return; 
      }

      lastSentKey = currentSentKey;

      // 送信するデータオブジェクトの作成
      const payload = {
        "type": "chunk",
        "timestamp": new Date().toLocaleTimeString('ja-JP', { hour12: false }), // 24時間表記のHH:MM:SS
        "body": finalTexts
      };

      console.log("【DRMaker】Djangoサーバーへ送信中...", payload);

      // 🚀 オリジナルの元のfetchを使い、DjangoのAPIにJSONをPOST送信
      origFetch(DJANGO_ENDPOINT, {
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
          console.log("【DRMaker】送信成功！SQLite/S3に同期されました。");
        }
      })
      .catch(err => {
        console.error("【DRMakerネットワークエラー】サーバーに接続できませんでした:", err);
      });

    }, ACCUMULATE_MS);
  }

  // 4. ログ出力の共通化（全トリガーのデータを1つのプールに集約）
  function logData(type, url, method, body) {
    try {
      // 自身のAPIへのPOSTリクエストのループ（無限ループ）を防止する
      if (url.includes(DJANGO_ENDPOINT)) return;

      let parsed = body;
      if (body instanceof FormData || body instanceof URLSearchParams) {
        parsed = {}; body.forEach((v, k) => parsed[k] = v);
      } else if (typeof body === 'string') {
        try { parsed = JSON.parse(body); } catch (_) {}
      } else if (body instanceof Blob || body instanceof ArrayBuffer) {
        parsed = `[バイナリ:${body.constructor.name}]`;
      }

      const texts = filterMeaningfulText(parsed);
      if (!texts) return;

      globalTextPool.push(...texts);
      startFlushTimer();

    } catch (e) { console.log("DRMakerエラー:", e); }
  }

  // 5. 各種プロキシ・モンキーパッチの適用
  // fetch
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const isReq = input instanceof Request;
    const url = isReq ? input.url : (input.url || input);
    const method = (isReq ? input.method : init?.method || "GET").toUpperCase();
    let body = isReq ? await input.clone().text().catch(() => null) : init?.body;

    if (method !== "GET" && body) logData("fetch", url, method, body);
    return origFetch.apply(this, arguments);
  };

  // XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._m = method; this._u = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (this._m?.toUpperCase() !== "GET" && body) logData("XHR", this._u, this._m, body);
    return origSend.apply(this, arguments);
  };

  // Beacon
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function(url, data) {
      if (data) logData("Beacon", url, "POST", data);
      return origBeacon.apply(this, arguments);
    };
  }

  // WebSocket
  const origWS = WebSocket.prototype.send;
  WebSocket.prototype.send = function(data) {
    logData("WebSocket", this.url, "SEND", data);
    return origWS.apply(this, arguments);
  };

  // Form Submit
  window.addEventListener('submit', e => {
    e.preventDefault();
    logData("Form", e.target.action || location.href, (e.target.method || "GET").toUpperCase(), new FormData(e.target));
  }, true);
})();