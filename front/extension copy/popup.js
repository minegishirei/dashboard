document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // 1. 画面を開いたときに、すでに保存されているキーがあれば自動で入力する
  chrome.storage.local.get(['savedAccessKey'], (result) => {
    if (result.savedAccessKey) {
      keyInput.value = result.savedAccessKey;
    }
  });

  // 2. 保存ボタンをクリックしたときの処理
  saveButton.addEventListener('click', () => {
    const keyToSave = keyInput.value.trim();

    // chrome.storage にキーを保存する
    chrome.storage.local.set({ savedAccessKey: keyToSave }, () => {
      statusDiv.textContent = "保存しました！";
      
      // 2秒後に「保存しました」の文字を消す
      setTimeout(() => {
        statusDiv.textContent = "";
      }, 2000);
    });
  });
});