const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nerabitDesktop", {
  platform: process.platform,
  chooseVaultFolder(path) {
    return ipcRenderer.invoke("vault:choose-folder", path);
  },
  getVaultPath(action) {
    return ipcRenderer.invoke("vault:get-path", action);
  },
  listNotes() {
    return ipcRenderer.invoke("vault:list-notes");
  },
  readNote(id) {
    return ipcRenderer.invoke("vault:read-note", id);
  },
  writeNote(note) {
    return ipcRenderer.invoke("vault:write-note", note);
  },
  deleteNote(id) {
    return ipcRenderer.invoke("vault:delete-note", id);
  },
  renameNote(id, title) {
    return ipcRenderer.invoke("vault:rename-note", id, title);
  },
  moveNote(id, folderId) {
    return ipcRenderer.invoke("vault:move-note", id, folderId);
  },
  createFolder(folder) {
    return ipcRenderer.invoke("vault:create-folder", folder);
  },
  deleteFolder(id) {
    return ipcRenderer.invoke("vault:delete-folder", id);
  },
  isFullScreen() {
    return ipcRenderer.invoke("window:is-full-screen");
  },
  toggleFullScreen() {
    return ipcRenderer.invoke("window:toggle-full-screen");
  },
  exitFullScreen() {
    return ipcRenderer.invoke("window:exit-full-screen");
  },
  onFullScreenChange(callback) {
    const listener = (_event, fullScreen) => callback(fullScreen);
    ipcRenderer.on("window:full-screen-changed", listener);
    return () => ipcRenderer.removeListener("window:full-screen-changed", listener);
  },
  toggleWindowMaximize() {
    ipcRenderer.send("window:toggle-maximize");
  },
  setTheme(theme) {
    return ipcRenderer.invoke("window:set-theme", theme);
  },
  getWordSuggestions(word) {
    return ipcRenderer.invoke("spellcheck:get-word-suggestions", word);
  },
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
