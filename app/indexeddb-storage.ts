import Dexie, { type Table } from "dexie";
import { parse } from "yaml";
import {
  DEFAULT_FOLDER_ID,
  type NoteDocument,
  type NoteFolder,
  type NoteKind,
  type NoteStorage,
  type NoteSummary,
} from "./storage";
import { encodeDocument } from "./note-format";

type StoredDocument = {
  id: string;
  markdown: string;
};

type WorkspaceSetting = {
  id: string;
  initialized?: boolean;
  value?: string | Blob;
};

export type IndexedDbExport = {
  notes: NoteDocument[];
  folders: NoteFolder[];
  bookmarks: string[];
  vaultFiles: { path: string; value: string | Blob }[];
};

class NotesDatabase extends Dexie {
  documents!: Table<StoredDocument, string>;
  folders!: Table<NoteFolder, string>;
  settings!: Table<WorkspaceSetting, string>;

  constructor() {
    super("focusboard");
    this.version(1).stores({ documents: "&id" });
    this.version(2).stores({
      documents: "&id",
      folders: "&id",
    });
    this.version(3).stores({
      documents: "&id",
      folders: "&id",
      settings: "&id",
    });
  }
}

const database = new NotesDatabase();
const previewCache = new Map<string, { markdown: string; preview: string }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBannerPosition(
  value: unknown,
): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    value.x <= 100 &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    value.y >= 0 &&
    value.y <= 100
  );
}

function isNoteKind(value: unknown): value is NoteKind {
  return value === "checklist" || value === "notes";
}

function parseLegacyProperties(markdown: string) {
  const lines = markdown.split(/(\r?\n)/);
  let category: string | undefined;
  let tags: string[] | undefined;
  const removed = new Set<number>();
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
  return {
    category,
    tags,
    markdown: lines.filter((_, index) => !removed.has(index)).join(""),
  };
}

function decodeDocument(document: StoredDocument): NoteDocument {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(
    document.markdown,
  );
  if (!frontmatter) {
    throw new Error(`Stored note "${document.id}" has invalid YAML frontmatter.`);
  }

  const parsedMetadata: unknown = parse(frontmatter[1]);
  if (!isRecord(parsedMetadata)) {
    throw new Error(`Stored note "${document.id}" has invalid YAML frontmatter.`);
  }

  delete parsedMetadata.titleSize;
  delete parsedMetadata.titleFormatting;

  const {
    id,
    title,
    kind,
    folderId,
    position,
    bannerImage,
    bannerWidth,
    bannerPosition,
    icon,
    propertyOrder,
    createdAt,
    updatedAt,
    ...properties
  } = parsedMetadata;
  const body = frontmatter[2];
  const legacyProperties = parseLegacyProperties(body);
  if (
    typeof id !== "string" ||
    id !== document.id ||
    typeof title !== "string" ||
    !isNoteKind(kind) ||
    (folderId !== undefined && typeof folderId !== "string") ||
    typeof position !== "number" ||
    !Number.isFinite(position) ||
    (bannerImage !== undefined && typeof bannerImage !== "string") ||
    (bannerWidth !== undefined &&
      bannerWidth !== "full" &&
      bannerWidth !== "medium") ||
    (bannerPosition !== undefined && !isBannerPosition(bannerPosition)) ||
    (icon !== undefined && typeof icon !== "string") ||
    (propertyOrder !== undefined &&
      (!Array.isArray(propertyOrder) ||
        !propertyOrder.every((key) => typeof key === "string"))) ||
    (createdAt !== undefined && typeof createdAt !== "string") ||
    (updatedAt !== undefined && typeof updatedAt !== "string")
  ) {
    throw new Error(`Stored note "${document.id}" has invalid frontmatter.`);
  }

  return {
    id,
    title,
    kind,
    folderId: typeof folderId === "string" ? folderId : DEFAULT_FOLDER_ID,
    position,
    markdown: body,
    ...(typeof icon === "string" ? { icon } : {}),
    properties,
    propertyOrder: Array.isArray(propertyOrder) ? propertyOrder : [],
    ...(typeof createdAt === "string" ? { createdAt } : {}),
    ...(typeof updatedAt === "string" ? { updatedAt } : {}),
    ...(legacyProperties.category !== undefined || legacyProperties.tags !== undefined
      ? {
          legacyProperties: {
            ...(legacyProperties.category !== undefined
              ? { category: legacyProperties.category }
              : {}),
            ...(legacyProperties.tags !== undefined
              ? { tags: legacyProperties.tags }
              : {}),
          },
        }
      : {}),
    ...(typeof bannerImage === "string" ? { bannerImage } : {}),
    ...(bannerWidth === "full" || bannerWidth === "medium"
      ? { bannerWidth }
      : {}),
    ...(isBannerPosition(bannerPosition) ? { bannerPosition } : {}),
  };
}

