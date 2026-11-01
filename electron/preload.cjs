const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nerabitDesktop", {
  onSuggestions(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("spellcheck:suggestions", listener);
    return () => ipcRenderer.removeListener("spellcheck:suggestions", listener);
  },
  replaceMisspelling(word) {
    ipcRenderer.send("spellcheck:replace", word);
  },
  addToDictionary(word) {
    ipcRenderer.send("spellcheck:add-word", word);
  },
  saveImageAs(dataUrl) {
    return ipcRenderer.invoke("image:save-as", dataUrl);
  },
});
