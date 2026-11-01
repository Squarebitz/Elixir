# Nerabit

An offline-capable notes and task dashboard built with Vite, React, TypeScript, Tailwind, JetBrains Mono, and Electron. Notes and folders are stored locally with IndexedDB (Dexie) as Markdown documents with YAML frontmatter.

## Run locally

Use Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Use `npm run build` to type-check and create a production build, then `npm run preview` to serve it.

## Desktop app

The Electron app loads its renderer from the local production build and does not require an internet connection to use notes, folders, or settings. Workspace data stays in the local Electron profile on the device.

```bash
npm run desktop
```

Create Windows installer and portable `.exe` downloads with:

```bash
npm run package:win
```

Find the generated downloads in `release/`. Building the installers requires internet access the first time so npm can install Electron and electron-builder can fetch packaging tools. The installed app itself runs offline.

The UI depends on the `NoteStorage` interface in `app/storage.ts`; `app/indexeddb-storage.ts` implements it with Dexie. Swap the implementation passed from `app/main.tsx` to connect another storage backend.

New workspaces include a **Notes** folder with a Welcome note explaining the basics. Folders and notes appear together in the sidebar: expand folders to see their notes and subfolders, and use a folder's options to create notes or nested subfolders to any depth. You can reorder sibling folders or delete a folder from its options; deleting a folder moves its notes to its parent or another available folder and promotes its subfolders. If there is no destination folder, its notes are deleted. Notes open in the full-screen TipTap editor and save automatically as Markdown; YAML frontmatter stores the title, folder, position, and optional note icon. Choose an emoji or Lucide icon for a note from the icon button above its title. The note editor has a visible scrollbar that can be dragged or scrolled with the mouse or keyboard. Type `/` in the editor to insert a heading, list, checklist, quote, or code block. Use the arrow keys and Enter to choose a command, or click it.

The sidebar can be collapsed from its top-right control and resized by dragging its right edge. Its minimum expanded width is 200px, with no fixed maximum. Drag a folder to change its order among its siblings, or open its options to create a note, add a subfolder, or delete it.