function safePathSegment(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim() || "Untitled";
}

function createNotePreview(markdown: string): string {
  const paragraph: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (paragraph.length) break;
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^!\[[^\]]*\]\(.*\)$/.test(line)) continue;
    paragraph.push(line);
    if (paragraph.length === 3) break;
  }
  const plainText = paragraph
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~#>]/g, "")
    .replace(/^\s*[-+]\s+|\s+\|\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plainText.length > 140 ? `${plainText.slice(0, 139).trimEnd()}…` : plainText;
}

export class IndexedDbNoteStorage implements NoteStorage {
  async exportExistingWorkspace(): Promise<IndexedDbExport | null> {
    if (await database.documents.count() === 0) return null;
    const [folders, summaries, settings] = await Promise.all([
      this.listFolders(),
      this.listNotes(),
      database.settings.toArray(),
    ]);
    const notes = await Promise.all(
      summaries.map(async ({ id }) => {
        const note = await this.readNote(id);
        if (!note) throw new Error(`Legacy note "${id}" disappeared during import.`);
        return note;
      }),
    );
    return {
      notes,
      folders,
      bookmarks: await this.listBookmarks(),
      vaultFiles: settings.flatMap((setting) => {
        if (!setting.id.startsWith("vault-file:") || setting.value === undefined) return [];
        return [{
          path: setting.id.slice("vault-file:".length),
          value: setting.value,
        }];
      }),
    };
  }

  async listFolders(): Promise<NoteFolder[]> {
    await database.transaction(
      "rw",
      database.folders,
      database.documents,
      database.settings,
      async () => {
        const setting = await database.settings.get("workspace");
        if (setting?.initialized) return;

        const folders = await database.folders.count();
        if (folders === 0) {
          await database.folders.put({
            id: DEFAULT_FOLDER_ID,
            name: "Notes",
            position: 0,
          });
        }

        await database.settings.put({
          id: "workspace",
          initialized: true,
        });
      },
    );
    const folders = await database.folders.toArray();
    return folders.sort((left, right) => left.position - right.position);
  }

  async createFolder(folder: NoteFolder): Promise<void> {
    const storedFolder: NoteFolder = {
      id: folder.id,
      name: folder.name,
      position: folder.position,
      ...(folder.parentId ? { parentId: folder.parentId } : {}),
    };
    await database.folders.put(storedFolder);
  }

  async deleteFolder(id: string): Promise<void> {
    await database.folders.delete(id);
  }

  async listNotes(): Promise<NoteSummary[]> {
    const stored = await database.documents.toArray();
    return stored
      .map(decodeDocument)
      .sort((left, right) => left.position - right.position)
      .map(({ id, title, kind, folderId, position, icon, properties, propertyOrder, createdAt, updatedAt }) => ({
        id,
        title,
        kind,
        folderId,
        position,
        ...(icon ? { icon } : {}),
        properties,
        propertyOrder,
        ...(typeof properties?.category === "string"
          ? { category: properties.category }
          : {}),
        ...(Array.isArray(properties?.tags) &&
          properties.tags.every((tag) => typeof tag === "string")
          ? { tags: properties.tags as string[] }
          : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {}),
      }));
  }

  async readNote(id: string): Promise<NoteDocument | null> {
    const stored = await database.documents.get(id);
    return stored ? decodeDocument(stored) : null;
  }

  async readNoteMarkdown(id: string): Promise<string | null> {
    const stored = await database.documents.get(id);
    return stored?.markdown ?? null;
  }

  async getNotePreview(id: string): Promise<string> {
    const stored = await database.documents.get(id);
    if (!stored) throw new Error(`Note "${id}" does not exist.`);
    const cached = previewCache.get(id);
    if (cached?.markdown === stored.markdown) return cached.preview;
    const preview = createNotePreview(
      parseLegacyProperties(decodeDocument(stored).markdown).markdown,
    );
    previewCache.set(id, { markdown: stored.markdown, preview });
    return preview;
  }

