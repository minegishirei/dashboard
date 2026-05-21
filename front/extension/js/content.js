(function() {
  console.log("【DRMaker】監視開始（fetch/XHR/Beacon/WS/Form）[意味データ抽出有効]");

  // 1. データ抽出・フィルタリングの集約
  function filterMeaningfulText(data) {
    if (!data) return null;
    let str = typeof data === 'object' ? JSON.stringify(data) : String(data);
    try { str = decodeURIComponent(str); } catch (_) {}

    //const matches = str.match(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]|[a-zA-Z0-9_\s,.?!-]{5,})/g);
    // 日本語（ひらがな、カタカナ、漢字、長音記号「ー」、読点「、」「。」など）のみにマッチ
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

  // 2. ログ出力の共通化
  function logData(type, url, method, body) {
    try {
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

      console.group(`🚨【DRMaker: ${type}】`);
      console.log(`URL: ${url} [${method || 'POST'}]`);
      console.log("💡【会話・意味データ】:", texts);
      console.log("元の送信データ:", parsed);
      console.groupEnd();
    } catch (e) { console.log("DRMakerエラー:", e); }
  }

  // 3. 各種プロキシ・モンキーパッチの適用
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
    alert("【DRMaker】フォーム送信を一時停止しました。");
  }, true);
})();