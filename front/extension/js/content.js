(function() {

  // イベントを受け取ったら、即座にカスタムイベントとして document に流す
  function emitBridgeEvent(type, url, method, body) {
    try {
      const payload = {
        type: type,
        url: url,
        method: method?.toUpperCase() || "POST",
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
        body: body
      };

      // カスタムイベントを作成して発火
      const customEvent = new CustomEvent("DRMaker_BridgeEvent", {
        detail: payload
      });
      document.dispatchEvent(customEvent);

    } catch (e) {
    }
  }

  // 1. fetch (GET以外のリクエストを監視)
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const isReq = input instanceof Request;
    const url = isReq ? input.url : (input.url || input);
    const method = isReq ? input.method : init?.method || "GET";
    const body = isReq ? await input.clone().text().catch(() => null) : init?.body;

    if (method.toUpperCase() !== "GET" && body) {
      emitBridgeEvent("fetch", url, method, body);
    }
    return origFetch.apply(this, arguments);
  };

  // 2. XHR (GET以外のリクエストを監視)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._m = method; 
    this._u = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (this._m?.toUpperCase() !== "GET" && body) {
      emitBridgeEvent("XHR", this._u, this._m, body);
    }
    return origSend.apply(this, arguments);
  };

  // 3. Beacon (データ送信を監視)
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function(url, data) {
      if (data) {
        emitBridgeEvent("Beacon", url, "POST", data);
      }
      return origBeacon.apply(this, arguments);
    };
  }

  // 4. WebSocket (送信データを監視)
  const origWS = WebSocket.prototype.send;
  WebSocket.prototype.send = function(data) {
    emitBridgeEvent("WebSocket", this.url, "SEND", data);
    return origWS.apply(this, arguments);
  };

  // 5. Form Submit (フォーム送信を監視)
  window.addEventListener('submit', e => {
    const formData = new FormData(e.target);
    const formObj = {};
    formData.forEach((v, k) => formObj[k] = v);

    emitBridgeEvent("Form", e.target.action || location.href, e.target.method, formObj);
  }, true);

})();