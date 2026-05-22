// ISOLATEDワールド側でイベントを監視
document.addEventListener("DRMaker_BridgeEvent", (event) => {
  console.log("【DRMaker Relay】ISOLATED側でDOMイベントを検知しました。");
  
  // MAIN側から detail に詰められたデータを回収
  const messageData = event.detail;

  if (messageData) {
    // ここなら sendMessage が絶対に undefined になりません！
    chrome.runtime.sendMessage(
      messageData,
      function (response) {
        console.log("バックグラウンドからの応答:", response);
      }
    );
  }
});
console.log("【DRMaker Relay】DOMイベントリスナーを配置しました。");