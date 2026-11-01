import type { NoteDocument, NoteFolder, NoteSummary } from "./storage";

declare global {
  interface Window {
    nerabitDesktop?: {
      platform: string;
      chooseVaultFolder(path?: string): Promise<{
        path: string;
        writable: boolean;
        warning: boolean;
      } | null>;
      getVaultPath(action?: "open"): Promise<{
        path: string | null;
        valid: boolean;
        missing?: boolean;
      }>;
      listNotes(): Promise<{
        notes: NoteSummary[];
        folders: NoteFolder[];
        bookmarks: string[];
      }>;
      readNote(id: string): Promise<NoteDocument | string | null>;
      writeNote(value:
        | { id: string; markdown: string }
        | { path: string; contents: string }
        | { path: string; data: string }
        | { bookmark: string; bookmarked: boolean }
        | { operation: "switch-vault"; path: string; move: boolean }
      ): Promise<void | string>;
      deleteNote(id: string | { path: string }): Promise<void>;
      renameNote(id: string, title: string): Promise<void>;
      moveNote(id: string, folderId: string): Promise<void>;
      createFolder(folder: NoteFolder): Promise<void>;
      deleteFolder(id: string): Promise<void>;
      isFullScreen(): Promise<boolean>;
      toggleFullScreen(): Promise<boolean>;
      exitFullScreen(): Promise<boolean>;
      onFullScreenChange(callback: (fullScreen: boolean) => void): () => void;
      toggleWindowMaximize(): void;
      setTheme(theme: "dark" | "light"): Promise<void>;
      getWordSuggestions(word: string): Promise<string[]>;
      onSuggestions(
        callback: (data: {
          misspelledWord: string;
          dictionarySuggestions: string[];
        }) => void,
      ): () => void;
      replaceMisspelling(word: string): void;
      addToDictionary(word: string): void;
      saveImageAs(dataUrl: string): Promise<boolean>;
    };
  }
}
