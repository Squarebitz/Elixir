const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const isDevelopment = process.env.FOCUSBOARD_DEV_URL;
const windowStatePath = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStatePath(), "utf8"));
    if (
      typeof saved.width !== "number" ||
      typeof saved.height !== "number" ||
      !Number.isFinite(saved.width) ||
      !Number.isFinite(saved.height) ||
      saved.width < 760 ||
      saved.height < 560
    ) {
      return {};
    }

    const bounds = {
      x: Number.isFinite(saved.x) ? saved.x : undefined,
      y: Number.isFinite(saved.y) ? saved.y : undefined,
      width: saved.width,
      height: saved.height,
    };
    const isVisible = screen.getAllDisplays().some(({ workArea }) =>
      bounds.x !== undefined &&
      bounds.y !== undefined &&
      bounds.x < workArea.x + workArea.width - 32 &&
      bounds.x + bounds.width > workArea.x + 32 &&
      bounds.y < workArea.y + workArea.height - 32 &&
      bounds.y + bounds.height > workArea.y + 32,
    );

    return {
      ...(isVisible ? bounds : { width: saved.width, height: saved.height }),
      maximized: saved.maximized === true,
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read the saved window state:", error);
    }
    return {};
  }
}

function saveWindowState(window) {
  if (window.isDestroyed()) return;
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  try {
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ ...bounds, maximized: window.isMaximized() }),
    );
  } catch (error) {
    console.error("Could not save the window state:", error);
  }
}

function createWindow() {
  const savedState = readWindowState();
  const window = new BrowserWindow({
    width: savedState.width ?? 1280,
    height: savedState.height ?? 820,
    ...(savedState.x !== undefined ? { x: savedState.x } : {}),
    ...(savedState.y !== undefined ? { y: savedState.y } : {}),
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#090b10",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (savedState.maximized) window.maximize();
  window.once("ready-to-show", () => window.show());
  window.on("close", () => saveWindowState(window));
  window.webContents.setVisualZoomLevelLimits(1, 1);
  window.webContents.session.setSpellCheckerEnabled(true);
  window.webContents.on("context-menu", (event, params) => {
    event.preventDefault();
    window.webContents.send("spellcheck:suggestions", {
      misspelledWord: params.misspelledWord,
      dictionarySuggestions: params.dictionarySuggestions ?? [],
    });
  });
  window.webContents.on("before-input-event", (event, input) => {
    const reloadShortcut = input.control || input.meta;
    if (!isDevelopment && reloadShortcut && input.key.toLowerCase() === "r") {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (isDevelopment) {
    void window.loadURL(isDevelopment);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.on("spellcheck:replace", (event, word) => {
  if (typeof word === "string") {
    BrowserWindow.fromWebContents(event.sender)?.webContents.replaceMisspelling(word);
  }
});

ipcMain.on("spellcheck:add-word", (event, word) => {
  if (typeof word === "string" && word.length > 0) {
    BrowserWindow.fromWebContents(event.sender)?.webContents.session
      .addWordToSpellCheckerDictionary(word);
  }
});

ipcMain.handle("image:save-as", async (event, dataUrl) => {
  if (
    typeof dataUrl !== "string" ||
    !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)
  ) {
    throw new Error("Only image data can be saved.");
  }
  const image = /^data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!image) throw new Error("The image data is invalid.");

  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner) throw new Error("The application window is unavailable.");
  const extension = image[1] === "jpeg" ? "jpg" : image[1];
  const { canceled, filePath } = await dialog.showSaveDialog(owner, {
    defaultPath: `image.${extension}`,
    filters: [{ name: "Images", extensions: [extension] }],
  });
  if (!canceled && filePath) {
    fs.writeFileSync(filePath, Buffer.from(image[2], "base64"));
  }
  return !canceled;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
