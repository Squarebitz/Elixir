const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parse: parseYaml, stringify: stringifyYaml } = require("yaml");

const isDevelopment = process.env.FOCUSBOARD_DEV_URL;
const windowStatePath = () => path.join(app.getPath("userData"), "window-state.json");
const vaultConfigPath = () => path.join(app.getPath("userData"), "vault.json");
const defaultFolderId = "default-folder";
const notePathIndex = new Map();
const welcomeMarkdown = `# Welcome to Nerabit

Nerabit is your personal space for notes, ideas, and plans.

## Organize with folders
Create folders in the sidebar for projects or topics. Use a folder's options to add notes or make nested subfolders to any depth. Expand a folder to see its notes and subfolders. You can reorder sibling folders or delete a folder from its options.

## Write and navigate
Create a note from the sidebar. Your changes save automatically. Type \`/\` in the editor to add headings, lists, checklists, quotes, and code blocks. Use the note tabs at the top to switch between notes.

## Make it yours
Choose an icon for your notes and resize or collapse the sidebar whenever you like.

You can edit or delete this welcome note at any time.`;

function readVaultConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(vaultConfigPath(), "utf8"));
    return typeof config.path === "string" ? path.resolve(config.path) : null;
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not read the vault configuration:", error);
    return null;
  }
}

function saveVaultConfig(vaultPath) {
  fs.mkdirSync(path.dirname(vaultConfigPath()), { recursive: true });
  const target = vaultConfigPath();
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ path: vaultPath }, null, 2));
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

function getConfiguredVault() {
  const vaultPath = readVaultConfig();
  if (!vaultPath) return { path: null, valid: false };
  if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
    return { path: vaultPath, valid: false, missing: true };
  }
  return { path: vaultPath, valid: true };
}

function resolveVaultPath(vaultPath, relativePath = "") {
  if (!vaultPath || !path.isAbsolute(vaultPath)) throw new Error("The vault folder is not configured.");
  const root = path.resolve(vaultPath);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The requested path is outside the vault folder.");
  }
  // Check real paths too, so a symlink inside the vault cannot escape its root.
  const realRoot = fs.realpathSync(root);
  let existing = target;
  while (!fs.existsSync(existing) && existing !== root) existing = path.dirname(existing);
  const realExisting = fs.realpathSync(existing);
  const realRelative = path.relative(realRoot, realExisting);
  if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error("The requested path resolves outside the vault folder.");
  }
  return target;
}

function configuredRoot() {
  const state = getConfiguredVault();
  if (!state.valid) {
    throw new Error(state.missing
      ? `We can't find your vault at ${state.path}`
      : "Choose a vault folder before accessing notes.");
  }
  return state.path;
}

function safeSegment(value) {
  const segment = String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return segment && segment !== "." && segment !== ".." ? segment : "Untitled";
}

