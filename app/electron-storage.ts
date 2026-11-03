import { encodeDocument } from "./note-format";
import type {
  NoteDocument,
  NoteFolder,
  NoteStorage,
  NoteSummary,
} from "./storage";

type DesktopWorkspace = {
  notes: NoteSummary[];
  folders: NoteFolder[];
  bookmarks: string[];
};

function desktopApi() {
  const api = window.ElixirDesktop;
  if (!api) throw new Error("The Elixir desktop storage API is unavailable.");
  return api;
}

function preview(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const paragraph: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (paragraph.length) break;
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^!\[[^\]]*\]\(.*\)$/.test(line)) continue;
    paragraph.push(line);
    if (paragraph.length === 3) break;
  }
  const text = paragraph
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
}

function safeSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
    .join("")
    .trim() || "Untitled";
}

export class ElectronNoteStorage implements NoteStorage {
  private async workspace(): Promise<DesktopWorkspace> {
    return desktopApi().listNotes();
  }

  async listFolders(): Promise<NoteFolder[]> {
    return (await this.workspace()).folders;
  }

  async createFolder(folder: NoteFolder): Promise<void> {
    await desktopApi().createFolder(folder);
  }

  async deleteFolder(id: string): Promise<void> {
    await desktopApi().deleteFolder(id);
  }

  async listNotes(): Promise<NoteSummary[]> {
    return (await this.workspace()).notes;
  }

  async readNote(id: string): Promise<NoteDocument | null> {
    const note = await desktopApi().readNote(id);
    return typeof note === "object" && note !== null ? note : null;
  }

  async readNoteMarkdown(id: string): Promise<string | null> {
    const note = await this.readNote(id);
    return note ? encodeDocument(note).markdown : null;
  }

  async getNotePreview(id: string): Promise<string> {
    const note = await this.readNote(id);
    if (!note) throw new Error(`Note "${id}" does not exist.`);
    return preview(note.markdown);
  }

  async migrateLegacyProperties(id: string): Promise<NoteDocument> {
    const note = await this.readNote(id);
    if (!note) throw new Error(`Note "${id}" does not exist.`);
    const lines = note.markdown.split(/(\r?\n)/);
    const properties = { ...(note.properties ?? {}) };
    const removed = new Set<number>();
    let category: string | undefined;
    let tags: string[] | undefined;
    for (let index = 0; index < lines.length; index += 2) {
      const line = lines[index];
      if (!line.trim()) continue;
      const categoryMatch = /^category:\s*(.*)$/i.exec(line);
      const tagsMatch = /^tags:\s*(.*)$/i.exec(line);
      if (categoryMatch && category === undefined) {
        category = categoryMatch[1].trim();
        removed.add(index);
        if (lines[index + 1]) removed.add(index + 1);
        continue;
      }
      if (tagsMatch && tags === undefined) {
        tags = tagsMatch[1]
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        removed.add(index);
        if (lines[index + 1]) removed.add(index + 1);
        continue;
      }
      break;
    }
    if (category !== undefined && properties.category === undefined) properties.category = category;
    if (tags !== undefined) {
      const current = Array.isArray(properties.tags)
        ? properties.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      properties.tags = [
        ...current,
        ...tags.filter((tag) => !current.some((item) => item.toLowerCase() === tag.toLowerCase())),
      ];
    }
    const migrated = {
      ...note,
      properties,
      markdown: lines.filter((_, index) => !removed.has(index)).join(""),
      propertyOrder: [
        ...new Set([
          ...(note.propertyOrder ?? []),
          ...(category !== undefined ? ["category"] : []),
          ...(tags !== undefined ? ["tags"] : []),
        ]),
      ],
    };
    await this.writeNote(migrated);
    return migrated;
  }

  async readVaultFile(path: string): Promise<string | null> {
    const contents = await desktopApi().readNote(path);
    return typeof contents === "string" ? contents : null;
  }

  async writeVaultFile(path: string, contents: string): Promise<void> {
    await desktopApi().writeNote({ path, contents });
  }

  async writeVaultAttachment(path: string, contents: Blob): Promise<void> {
    const bytes = new Uint8Array(await contents.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    await desktopApi().writeNote({ path, data: btoa(binary) });
  }

  async deleteVaultFile(path: string): Promise<void> {
    await desktopApi().deleteNote({ path });
  }

  async writeNote(note: NoteDocument): Promise<void> {
    const previous = await this.readNote(note.id);
    const timestamp = new Date().toISOString();
    const saved = {
      ...note,
      createdAt: note.createdAt ?? previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const encoded = encodeDocument(saved);
    await desktopApi().writeNote(encoded);
  }

  async deleteNote(id: string): Promise<void> {
    await desktopApi().deleteNote(id);
  }

  async listBookmarks(): Promise<string[]> {
    return (await this.workspace()).bookmarks;
  }

  async setBookmark(key: string, bookmarked: boolean): Promise<void> {
    await desktopApi().writeNote({ bookmark: key, bookmarked });
  }

  async getNotePath(id: string, absolute: boolean): Promise<string | null> {
    const note = await this.readNote(id);
    if (!note) throw new Error(`Note "${id}" does not exist.`);
    const relative = await this.getFolderPath(note.folderId, false);
    const path = `${relative ? `${relative}/` : ""}${safeSegment(note.title)}.md`;
    if (!absolute) return path;
    const vault = await desktopApi().getVaultPath();
    return vault.valid && vault.path ? `${vault.path}\\${path.replace(/\//g, "\\")}` : null;
  }

  async getFolderPath(id: string, absolute: boolean): Promise<string | null> {
    const folders = await this.listFolders();
    const parts: string[] = [];
    let current = folders.find((folder) => folder.id === id);
    if (!current) throw new Error(`Folder "${id}" does not exist.`);
    while (current && current.id !== "default-folder") {
      parts.unshift(safeSegment(current.name));
      current = current.parentId
        ? folders.find((folder) => folder.id === current?.parentId)
        : undefined;
    }
    const relative = parts.join("/");
    if (!absolute) return relative;
    const vault = await desktopApi().getVaultPath();
    return vault.valid && vault.path
      ? `${vault.path}\\${relative.replace(/\//g, "\\")}`
      : null;
  }
}

export async function activateVault(path: string): Promise<void> {
  await desktopApi().chooseVaultFolder(path);
}

export async function switchVault(path: string, move: boolean): Promise<void> {
  await desktopApi().writeNote({ operation: "switch-vault", path, move });
}
