import {
  AlignHorizontalDistributeCenter,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Command as CommandIcon,
  Copy,
  FileText,
  FilePlus2,
  Folder,
  FolderPlus,
  Maximize2,
  MoveRight,
  MoreHorizontal,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shapes,
  Split,
  X,
} from "lucide-react";
import MiniSearch from "minisearch";
import { NoteProperties } from "./components/note-properties";
import { IconPicker, NoteIcon } from "./components/icon-picker";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { ScrollArea } from "./components/ui/scroll-area";
import { Input } from "./components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/ui/context-menu";
import {
  Fragment,
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import {
  DEFAULT_FOLDER_ID,
  WELCOME_NOTE_MARKDOWN,
  WELCOME_NOTE_TITLE,
  type NoteDocument,
  type NoteFolder,
  type NoteStorage,
  type PropertyStateUpdate,
} from "./storage";
import { NotesEditor, type LinkedNoteOption } from "./notes-editor";
import { switchVault } from "./electron-storage";

type Task = {
  id: string;
  title: string;
  completed: boolean;
};

type ChecklistBlock = {
  id: string;
  type: "checklist";
  title: string;
  tasks: Task[];
  category?: string;
  tags: string[];
  icon?: string;
};

type NotesBlock = {
  id: string;
  type: "notes";
  title: string;
  icon?: string;
  folderId: string;
  content: string;
  preview: string;
  properties: Record<string, unknown>;
  propertyOrder: string[];
  createdAt?: string;
  updatedAt?: string;
  legacyProperties?: { category?: string; tags?: string[] };
  bannerImage?: string;
  bannerWidth?: "full" | "medium";
  bannerPosition?: { x: number; y: number };
};

type DashboardBlock = ChecklistBlock | NotesBlock;

type SidebarItemActions = {
  bookmarks: Set<string>;
  onDuplicateFolder: (folderId: string) => void;
  onMoveFolder: (folderId: string, parentId?: string) => void;
  onSearchFolder: (folderId: string) => void;
  onToggleBookmark: (key: string) => void;
  onCopyPath: (kind: "note" | "folder", id: string, absolute: boolean) => void;
  onCopyNote: (noteId: string) => void;
  onMoveNote: (noteId: string, folderId: string) => void;
  onRenameNote: (noteId: string, title: string) => void;
  onDeleteNote: (noteId: string) => void;
  onOpenSplitNote: (noteId: string) => void;
  onOpenNote: (noteId: string) => void;
  onSetFolderIcon: (folderId: string, icon?: string) => void;
};

function isFolderWithin(candidateId: string, ancestorId: string, folders: NoteFolder[]): boolean {
  let current = folders.find((folder) => folder.id === candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function SidebarNoteItem({
  note,
  folders,
  selected,
  paddingLeft,
  actions,
}: {
  note: NotesBlock;
  folders: NoteFolder[];
  selected: boolean;
  paddingLeft: number;
  actions: SidebarItemActions;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(note.title);
  const isBookmarked = actions.bookmarks.has(`note:${note.id}`);
  const menuItems = [
    { label: "Open in split view", icon: <Split />, action: () => actions.onOpenSplitNote(note.id), group: 1 },
    { label: "Make a copy", icon: <Copy />, action: () => actions.onCopyNote(note.id), group: 1 },
    { label: "Move to...", icon: <MoveRight />, action: () => undefined, group: 1 },
    { label: isBookmarked ? "Remove bookmark" : "Bookmark...", icon: <Bookmark />, action: () => actions.onToggleBookmark(`note:${note.id}`), group: 2 },
    { label: "Copy path", icon: <Copy />, action: () => undefined, group: 3 },
    { label: "Rename...", icon: <FileText />, action: () => setRenameOpen(true), group: 4 },
    { label: "Delete", icon: <X />, action: () => setDeleteOpen(true), group: 4, danger: true },
  ];

  useEffect(() => {
    if (renameOpen) setRenameValue(note.title);
  }, [note.title, renameOpen]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={<button
          type="button"
          data-selected={selected}
          aria-current={selected ? "page" : undefined}
          onClick={() => actions.onOpenNote(note.id)}
          style={{ paddingLeft }}
          title={note.title || "Untitled"}
          className={`flex min-w-0 w-full items-center rounded-md py-2 pr-2 text-left text-xs transition-colors ${
            selected
              ? "bg-white/[0.06] text-[#e8eaf0]"
              : "text-[#aeb3c1] hover:bg-white/[0.04] hover:text-white"
          }`}
        />}>
          {isBookmarked && <Bookmark className="mr-1 inline h-3 w-3" />}
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden align-middle">
            {note.icon ? (
              <NoteIcon value={note.icon} className="h-4 w-4 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
            )}
            <span className="min-w-0 flex-1 truncate">{note.title || "Untitled"}</span>
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52 font-mono text-xs">
          {menuItems.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 && menuItems[index - 1].group !== item.group && <ContextMenuSeparator />}
              {item.label === "Move to..." ? (
                <ContextMenuSub>
                  <ContextMenuSubTrigger>{item.icon}{item.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="font-mono text-xs">
                    {folders.filter((folder) => folder.id !== note.folderId).map((folder) => (
                      <ContextMenuItem key={folder.id} onClick={() => actions.onMoveNote(note.id, folder.id)}>
                        <Folder />{folder.name}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ) : item.label === "Copy path" ? (
                <ContextMenuSub>
                  <ContextMenuSubTrigger>{item.icon}{item.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="font-mono text-xs">
                    <ContextMenuItem onClick={() => actions.onCopyPath("note", note.id, false)}>Relative path</ContextMenuItem>
                    <ContextMenuItem onClick={() => actions.onCopyPath("note", note.id, true)}>Full path</ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ) : (
                <ContextMenuItem
                  onClick={item.action}
                  className={item.danger ? "text-[#ff929b] focus:text-[#ff929b]" : ""}
                >
                  {item.icon}{item.label}
                </ContextMenuItem>
              )}
            </Fragment>
          ))}
          {/* Add "Show in system explorer" and "Open in default app" in the Electron integration. */}
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="font-mono">
          <DialogHeader><DialogTitle>Rename note</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} aria-label="Note title" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={() => { actions.onRenameNote(note.id, renameValue); setRenameOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="font-mono">
          <DialogHeader>
            <DialogTitle>Delete {note.title || "Untitled"}?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { actions.onDeleteNote(note.id); setDeleteOpen(false); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ElixirMark({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 68"
      className={className}
      fill="currentColor"
    >
      <path d="M24 0h60v38H60v30H0V30h24z" />
      <path d="M80 54h16v14H80z" />
    </svg>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  label,
  placeholder,
  className,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  className: string;
  onEnter?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resizeToContent() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  useLayoutEffect(resizeToContent, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onInput={resizeToContent}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }}
      aria-label={label}
      placeholder={placeholder}
      className={`resize-none overflow-hidden break-words ${className}`}
    />
  );
}

function FolderItem({
  folder,
  allFolders,
  allNotes,
  depth,
  selectedFolderId,
  expandedFolders,
  creatingFolder,
  creatingUnderFolderId,
  folderName,
  folderInputRef,
  onOpenNote,
  onSelectFolder,
  onToggle,
  onCreateSubfolder,
  onCreateNote,
  onFolderNameChange,
  onCreateFolderSubmit,
  onCancelFolderCreation,
  onRenameFolder,
  onDelete,
  onReorder,
  openNoteId,
  actions,
}: {
  folder: NoteFolder;
  allFolders: NoteFolder[];
  allNotes: NotesBlock[];
  depth: number;
  selectedFolderId: string | null;
  expandedFolders: Set<string>;
  creatingFolder: boolean;
  creatingUnderFolderId?: string;
  folderName: string;
  folderInputRef: RefObject<HTMLInputElement>;
  onOpenNote: (noteId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onCreateNote: (folderId: string) => void;
  onFolderNameChange: (name: string) => void;
  onCreateFolderSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancelFolderCreation: () => void;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
  onDelete: (folderId: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  openNoteId: string | null;
  actions: SidebarItemActions;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [folderIconPickerOpen, setFolderIconPickerOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const childFolders = allFolders.filter((item) => item.parentId === folder.id);
  const notes = allNotes.filter((note) => note.folderId === folder.id);
  const expanded = expandedFolders.has(folder.id);
  const selected =
    selectedFolderId === folder.id &&
    !allNotes.some((note) => note.id === openNoteId && note.folderId === folder.id);
  const contextItems = [
    { label: "New note", icon: <FilePlus2 />, action: () => onCreateNote(folder.id), group: 1 },
    { label: "New folder", icon: <FolderPlus />, action: () => onCreateSubfolder(folder.id), group: 1 },
    { label: "Make a copy", icon: <Copy />, action: () => actions.onDuplicateFolder(folder.id), group: 2 },
    { label: "Move folder to...", icon: <MoveRight />, action: () => undefined, group: 2 },
    { label: "Search in folder", icon: <Search />, action: () => actions.onSearchFolder(folder.id), group: 2 },
    { label: actions.bookmarks.has(`folder:${folder.id}`) ? "Remove bookmark" : "Bookmark...", icon: <Bookmark />, action: () => actions.onToggleBookmark(`folder:${folder.id}`), group: 2 },
    { label: "Copy path", icon: <Copy />, action: () => undefined, group: 3 },
    { label: "Change icon...", icon: <Shapes />, action: () => setFolderIconPickerOpen(true), group: 4 },
    { label: "Rename...", icon: <FileText />, action: () => setRenaming(true), group: 4 },
    { label: "Delete", icon: <X />, action: () => setDeleteFolderOpen(true), group: 4, danger: true },
  ];

  useEffect(() => {
    if (renaming) {
      setRenameValue(folder.name);
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming, folder.name]);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== folder.id) onReorder(draggedId, folder.id);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onRenameFolder(folder.id, renameValue)) setRenaming(false);
  }

  return (
    <div
      className="relative"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <ContextMenu>
      <ContextMenuTrigger render={<div
        data-selected={selected}
        style={{ paddingLeft: `${depth * 12}px` }}
        className={`group relative flex items-center gap-1 rounded-md transition-colors ${
          selected
            ? "bg-white/[0.06]"
            : "hover:bg-white/[0.04]"
        }`}
      />}>
      <Fragment>
        <button
          type="button"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.name}`}
          aria-expanded={expanded}
          onClick={() => onToggle(folder.id)}
          className="flex h-7 w-5 shrink-0 items-center justify-center text-[#73798a] hover:text-white"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        {renaming ? (
          <form onSubmit={handleRename} className="flex min-w-0 flex-1 items-center gap-1">
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              aria-label={`Rename ${folder.name}`}
              className="min-w-0 flex-1 rounded-md border border-white/[0.1] bg-[#11141c] px-2 py-1.5 text-xs text-[#e8eaf0] outline-none focus:border-[#7763f6]/70"
            />
            <button
              type="submit"
              disabled={!renameValue.trim() || renameValue.trim() === folder.name}
              className="rounded px-2 py-1.5 text-xs text-[#c9c1ff] hover:bg-white/[0.06] disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              aria-label="Cancel rename"
              className="rounded px-2 py-1.5 text-xs text-[#9298a9] hover:bg-white/[0.06] hover:text-white"
            >
              ×
            </button>
          </form>
        ) : <button
          type="button"
          aria-label={folder.name}
          title={folder.name}
          aria-current={selected ? "page" : undefined}
          draggable={folder.id !== DEFAULT_FOLDER_ID}
          onDragStart={(event) => {
            if (folder.id === DEFAULT_FOLDER_ID) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.setData("text/plain", folder.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => {
            if (selected) onToggle(folder.id);
            else onSelectFolder(folder.id);
          }}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-2 text-left text-xs transition-colors ${
            selected ? "text-[#c9c1ff]" : "text-[#9298a9] hover:text-[#e8eaf0]"
          }`}
        >
          <span className="truncate">{folder.name}</span>
        </button>}
      </Fragment>
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-52 font-mono text-xs">
            {contextItems.map((item, index) => (
              <Fragment key={item.label}>
                {index > 0 && contextItems[index - 1].group !== item.group && <ContextMenuSeparator />}
                {item.label === "Move folder to..." ? (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>{item.icon}{item.label}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="font-mono text-xs">
                      <ContextMenuItem onClick={() => actions.onMoveFolder(folder.id, undefined)}>
                        <Folder /> Top level
                      </ContextMenuItem>
                      {allFolders
                        .filter((target) => target.id !== folder.id && !isFolderWithin(target.id, folder.id, allFolders))
                        .map((target) => (
                          <ContextMenuItem key={target.id} onClick={() => actions.onMoveFolder(folder.id, target.id)}>
                            <Folder />{target.name}
                          </ContextMenuItem>
                        ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ) : item.label === "Copy path" ? (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>{item.icon}{item.label}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="font-mono text-xs">
                      <ContextMenuItem onClick={() => actions.onCopyPath("folder", folder.id, false)}>
                        Relative path
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => actions.onCopyPath("folder", folder.id, true)}>
                        Full path
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ) : (
                  <ContextMenuItem
                    onClick={item.action}
                    className={item.danger ? "text-[#ff929b] focus:text-[#ff929b]" : ""}
                  >
                    {item.icon}{item.label}
                  </ContextMenuItem>
                )}
              </Fragment>
            ))}
            {/* Add "Show in system explorer" and "Open in default app" in the Electron integration. */}
          </ContextMenuContent>
          </ContextMenu>
          <IconPicker
            value={folder.icon}
            open={folderIconPickerOpen}
            onOpenChange={setFolderIconPickerOpen}
            onChange={(icon) => actions.onSetFolderIcon(folder.id, icon)}
            trigger={
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                className="absolute left-6 top-0 h-7 w-px opacity-0"
              />
            }
          />
          <Dialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
            <DialogContent className="font-mono">
              <DialogHeader>
                <DialogTitle>Delete {folder.name}?</DialogTitle>
                <DialogDescription>Notes will be moved to another folder or deleted if no destination exists.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteFolderOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => { onDelete(folder.id); setDeleteFolderOpen(false); }}>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      <div
        className={`folder-tree-children${expanded ? " is-expanded" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="folder-tree-inner space-y-0.5">
          {notes.map((note) => (
            <SidebarNoteItem
              key={note.id}
              note={note}
              folders={allFolders}
              selected={note.id === openNoteId}
              paddingLeft={(depth + 1) * 14 + 20}
              actions={actions}
            />
          ))}
          {childFolders.map((childFolder) => (
            <FolderItem
              key={childFolder.id}
              folder={childFolder}
              allFolders={allFolders}
              allNotes={allNotes}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              creatingFolder={creatingFolder}
              creatingUnderFolderId={creatingUnderFolderId}
              folderName={folderName}
              folderInputRef={folderInputRef}
              onOpenNote={onOpenNote}
              onSelectFolder={onSelectFolder}
              onToggle={onToggle}
              onCreateSubfolder={onCreateSubfolder}
              onCreateNote={onCreateNote}
              onFolderNameChange={onFolderNameChange}
              onCreateFolderSubmit={onCreateFolderSubmit}
              onCancelFolderCreation={onCancelFolderCreation}
              onRenameFolder={onRenameFolder}
              onDelete={onDelete}
              onReorder={onReorder}
              openNoteId={openNoteId}
              actions={actions}
            />
          ))}
          {creatingFolder && creatingUnderFolderId === folder.id && (
            <form
              onSubmit={onCreateFolderSubmit}
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}
            >
              <input
                ref={folderInputRef}
                value={folderName}
                onChange={(event) => onFolderNameChange(event.target.value)}
                placeholder="New subfolder"
                aria-label={`Subfolder name in ${folder.name}`}
                className="min-w-0 flex-1 rounded-md border border-white/[0.1] bg-[#11141c] px-2 py-2 text-xs text-[#e8eaf0] outline-none placeholder:text-[#616777] focus:border-[#7763f6]/70"
              />
              <button
                type="submit"
                disabled={!folderName.trim()}
                className="rounded-md bg-[#7763f6] px-2 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
              <button
                type="button"
                onClick={onCancelFolderCreation}
                aria-label="Cancel subfolder creation"
                className="rounded-md px-2 py-2 text-xs text-[#9298a9] hover:bg-white/[0.06] hover:text-white"
              >
                ×
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

type WorkspaceSection = "folders" | "calendar" | "collection";

function WorkspaceRail({
  activeSection,
  onSelectSection,
  onOpenSettings,
  folderPanelCollapsed,
  onToggleFolderPanel,
}: {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  onOpenSettings: () => void;
  folderPanelCollapsed: boolean;
  onToggleFolderPanel: () => void;
}) {
  const sections: {
    id: WorkspaceSection;
    label: string;
    icon: ReactNode;
  }[] = [
    {
      id: "folders",
      label: "Folders",
      icon: (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
          <path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h4l1.5 1.7h6.5A1.5 1.5 0 0 1 17.5 7v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "collection",
      label: "Collection",
      icon: (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
          <rect x="11" y="3" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
          <rect x="3" y="11" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
          <rect x="11" y="11" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-30 flex h-14 w-full shrink-0 flex-row items-center justify-between border-b border-white/[0.08] bg-[#090b10] px-3 py-2 md:h-screen md:w-16 md:flex-col md:justify-start md:border-b-0 md:border-r md:px-0 md:py-4"
    >
      <div className="flex flex-row items-center gap-2 md:w-full md:flex-col">
        <button
          type="button"
          aria-label={folderPanelCollapsed ? "Expand folder panel" : "Collapse folder panel"}
          aria-pressed={folderPanelCollapsed}
          title={`${folderPanelCollapsed ? "Expand" : "Collapse"} folder panel (Ctrl/Cmd+B)`}
          onClick={onToggleFolderPanel}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#858b9c] transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          {folderPanelCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
        <div className="flex flex-row items-center gap-2 md:w-full md:flex-col">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-label={section.label}
              aria-current={activeSection === section.id ? "page" : undefined}
              title={section.label}
              onClick={() => onSelectSection(section.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                activeSection === section.id
                  ? "bg-white/[0.08] text-[#c9c1ff]"
                  : "text-[#858b9c] hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {section.icon}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
        className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl text-[#858b9c] transition-colors hover:bg-white/[0.05] hover:text-white md:ml-0 md:mt-auto"
      >
        <SettingsIcon />
      </button>
    </nav>
  );
}

function FolderSidebar({
  folders,
  notes,
  selectedFolderId,
  openNoteId,
  visible,
  onSelectFolder,
  onOpenNote,
  onCreateFolder,
  onCreateNote,
  onOpenCommandPalette,
  actions,
  onRenameFolder,
  onDeleteFolder,
  onReorderFolders,
  sidebarWidth,
  onSidebarWidthChange,
}: {
  folders: NoteFolder[];
  notes: NotesBlock[];
  selectedFolderId: string | null;
  openNoteId: string | null;
  visible: boolean;
  onSelectFolder: (folderId: string) => void;
  onOpenNote: (noteId: string) => void;
  onCreateFolder: (name: string, parentId?: string) => Promise<boolean>;
  onCreateNote: (folderId: string) => void;
  onOpenCommandPalette: () => void;
  actions: SidebarItemActions;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
  onDeleteFolder: (folderId: string) => void;
  onReorderFolders: (draggedId: string, targetId: string) => void;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
}) {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingUnderFolderId, setCreatingUnderFolderId] = useState<string>();
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const folderInputRef = useRef<HTMLInputElement>(null);
  const expandedFolders = new Set(
    folders
      .filter((folder) => !collapsedFolders.has(folder.id))
      .map((folder) => folder.id),
  );

  useEffect(() => {
    if (creatingFolder) folderInputRef.current?.focus();
  }, [creatingFolder]);

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await onCreateFolder(folderName, creatingUnderFolderId);
    if (created) {
      setFolderName("");
      setCreatingFolder(false);
      setCreatingUnderFolderId(undefined);
    }
  }

  function startCreatingFolder(parentId?: string) {
    setCreatingUnderFolderId(parentId);
    setCreatingFolder(true);
    if (parentId) {
      setCollapsedFolders((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
  }

  function toggleFolder(folderId: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    function resize(moveEvent: PointerEvent) {
      const maximumWidth = Math.floor(window.innerWidth / 2);
      onSidebarWidthChange(
        Math.min(
          maximumWidth,
          Math.max(200, startWidth + moveEvent.clientX - startX),
        ),
      );
    }

    function stopResize() {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  return (
    <aside
      role="complementary"
      aria-label="Folders sidebar"
      style={{
        "--sidebar-width": `${Math.min(sidebarWidth, Math.floor(window.innerWidth / 2))}px`,
      } as CSSProperties}
      aria-hidden={!visible}
      className={`relative flex max-h-[45vh] w-full shrink-0 flex-col border-b border-white/[0.08] bg-[#0c0f15] px-4 py-5 transition-[width,padding,max-height,opacity,transform] duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:max-h-screen md:border-b-0 md:border-r ${
        !visible
          ? "workspace-sidebar-hidden pointer-events-none max-h-0 -translate-x-3 overflow-hidden opacity-0 px-0 py-0 md:max-h-screen md:w-0 md:min-w-0 md:translate-x-0 md:border-r-0 md:opacity-0"
          : "max-h-[45vh] translate-x-0 opacity-100 md:max-h-screen md:w-[var(--sidebar-width)] md:px-4 md:py-6"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-[#858b9c]">
          Folders
        </h2>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger render={<button
              type="button"
              aria-label="New note"
              onClick={() => onCreateNote(selectedFolderId ?? folders[0]?.id ?? "")}
              disabled={!selectedFolderId && folders.length === 0}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#9298a9] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            />}>
              <FilePlus2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>New note</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<button
              type="button"
              aria-label="New folder"
              onClick={() => {
                if (creatingFolder) {
                  setCreatingFolder(false);
                  setCreatingUnderFolderId(undefined);
                } else {
                  startCreatingFolder();
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#9298a9] transition-colors hover:bg-white/[0.06] hover:text-white"
            />}>
              <FolderPlus className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>New folder</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<button
              type="button"
              aria-label="Command palette"
              onClick={onOpenCommandPalette}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#9298a9] transition-colors hover:bg-white/[0.06] hover:text-white"
            />}>
              <CommandIcon className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Command palette (Ctrl/Cmd+K)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {creatingFolder && !creatingUnderFolderId && (
        <form onSubmit={handleCreateFolder} className="mb-3 flex gap-2">
          <input
            ref={folderInputRef}
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="Folder name"
            aria-label="Folder name"
            className="min-w-0 flex-1 rounded-md border border-white/[0.1] bg-[#11141c] px-2 py-2 text-xs text-[#e8eaf0] outline-none placeholder:text-[#616777] focus:border-[#7763f6]/70"
          />
          <button
            type="submit"
            disabled={!folderName.trim()}
            className="rounded-md bg-[#7763f6] px-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingFolder(false);
              setCreatingUnderFolderId(undefined);
              setFolderName("");
            }}
            aria-label="Cancel folder creation"
            className="rounded-md px-2 text-xs text-[#9298a9] hover:bg-white/[0.06] hover:text-white"
          >
            ×
          </button>
        </form>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5">
          {folders
            .filter((folder) => !folder.parentId)
            .map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                allFolders={folders}
                allNotes={notes}
                depth={0}
                selectedFolderId={selectedFolderId}
                expandedFolders={expandedFolders}
                creatingFolder={creatingFolder}
                creatingUnderFolderId={creatingUnderFolderId}
                folderName={folderName}
                folderInputRef={folderInputRef}
                onSelectFolder={onSelectFolder}
                onToggle={toggleFolder}
                onOpenNote={onOpenNote}
                onCreateSubfolder={startCreatingFolder}
                onCreateNote={onCreateNote}
                onFolderNameChange={setFolderName}
                onCreateFolderSubmit={handleCreateFolder}
                onCancelFolderCreation={() => {
                  setCreatingFolder(false);
                  setCreatingUnderFolderId(undefined);
                  setFolderName("");
                }}
                onRenameFolder={onRenameFolder}
                onDelete={onDeleteFolder}
                onReorder={onReorderFolders}
                openNoteId={openNoteId}
                actions={actions}
              />
            ))}
        </div>
      </ScrollArea>
      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        title="Drag to resize sidebar"
        onPointerDown={startSidebarResize}
        className="absolute right-0 top-0 z-20 hidden h-full w-1 cursor-col-resize touch-none transition-colors hover:bg-[#7763f6]/70 md:block"
      />
    </aside>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path
        d="M8.2 2.8h3.6l.45 1.8c.42.16.81.38 1.17.66l1.78-.5 1.8 3.12-1.33 1.3c.06.45.06.9 0 1.34l1.33 1.31-1.8 3.12-1.78-.5c-.36.27-.75.5-1.17.65l-.45 1.81H8.2l-.45-1.81a5.8 5.8 0 0 1-1.17-.65l-1.78.5L3 11.83l1.33-1.31a5 5 0 0 1 0-1.34L3 7.88l1.8-3.12 1.78.5c.36-.28.75-.5 1.17-.66l.45-1.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="10" cy="9.85" r="2.25" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

type SettingsCategory = "General" | "Text editor" | "Appearance" | "About";
type ThemePreference = "system" | "light" | "dark";
type UserPreferences = {
  theme: ThemePreference;
  editorFontSize: number;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  editorFontSize: 15,
};
const PREFERENCES_STORAGE_KEY = "focusboard-preferences";

function isUserPreferences(value: unknown): value is UserPreferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Partial<UserPreferences>;
  return (
    (preferences.theme === "system" ||
      preferences.theme === "light" ||
      preferences.theme === "dark") &&
    typeof preferences.editorFontSize === "number" &&
    Number.isFinite(preferences.editorFontSize) &&
    preferences.editorFontSize >= 12 &&
    preferences.editorFontSize <= 24
  );
}

function SettingsOverlay({
  preferences,
  onPreferencesChange,
  onClose,
  vaultPath,
}: {
  preferences: UserPreferences;
  onPreferencesChange: (preferences: UserPreferences) => void;
  onClose: () => void;
  vaultPath?: string;
}) {
  const [category, setCategory] = useState<SettingsCategory>("General");
  const [nextVaultPath, setNextVaultPath] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState("");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const categories: SettingsCategory[] = ["General", "Text editor", "Appearance", "About"];

  async function chooseNewVault() {
    try {
      const selected = await window.ElixirDesktop?.chooseVaultFolder();
      if (selected) {
        setNextVaultPath(selected.path);
        setVaultError(selected.warning
          ? "This is a system folder or drive root. Choose a regular folder for safer storage."
          : "");
      }
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openVaultInExplorer() {
    try {
      await window.ElixirDesktop?.getVaultPath("open");
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
    }
  }

  async function changeVault(move: boolean) {
    if (!nextVaultPath) return;
    setVaultBusy(true);
    setVaultError("");
    try {
      await switchVault(nextVaultPath, move);
      window.location.reload();
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : String(error));
      setVaultBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#090b10]/90 p-3 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="mx-auto flex min-h-[min(44rem,calc(100vh-1.5rem))] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#11141c] shadow-2xl sm:min-h-[min(42rem,calc(100vh-4rem))] sm:flex-row"
      >
        <nav
          aria-label="Settings categories"
          className="shrink-0 border-b border-white/[0.08] p-4 sm:w-56 sm:border-b-0 sm:border-r sm:p-5"
        >
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 id="settings-title" className="text-sm font-medium text-[#f0efff]">
              Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-[#9298a9] hover:bg-white/[0.06] hover:text-white sm:hidden"
            >
              ×
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto sm:flex-col">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                aria-current={category === item ? "page" : undefined}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  category === item
                    ? "bg-[#7763f6]/15 text-[#c9c1ff]"
                    : "text-[#9298a9] hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="mb-8 hidden items-center justify-between sm:flex">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.15em] text-[#8f83e9]">
                Preferences
              </p>
              <h1 className="text-xl font-medium text-[#f0efff]">{category}</h1>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-[#9298a9] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              ×
            </button>
          </header>

          <div className="sm:hidden">
            <h1 className="mb-6 text-lg font-medium text-[#f0efff]">{category}</h1>
          </div>

          {category === "General" && (
            <div className="max-w-2xl space-y-4">
              {vaultPath && (
                <div className="rounded-xl border border-white/[0.08] bg-[#0c0f15] p-5">
                  <h3 className="text-sm font-medium text-[#e8eaf0]">Vault location</h3>
                  <p className="mt-2 break-all text-xs leading-6 text-[#858b9c]" data-text-selectable>{vaultPath}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openVaultInExplorer()}
                    >
                      Open in file explorer
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void chooseNewVault()}>
                      Change vault location
                    </Button>
                  </div>
                  {nextVaultPath && (
                    <div className="mt-5 rounded-lg border border-white/[0.08] bg-[#11141c] p-4">
                      <p className="break-all text-xs text-[#d4d7e0]" data-text-selectable>{nextVaultPath}</p>
                      <p className="mt-3 text-xs leading-5 text-[#858b9c]">
                        Changing folders does not move existing notes automatically. Choose whether to switch folders or copy your notes first. The old files will never be deleted automatically.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={vaultBusy} onClick={() => void changeVault(false)}>
                          Switch to another folder
                        </Button>
                        <Button size="sm" disabled={vaultBusy} onClick={() => void changeVault(true)}>
                          Move my notes to the new folder
                        </Button>
                        <Button size="sm" variant="ghost" disabled={vaultBusy} onClick={() => setNextVaultPath("")}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {vaultError && <p role="alert" className="mt-3 text-xs text-[#ff929b]">{vaultError}</p>}
                </div>
              )}
              <div className="rounded-xl border border-white/[0.08] bg-[#0c0f15] p-5">
                <h3 className="text-sm font-medium text-[#e8eaf0]">Your preferences</h3>
                <p className="mt-2 text-xs leading-6 text-[#858b9c]">
                  {vaultPath
                    ? "Display and editor settings apply to your Elixir workspace on this device."
                    : "Settings are saved in this browser and apply to your Elixir workspace."}
                </p>
              </div>
              {window.ElixirDesktop && (
                <div className="rounded-xl border border-white/[0.08] bg-[#0c0f15] p-5">
                  <h3 className="text-sm font-medium text-[#e8eaf0]">Keyboard shortcuts</h3>
                  <dl className="mt-3 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[#858b9c]">Toggle full screen</dt>
                      <dd className="text-[#d4d7e0]">F11 <span className="text-[#73798a]">(Ctrl+⌘+F on Mac)</span></dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[#858b9c]">Exit full screen</dt>
                      <dd className="text-[#d4d7e0]">Esc</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          )}

          {category === "Text editor" && (
            <div className="max-w-2xl rounded-xl border border-white/[0.08] bg-[#0c0f15] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-[#e8eaf0]">Font size</h3>
                  <p className="mt-1 text-xs text-[#858b9c]">
                    Adjust the text size in your notes.
                  </p>
                </div>
                <output
                  htmlFor="editor-font-size"
                  className="rounded-md border border-white/[0.1] px-2 py-1 text-xs text-[#c5c9d4]"
                >
                  {preferences.editorFontSize}px
                </output>
              </div>
              <input
                id="editor-font-size"
                type="range"
                min="12"
                max="24"
                step="1"
                value={preferences.editorFontSize}
                onChange={(event) =>
                  onPreferencesChange({
                    ...preferences,
                    editorFontSize: Number(event.target.value),
                  })
                }
                aria-label="Notes editor font size"
                className="mt-5 w-full accent-[#7763f6]"
              />
              <div
                aria-live="polite"
                className="mt-5 rounded-lg border border-white/[0.07] bg-[#11141c] p-4 text-[#d4d7e0]"
                style={{ fontSize: `${preferences.editorFontSize}px` }}
              >
                A little preview of your note text.
              </div>
            </div>
          )}

          {category === "Appearance" && (
            <div className="max-w-2xl rounded-xl border border-white/[0.08] bg-[#0c0f15] p-5">
              <h3 className="text-sm font-medium text-[#e8eaf0]">Theme</h3>
              <p className="mt-1 text-xs text-[#858b9c]">
                Choose how Elixir looks on this device.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {(["system", "light", "dark"] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    aria-pressed={preferences.theme === theme}
                    onClick={() => onPreferencesChange({ ...preferences, theme })}
                    className={`rounded-lg border px-3 py-3 text-left text-xs capitalize transition-colors ${
                      preferences.theme === theme
                        ? "border-[#9a87ff]/60 bg-[#7763f6]/15 text-[#c9c1ff]"
                        : "border-white/[0.08] text-[#aeb3c1] hover:bg-white/[0.05]"
                    }`}
                  >
                    {theme}
                    <span className="mt-1 block text-[10px] text-[#858b9c]">
                      {theme === "system"
                        ? "Match device"
                        : theme === "light"
                          ? "Bright background"
                          : "Dark background"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {category === "About" && (
            <div className="max-w-2xl rounded-xl border border-white/[0.08] bg-[#0c0f15] p-5">
              <h3 className="text-sm font-medium text-[#e8eaf0]">Elixir</h3>
              <p className="mt-2 text-xs leading-6 text-[#858b9c]">
                A quiet place for ideas, plans, and everything you want to remember.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function BlockOptions({
  blockId,
  title,
  position,
  blockCount,
  onDelete,
  onMove,
  onSplit,
}: {
  blockId: string;
  title: string;
  position: number;
  blockCount: number;
  onDelete: (blockId: string) => void;
  onMove: (blockId: string, direction: "up" | "down") => void;
  onSplit?: (blockId: string, direction: "right" | "down") => void;
}) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const menuItems: {
    label: string;
    icon: ReactNode;
    action: () => void;
    group: number;
    danger?: boolean;
    disabled?: boolean;
  }[] = [
    { label: "Move up", icon: <ChevronDown className="rotate-180" />, action: () => onMove(blockId, "up"), group: 1, disabled: position === 0 },
    { label: "Move down", icon: <ChevronDown />, action: () => onMove(blockId, "down"), group: 1, disabled: position === blockCount - 1 },
    // Electron follow-up: add "Open in new window" alongside these split actions.
    ...(onSplit ? [
      { label: "Split right", icon: <Split />, action: () => onSplit(blockId, "right"), group: 2 },
      { label: "Split down", icon: <AlignHorizontalDistributeCenter className="rotate-90" />, action: () => onSplit(blockId, "down"), group: 2 },
    ] : []),
    { label: "Delete", icon: <X />, action: () => setConfirmDeleteOpen(true), group: 3, danger: true },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button
          type="button"
          aria-label={`Options for ${title}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[#9298a9] transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9a87ff]"
        />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44 font-mono text-xs">
          {menuItems.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 && menuItems[index - 1].group !== item.group && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={item.disabled}
                onClick={item.action}
                className={item.danger ? "text-[#ff929b] focus:text-[#ff929b]" : ""}
              >
                {item.icon}{item.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="font-mono">
          <DialogHeader>
            <DialogTitle>Delete {title}?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(blockId);
                setConfirmDeleteOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Checklist({
  block,
  position,
  blockCount,
  onDelete,
  onMove,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}: {
  block: ChecklistBlock;
  position: number;
  blockCount: number;
  onDelete: (blockId: string) => void;
  onMove: (blockId: string, direction: "up" | "down") => void;
  onAddTask: (blockId: string, title: string) => void;
  onToggleTask: (blockId: string, taskId: string) => void;
  onDeleteTask: (blockId: string, taskId: string) => void;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const completedCount = block.tasks.filter((task) => task.completed).length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddTask(block.id, taskTitle);
    setTaskTitle("");
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#11141c] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#858b9c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9a87ff]" />
            Checklist
          </div>
          <h2 className="text-base font-medium text-[#f0efff]">{block.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-[#9298a9]">
            {completedCount}/{block.tasks.length}
          </span>
          <BlockOptions
            blockId={block.id}
            title={block.title}
            position={position}
            blockCount={blockCount}
            onDelete={onDelete}
            onMove={onMove}
          />
        </div>
      </div>

      {block.tasks.length > 0 ? (
        <ul className="mb-5 space-y-1">
          {block.tasks.map((task) => (
            <li
              key={task.id}
              className="group flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-white/[0.03]"
            >
              <button
                type="button"
                aria-label={
                  task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`
                }
                aria-pressed={task.completed}
                onClick={() => onToggleTask(block.id, task.id)}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                  task.completed
                    ? "border-[#9a87ff] bg-[#9a87ff] text-[#11111a]"
                    : "border-[#4b5060] bg-transparent hover:border-[#9a87ff]"
                }`}
              >
                {task.completed && <span className="text-xs font-bold">✓</span>}
              </button>
              <span
                className={`min-w-0 flex-1 break-words text-sm ${
                  task.completed ? "text-[#73798a] line-through" : "text-[#d4d7e0]"
                }`}
              >
                {task.title}
              </span>
              <button
                type="button"
                aria-label={`Delete ${task.title}`}
                onClick={() => onDeleteTask(block.id, task.id)}
                className="rounded p-1 text-lg leading-none text-[#676d7c] opacity-100 transition-colors hover:text-[#ff818c] sm:opacity-0 sm:group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-5 rounded-lg border border-dashed border-white/[0.09] px-4 py-6 text-center text-xs text-[#73798a]">
          Nothing on your list yet. Add a task to get started.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Add a task..."
          aria-label="New task"
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#0c0f15] px-3 py-2.5 text-sm text-[#e8eaf0] outline-none placeholder:text-[#616777] focus:border-[#7763f6]/70"
        />
        <button
          type="submit"
          disabled={!taskTitle.trim()}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-[#b8bdca] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add task
        </button>
      </form>
    </section>
  );
}

function Notes({
  block,
  onOpen,
}: {
  block: NotesBlock;
  onOpen: () => void;
}) {
  const preview = block.preview;

  return (
    <section className="group/note relative rounded-xl border border-white/[0.08] bg-[#11141c] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] transition-colors hover:border-white/[0.14] sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 text-left"
          aria-label={`Open ${block.title}`}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#858b9c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9a87ff]" />
            Note page
          </div>
          <h2 className="truncate text-base font-medium text-[#f0efff]">
            <span className="inline-flex items-center gap-2">
              <NoteIcon value={block.icon} className="h-4 w-4 shrink-0" />
              {block.title || "Untitled"}
            </span>
          </h2>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[#9298a9] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Open page ↗
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${block.title} page to edit`}
        className="block min-h-28 w-full overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0f15] p-4 text-left transition-colors hover:border-white/[0.12]"
      >
        <p className="line-clamp-5 whitespace-pre-wrap text-xs leading-6 text-[#aeb3c1]">
          {preview || <span className="text-muted-foreground/60">Empty note</span>}
        </p>
      </button>
    </section>
  );
}

function NotesPage({
  block,
  notes,
  linkedNoteOptions,
  folderName,
  position,
  blockCount,
  onClose,
  onDelete,
  onMove,
  onUpdateTitle,
  onUpdateIcon,
  onUpdateContent,
  onUpdateProperties,
  storage,
  onStorageError,
  storageError,
  existingNotes,
  onSelectNote,
  onOpenLinkedNote,
  onAddSelectionAsNote,
  onSplit,
  isSplit,
  onFilterProperty,
  onOpenRelatedNote,
  onConvertLegacy,
}: {
  block: NotesBlock;
  notes: NotesBlock[];
  linkedNoteOptions: LinkedNoteOption[];
  folderName: string;
  position: number;
  blockCount: number;
  onClose: () => void;
  onDelete: (blockId: string) => void;
  onMove: (blockId: string, direction: "up" | "down") => void;
  onUpdateTitle: (blockId: string, title: string) => void;
  onUpdateIcon: (blockId: string, icon?: string) => void;
  onUpdateContent: (blockId: string, markdown: string) => void;
  onUpdateProperties: (
    blockId: string,
    update: PropertyStateUpdate,
  ) => void;
  storage: NoteStorage;
  onStorageError: (message: string) => void;
  storageError: string | null;
  existingNotes: { id: string; title: string; properties: Record<string, unknown> }[];
  onSelectNote: (noteId: string) => void;
  onOpenLinkedNote: (noteId: string) => void;
  onAddSelectionAsNote: (selection: string) => void;
  onSplit: (blockId: string, direction: "right" | "down") => void;
  isSplit: boolean;
  onFilterProperty: (key: string, value: string) => void;
  onOpenRelatedNote: (noteId: string) => void;
  onConvertLegacy: (noteId: string) => void;
}) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    function togglePreview(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setPreviewMode((current) => !current);
      }
    }

    document.addEventListener("keydown", togglePreview);
    return () => document.removeEventListener("keydown", togglePreview);
  }, []);

  return (
    <div
      aria-label={`${block.title || "Untitled"} note editor`}
      className="note-scroll-area h-full overflow-y-auto bg-[#090b10]"
    >
      <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#090b10]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to folder"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-lg text-[#aeb3c1] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              ←
            </button>
            <span className="hidden text-xs text-[#6d7382] sm:inline">
              {folderName} /
            </span>
            <NoteIcon value={block.icon} className="h-4 w-4 shrink-0" />
            {previewMode ? (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#e8eaf0]">
                {block.title || "Untitled"}
              </span>
            ) : (
              <input
                value={block.title}
                onChange={(event) => onUpdateTitle(block.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    editorContainerRef.current
                      ?.querySelector<HTMLElement>('[contenteditable="true"]')
                      ?.focus();
                  }
                }}
                aria-label="Page title"
                placeholder="Untitled"
                className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium text-[#e8eaf0] outline-none placeholder:text-[#616777] focus:text-white"
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Edit note"
              aria-pressed={!previewMode}
              title="Edit note"
              onClick={() => setPreviewMode(false)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                !previewMode
                  ? "bg-white/[0.08] text-[#c9c1ff]"
                  : "text-[#858b9c] hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Preview note"
              aria-pressed={previewMode}
              title="Preview note (Ctrl/Cmd+Shift+P)"
              onClick={() => setPreviewMode(true)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                previewMode
                  ? "bg-white/[0.08] text-[#c9c1ff]"
                  : "text-[#858b9c] hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <BookOpen className="h-4 w-4" />
            </button>
            {!previewMode && (
              <BlockOptions
                blockId={block.id}
                title={block.title || "Untitled"}
                position={position}
                blockCount={blockCount}
                onDelete={onDelete}
                onMove={onMove}
                onSplit={onSplit}
              />
            )}
          </div>
        </div>
        <nav
          aria-label="Notes in this folder"
          className="mx-auto mt-2 flex max-w-5xl gap-1 overflow-x-auto px-5 sm:px-8"
        >
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              aria-current={note.id === block.id ? "page" : undefined}
              title={note.title || "Untitled"}
              onClick={() => onSelectNote(note.id)}
              className={`w-52 max-w-52 shrink-0 overflow-hidden border-b-2 px-3 py-2 text-xs transition-colors ${
                note.id === block.id
                  ? "border-[#9a87ff] text-[#f0efff]"
                  : "border-transparent text-[#777d8d] hover:text-[#d4d7e0]"
              }`}
            >
              <span className="inline-flex w-full min-w-0 items-center gap-1.5 overflow-hidden">
                <NoteIcon value={note.icon} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{note.title || "Untitled"}</span>
              </span>
            </button>
          ))}
        </nav>
      </header>
      <main
        className={`mx-auto ${isSplit ? "min-h-0" : "min-h-[calc(100vh-4rem)]"} max-w-5xl px-6 pb-40 pt-10 sm:px-10 sm:pt-12`}
        onDoubleClick={() => {
          if (previewMode) setPreviewMode(false);
        }}
      >
        <div className="mb-4">
          <div className="group/title relative mx-auto max-w-3xl">
            {!previewMode && (
              <IconPicker
                value={block.icon}
                onChange={(icon) => onUpdateIcon(block.id, icon)}
                triggerLabel={block.icon ? "Change note icon" : "Add icon"}
                iconClassName="h-16 w-16 text-5xl"
                triggerClassName={`note-icon-trigger rounded-xl text-muted-foreground ${
                  block.icon
                    ? "mb-2 p-0 text-foreground"
                    : "note-icon-add absolute -top-9 left-0 px-2 py-1 text-xs opacity-0 group-hover/title:opacity-100"
                }`}
              />
            )}
            {previewMode && block.icon && (
              <NoteIcon value={block.icon} className="mb-2 h-16 w-16 text-5xl" />
            )}
            {previewMode ? (
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[#f0efff] sm:text-4xl">
                {block.title || "Untitled"}
              </h1>
            ) : (
              <AutoResizeTextarea
                value={block.title}
                onChange={(title) => onUpdateTitle(block.id, title)}
                label="Edit page title"
                placeholder="Untitled"
                onEnter={() =>
                  editorContainerRef.current
                    ?.querySelector<HTMLElement>('[contenteditable="true"]')
                    ?.focus()
                }
                className="w-full bg-transparent text-3xl font-semibold leading-tight tracking-tight text-[#f0efff] outline-none placeholder:text-[#616777] sm:text-4xl"
              />
            )}
            {!previewMode ? (
              <NoteProperties
                noteId={block.id}
                properties={block.properties}
                propertyOrder={block.propertyOrder}
                storage={storage}
                existingNotes={existingNotes}
                onChange={(update) => onUpdateProperties(block.id, update)}
                onFilter={onFilterProperty}
                onOpenRelatedNote={onOpenRelatedNote}
                onStorageError={onStorageError}
                legacyProperties={block.legacyProperties}
                onConvertLegacy={() => onConvertLegacy(block.id)}
              />
            ) : (
              Object.entries(block.properties).length > 0 && (
                <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {Object.entries(block.properties).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="text-[#73798a]">{key}</dt>
                      <dd className="text-[#aeb3c1]">
                        {Array.isArray(value)
                          ? value.join(", ")
                          : typeof value === "object" && value !== null
                            ? JSON.stringify(value)
                            : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )
            )}
          {storageError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              Could not save your changes: {storageError}
            </p>
          )}
          </div>
        </div>
        <div ref={editorContainerRef} className="mx-auto max-w-3xl">
          <NotesEditor
            content={block.content}
            onChange={(markdown) => onUpdateContent(block.id, markdown)}
            notes={linkedNoteOptions.filter((note) => note.id !== block.id)}
            onOpenLinkedNote={onOpenLinkedNote}
            onAddSelectionAsNote={onAddSelectionAsNote}
            storage={storage}
            onStorageError={onStorageError}
            previewMode={previewMode}
            onRequestEdit={() => setPreviewMode(false)}
          />
          {!previewMode && (
            <p className="mt-8 text-[11px] text-[#656b7a]">
              Type / to insert a block
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function noteToBlock(note: NoteDocument, preview = ""): DashboardBlock {
  if (note.kind === "notes") {
    return {
      id: note.id,
      type: "notes",
      title: note.title,
      icon: note.icon,
      folderId: note.folderId,
      content: note.markdown,
      preview,
      properties: note.properties ?? {},
      propertyOrder: note.propertyOrder ?? [],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      legacyProperties: note.legacyProperties,
      bannerImage: note.bannerImage,
      bannerWidth: note.bannerWidth,
      bannerPosition: note.bannerPosition,
    };
  }

  const tasks = note.markdown
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
      return match
        ? [{
            id: `${note.id}-task-${index}`,
            title: match[2],
            completed: match[1].toLowerCase() === "x",
          }]
        : [];
    });

  return {
    id: note.id,
    type: "checklist",
    title: note.title,
    icon: note.icon,
    tasks,
    category: typeof note.properties?.category === "string"
      ? note.properties.category
      : undefined,
    tags: Array.isArray(note.properties?.tags)
      ? note.properties.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

function blockToNote(block: DashboardBlock, position: number): NoteDocument {
  const markdown =
    block.type === "checklist"
      ? block.tasks
          .map(
            (task) =>
              `- [${task.completed ? "x" : " "}] ${task.title.replace(/\r?\n/g, " ")}`,
          )
          .join("\n")
      : block.content;

  return {
    id: block.id,
    title: block.title,
    kind: block.type,
    folderId: block.type === "notes" ? block.folderId : DEFAULT_FOLDER_ID,
    position,
    markdown,
    ...(block.type === "notes"
      ? {
          ...(block.icon ? { icon: block.icon } : {}),
          properties: block.properties,
          propertyOrder: block.propertyOrder,
          ...(block.createdAt ? { createdAt: block.createdAt } : {}),
          ...(block.updatedAt ? { updatedAt: block.updatedAt } : {}),
        }
      : {
          ...(block.icon ? { icon: block.icon } : {}),
          properties: {
            ...(block.category ? { category: block.category } : {}),
            ...(block.tags.length > 0 ? { tags: block.tags } : {}),
          },
        }),
    ...(block.type === "notes" && block.bannerImage
      ? { bannerImage: block.bannerImage }
      : {}),
    ...(block.type === "notes" && block.bannerWidth
      ? { bannerWidth: block.bannerWidth }
      : {}),
    ...(block.type === "notes" && block.bannerPosition
      ? { bannerPosition: block.bannerPosition }
      : {}),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected storage error occurred.";
}

function parseFolderIcons(contents: string | null): Record<string, string> {
  if (!contents) return {};
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored folder icons are not a valid JSON object.");
  }
  const icons: Record<string, string> = {};
  for (const [id, icon] of Object.entries(parsed)) {
    if (typeof icon !== "string") {
      throw new Error(`Stored icon for folder "${id}" is invalid.`);
    }
    icons[id] = icon;
  }
  return icons;
}

export default function DashboardPage({
  storage,
  vaultPath,
}: {
  storage: NoteStorage;
  vaultPath?: string;
}) {
  const [blocks, setBlocks] = useState<DashboardBlock[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [sidebarWidthLoaded, setSidebarWidthLoaded] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createFolderParentId, setCreateFolderParentId] = useState<string | undefined>();
  const [searchFolderId, setSearchFolderId] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<{ key: string; value: string } | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [splitNoteId, setSplitNoteId] = useState<string | null>(null);
  const [splitDirection, setSplitDirection] = useState<"right" | "down">("right");
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("folders");
  const [openNotesId, setOpenNotesId] = useState<string | null>(() =>
    window.localStorage.getItem("Elixir-last-note"),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFullScreenBar, setShowFullScreenBar] = useState(false);
  const fullScreenRef = useRef(false);
  const fullScreenBarTimer = useRef<number | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<DashboardBlock[]>([]);
  const folderIconsRef = useRef<Record<string, string>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const restoredLastNote = useRef(false);
  const openNotes = blocks.find(
    (block): block is NotesBlock =>
      block.type === "notes" && block.id === openNotesId,
  );
  const splitNote = blocks.find(
    (block): block is NotesBlock =>
      block.type === "notes" && block.id === splitNoteId,
  );
  const visibleBlocks = blocks.filter(
    (block) =>
      (block.type === "checklist" && selectedFolderId === DEFAULT_FOLDER_ID) ||
      (block.type === "notes" && block.folderId === selectedFolderId),
  );
  const selectedFolder = folders.find(
    (folder) => folder.id === selectedFolderId,
  );
  const selectedFolderNotes = blocks.filter(
    (block): block is NotesBlock =>
      block.type === "notes" && block.folderId === selectedFolderId,
  );
  const selectedFolderSubfolders = folders.filter(
    (folder) => folder.parentId === selectedFolderId,
  );

  useEffect(() => {
    const desktop = window.ElixirDesktop;
    if (!desktop) return;
    let active = true;

    function showExitHint() {
      setShowFullScreenBar(true);
      if (fullScreenBarTimer.current !== null) {
        window.clearTimeout(fullScreenBarTimer.current);
      }
      fullScreenBarTimer.current = window.setTimeout(() => {
        setShowFullScreenBar(false);
        fullScreenBarTimer.current = null;
      }, 2000);
    }

    function updateFullScreen(fullScreen: boolean) {
      if (!active) return;
      setIsFullScreen(fullScreen);
      if (fullScreen && !fullScreenRef.current) {
        const key = "Elixir-fullscreen-hint-count";
        const count = Number(window.localStorage.getItem(key) ?? 0);
        if (count < 3) {
          window.localStorage.setItem(key, String(count + 1));
          showExitHint();
        }
      } else if (!fullScreen) {
        setShowFullScreenBar(false);
        if (fullScreenBarTimer.current !== null) {
          window.clearTimeout(fullScreenBarTimer.current);
          fullScreenBarTimer.current = null;
        }
      }
      fullScreenRef.current = fullScreen;
    }

    const unsubscribe = desktop.onFullScreenChange(updateFullScreen);
    void desktop.isFullScreen().then(updateFullScreen).catch((error: unknown) => {
      console.error("Could not read full-screen state:", error);
    });

    return () => {
      active = false;
      unsubscribe();
      if (fullScreenBarTimer.current !== null) {
        window.clearTimeout(fullScreenBarTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const desktop = window.ElixirDesktop;
    if (!desktop) return;

    function exitFullScreenOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !fullScreenRef.current) return;
      const blockingUi = Array.from(document.querySelectorAll(
        '[role="dialog"], [role="menu"], [data-slot="dialog-content"], [data-slot$="-menu-content"], [data-slot="popover-content"], [data-slot="command-input"], input[type="search"], input[aria-label*="Search" i]',
      )).some((element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden",
      );
      if (blockingUi) return;
      event.preventDefault();
      void window.ElixirDesktop?.exitFullScreen().catch((error: unknown) => {
        console.error("Could not exit full screen:", error);
      });
    }

    document.addEventListener("keydown", exitFullScreenOnEscape);
    return () => document.removeEventListener("keydown", exitFullScreenOnEscape);
  }, []);
  const hasAnyNotes = blocks.some((block) => block.type === "notes");
  const noteSearch = useMemo(
    () =>
      new MiniSearch<{
        id: string;
        title: string;
        folder: string;
        properties: string;
      }>({
      fields: ["title", "folder", "properties"],
      storeFields: ["id"],
    }),
    [],
  );
  const indexedNotes = useRef(new Map<string, {
    id: string;
    title: string;
    folder: string;
    properties: string;
  }>());

  useEffect(() => {
    const nextNotes = new Map(
      blocks
        .filter((block): block is NotesBlock => block.type === "notes")
        .map((note) => [
          note.id,
          {
          id: note.id,
          title: note.title,
          folder: folders.find((folder) => folder.id === note.folderId)?.name ?? "",
          properties: JSON.stringify(note.properties),
          },
        ]),
    );
    for (const [id, previous] of indexedNotes.current) {
      const next = nextNotes.get(id);
      if (!next || JSON.stringify(previous) !== JSON.stringify(next)) {
        noteSearch.remove(previous);
      }
    }
    for (const [id, next] of nextNotes) {
      const previous = indexedNotes.current.get(id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) {
        noteSearch.add(next);
      }
    }
    indexedNotes.current = nextNotes;
  }, [blocks, folders]);
  const propertySearchTerms = [...commandQuery.matchAll(/([a-z][a-z0-9_-]*):(\S+)/gi)]
    .map((match) => ({
      key: match[1].toLowerCase() === "tag" ? "tags" : match[1].toLowerCase(),
      value: match[2].toLowerCase(),
    }));
  const plainSearchQuery = commandQuery.replace(/([a-z][a-z0-9_-]*):(\S+)/gi, " ").trim();
  const textMatchIds = plainSearchQuery
    ? new Set(noteSearch.search(plainSearchQuery).map((result) => String(result.id)))
    : null;
  const matchingNoteIds =
    commandQuery.trim() || propertyFilter
      ? new Set(
          blocks
            .filter((block): block is NotesBlock => block.type === "notes")
            .filter((note) => {
              const matchesText =
                textMatchIds === null || textMatchIds.has(note.id);
              const matchesSearchProperties = propertySearchTerms.every(({ key, value }) => {
                const noteValue = note.properties[key];
                const values = Array.isArray(noteValue) ? noteValue : [noteValue];
                return values.some(
                  (entry) =>
                    entry !== null &&
                    entry !== undefined &&
                    String(entry).toLowerCase().includes(value),
                );
              });
              const activeValue = propertyFilter
                ? note.properties[propertyFilter.key]
                : undefined;
              const activeValues = Array.isArray(activeValue) ? activeValue : [activeValue];
              const matchesActiveFilter =
                !propertyFilter ||
                activeValues.some(
                  (entry) =>
                    entry !== null &&
                    entry !== undefined &&
                    String(entry).replace(/^\[\[|\]\]$/g, "").toLowerCase() ===
                      propertyFilter.value.toLowerCase(),
                );
              return matchesText && matchesSearchProperties && matchesActiveFilter;
            })
            .map((note) => note.id),
        )
      : null;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("Elixir-sidebar");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "collapsed" in parsed &&
          typeof parsed.collapsed === "boolean" &&
          "width" in parsed &&
          typeof parsed.width === "number" &&
          Number.isFinite(parsed.width)
        ) {
          setSidebarCollapsed(parsed.collapsed);
          setSidebarWidth(parsed.width);
        }
      }
    } catch (error) {
      setSettingsError(`Could not load sidebar preferences: ${describeError(error)}`);
    } finally {
      setSidebarWidthLoaded(true);
    }
  }, []);

  useEffect(() => {
    const constrainWidth = () =>
      setSidebarWidth((width) =>
        Math.min(Math.floor(window.innerWidth / 2), Math.max(200, width)),
      );
    constrainWidth();
    window.addEventListener("resize", constrainWidth);
    return () => window.removeEventListener("resize", constrainWidth);
  }, []);

  useEffect(() => {
    if (!sidebarWidthLoaded) return;
    try {
      window.localStorage.setItem(
        "Elixir-sidebar",
        JSON.stringify({ collapsed: sidebarCollapsed, width: sidebarWidth }),
      );
    } catch (error) {
      setSettingsError(`Could not save sidebar preferences: ${describeError(error)}`);
    }
  }, [sidebarCollapsed, sidebarWidth, sidebarWidthLoaded]);

  useEffect(() => {
    try {
      const savedPreferences = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (savedPreferences !== null) {
        const parsedPreferences: unknown = JSON.parse(savedPreferences);
        if (isUserPreferences(parsedPreferences)) {
          setPreferences(parsedPreferences);
        } else {
          setSettingsError("Saved settings are invalid. Default settings were loaded.");
        }
      }
      setPreferencesLoaded(true);
    } catch (error) {
      setSettingsError(`Could not load settings: ${describeError(error)}`);
      setPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(preferences),
      );
      setSettingsError((currentError) =>
        currentError?.startsWith("Could not save settings:") ? null : currentError,
      );
    } catch (error) {
      setSettingsError(`Could not save settings: ${describeError(error)}`);
    }
  }, [preferences, preferencesLoaded]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${preferences.editorFontSize}px`,
    );

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = () => {
      const theme = preferences.theme === "system"
        ? mediaQuery.matches
          ? "light"
          : "dark"
        : preferences.theme;
      document.documentElement.dataset.theme = theme;
      void window.ElixirDesktop?.setTheme(theme).catch((error: unknown) => {
        console.error("Could not update the native title bar theme:", error);
      });
    };

    applyTheme();
    if (preferences.theme === "system") {
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [preferences.editorFontSize, preferences.theme]);

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      try {
        const [foldersFromStorage, folderIconContents] = await Promise.all([
          storage.listFolders(),
          storage.readVaultFile(".Elixir/folders.json"),
        ]);
        const folderIcons = parseFolderIcons(folderIconContents);
        const loadedFolders = foldersFromStorage.map((folder) => ({
          ...folder,
          ...(folderIcons[folder.id] ? { icon: folderIcons[folder.id] } : {}),
        }));
        const loadedBookmarks = await storage.listBookmarks();
        const summaries = await storage.listNotes();
        const storedNotes = await Promise.all(
          summaries.map(({ id }) => storage.readNote(id)),
        );
        const defaultWelcomeNoteIds = new Set(
          storedNotes.flatMap((note) =>
            note?.kind === "notes" &&
            note.title === WELCOME_NOTE_TITLE &&
            note.markdown === WELCOME_NOTE_MARKDOWN
              ? [note.id]
              : [],
          ),
        );
        await Promise.all(
          Array.from(defaultWelcomeNoteIds, (id) => storage.deleteNote(id)),
        );
        const loadedBlocksWithPreviews = await Promise.all(
          storedNotes.map(async (note) =>
            note
              && !defaultWelcomeNoteIds.has(note.id)
              ? noteToBlock(
                  note,
                  note.kind === "notes"
                    ? await storage.getNotePreview(note.id)
                    : "",
                )
              : null,
          ),
        );
        let loadedBlocks = loadedBlocksWithPreviews.filter(
          (block): block is DashboardBlock => block !== null,
        );
        const emptyStarterChecklist = loadedBlocks.find(
          (block) =>
            block.type === "checklist" &&
            block.id === "starter-checklist" &&
            block.title === "Task checklist" &&
            block.tasks.length === 0,
        );
        if (emptyStarterChecklist) {
          await storage.deleteNote(emptyStarterChecklist.id);
          loadedBlocks = loadedBlocks.filter(
            (block) => block.id !== emptyStarterChecklist.id,
          );
        }

        if (active) {
          blocksRef.current = loadedBlocks;
          setBlocks(loadedBlocks);
          setFolders(loadedFolders);
          folderIconsRef.current = folderIcons;
          setBookmarks(new Set(loadedBookmarks));
          setSelectedFolderId(loadedFolders[0]?.id ?? null);
          setIsLoaded(true);
        }
      } catch (error) {
        if (active) {
          setStorageError(describeError(error));
          setIsLoaded(true);
        }
      }
    }

    void loadNotes();
    return () => {
      active = false;
    };
  }, [storage]);

  useEffect(() => {
    if (!isLoaded || restoredLastNote.current) return;
    restoredLastNote.current = true;
    const savedNote = blocks.find(
      (block): block is NotesBlock =>
        block.type === "notes" && block.id === openNotesId,
    );
    setOpenNotesId(
      savedNote?.id ??
        blocks.find((block): block is NotesBlock => block.type === "notes")?.id ??
        null,
    );
  }, [blocks, isLoaded, openNotesId]);

  useEffect(() => {
    if (openNotesId) window.localStorage.setItem("Elixir-last-note", openNotesId);
  }, [openNotesId]);

  useEffect(() => {
    const preventDefaultContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventDropNavigation = (event: globalThis.DragEvent) => event.preventDefault();
    const preventImageAndLinkDragging = (event: globalThis.DragEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("img, a") &&
        !target.closest("[data-native-drag], .sticker, [data-sticker]")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("contextmenu", preventDefaultContextMenu);
    window.addEventListener("dragover", preventDropNavigation);
    window.addEventListener("drop", preventDropNavigation);
    window.addEventListener("dragstart", preventImageAndLinkDragging);
    return () => {
      window.removeEventListener("contextmenu", preventDefaultContextMenu);
      window.removeEventListener("dragover", preventDropNavigation);
      window.removeEventListener("drop", preventDropNavigation);
      window.removeEventListener("dragstart", preventImageAndLinkDragging);
    };
  }, []);

  function commitBlocks(
    nextBlocks: DashboardBlock[],
    deletedId?: string,
    changedId?: string,
    deletedFolderId?: string,
    deletedNoteIds: string[] = [],
  ) {
    blocksRef.current = nextBlocks;
    setBlocks(nextBlocks);
    setStorageError(null);
    saveQueue.current = saveQueue.current
      .then(async () => {
        const savedIds: string[] = [];
        const savedPreviews = new Map<string, string>();
        const savedTimestamps = new Map<string, { createdAt?: string; updatedAt?: string }>();
        async function writeBlock(block: DashboardBlock, index: number) {
          await storage.writeNote(blockToNote(block, index));
          savedIds.push(block.id);
          if (block.type === "notes") {
            const [preview, savedNote] = await Promise.all([
              storage.getNotePreview(block.id),
              storage.readNote(block.id),
            ]);
            savedPreviews.set(block.id, preview);
            savedTimestamps.set(block.id, {
              createdAt: savedNote?.createdAt,
              updatedAt: savedNote?.updatedAt,
            });
          }
        }
        if (changedId) {
          const index = nextBlocks.findIndex((block) => block.id === changedId);
          const block = nextBlocks[index];
          if (block) await writeBlock(block, index);
        } else {
          await Promise.all(
            nextBlocks.map(writeBlock),
          );
        }
        if (deletedId) await storage.deleteNote(deletedId);
        await Promise.all(deletedNoteIds.map((id) => storage.deleteNote(id)));
        if (deletedFolderId) await storage.deleteFolder(deletedFolderId);
        if (savedIds.length > 0) {
          setBlocks((current) => {
            const next = current.map((block) =>
              savedIds.includes(block.id) && block.type === "notes"
                ? {
                    ...block,
                  preview: savedPreviews.get(block.id) ?? block.preview,
                  ...savedTimestamps.get(block.id),
                  }
                : block,
            );
            blocksRef.current = next;
            return next;
          });
        }
      })
      .catch((error: unknown) => setStorageError(describeError(error)));
  }

  function addChecklist() {
    const block: ChecklistBlock = {
      id: crypto.randomUUID(),
      type: "checklist",
      title: "Task checklist",
      tasks: [],
      tags: [],
    };
    commitBlocks([...blocksRef.current, block]);
  }

  function createNote(folderId: string) {
    const block: NotesBlock = {
      id: crypto.randomUUID(),
      type: "notes",
      title: "",
      folderId,
      content: "",
      preview: "",
      properties: {},
      propertyOrder: [],
    };
    commitBlocks([...blocksRef.current, block]);
    setOpenNotesId(block.id);
  }

  function addSelectionToNewNote(sourceNoteId: string, selection: string) {
    const source = blocksRef.current.find(
      (item): item is NotesBlock => item.type === "notes" && item.id === sourceNoteId,
    );
    const selectedText = selection.trim();
    if (!source || !selectedText) return;
    const title = selectedText.split(/\r?\n/, 1)[0].slice(0, 60) || "Extracted note";
    const extracted: NotesBlock = {
      id: crypto.randomUUID(),
      type: "notes",
      title,
      folderId: source.folderId,
      content: `# ${title}\n\n${selectedText}\n\n[[${source.title || "Untitled"}]]`,
      preview: "",
      properties: {},
      propertyOrder: [],
    };
    commitBlocks([...blocksRef.current, extracted]);
    setSelectedFolderId(source.folderId);
    setOpenNotesId(extracted.id);
  }

  async function toggleBookmark(key: string) {
    const bookmarked = !bookmarks.has(key);
    try {
      await storage.setBookmark(key, bookmarked);
      setBookmarks((current) => {
        const next = new Set(current);
        if (bookmarked) next.add(key);
        else next.delete(key);
        return next;
      });
    } catch (error) {
      setStorageError(describeError(error));
    }
  }

  async function copyStoredPath(kind: "note" | "folder", id: string, absolute: boolean) {
    try {
      const path = kind === "note"
        ? await storage.getNotePath(id, absolute)
        : await storage.getFolderPath(id, absolute);
      if (!path) {
        setSettingsError("A full filesystem path is not available for notes in IndexedDB storage.");
        return;
      }
      await navigator.clipboard.writeText(path);
      setSettingsError(null);
    } catch (error) {
      setSettingsError(`Could not copy path: ${describeError(error)}`);
    }
  }

  function duplicateNote(noteId: string) {
    const source = blocksRef.current.find(
      (item): item is NotesBlock => item.type === "notes" && item.id === noteId,
    );
    if (!source) return;
    const duplicate = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title || "Untitled"} copy`,
    };
    commitBlocks([...blocksRef.current, duplicate]);
  }

  function moveNoteToFolder(noteId: string, folderId: string) {
    if (!folders.some((folder) => folder.id === folderId)) return;
    commitBlocks(
      blocksRef.current.map((item) =>
        item.type === "notes" && item.id === noteId
          ? { ...item, folderId }
          : item,
      ),
      undefined,
      noteId,
    );
  }

  function moveFolderTo(folderId: string, parentId?: string) {
    const source = folders.find((folder) => folder.id === folderId);
    if (!source || parentId === folderId || (parentId && isFolderWithin(parentId, folderId, folders))) {
      setStorageError("That folder cannot be moved into itself or one of its descendants.");
      return;
    }
    const siblings = folders.filter((folder) => folder.parentId === parentId);
    const moved = {
      id: source.id,
      name: source.name,
      position: siblings.length,
      ...(parentId ? { parentId } : {}),
    };
    setFolders((current) =>
      current.map((folder) => (folder.id === folderId ? moved : folder)),
    );
    saveQueue.current = saveQueue.current
      .then(() => storage.createFolder(moved))
      .catch((error: unknown) => setStorageError(describeError(error)));
  }

  async function duplicateFolder(folderId: string) {
    const source = folders.find((folder) => folder.id === folderId);
    if (!source) return;
    const subtree = folders.filter(
      (folder) => folder.id === folderId || isFolderWithin(folder.id, folderId, folders),
    );
    const idMap = new Map(subtree.map((folder) => [folder.id, crypto.randomUUID()]));
    const copies = subtree.map((folder, index) => ({
      ...folder,
      id: idMap.get(folder.id)!,
      name: folder.id === folderId ? `${folder.name} copy` : folder.name,
      position: index,
      ...(folder.parentId && idMap.has(folder.parentId)
        ? { parentId: idMap.get(folder.parentId)! }
        : folder.id === folderId
          ? (folder.parentId ? { parentId: folder.parentId } : { parentId: undefined })
          : {}),
    }));
    try {
      await Promise.all(copies.map((folder) => storage.createFolder(folder)));
      setFolders((current) => [...current, ...copies]);
      const duplicatedNotes = blocksRef.current
        .filter((block): block is NotesBlock => block.type === "notes" && idMap.has(block.folderId))
        .map((note) => ({
          ...note,
          id: crypto.randomUUID(),
          title: `${note.title || "Untitled"} copy`,
          folderId: idMap.get(note.folderId)!,
        }));
      commitBlocks([...blocksRef.current, ...duplicatedNotes]);
    } catch (error) {
      setStorageError(describeError(error));
    }
  }

  function addNotes() {
    if (selectedFolderId === null) return;
    createNote(selectedFolderId);
  }

  useEffect(() => {
    function handleCreateNoteShortcut(event: KeyboardEvent) {
      if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "n" &&
        selectedFolderId !== null &&
        !settingsOpen
      ) {
        event.preventDefault();
        addNotes();
      }
    }

    document.addEventListener("keydown", handleCreateNoteShortcut);
    return () =>
      document.removeEventListener("keydown", handleCreateNoteShortcut);
  }, [selectedFolderId, settingsOpen]);

  useEffect(() => {
    function handleWorkspaceShortcuts(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((collapsed) => !collapsed);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    }

    document.addEventListener("keydown", handleWorkspaceShortcuts);
    return () => document.removeEventListener("keydown", handleWorkspaceShortcuts);
  }, []);

  async function createFolder(
    name: string,
    parentId?: string,
  ): Promise<boolean> {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    if (parentId && !folders.some((folder) => folder.id === parentId)) {
      setStorageError("Could not create subfolder because its parent no longer exists.");
      return false;
    }
    const folder: NoteFolder = {
      id: crypto.randomUUID(),
      name: trimmedName,
      position: folders.filter((item) => item.parentId === parentId).length,
      ...(parentId ? { parentId } : {}),
    };

    try {
      await storage.createFolder(folder);
      setFolders((currentFolders) => [...currentFolders, folder]);
      setSelectedFolderId(folder.id);
      setStorageError(null);
      return true;
    } catch (error) {
      setStorageError(describeError(error));
      return false;
    }
  }

  async function renameFolder(folderId: string, name: string): Promise<boolean> {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) {
      setStorageError("Could not rename folder because it no longer exists.");
      return false;
    }

    const renamedFolder = { ...folder, name: trimmedName };
    setFolders((currentFolders) =>
      currentFolders.map((item) =>
        item.id === folderId ? renamedFolder : item,
      ),
    );
    setStorageError(null);
    let saved = true;
    saveQueue.current = saveQueue.current
      .then(() => storage.createFolder(renamedFolder))
      .catch((error: unknown) => {
        saved = false;
        setFolders((currentFolders) =>
          currentFolders.map((item) => (item.id === folderId ? folder : item)),
        );
        setStorageError(describeError(error));
      });

    await saveQueue.current;
    return saved;
  }

  function deleteFolder(folderId: string) {
    const folderToDelete = folders.find((folder) => folder.id === folderId);
    if (!folderToDelete) return;

    const remainingFolders = folders.filter((folder) => folder.id !== folderId);
    const siblingFallback = remainingFolders.find(
      (folder) => folder.parentId === folderToDelete.parentId,
    );
    const fallbackFolder =
      folderToDelete.parentId
        ? folders.find((folder) => folder.id === folderToDelete.parentId)
        : siblingFallback ??
          remainingFolders.find((folder) => folder.parentId === folderId);
    const promotedFolders = remainingFolders.map((folder) =>
      folder.parentId === folderId
        ? {
            ...folder,
            ...(folderToDelete.parentId
              ? { parentId: folderToDelete.parentId }
              : { parentId: undefined }),
          }
        : folder,
    );
    const notesInFolder = blocksRef.current.filter(
      (block): block is NotesBlock =>
        block.type === "notes" && block.folderId === folderId,
    );
    const deletedNoteIds = fallbackFolder
      ? []
      : notesInFolder.map((note) => note.id);
    const nextBlocks = blocksRef.current
      .filter(
        (block) =>
          fallbackFolder ||
          block.type !== "notes" ||
          block.folderId !== folderId,
      )
      .map((block) =>
        block.type === "notes" && block.folderId === folderId && fallbackFolder
          ? { ...block, folderId: fallbackFolder.id }
          : block,
      );
    const orderedFolders = promotedFolders.map((folder, position) => ({
      ...folder,
      position,
    }));
    commitBlocks(
      nextBlocks,
      undefined,
      undefined,
      folderId,
      deletedNoteIds,
    );
    saveQueue.current = saveQueue.current
      .then(() =>
        Promise.all(
          orderedFolders.map((folder) => storage.createFolder(folder)),
        ).then(() => undefined),
      )
      .catch((error: unknown) => setStorageError(describeError(error)));
    if (selectedFolderId === folderId) {
      setSelectedFolderId(fallbackFolder?.id ?? null);
      setOpenNotesId(null);
    }
    setFolders(orderedFolders);
  }

  function reorderFolders(draggedId: string, targetId: string) {
    if (draggedId === DEFAULT_FOLDER_ID || draggedId === targetId) return;
    const draggedFolderItem = folders.find((folder) => folder.id === draggedId);
    const targetFolder = folders.find((folder) => folder.id === targetId);
    if (!draggedFolderItem || draggedFolderItem.parentId !== targetFolder?.parentId) return;

    const nextFolders = [...folders];
    const draggedIndex = nextFolders.findIndex(
      (folder) => folder.id === draggedId,
    );
    if (draggedIndex < 0) return;

    nextFolders.splice(draggedIndex, 1);
    const targetIndex = nextFolders.findIndex(
      (folder) => folder.id === targetId,
    );
    if (targetIndex < 0) return;

    nextFolders.splice(
      targetId === DEFAULT_FOLDER_ID ? targetIndex + 1 : targetIndex,
      0,
      draggedFolderItem,
    );
    const orderedFolders = nextFolders.map((folder, position) => ({
      ...folder,
      position,
    }));
    setFolders(orderedFolders);
    saveQueue.current = saveQueue.current
      .then(() =>
        Promise.all(
          orderedFolders.map((folder) => storage.createFolder(folder)),
        ).then(() => undefined),
      )
      .catch((error: unknown) => setStorageError(describeError(error)));
  }

  async function updateFolderIcon(folderId: string, icon?: string) {
    const nextIcons = { ...folderIconsRef.current };
    if (icon) nextIcons[folderId] = icon;
    else delete nextIcons[folderId];
    try {
      await storage.writeVaultFile(
        ".Elixir/folders.json",
        JSON.stringify(nextIcons, null, 2),
      );
      folderIconsRef.current = nextIcons;
      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderId
            ? { ...folder, ...(icon ? { icon } : { icon: undefined }) }
            : folder,
        ),
      );
      setStorageError(null);
    } catch (error) {
      setStorageError(`Could not save folder icon: ${describeError(error)}`);
    }
  }

  function deleteBlock(blockId: string) {
    commitBlocks(
      blocksRef.current.filter((block) => block.id !== blockId),
      blockId,
    );
  }

  function moveBlock(blockId: string, direction: "up" | "down") {
    const currentBlocks = blocksRef.current;
    const currentIndex = currentBlocks.findIndex((block) => block.id === blockId);
    const nextIndex = currentIndex + (direction === "up" ? -1 : 1);
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentBlocks.length) {
      return;
    }

    const nextBlocks = [...currentBlocks];
    [nextBlocks[currentIndex], nextBlocks[nextIndex]] = [
      nextBlocks[nextIndex],
      nextBlocks[currentIndex],
    ];
    commitBlocks(nextBlocks);
  }

  function updateNotesTitle(blockId: string, title: string) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId ? { ...block, title } : block,
      ),
      undefined,
      blockId,
    );
  }

  function updateNotesIcon(blockId: string, icon?: string) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId ? { ...block, icon } : block,
      ),
      undefined,
      blockId,
    );
  }

  function updateNotesContent(blockId: string, content: string) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId && block.type === "notes"
          ? { ...block, content }
          : block,
      ),
      undefined,
      blockId,
    );
  }

  function updateNotesProperties(
    blockId: string,
    update: PropertyStateUpdate,
  ) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId && block.type === "notes"
          ? { ...block, ...update(block.properties, block.propertyOrder) }
          : block,
      ),
      undefined,
      blockId,
    );
  }

  async function convertLegacyProperties(blockId: string) {
    try {
      await saveQueue.current;
      const migrated = await storage.migrateLegacyProperties(blockId);
      const preview = await storage.getNotePreview(blockId);
      const replacement = noteToBlock(migrated, preview);
      const next = blocksRef.current.map((block) =>
        block.id === blockId ? replacement : block,
      );
      blocksRef.current = next;
      setBlocks(next);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Could not convert legacy properties: ${describeError(error)}`);
    }
  }

  function addTask(blockId: string, title: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId && block.type === "checklist"
          ? {
              ...block,
              tasks: [
                ...block.tasks,
                { id: crypto.randomUUID(), title: trimmedTitle, completed: false },
              ],
            }
          : block,
      ),
      undefined,
      blockId,
    );
  }

  function toggleTask(blockId: string, taskId: string) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId && block.type === "checklist"
          ? {
              ...block,
              tasks: block.tasks.map((task) =>
                task.id === taskId ? { ...task, completed: !task.completed } : task,
              ),
            }
          : block,
      ),
      undefined,
      blockId,
    );
  }

  function deleteTask(blockId: string, taskId: string) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === blockId && block.type === "checklist"
          ? {
              ...block,
              tasks: block.tasks.filter((task) => task.id !== taskId),
            }
          : block,
      ),
      undefined,
      blockId,
    );
  }

  useEffect(() => {
    if (!addMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAddMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMenuOpen]);

  function renderNotePane(note: NotesBlock, pane: "primary" | "split") {
    const paneNotes = blocks.filter(
      (item): item is NotesBlock =>
        item.type === "notes" && item.folderId === note.folderId,
    );
    return (
      <NotesPage
        key={`${pane}-${note.id}`}
        block={note}
        notes={paneNotes}
        linkedNoteOptions={blocks
          .filter((item): item is NotesBlock => item.type === "notes")
          .map((item) => ({
            id: item.id,
            title: item.title,
            folderName: folders.find((folder) => folder.id === item.folderId)?.name ?? "Notes",
          }))}
        folderName={folders.find((folder) => folder.id === note.folderId)?.name ?? "Notes"}
        position={blocks.findIndex((item) => item.id === note.id)}
        blockCount={blocks.length}
        onClose={() => {
          if (pane === "primary") {
            setOpenNotesId(null);
            setSplitNoteId(null);
          } else {
            setSplitNoteId(null);
          }
        }}
        onDelete={deleteBlock}
        onMove={moveBlock}
        onUpdateTitle={updateNotesTitle}
        onUpdateIcon={updateNotesIcon}
        onUpdateContent={updateNotesContent}
        onUpdateProperties={updateNotesProperties}
        storage={storage}
        onStorageError={setStorageError}
        storageError={storageError}
        existingNotes={blocks
          .filter((item): item is NotesBlock => item.type === "notes")
          .map((item) => ({
            id: item.id,
            title: item.title,
            properties: item.properties,
          }))}
        onSelectNote={pane === "primary" ? setOpenNotesId : setSplitNoteId}
        onOpenLinkedNote={(noteId) => {
          const target = blocks.find(
            (item): item is NotesBlock => item.type === "notes" && item.id === noteId,
          );
          if (!target) return;
          if (pane === "primary") {
            setSelectedFolderId(target.folderId);
            setOpenNotesId(target.id);
          } else {
            setSplitNoteId(target.id);
          }
        }}
        onAddSelectionAsNote={(selection) =>
          addSelectionToNewNote(note.id, selection)
        }
        onFilterProperty={(key, value) => {
          setPropertyFilter({ key, value: value.replace(/^\[\[|\]\]$/g, "") });
          setSearchFolderId(null);
          setCommandQuery("");
          setCommandPaletteOpen(true);
        }}
        onOpenRelatedNote={(noteId) => {
          const target = blocks.find(
            (item): item is NotesBlock => item.type === "notes" && item.id === noteId,
          );
          if (!target) return;
          if (pane === "primary") {
            setSelectedFolderId(target.folderId);
            setOpenNotesId(target.id);
          } else {
            setSplitNoteId(target.id);
          }
        }}
        onConvertLegacy={convertLegacyProperties}
        onSplit={(noteId, direction) => {
          setOpenNotesId(noteId);
          setSplitNoteId(noteId);
          setSplitDirection(direction);
        }}
        isSplit={splitNote !== null}
      />
    );
  }

  function startSplitResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const bounds = container.getBoundingClientRect();

    function resize(moveEvent: PointerEvent) {
      const position = splitDirection === "right"
        ? (moveEvent.clientX - bounds.left) / bounds.width
        : (moveEvent.clientY - bounds.top) / bounds.height;
      setSplitRatio(Math.max(0.25, Math.min(0.75, position)));
    }

    function stopResize() {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  if (!isLoaded) return <main className="min-h-screen" />;

  return (
    <div className={`flex min-h-screen flex-col md:flex-row${isFullScreen ? " is-fullscreen" : ""}${window.ElixirDesktop ? ` native-titlebar-${window.ElixirDesktop.platform}` : ""}`}>
      {window.ElixirDesktop && !isFullScreen && (
        <div
          className="native-window-drag-region"
          aria-hidden="true"
          onDoubleClick={() => window.ElixirDesktop?.toggleWindowMaximize()}
        />
      )}
      {isFullScreen && window.ElixirDesktop && (
        <>
          <div
            className="fullscreen-top-drag-area"
            aria-hidden="true"
            onMouseEnter={() => {
              setShowFullScreenBar(true);
              if (fullScreenBarTimer.current !== null) {
                window.clearTimeout(fullScreenBarTimer.current);
              }
              fullScreenBarTimer.current = window.setTimeout(() => {
                setShowFullScreenBar(false);
                fullScreenBarTimer.current = null;
              }, 1500);
            }}
            onDoubleClick={() => window.ElixirDesktop?.toggleWindowMaximize()}
          />
          <div
            className={`fullscreen-exit-bar${showFullScreenBar ? " is-visible" : ""}`}
            onMouseEnter={() => {
              if (fullScreenBarTimer.current !== null) {
                window.clearTimeout(fullScreenBarTimer.current);
                fullScreenBarTimer.current = null;
              }
            }}
            onMouseLeave={() => {
              fullScreenBarTimer.current = window.setTimeout(() => {
                setShowFullScreenBar(false);
                fullScreenBarTimer.current = null;
              }, 1500);
            }}
          >
            <button
              type="button"
              aria-label="Exit full screen (F11)"
              title="Exit full screen (F11)"
              onClick={() => {
                void window.ElixirDesktop?.exitFullScreen().catch((error: unknown) => {
                  console.error("Could not exit full screen:", error);
                });
              }}
            >
              <X className="h-4 w-4" />
            </button>
            <span>Press F11 or Esc</span>
          </div>
        </>
      )}
      <WorkspaceRail
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onOpenSettings={() => setSettingsOpen(true)}
        folderPanelCollapsed={sidebarCollapsed}
        onToggleFolderPanel={() =>
          setSidebarCollapsed((collapsed) => !collapsed)
        }
      />
      <FolderSidebar
        folders={folders}
        notes={blocks.filter(
          (block): block is NotesBlock => block.type === "notes",
        )}
        selectedFolderId={selectedFolderId}
        openNoteId={openNotesId}
        visible={activeSection === "folders" && !sidebarCollapsed}
        onSelectFolder={(folderId) => {
          setSelectedFolderId(folderId);
          setOpenNotesId(null);
        }}
        onOpenNote={(noteId) => {
          const note = blocks.find(
            (block): block is NotesBlock =>
              block.type === "notes" && block.id === noteId,
          );
          if (note) setSelectedFolderId(note.folderId);
          setOpenNotesId(noteId);
        }}
        onCreateFolder={createFolder}
        onCreateNote={(folderId) => {
          if (!folderId) return;
          setSelectedFolderId(folderId);
          createNote(folderId);
        }}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        actions={{
          bookmarks,
          onDuplicateFolder: (folderId) => void duplicateFolder(folderId),
          onMoveFolder: moveFolderTo,
          onSearchFolder: (folderId) => {
            setSearchFolderId(folderId);
            setCommandPaletteOpen(true);
          },
          onToggleBookmark: (key) => void toggleBookmark(key),
          onCopyPath: (kind, id, absolute) => void copyStoredPath(kind, id, absolute),
          onCopyNote: duplicateNote,
          onMoveNote: moveNoteToFolder,
          onRenameNote: updateNotesTitle,
          onDeleteNote: deleteBlock,
          onOpenSplitNote: (noteId) => {
            setOpenNotesId((current) => current ?? noteId);
            setSplitNoteId(noteId);
            setSplitDirection("right");
          },
          onSetFolderIcon: (folderId, icon) => void updateFolderIcon(folderId, icon),
          onOpenNote: (noteId) => {
            const note = blocksRef.current.find(
              (item): item is NotesBlock => item.type === "notes" && item.id === noteId,
            );
            if (note) setSelectedFolderId(note.folderId);
            setOpenNotesId(noteId);
          },
        }}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onReorderFolders={reorderFolders}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
      />
      <main className="workspace-main-view min-w-0 flex-1">
      {activeSection === "calendar" ? (
        <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 text-[#8f83e9]">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-medium text-[#f0efff]">Calendar</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#858b9c]">
            Your calendar space is ready. Calendar features will be available here.
          </p>
        </section>
      ) : activeSection === "collection" ? (
        <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 text-[#8f83e9]">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" aria-hidden="true">
              <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <h1 className="text-xl font-medium text-[#f0efff]">Collection</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#858b9c]">
            Your collection space is ready. Collection features will be available here.
          </p>
        </section>
      ) : (
      <>
      {openNotes ? (
        splitNote ? (
          <div
            className={`note-split-workspace${splitDirection === "down" ? " is-vertical" : ""}`}
            style={
              splitDirection === "right"
                ? {
                    gridTemplateColumns: `minmax(0, ${splitRatio}fr) 6px minmax(0, ${1 - splitRatio}fr)`,
                  }
                : {
                    gridTemplateRows: `minmax(0, ${splitRatio}fr) 6px minmax(0, ${1 - splitRatio}fr)`,
                  }
            }
          >
            <section className="split-note-pane">
              <header className="split-pane-header">
                <span className="inline-flex items-center gap-1.5">
                  <NoteIcon value={openNotes.icon} className="h-4 w-4 shrink-0" />
                  {openNotes.title || "Untitled"}
                </span>
                <button type="button" aria-label="Close first pane" onClick={() => setOpenNotesId(null)}>
                  <X />
                </button>
              </header>
              {renderNotePane(openNotes, "primary")}
            </section>
            <div
              role="separator"
              aria-label="Resize split panes"
              aria-orientation={splitDirection === "right" ? "vertical" : "horizontal"}
              aria-valuenow={Math.round(splitRatio * 100)}
              tabIndex={0}
              onPointerDown={startSplitResize}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setSplitRatio((ratio) => Math.max(0.25, ratio - 0.02));
                }
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  setSplitRatio((ratio) => Math.min(0.75, ratio + 0.02));
                }
              }}
              className="split-pane-divider"
            />
            <section className="split-note-pane">
              <header className="split-pane-header">
                <span className="inline-flex items-center gap-1.5">
                  <NoteIcon value={splitNote.icon} className="h-4 w-4 shrink-0" />
                  {splitNote.title || "Untitled"}
                </span>
                <button type="button" aria-label="Close second pane" onClick={() => setSplitNoteId(null)}>
                  <X />
                </button>
              </header>
              {renderNotePane(splitNote, "split")}
            </section>
          </div>
        ) : (
          <div className="single-note-workspace h-screen">
            {renderNotePane(openNotes, "primary")}
          </div>
        )
      ) : selectedFolderId !== null &&
        selectedFolderId !== DEFAULT_FOLDER_ID ? (
        <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-16 pt-12 sm:px-10 sm:pt-16">
          {storageError && (
            <p role="alert" className="mb-5 text-xs text-[#ff929b]">
              Could not save your changes: {storageError}
            </p>
          )}
          <header className="mb-8 flex items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.17em] text-[#8f83e9]">
                Folder
              </p>
              <h1 className="text-2xl font-medium tracking-tight text-[#f0efff]">
                {selectedFolder?.name}
              </h1>
            </div>
            <button
              type="button"
              onClick={addNotes}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7763f6] px-4 text-xs font-medium text-white transition-colors hover:bg-[#8876ff]"
            >
              <span className="text-base leading-none">+</span>
              New note
            </button>
          </header>
          {selectedFolderNotes.length === 0 && selectedFolderSubfolders.length === 0 ? (
            <div className="m-auto max-w-xl py-16 text-center">
              <Folder className="mx-auto mb-5 h-10 w-10 text-muted-foreground/60" />
              <h2 className="text-xl font-medium text-foreground">This folder is empty</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add a note or create a subfolder to get started.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={addNotes}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7763f6] px-4 text-xs font-medium text-white transition-colors hover:bg-[#8876ff]"
                >
                  <FilePlus2 className="h-4 w-4" />
                  New note
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateFolderParentId(selectedFolderId);
                    setNewFolderName("");
                    setCreateFolderDialogOpen(true);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-muted px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <FolderPlus className="h-4 w-4" />
                  New folder
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedFolderSubfolders.map((folder) => {
                const noteCount = blocks.filter(
                  (block) =>
                    block.type === "notes" &&
                    (block.folderId === folder.id ||
                      isFolderWithin(block.folderId, folder.id, folders)),
                ).length;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setOpenNotesId(null);
                    }}
                    className="flex min-h-28 items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent"
                  >
                    <Folder className="mt-1 h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-card-foreground">
                        {folder.name}
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {noteCount} {noteCount === 1 ? "note" : "notes"}
                      </span>
                    </span>
                  </button>
                );
              })}
              {selectedFolderNotes.map((block) => (
                <Notes
                  key={block.id}
                  block={block}
                  onOpen={() => setOpenNotesId(block.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : selectedFolderId === null ||
        (!hasAnyNotes &&
          selectedFolderId === DEFAULT_FOLDER_ID &&
          selectedFolderSubfolders.length === 0) ? (
        <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 pb-16 text-center sm:px-10">
          {storageError && (
            <p role="alert" className="mb-5 text-xs text-[#ff929b]">
              Could not load your workspace: {storageError}
            </p>
          )}
          <div className="max-w-xl">
            <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#9a87ff]/20 bg-[#9a87ff]/[0.08] text-[#a99cff]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none">
                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11l2 2h5.5A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 12h8M8 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[#8f83e9]">
              Your workspace
            </p>
            <h1 className="text-2xl font-medium tracking-tight text-[#f0efff] sm:text-3xl">
              Your second brain starts here.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#858b9c]">
              Create a folder to start organizing your ideas, plans, and notes.
            </p>
          </div>
        </section>
      ) : (
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-14 flex items-center justify-between border-b border-white/[0.07] pb-5">
          <a href="/" className="flex items-center gap-3" aria-label="Elixir home">
            <ElixirMark className="h-8 w-8 text-[#7763f6]" />
            <span className="text-sm font-medium tracking-tight text-[#e8eaf0]">
              Elixir<span className="text-[#8f83e9]">.</span>
            </span>
          </a>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#6d7382]">
            Your workspace
          </span>
        </header>

        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.17em] text-[#8f83e9]">
              Dashboard / Today
            </p>
            <h1 className="text-2xl font-medium tracking-tight text-[#f0efff] sm:text-3xl">
              A little more focus.
            </h1>
            <p className="mt-2 text-sm text-[#7e8494]">
              Keep your next steps in one place.
            </p>
          </div>
          <div ref={addMenuRef} className="relative self-start sm:self-auto">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              onClick={() => setAddMenuOpen((open) => !open)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#7763f6] px-4 text-xs font-medium text-white transition-colors hover:bg-[#8876ff]"
            >
              <span className="text-base leading-none">+</span>
              Add block
            </button>
            {addMenuOpen && (
              <div
                role="menu"
                aria-label="Add a block"
                className="absolute right-0 top-full z-20 mt-2 w-44 rounded-lg border border-white/[0.1] bg-[#191c26] p-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    addChecklist();
                    setAddMenuOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-[#c5c9d4] hover:bg-white/[0.06]"
                >
                  Task checklist
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    addNotes();
                    setAddMenuOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-[#c5c9d4] hover:bg-white/[0.06]"
                >
                  Notes
                </button>
              </div>
            )}
          </div>
        </div>

        {storageError && (
          <p role="alert" className="mb-5 text-xs text-[#ff929b]">
            Could not save your changes: {storageError}
          </p>
        )}

        {selectedFolderSubfolders.length > 0 && (
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            {selectedFolderSubfolders.map((folder) => {
              const noteCount = blocks.filter(
                (block) =>
                  block.type === "notes" &&
                  (block.folderId === folder.id ||
                    isFolderWithin(block.folderId, folder.id, folders)),
              ).length;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setOpenNotesId(null);
                  }}
                  className="flex min-h-28 items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent"
                >
                  <Folder className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-card-foreground">
                      {folder.name}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {noteCount} {noteCount === 1 ? "note" : "notes"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {visibleBlocks.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleBlocks.map((block) => {
              const index = blocks.indexOf(block);
              return block.type === "checklist" ? (
                <Checklist
                  key={block.id}
                  block={block}
                  position={index}
                  blockCount={blocks.length}
                  onDelete={deleteBlock}
                  onMove={moveBlock}
                  onAddTask={addTask}
                  onToggleTask={toggleTask}
                  onDeleteTask={deleteTask}
                />
              ) : (
                <Notes
                  key={block.id}
                  block={block}
                  onOpen={() => setOpenNotesId(block.id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.1] py-16 text-center">
            <p className="text-sm text-[#b4b8c5]">Your dashboard is empty.</p>
            <p className="mt-2 text-xs text-[#73798a]">
              Add a block to start organizing your day.
            </p>
          </div>
        )}
      </div>
      )}
      </>
      )}
      </main>
      <CommandDialog
        open={commandPaletteOpen}
        onOpenChange={(open) => {
          setCommandPaletteOpen(open);
          if (!open) {
            setSearchFolderId(null);
            setCommandQuery("");
          }
        }}
        title="Command palette"
        description="Search notes and run workspace actions"
        className="font-mono"
      >
        {propertyFilter && (
          <div className="flex items-center gap-2 border-b border-border bg-popover px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Filtered by {propertyFilter.key}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground">
              {propertyFilter.value}
              <button
                type="button"
                aria-label={`Remove ${propertyFilter.key} filter`}
                onClick={() => setPropertyFilter(null)}
                className="rounded-full px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ×
              </button>
            </span>
          </div>
        )}
        <Command className="font-mono">
          <CommandInput
            placeholder="Search notes or actions..."
            value={commandQuery}
            onValueChange={setCommandQuery}
          />
          <CommandList>
            <CommandEmpty>No notes or commands found.</CommandEmpty>
            <CommandGroup heading="Actions">
              {window.ElixirDesktop && (
                <CommandItem
                  value="toggle full screen fullscreen f11"
                  onSelect={() => {
                    void window.ElixirDesktop?.toggleFullScreen().catch((error: unknown) => {
                      console.error("Could not toggle full screen:", error);
                    });
                    setCommandPaletteOpen(false);
                  }}
                >
                  <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                    <Maximize2 /> Toggle full screen
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">F11</span>
                </CommandItem>
              )}
              <CommandItem
                value="new note"
                onSelect={() => {
                  const folderId = selectedFolderId ?? folders[0]?.id;
                  if (folderId) {
                    setSelectedFolderId(folderId);
                    createNote(folderId);
                  }
                  setCommandPaletteOpen(false);
                }}
              >
                <FilePlus2 /> New note
              </CommandItem>
              <CommandItem
                value="new folder"
                onSelect={() => {
                  setCommandPaletteOpen(false);
                  setNewFolderName("");
                  setCreateFolderParentId(undefined);
                  setCreateFolderDialogOpen(true);
                }}
              >
                <FolderPlus /> New folder
              </CommandItem>
              <CommandItem
                value="settings"
                onSelect={() => {
                  setSettingsOpen(true);
                  setCommandPaletteOpen(false);
                }}
              >
                <Settings /> Settings
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {(() => {
              const match = /^([a-z][a-z0-9_-]*):(\S*)$/i.exec(commandQuery.trim());
              if (!match) {
                const query = commandQuery.trim().toLowerCase();
                if (!query) return null;
                const keys = [
                  ...new Set([
                    "tag",
                    ...blocks
                      .filter((block): block is NotesBlock => block.type === "notes")
                      .flatMap((note) => Object.keys(note.properties)),
                  ]),
                ].filter((key) => key.toLowerCase().startsWith(query));
                return keys.length ? (
                  <CommandGroup heading="Property filters">
                    {keys.map((key) => (
                      <CommandItem
                        key={key}
                        value={`${key}:`}
                        onSelect={() => setCommandQuery(`${key}:`)}
                      >
                        <Search />
                        {key}:
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null;
              }
              const key = match[1].toLowerCase() === "tag" ? "tags" : match[1].toLowerCase();
              const values = [
                ...new Set(
                  blocks
                    .filter((block): block is NotesBlock => block.type === "notes")
                    .flatMap((note) => {
                      const value = note.properties[key];
                      return (Array.isArray(value) ? value : [value])
                        .filter((item) => item !== undefined && item !== null)
                        .map((item) => String(item).replace(/^\[\[|\]\]$/g, ""));
                    }),
                ),
              ].filter((value) => value.toLowerCase().includes(match[2].toLowerCase()));
              return values.length ? (
                <CommandGroup heading="Property suggestions">
                  {values.map((value) => (
                    <CommandItem
                      key={`${key}:${value}`}
                      value={`${key}:${value}`}
                      onSelect={() => setCommandQuery(`${key}:${value}`)}
                    >
                      <Search />
                      {key}:{value}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null;
            })()}
            <CommandGroup
              heading={
                searchFolderId
                  ? "Folder notes"
                  : propertyFilter
                    ? `Notes filtered by ${propertyFilter.key}: ${propertyFilter.value}`
                    : "Notes"
              }
            >
              {blocks
                .filter((block): block is NotesBlock =>
                  block.type === "notes" &&
                  (searchFolderId === null || block.folderId === searchFolderId) &&
                  (matchingNoteIds === null || matchingNoteIds.has(block.id)),
                )
                .map((note) => (
                  <CommandItem
                    key={note.id}
                    value={[
                      note.title,
                      folders.find((folder) => folder.id === note.folderId)?.name ?? "",
                      JSON.stringify(note.properties),
                      ...Object.entries(note.properties).flatMap(([key, value]) => {
                        const values = Array.isArray(value) ? value : [value];
                        return values
                          .filter((item) => item !== null && item !== undefined)
                          .flatMap((item) => [
                            `${key}:${String(item).replace(/^\[\[|\]\]$/g, "")}`,
                            ...(key === "tags"
                              ? [`tag:${String(item).replace(/^\[\[|\]\]$/g, "")}`]
                              : []),
                          ]);
                      }),
                    ].join(" ")}
                    onSelect={() => {
                      setSelectedFolderId(note.folderId);
                      setOpenNotesId(note.id);
                      setCommandPaletteOpen(false);
                    }}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <NoteIcon value={note.icon} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{note.title || "Untitled"}</span>
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <Dialog
        open={createFolderDialogOpen}
        onOpenChange={(open) => {
          setCreateFolderDialogOpen(open);
          if (!open) setCreateFolderParentId(undefined);
        }}
      >
        <DialogContent className="font-mono">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Choose a name for the folder.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newFolderName.trim()) {
                event.preventDefault();
                void createFolder(newFolderName, createFolderParentId).then((created) => {
                  if (created) {
                    setCreateFolderDialogOpen(false);
                    setCreateFolderParentId(undefined);
                  }
                });
              }
            }}
            aria-label="Folder name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!newFolderName.trim()}
              onClick={() => {
                void createFolder(newFolderName, createFolderParentId).then((created) => {
                  if (created) {
                    setCreateFolderDialogOpen(false);
                    setCreateFolderParentId(undefined);
                  }
                });
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {settingsError && (
        <p
          role="alert"
          className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg border border-[#ff929b]/30 bg-[#191c26] px-4 py-3 text-xs text-[#ff929b] shadow-xl"
        >
          {settingsError}
        </p>
      )}
      {settingsOpen && (
        <SettingsOverlay
          preferences={preferences}
          onPreferencesChange={setPreferences}
          onClose={() => setSettingsOpen(false)}
          vaultPath={vaultPath}
        />
      )}
    </div>
  );
}