function readFolderTree(root) {
  const folderTreePath = resolveVaultPath(root, ".nerabit/folder-tree.json");
  const icons = readJson(resolveVaultPath(root, ".nerabit/folders.json"), {});
  try {
    const folders = JSON.parse(fs.readFileSync(folderTreePath, "utf8"));
    if (Array.isArray(folders)) {
      const validatedFolders = folders.filter(isFolder);
      if (!validatedFolders.some((folder) => folder.id === defaultFolderId)) {
        validatedFolders.unshift({ id: defaultFolderId, name: "Notes", position: 0 });
      }
      return mergePhysicalFolders(root, validatedFolders).map((folder) => ({
        ...folder,
        ...(typeof icons[folder.id] === "string" ? { icon: icons[folder.id] } : {}),
      }));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const folders = [{ id: defaultFolderId, name: "Notes", position: 0 }];
  for (const [relative, entries] of walkDirectories(root)) {
    if (!relative || relative.startsWith(".nerabit")) continue;
    const id = `folder-${crypto.createHash("sha1").update(relative).digest("hex").slice(0, 12)}`;
    folders.push({
      id,
      name: path.basename(relative),
      parentId: folderIdForPath(path.dirname(relative)),
      position: entries,
    });
  }
  return mergePhysicalFolders(root, folders).map((folder) => ({
    ...folder,
    ...(typeof icons[folder.id] === "string" ? { icon: icons[folder.id] } : {}),
  }));
}

function isFolder(value) {
  return value && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.position === "number" &&
    (value.parentId === undefined || typeof value.parentId === "string");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function walkDirectories(root) {
  const result = [];
  function visit(relative) {
    const absolute = resolveVaultPath(root, relative);
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    let folderPosition = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const child = path.join(relative, entry.name);
      result.push([child, folderPosition++]);
      visit(child);
    }
  }
  visit("");
  return result;
}

function folderIdForPath(relativePath) {
  if (!relativePath || relativePath === ".") return defaultFolderId;
  return `folder-${crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 12)}`;
}

function folderPathForId(folderId, folders) {
  if (folderId === defaultFolderId) return "";
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) throw new Error(`Folder "${folderId}" does not exist.`);
  const chain = [];
  let current = folder;
  const visited = new Set();
  while (current && current.id !== defaultFolderId) {
    if (visited.has(current.id)) throw new Error(`Folder "${current.id}" has a circular parent reference.`);
    visited.add(current.id);
    chain.unshift(safeSegment(current.name));
    if (current.parentId) {
      const parent = folders.find((item) => item.id === current.parentId);
      if (!parent) throw new Error(`Parent folder "${current.parentId}" does not exist.`);
      current = parent;
    } else {
      current = undefined;
    }
  }
  return chain.join(path.sep);
}

function mergePhysicalFolders(root, folders) {
  const normalize = (value) => {
    const normalized = path.normalize(value);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  for (const [relative] of walkDirectories(root)) {
    const existing = folders.find((folder) =>
      normalize(folderPathForId(folder.id, folders)) === normalize(relative),
    );
    if (existing) continue;
    const parentRelative = path.dirname(relative);
    const parent = parentRelative === "."
      ? undefined
      : folders.find((folder) =>
          normalize(folderPathForId(folder.id, folders)) === normalize(parentRelative),
        );
    const parentId = parent?.id ??
      (parentRelative === "." ? defaultFolderId : folderIdForPath(parentRelative));
    const id = folderIdForPath(relative);
    if (!folders.some((folder) => folder.id === id)) {
      folders.push({
        id,
        name: path.basename(relative),
        parentId,
        position: folders.filter((folder) => folder.parentId === parentId).length,
      });
    }
  }
  return folders;
}

function legacyProperties(markdown) {
  const lines = markdown.split(/(\r?\n)/);
  let category;
  let tags;
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    if (!line.trim()) continue;
    const categoryMatch = /^category:\s*(.*)$/i.exec(line);
    const tagsMatch = /^tags:\s*(.*)$/i.exec(line);
    if (categoryMatch && category === undefined) {
      category = categoryMatch[1].trim();
      continue;
    }
    if (tagsMatch && tags === undefined) {
      tags = tagsMatch[1]
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    break;
  }
  return {
    ...(category !== undefined || tags !== undefined
      ? { legacyProperties: {
          ...(category !== undefined ? { category } : {}),
          ...(tags !== undefined ? { tags } : {}),
        } }
      : {}),
  };
}

function parseNote(markdown, filePath, folders) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown);
  const relative = path.relative(configuredRoot(), filePath);
  const folderRelative = path.dirname(relative);
  let metadata = {};
  if (match) {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
  }
  const title = typeof metadata.title === "string" ? metadata.title : path.basename(filePath, ".md");
  const folderId = typeof metadata.folderId === "string"
    ? metadata.folderId
    : folderIdForPath(folderRelative === "." ? "" : folderRelative);
  const id = typeof metadata.id === "string"
    ? metadata.id
    : `note-${crypto.createHash("sha1").update(relative).digest("hex").slice(0, 16)}`;
  if (!folders.some((folder) => folder.id === folderId)) {
    folders.push({
      id: folderId,
      name: path.basename(folderRelative),
      parentId: folderIdForPath(path.dirname(folderRelative)),
      position: folders.length,
    });
  }
  return {
    id,
    title,
    kind: metadata.kind === "checklist" ? "checklist" : "notes",
    folderId,
    position: typeof metadata.position === "number" ? metadata.position : 0,
    properties: Object.fromEntries(Object.entries(metadata).filter(([key]) =>
      !["id", "title", "kind", "folderId", "position", "icon", "propertyOrder", "createdAt", "updatedAt", "bannerImage", "bannerWidth", "bannerPosition", "titleSize", "titleFormatting"].includes(key))),
    propertyOrder: Array.isArray(metadata.propertyOrder) ? metadata.propertyOrder : [],
    ...(typeof metadata.icon === "string" ? { icon: metadata.icon } : {}),
    ...(typeof metadata.createdAt === "string" ? { createdAt: metadata.createdAt } : {}),
    ...(typeof metadata.updatedAt === "string" ? { updatedAt: metadata.updatedAt } : {}),
    ...(typeof metadata.bannerImage === "string" ? { bannerImage: metadata.bannerImage } : {}),
    ...(metadata.bannerWidth === "full" || metadata.bannerWidth === "medium" ? { bannerWidth: metadata.bannerWidth } : {}),
    ...(metadata.bannerPosition && typeof metadata.bannerPosition === "object" ? { bannerPosition: metadata.bannerPosition } : {}),
    markdown: match ? match[2] : markdown,
    ...legacyProperties(match ? match[2] : markdown),
  };
}