  async migrateLegacyProperties(id: string): Promise<NoteDocument> {
    // Keep conversion atomic so a failed migration leaves the stored note unchanged.
    return database.transaction("rw", database.documents, async () => {
      const stored = await database.documents.get(id);
      if (!stored) throw new Error(`Note "${id}" does not exist.`);
      const note = decodeDocument(stored);
      const migration = parseLegacyProperties(note.markdown);
      if (migration.category === undefined && migration.tags === undefined) {
        return note;
      }
      const properties = { ...(note.properties ?? {}) };
      if (migration.category !== undefined && properties.category === undefined) {
        properties.category = migration.category;
      }
      if (migration.tags !== undefined) {
        const existingTags = Array.isArray(properties.tags)
          ? properties.tags.filter((tag): tag is string => typeof tag === "string")
          : [];
        properties.tags = [
          ...existingTags,
          ...migration.tags.filter(
            (tag) => !existingTags.some((current) => current.toLowerCase() === tag.toLowerCase()),
          ),
        ];
      }
      const migrated = {
        ...note,
        markdown: migration.markdown,
        properties,
            createdAt: note.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            propertyOrder: [
          ...new Set([
            ...(note.propertyOrder ?? []),
            ...(migration.category !== undefined ? ["category"] : []),
            ...(migration.tags !== undefined ? ["tags"] : []),
          ]),
        ],
      };
      await database.documents.put(encodeDocument(migrated));
      previewCache.delete(id);
      return decodeDocument(encodeDocument(migrated));
    });
  }

  async readVaultFile(path: string): Promise<string | null> {
    // Vault-level files stay behind NoteStorage for other storage backends.
    const setting = await database.settings.get(`vault-file:${path}`);
    return typeof setting?.value === "string" ? setting.value : null;
  }

  async writeVaultFile(path: string, contents: string): Promise<void> {
    await database.settings.put({
      id: `vault-file:${path}`,
      value: contents,
    });
  }

  async writeVaultAttachment(path: string, contents: Blob): Promise<void> {
    await database.settings.put({
      id: `vault-file:${path}`,
      value: contents,
    });
  }

  async deleteVaultFile(path: string): Promise<void> {
    await database.settings.delete(`vault-file:${path}`);
  }

  async writeNote(note: NoteDocument): Promise<void> {
    const previous = await database.documents.get(note.id);
    const previousMetadata = previous
      ? parse(
          /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(previous.markdown)?.[1] ?? "",
        )
      : null;
    const metadata = isRecord(previousMetadata) ? previousMetadata : {};
    const timestamp = new Date().toISOString();
    const saved = {
      ...note,
      createdAt: note.createdAt ?? (
        typeof metadata.createdAt === "string" ? metadata.createdAt : timestamp
      ),
      updatedAt: timestamp,
    };
    await database.documents.put(encodeDocument(saved));
    previewCache.delete(note.id);
  }

  async deleteNote(id: string): Promise<void> {
    await database.documents.delete(id);
    previewCache.delete(id);
  }

  async listBookmarks(): Promise<string[]> {
    const settings = await database.settings.toArray();
    return settings
      .filter((setting) => setting.id.startsWith("bookmark:") && setting.initialized)
      .map((setting) => setting.id.slice("bookmark:".length));
  }

  async setBookmark(key: string, bookmarked: boolean): Promise<void> {
    const id = `bookmark:${key}`;
    if (bookmarked) {
      await database.settings.put({ id, initialized: true });
    } else {
      await database.settings.delete(id);
    }
  }

  async getFolderPath(id: string, absolute: boolean): Promise<string | null> {
    if (absolute) return null;
    const folders = await this.listFolders();
    const path: string[] = [];
    let current = folders.find((folder) => folder.id === id);
    if (!current) throw new Error(`Folder "${id}" does not exist.`);
    while (current) {
      path.unshift(safePathSegment(current.name));
      current = current.parentId
        ? folders.find((folder) => folder.id === current?.parentId)
        : undefined;
    }
    return path.join("/");
  }

  async getNotePath(id: string, absolute: boolean): Promise<string | null> {
    if (absolute) return null;
    const note = await this.readNote(id);
    if (!note) throw new Error(`Note "${id}" does not exist.`);
    const folderPath = await this.getFolderPath(note.folderId, false);
    return `${folderPath ? `${folderPath}/` : ""}${safePathSegment(note.title)}.md`;
  }
}
