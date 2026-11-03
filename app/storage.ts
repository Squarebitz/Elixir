export type NoteKind = "checklist" | "notes";
export const DEFAULT_FOLDER_ID = "default-folder";
export const WELCOME_NOTE_TITLE = "Welcome";
export const WELCOME_NOTE_MARKDOWN = `# Welcome to Elixir

Elixir is your personal space for notes, ideas, and plans.

## Organize with folders
Create folders in the sidebar for projects or topics. Use a folder's options to add notes or make nested subfolders to any depth. Expand a folder to see its notes and subfolders. You can reorder sibling folders or delete a folder from its options.

## Write and navigate
Create a note from the sidebar. Your changes save automatically. Type \`/\` in the editor to add headings, lists, checklists, quotes, and code blocks. Use the note tabs at the top to switch between notes.

## Make it yours
Choose an icon for your notes and resize or collapse the sidebar whenever you like.

You can edit or delete this welcome note at any time.`;

export type NoteFolder = {
  id: string;
  name: string;
  position: number;
  parentId?: string;
  icon?: string;
};

export type PropertyType =
  | "tags"
  | "category"
  | "date"
  | "text"
  | "url"
  | "choice"
  | "rating"
  | "related"
  | "summary"
  | "number"
  | "checkbox"
  | "multi-choice";

export type PropertyDefinition = {
  key: string;
  label: string;
  type: PropertyType;
};

export type PropertyStateUpdate = (
  properties: Record<string, unknown>,
  propertyOrder: string[],
) => { properties: Record<string, unknown>; propertyOrder: string[] };

export type NoteSummary = {
  id: string;
  title: string;
  kind: NoteKind;
  folderId: string;
  position: number;
  category?: string;
  tags?: string[];
  properties?: Record<string, unknown>;
  propertyOrder?: string[];
  createdAt?: string;
  updatedAt?: string;
  icon?: string;
};

export type NoteDocument = NoteSummary & {
  markdown: string;
  icon?: string;
  bannerImage?: string;
  bannerWidth?: "full" | "medium";
  bannerPosition?: { x: number; y: number };
  migrationBackup?: string;
  properties?: Record<string, unknown>;
  propertyOrder?: string[];
  createdAt?: string;
  updatedAt?: string;
  legacyProperties?: { category?: string; tags?: string[] };
};

export interface NoteStorage {
  listFolders(): Promise<NoteFolder[]>;
  createFolder(folder: NoteFolder): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  listNotes(): Promise<NoteSummary[]>;
  readNote(id: string): Promise<NoteDocument | null>;
  readNoteMarkdown(id: string): Promise<string | null>;
  getNotePreview(id: string): Promise<string>;
  migrateLegacyProperties(id: string): Promise<NoteDocument>;
  readVaultFile(path: string): Promise<string | null>;
  writeVaultFile(path: string, contents: string): Promise<void>;
  writeVaultAttachment(path: string, contents: Blob): Promise<void>;
  deleteVaultFile(path: string): Promise<void>;
  writeNote(note: NoteDocument): Promise<void>;
  deleteNote(id: string): Promise<void>;
  listBookmarks(): Promise<string[]>;
  setBookmark(key: string, bookmarked: boolean): Promise<void>;
  getNotePath(id: string, absolute: boolean): Promise<string | null>;
  getFolderPath(id: string, absolute: boolean): Promise<string | null>;
}