function listMarkdownFiles(root) {
  const files = [];
  function visit(relative) {
    const absolute = resolveVaultPath(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(resolveVaultPath(root, child));
      }
    }
  }
  visit("");
  return files;
}

function noteLocation(note, folders) {
  const directory = folderPathForId(note.folderId || defaultFolderId, folders);
  return path.join(directory, `${safeSegment(note.title)}.md`);
}

function findNoteFile(id, root) {
  const folders = readFolderTree(root);
  const cacheKey = `${path.resolve(root)}\0${id}`;
  const cachedPath = notePathIndex.get(cacheKey);
  if (cachedPath && fs.existsSync(cachedPath)) {
    const markdown = fs.readFileSync(cachedPath, "utf8");
    const note = parseNote(markdown, cachedPath, folders);
    if (note.id === id) return { filePath: cachedPath, note, markdown, folders };
  }
  notePathIndex.delete(cacheKey);
  for (const filePath of listMarkdownFiles(root)) {
    const markdown = fs.readFileSync(filePath, "utf8");
    const note = parseNote(markdown, filePath, folders);
    if (note.id === id) {
      notePathIndex.set(cacheKey, filePath);
      return { filePath, note, markdown, folders };
    }
  }
  return null;
}

function writeAtomic(root, relativePath, contents) {
  const target = resolveVaultPath(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents);
    // Rename only after the complete file is on disk.
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

function validateVaultFolder(vaultPath) {
  const resolved = path.resolve(vaultPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("The selected folder does not exist.");
  }
  const probe = resolveVaultPath(resolved, `.nerabit-write-test-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
  } catch {
    throw new Error("nerabit can't write to this folder. Please choose another.");
  }
  const root = path.parse(resolved).root;
  const systemPaths = [
    process.env.WINDIR,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean).map((value) => path.resolve(value).toLowerCase());
  const isSystemFolder = resolved.toLowerCase() === root.toLowerCase() ||
    systemPaths.some((systemPath) => resolved.toLowerCase() === systemPath ||
      resolved.toLowerCase().startsWith(`${systemPath}${path.sep.toLowerCase()}`));
  return { path: resolved, writable: true, warning: isSystemFolder };
}

function saveFolderTree(root, folders) {
  writeAtomic(root, ".nerabit/folder-tree.json", JSON.stringify(folders, null, 2));
}

function ensureVaultInitialized(root) {
  fs.mkdirSync(resolveVaultPath(root, ".nerabit"), { recursive: true });
  const settingsPath = resolveVaultPath(root, ".nerabit/settings.json");
  if (!fs.existsSync(settingsPath)) {
    writeAtomic(root, ".nerabit/settings.json", JSON.stringify({ bookmarks: [] }, null, 2));
  }
  const treePath = resolveVaultPath(root, ".nerabit/folder-tree.json");
  if (!fs.existsSync(treePath)) {
    saveFolderTree(root, [{ id: defaultFolderId, name: "Notes", position: 0 }]);
  }
  if (listMarkdownFiles(root).length === 0) {
    const now = new Date().toISOString();
    const markdown = `---\n${stringifyYaml({
      id: "welcome-note",
      title: "Welcome",
      kind: "notes",
      folderId: defaultFolderId,
      position: 0,
      propertyOrder: [],
      createdAt: now,
      updatedAt: now,
    })}---\n${welcomeMarkdown}`;
    writeAtomic(root, "Welcome.md", markdown);
  }
}

ipcMain.handle("vault:get-path", (_event, action) => {
  let state;
  try {
    state = getConfiguredVault();
  } catch (error) {
    console.error("Could not validate the saved vault:", error);
    state = { path: readVaultConfig(), valid: false, missing: true };
  }
  if (action === "open" && state.valid) shell.showItemInFolder(state.path);
  return state;
});

ipcMain.handle("vault:choose-folder", async (event, selectedPath) => {
  if (typeof selectedPath === "string") {
    const validated = validateVaultFolder(selectedPath);
    ensureVaultInitialized(validated.path);
    saveVaultConfig(validated.path);
    return validated;
  }
  const owner = BrowserWindow.fromWebContents(event.sender);
  const documentsPath = app.getPath("documents");
  const { canceled, filePaths } = await dialog.showOpenDialog(owner, {
    title: "Choose your Nerabit vault",
    defaultPath: path.join(documentsPath, "nerabit"),
    buttonLabel: "Choose folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || !filePaths[0]) return null;
  return validateVaultFolder(filePaths[0]);
});

ipcMain.handle("vault:list-notes", () => {
  const root = configuredRoot();
  const folders = readFolderTree(root);
  const folderTreePath = resolveVaultPath(root, ".nerabit/folder-tree.json");
  if (!folders.some((folder) => folder.id === defaultFolderId)) {
    folders.unshift({ id: defaultFolderId, name: "Notes", position: 0 });
  }
  const notes = listMarkdownFiles(root).map((filePath) => {
    const note = parseNote(fs.readFileSync(filePath, "utf8"), filePath, folders);
    notePathIndex.set(`${path.resolve(root)}\0${note.id}`, filePath);
    const { markdown: _markdown, ...summary } = note;
    return summary;
  });
  if (!fs.existsSync(folderTreePath)) saveFolderTree(root, folders);
  const bookmarks = readJson(resolveVaultPath(root, ".nerabit/settings.json"), {}).bookmarks ?? [];
  if (!Array.isArray(bookmarks) || !bookmarks.every((key) => typeof key === "string")) {
    throw new Error("Vault bookmarks are invalid.");
  }
  return { notes, folders, bookmarks };
});

ipcMain.handle("vault:read-note", (_event, id) => {
  const root = configuredRoot();
  if (typeof id !== "string") throw new Error("The note identifier is invalid.");
  if (id.startsWith(".nerabit/") || id.startsWith(".nerabit\\")) {
    const filePath = resolveVaultPath(root, id);
    try { return fs.readFileSync(filePath, "utf8"); } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  const found = findNoteFile(id, root);
  return found?.note ?? null;
});

ipcMain.handle("vault:write-note", async (_event, value) => {
  const root = configuredRoot();
  if (!value || typeof value !== "object") throw new Error("The requested write is invalid.");
  if (value.operation === "switch-vault") {
    const destination = validateVaultFolder(value.path).path;
    if (path.resolve(destination) === path.resolve(root)) {
      throw new Error("The selected folder is already the current vault.");
    }
    if (value.move === true) {
      const sourceFiles = listAllFiles(root);
      for (const file of sourceFiles) {
        const relative = path.relative(root, file);
        const target = resolveVaultPath(destination, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
      }
      for (const file of sourceFiles) {
        const relative = path.relative(root, file);
        const target = resolveVaultPath(destination, relative);
        if (fs.statSync(file).size !== fs.statSync(target).size ||
          await hashFile(file) !== await hashFile(target)) {
          throw new Error(`Could not verify copied file "${relative}".`);
        }
      }
    }
    ensureVaultInitialized(destination);
    saveVaultConfig(destination);
    return destination;
  }
  if (typeof value.path === "string" && typeof value.contents === "string") {
    if (value.path.replace(/\\/g, "/") === ".nerabit/settings.json") {
      const current = readJson(resolveVaultPath(root, value.path), {});
      const incoming = JSON.parse(value.contents);
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw new Error("Vault settings are invalid.");
      }
      writeAtomic(root, value.path, JSON.stringify({
        ...incoming,
        ...(Array.isArray(current.bookmarks) ? { bookmarks: current.bookmarks } : {}),
      }, null, 2));
    } else {
      writeAtomic(root, value.path, value.contents);
    }
    return;
  }
  if (typeof value.path === "string" && typeof value.data === "string") {
    const target = resolveVaultPath(root, value.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = Buffer.from(value.data, "base64");
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, bytes);
      fs.renameSync(temporary, target);
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      throw error;
    }
    return;
  }
  if (typeof value.bookmark === "string" && typeof value.bookmarked === "boolean") {
    const filePath = resolveVaultPath(root, ".nerabit/settings.json");
    const settings = readJson(filePath, {});
    const bookmarks = new Set(Array.isArray(settings.bookmarks) ? settings.bookmarks : []);
    if (value.bookmarked) bookmarks.add(value.bookmark);
    else bookmarks.delete(value.bookmark);
    writeAtomic(root, ".nerabit/settings.json", JSON.stringify({ ...settings, bookmarks: [...bookmarks] }, null, 2));
    return;
  }
  if (typeof value.id !== "string" || typeof value.markdown !== "string") {
    throw new Error("The note contents are invalid.");
  }
  const folders = readFolderTree(root);
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(value.markdown);
  if (!frontmatter) throw new Error(`Note "${value.id}" has invalid YAML frontmatter.`);
  const metadata = parseYaml(frontmatter[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
    metadata.id !== value.id || typeof metadata.title !== "string" ||
    (metadata.folderId !== undefined && typeof metadata.folderId !== "string")) {
    throw new Error(`Note "${value.id}" has invalid YAML frontmatter.`);
  }
  const relative = noteLocation({
    title: metadata.title,
    folderId: metadata.folderId || defaultFolderId,
  }, folders);
  const existing = findNoteFile(value.id, root);
  const target = resolveVaultPath(root, relative);
  if (fs.existsSync(target) && (!existing || path.resolve(existing.filePath) !== target)) {
    throw new Error(`A note named "${metadata.title}" already exists in this folder.`);
  }
  writeAtomic(root, relative, value.markdown);
  notePathIndex.set(`${path.resolve(root)}\0${value.id}`, resolveVaultPath(root, relative));
  if (existing && path.resolve(existing.filePath) !== resolveVaultPath(root, relative)) {
    fs.unlinkSync(existing.filePath);
  }
});

function listAllFiles(root) {
  const files = [];
  function visit(relative) {
    for (const entry of fs.readdirSync(resolveVaultPath(root, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(resolveVaultPath(root, child));
    }
  }
  visit("");
  return files;
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

ipcMain.handle("vault:delete-note", (_event, id) => {
  const root = configuredRoot();
  if (id && typeof id === "object" && typeof id.path === "string") {
    const target = resolveVaultPath(root, id.path);
    try { fs.unlinkSync(target); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return;
  }
  if (typeof id !== "string") throw new Error("The note identifier is invalid.");
  const found = findNoteFile(id, root);
  if (found) {
    fs.unlinkSync(found.filePath);
    notePathIndex.delete(`${path.resolve(root)}\0${id}`);
  }
});

ipcMain.handle("vault:rename-note", (_event, id, title) => {
  if (typeof title !== "string") throw new Error("The note title is invalid.");
  const root = configuredRoot();
  const found = findNoteFile(id, root);
  if (!found) throw new Error(`Note "${id}" does not exist.`);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(found.markdown);
  if (!match) throw new Error(`Note "${id}" has invalid YAML frontmatter.`);
  const metadata = parseYaml(match[1]);
  metadata.title = title;
  const relative = noteLocation({ title, folderId: found.note.folderId }, found.folders);
  const target = resolveVaultPath(root, relative);
  if (fs.existsSync(target) && path.resolve(found.filePath) !== target) {
    throw new Error(`A note named "${title}" already exists in this folder.`);
  }
  writeAtomic(root, relative, `---\n${stringifyYaml(metadata)}---\n${match[2]}`);
  if (resolveVaultPath(root, relative) !== found.filePath) fs.unlinkSync(found.filePath);
  notePathIndex.set(`${path.resolve(root)}\0${id}`, resolveVaultPath(root, relative));
});

ipcMain.handle("vault:move-note", async (_event, id, folderId) => {
  const root = configuredRoot();
  if (typeof folderId !== "string") throw new Error("The destination folder is invalid.");
  const found = findNoteFile(id, root);
  if (!found) throw new Error(`Note "${id}" does not exist.`);
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(found.markdown);
  if (!frontmatter) throw new Error(`Note "${id}" has invalid YAML frontmatter.`);
  const metadata = parseYaml(frontmatter[1]);
  metadata.folderId = folderId;
  const relative = path.join(folderPathForId(folderId, found.folders), `${safeSegment(found.note.title)}.md`);
  const target = resolveVaultPath(root, relative);
  if (fs.existsSync(target) && path.resolve(found.filePath) !== target) {
    throw new Error(`A note named "${found.note.title}" already exists in that folder.`);
  }
  writeAtomic(root, relative, `---\n${stringifyYaml(metadata)}---\n${frontmatter[2]}`);
  if (resolveVaultPath(root, relative) !== found.filePath) fs.unlinkSync(found.filePath);
  notePathIndex.set(`${path.resolve(root)}\0${id}`, resolveVaultPath(root, relative));
});

ipcMain.handle("vault:create-folder", (_event, folder) => {
  const root = configuredRoot();
  if (!isFolder(folder) || !folder.id || !folder.name) throw new Error("The folder data is invalid.");
  if (folder.id === defaultFolderId) throw new Error("The default folder cannot be replaced.");
  const previousFolders = readFolderTree(root);
  const previousFolder = previousFolders.find((item) => item.id === folder.id);
  const folders = previousFolders.filter((item) => item.id !== folder.id);
  if (folder.parentId && !folders.some((item) => item.id === folder.parentId)) {
    throw new Error("The parent folder does not exist.");
  }
  folders.push({ id: folder.id, name: folder.name, position: folder.position, ...(folder.parentId ? { parentId: folder.parentId } : {}) });
  const relative = folderPathForId(folder.id, folders);
  const destination = resolveVaultPath(root, relative);
  if (previousFolder) {
    const previousPath = folderPathForId(folder.id, previousFolders);
    const previousLocation = resolveVaultPath(root, previousPath);
    if (previousLocation !== destination && fs.existsSync(previousLocation)) {
      if (fs.existsSync(destination)) throw new Error(`The folder "${folder.name}" already exists at that location.`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(previousLocation, destination);
    }
  } else {
    fs.mkdirSync(destination, { recursive: true });
  }
  saveFolderTree(root, folders);
});

ipcMain.handle("vault:delete-folder", (_event, id) => {
  const root = configuredRoot();
  if (typeof id !== "string") throw new Error("The folder identifier is invalid.");
  if (id === defaultFolderId) throw new Error("The default folder cannot be deleted.");
  const folders = readFolderTree(root);
  const folder = folders.find((item) => item.id === id);
  if (!folder) return;
  const folderPath = folderPathForId(id, folders);
  const remaining = folders.filter((item) => item.id !== id && item.parentId !== id);
  saveFolderTree(root, remaining);
  try { fs.rmdirSync(resolveVaultPath(root, folderPath)); } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
  }
});

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
  if (window.webContents.session.availableSpellCheckerLanguages.includes("en-US")) {
    window.webContents.session.setSpellCheckerLanguages(["en-US"]);
  }
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

ipcMain.handle("spellcheck:get-word-suggestions", (event, word) => {
  if (typeof word !== "string" || !/^[\p{L}\p{N}'’-]{2,64}$/u.test(word)) {
    return [];
  }
  const contents = BrowserWindow.fromWebContents(event.sender)?.webContents;
  return contents?.getWordSuggestions(word).slice(0, 6) ?? [];
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
