// メッセージが受信された時に実行する処理
chrome.runtime.onMessage.addListener((message, sender) => {
  console.log(message.message)

  const tabId = sender.tab.id

  

  if (tabId) {
    // contextscript.jsにメッセージを送信
    chrome.tabs.sendMessage(tabId, {
      message: 'background.jsからcontextscript.jsに送るメッセージ',
    })
  }
})
