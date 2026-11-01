import { Extension, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Highlight from "@tiptap/extension-highlight";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Bold,
  Code2,
  Heading,
  Italic,
  Link2,
  MoreHorizontal,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Scissors,
  Clipboard,
  FilePlus2,
  ImageDown,
  ScanEye,
  Trash2,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";
import type { NoteStorage } from "./storage";

type SlashCommand = {
  label: string;
  description: string;
  run: (editor: Editor) => void;
};

export type LinkedNoteOption = {
  id: string;
  title: string;
  folderName: string;
};

const internalNoteLinkPrefix = "https://focusboard.local/note/";

function describeEditorError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The dropped image could not be read."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The dropped image could not be read."));
    reader.readAsDataURL(file);
  });
}

const slashCommands: SlashCommand[] = [
  {
    label: "Heading 1",
    description: "Large section heading",
    run: (editor) => editor.chain().focus().setNode("heading", { level: 1 }).run(),
  },
  {
    label: "Heading 2",
    description: "Small section heading",
    run: (editor) => editor.chain().focus().setNode("heading", { level: 2 }).run(),
  },
  {
    label: "Bullet list",
    description: "Create a bulleted list",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    description: "Create an ordered list",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Checklist",
    description: "Create a task list",
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    label: "Quote",
    description: "Insert a blockquote",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    description: "Insert a code block",
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

function renderSlashMenu() {
  let menu: HTMLDivElement | undefined;
  let unmount: (() => void) | undefined;
  let currentProps: SuggestionProps<SlashCommand, SlashCommand> | undefined;
  let selectedIndex = 0;

  function renderItems() {
    if (!menu || !currentProps) return;

    menu.replaceChildren();
    menu.setAttribute("role", "listbox");

    if (currentProps.items.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "slash-menu-empty";
      emptyState.textContent = "No matching commands";
      menu.append(emptyState);
      return;
    }

    currentProps.items.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `slash-menu-item${index === selectedIndex ? " is-active" : ""}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === selectedIndex));
      const label = document.createElement("span");
      label.textContent = item.label;
      const description = document.createElement("small");
      description.textContent = item.description;
      option.append(label, description);
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => currentProps?.command(item));
      menu?.append(option);
    });
  }

  function update(props: SuggestionProps<SlashCommand, SlashCommand>) {
    currentProps = props;
    selectedIndex = Math.min(selectedIndex, Math.max(props.items.length - 1, 0));
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "slash-command-menu";
    }
    renderItems();
    if (!unmount) unmount = props.mount(menu);
  }

  return {
    onStart: update,
    onUpdate: update,
    onKeyDown({ event, view }: SuggestionKeyDownProps) {
      if (!currentProps) return false;

      if (event.key === "ArrowDown" && currentProps.items.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentProps.items.length;
        renderItems();
        return true;
      }

      if (event.key === "ArrowUp" && currentProps.items.length > 0) {
        selectedIndex =
          (selectedIndex - 1 + currentProps.items.length) %
          currentProps.items.length;
        renderItems();
        return true;
      }

      if (event.key === "Enter" && currentProps.items[selectedIndex]) {
        currentProps.command(currentProps.items[selectedIndex]);
        return true;
      }

      if (event.key === "Escape") {
        exitSuggestion(view);
        return true;
      }

      return false;
    },
    onExit() {
      currentProps = undefined;
      unmount?.();
      unmount = undefined;
      menu = undefined;
      selectedIndex = 0;
    },
  };
}

const SlashCommands = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        char: "/",
        allowedPrefixes: null,
        items: ({ query }) =>
          slashCommands.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
          ),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor);
        },
        allow: ({ editor }) =>
          !editor.isActive("code") && !editor.isActive("codeBlock"),
        render: renderSlashMenu,
      }),
    ];
  },
});

export function NotesEditor({
  content,
  onChange,
  notes,
  onOpenLinkedNote,
  onAddSelectionAsNote,
  storage,
  onStorageError,
}: {
  content: string;
  onChange: (markdown: string) => void;
  notes: LinkedNoteOption[];
  onOpenLinkedNote: (noteId: string) => void;
  onAddSelectionAsNote: (selection: string) => void;
  storage: NoteStorage;
  onStorageError: (message: string) => void;
}) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuKind, setContextMenuKind] = useState<"text" | "image">("text");
  const [contextImage, setContextImage] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [bubbleMenuDismissed, setBubbleMenuDismissed] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [spellcheck, setSpellcheck] = useState<{
    word: string;
    suggestions: string[];
  } | null>(null);
  const linkSelectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const unsubscribe = window.nerabitDesktop?.onSuggestions((data) => {
      setSpellcheck({
        word: data.misspelledWord,
        suggestions: data.dictionarySuggestions,
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!imagePreview) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setImagePreview(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  useEffect(() => {
    function dismissBubbleMenu(event: PointerEvent) {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (event.target.closest(".text-format-toolbar")) return;
      setBubbleMenuDismissed(!event.target.closest(".notes-editor"));
    }

    document.addEventListener("pointerdown", dismissBubbleMenu, true);
    return () =>
      document.removeEventListener("pointerdown", dismissBubbleMenu, true);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({
        allowBase64: true,
        resize: {
          enabled: true,
          directions: [
            "top",
            "right",
            "bottom",
            "left",
            "top-right",
            "top-left",
            "bottom-right",
            "bottom-left",
          ],
        },
      }),
      Markdown,
      SlashCommands,
    ],
    content,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Notes editor" },
      handleDoubleClick: (view, position, event) => {
        if (event.target instanceof HTMLImageElement) {
          setImagePreview(event.target.currentSrc || event.target.src);
          setPreviewScale(1);
          event.preventDefault();
          return true;
        }
        const resolved = view.state.doc.resolve(position);
        const text = resolved.parent.textContent;
        const offset = Math.min(resolved.parentOffset, text.length - 1);
        const isWordCharacter = (character: string | undefined) =>
          character !== undefined && /[\p{L}\p{N}_]/u.test(character);
        if (offset < 0 || !isWordCharacter(text[offset])) return false;
        let start = offset;
        let end = offset + 1;
        while (start > 0 && isWordCharacter(text[start - 1])) start -= 1;
        while (end < text.length && isWordCharacter(text[end])) end += 1;
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(
              view.state.doc,
              resolved.start() + start,
              resolved.start() + end,
            ),
          ),
        );
        return true;
      },
      handleClickOn: (view, _position, node, nodePosition, event) => {
        if (node.type.name !== "image") return false;
        view.dispatch(
          view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, nodePosition),
          ),
        );
        event.preventDefault();
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith("image/"),
        );
        event.preventDefault();
        if (files.length === 0) return true;
        const dropPosition = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        if (dropPosition === undefined) return true;
        void files.reduce<Promise<number | undefined>>(
          async (previousPosition, file) => {
            const position = await previousPosition;
            const dataUrl = await readFileAsDataUrl(file);
            const extension = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.exec(file.name)?.[1]
              ?.toLowerCase() ?? file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "img";
            const path = `.nerabit/attachments/${crypto.randomUUID()}.${extension}`;
            await storage.writeVaultAttachment(path, file);
            const insertionPosition = position ?? dropPosition;
            if (!view.dom.isConnected) return insertionPosition;
            const imageNode = view.state.schema.nodes.image.create({ src: dataUrl });
            const transaction = view.state.tr.replaceRangeWith(
              insertionPosition,
              insertionPosition,
              imageNode,
            );
            view.dispatch(transaction);
            return insertionPosition + 1;
          },
          Promise.resolve(dropPosition),
        ).catch((error: unknown) => {
          onStorageError(`Could not save dropped image: ${describeEditorError(error)}`);
        });
        return true;
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target;
          if (!(target instanceof Element)) return false;
          const href = target.closest("a")?.getAttribute("href");
          if (typeof href !== "string" || !href.startsWith(internalNoteLinkPrefix)) {
            return false;
          }

          const noteId = href.slice(internalNoteLinkPrefix.length);
          if (!notes.some((note) => note.id === noteId)) return false;
          event.preventDefault();
          event.stopPropagation();
          onOpenLinkedNote(noteId);
          return true;
        },
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getMarkdown()),
  });

  useEffect(() => {
    if (!editor || editor.getMarkdown() === content) return;
    editor.commands.setContent(content, { contentType: "markdown", emitUpdate: false });
  }, [content, editor]);

  function runFormatting(action: (currentEditor: Editor) => void) {
    if (!editor) return;
    action(editor);
  }

  const hasTextSelection = Boolean(editor && !editor.state.selection.empty);

  async function copyImage() {
    if (!contextImage) return;
    try {
      const response = await fetch(contextImage);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setClipboardError(null);
    } catch (error) {
      setClipboardError(`Could not copy image: ${describeEditorError(error)}`);
    }
  }

  async function saveImage() {
    if (!contextImage) return;
    try {
      const response = await fetch(contextImage);
      if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
      const dataUrl = await readFileAsDataUrl(await response.blob());
      if (window.nerabitDesktop) {
        await window.nerabitDesktop.saveImageAs(dataUrl);
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "image";
        link.click();
      }
    } catch (error) {
      setClipboardError(`Could not save image: ${describeEditorError(error)}`);
    }
  }

  const filteredNotes = notes.filter((note) =>
    `${note.title} ${note.folderName}`.toLowerCase().includes(linkSearch.trim().toLowerCase()),
  );

  function openLinkDialog() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    linkSelectionRef.current = { from, to };
    setLinkSearch("");
    setLinkDialogOpen(true);
  }

  function closeLinkDialog() {
    linkSelectionRef.current = null;
    setLinkDialogOpen(false);
  }

  function restoreLinkSelection(currentEditor: Editor) {
    const chain = currentEditor.chain().focus();
    if (linkSelectionRef.current) {
      chain.setTextSelection(linkSelectionRef.current);
    }
    return chain;
  }

  const formatActions = [
    { label: "Bold", icon: <Bold />, group: "inline", action: (current: Editor) => current.chain().focus().toggleBold().run() },
    { label: "Italic", icon: <Italic />, group: "inline", action: (current: Editor) => current.chain().focus().toggleItalic().run() },
    { label: "Strikethrough", icon: <Strikethrough />, group: "inline", action: (current: Editor) => current.chain().focus().toggleStrike().run() },
    { label: "Code", icon: <Code2 />, group: "inline", action: (current: Editor) => current.chain().focus().toggleCode().run() },
    { label: "Highlight", icon: <Highlighter />, group: "inline", action: (current: Editor) => current.chain().focus().toggleHighlight().run() },
    { label: "Heading 1", icon: <Heading />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", icon: <Heading />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", icon: <Heading />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "Bullet list", icon: <List />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: <ListOrdered />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleOrderedList().run() },
    { label: "Checklist", icon: <CheckSquare />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleTaskList().run() },
    { label: "Quote", icon: <Quote />, group: "blocks", action: (current: Editor) => current.chain().focus().toggleBlockquote().run() },
  ];

  async function copySelection(cut = false) {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, "\n");
    try {
      await navigator.clipboard.writeText(text);
      if (cut) editor.chain().focus().deleteSelection().run();
      setClipboardError(null);
    } catch (error) {
      setClipboardError(`Clipboard access failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function pasteSelection() {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
      setClipboardError(null);
    } catch (error) {
      setClipboardError(`Clipboard access failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <>
      <ContextMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger
          className="block"
          onContextMenu={(event) => {
            event.preventDefault();
            const target = event.target;
            const image = target instanceof Element ? target.closest("img") : null;
            if (image instanceof HTMLImageElement) {
              setContextMenuKind("image");
              setContextImage(image.currentSrc || image.src);
              if (editor) {
                const position = editor.view.posAtDOM(image, 0);
                const node = editor.state.doc.nodeAt(position);
                if (node?.type.name === "image") {
                  editor.view.dispatch(
                    editor.state.tr.setSelection(
                      NodeSelection.create(editor.state.doc, position),
                    ),
                  );
                }
              }
            } else {
              setContextMenuKind("text");
              setContextImage(null);
            }
            setSpellcheck(null);
            setBubbleMenuDismissed(true);
            setContextMenuOpen(Boolean(editor));
          }}
        >
          <EditorContent editor={editor} className="notes-editor" />
        </ContextMenuTrigger>
        {editor && contextMenuOpen && contextMenuKind === "image" && (
          <ContextMenuContent className="min-w-52 font-mono text-xs">
            <ContextMenuItem onClick={() => void copyImage()}>
              <Clipboard /> Copy image
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void saveImage()}>
              <ImageDown /> Save as...
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
              setImagePreview(contextImage);
              setPreviewScale(1);
            }}>
              <ScanEye /> Open preview
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => editor.chain().focus().deleteSelection().run()}
              className="text-[#ff929b] focus:text-[#ff929b]"
            >
              <Trash2 /> Remove
            </ContextMenuItem>
          </ContextMenuContent>
        )}
        {editor && contextMenuKind === "text" && (
          <ContextMenuContent className="min-w-52 font-mono text-xs">
            <ContextMenuItem disabled={!hasTextSelection} onClick={() => void copySelection(true)}>
              <Scissors /> Cut
            </ContextMenuItem>
            <ContextMenuItem disabled={!hasTextSelection} onClick={() => void copySelection()}>
              <Clipboard /> Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void pasteSelection()}>
              <Clipboard /> Paste
            </ContextMenuItem>
            <ContextMenuItem onClick={() => editor.chain().focus().selectAll().run()}>
              Select all
            </ContextMenuItem>
            {spellcheck?.suggestions.length ? (
              <>
                <ContextMenuSeparator />
                {spellcheck.suggestions.map((suggestion) => (
                  <ContextMenuItem
                    key={suggestion}
                    onClick={() => window.nerabitDesktop?.replaceMisspelling(suggestion)}
                  >
                    {suggestion}
                  </ContextMenuItem>
                ))}
                <ContextMenuItem
                  onClick={() => window.nerabitDesktop?.addToDictionary(spellcheck.word)}
                >
                  Add to dictionary
                </ContextMenuItem>
              </>
            ) : null}
            {hasTextSelection && (
              <>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Format</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="font-mono text-xs">
                    {formatActions.map((item, index) => (
                      <Fragment key={item.label}>
                        {index === 5 && <ContextMenuSeparator />}
                        <ContextMenuItem onClick={() => runFormatting(item.action)}>
                          {item.icon}{item.label}
                        </ContextMenuItem>
                      </Fragment>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
            )}
            {hasTextSelection && <ContextMenuSeparator />}
            {hasTextSelection && (
              <>
                <ContextMenuItem onClick={openLinkDialog}>
                  <Link2 /> Add link
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                >
                  <Quote /> Turn into callout
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const { from, to } = editor.state.selection;
                    const selected = editor.state.doc.textBetween(from, to, "\n");
                    onAddSelectionAsNote(selected);
                    editor.chain().focus().deleteSelection().run();
                  }}
                >
                  <FilePlus2 /> Add to a new note
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenu>
      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) =>
            !bubbleMenuDismissed && !state.selection.empty && editor.isFocused
          }
          className="text-format-toolbar"
        >
          <div
            role="toolbar"
            aria-label="Text formatting"
            onMouseDown={(event) => event.preventDefault()}
          >
            <button type="button" aria-label="Bold" title="Bold" className={editor.isActive("bold") ? "is-active" : ""} onClick={() => runFormatting((current) => current.chain().focus().toggleBold().run())}><Bold /></button>
            <button type="button" aria-label="Italic" title="Italic" className={editor.isActive("italic") ? "is-active" : ""} onClick={() => runFormatting((current) => current.chain().focus().toggleItalic().run())}><Italic /></button>
            <button type="button" aria-label="Strikethrough" title="Strikethrough" className={editor.isActive("strike") ? "is-active" : ""} onClick={() => runFormatting((current) => current.chain().focus().toggleStrike().run())}><Strikethrough /></button>
            <button type="button" aria-label="Inline code" title="Inline code" className={editor.isActive("code") ? "is-active" : ""} onClick={() => runFormatting((current) => current.chain().focus().toggleCode().run())}><Code2 /></button>
            <button type="button" aria-label="Highlight" title="Highlight" className={editor.isActive("highlight") ? "is-active" : ""} onClick={() => runFormatting((current) => current.chain().focus().toggleHighlight().run())}><Highlighter /></button>
            <button type="button" aria-label="Link" title="Link" onClick={openLinkDialog}><Link2 /></button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" aria-label="Heading" title="Heading"><Heading /></button>} />
              <DropdownMenuContent className="font-mono text-xs">
                {formatActions.filter((item) => item.label.startsWith("Heading")).map((item) => (
                  <DropdownMenuItem key={item.label} onClick={() => runFormatting(item.action)}>{item.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" aria-label="More formatting" title="More"><MoreHorizontal /></button>} />
              <DropdownMenuContent className="font-mono text-xs">
                {formatActions.filter((item) => item.group === "blocks" && !item.label.startsWith("Heading")).map((item) => (
                  <DropdownMenuItem key={item.label} onClick={() => runFormatting(item.action)}>{item.icon}{item.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </BubbleMenu>
      )}
      {clipboardError && <p role="alert" className="text-xs text-[#ff929b]">{clipboardError}</p>}
      {imagePreview && (
        <div
          className="image-preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setImagePreview(null)}
          onWheel={(event) => {
            event.preventDefault();
            setPreviewScale((scale) =>
              Math.max(0.2, Math.min(5, scale * (event.deltaY < 0 ? 1.1 : 0.9))),
            );
          }}
        >
          <button
            type="button"
            className="image-preview-close"
            aria-label="Close image preview"
            onClick={() => setImagePreview(null)}
          >×</button>
          <img
            src={imagePreview}
            alt=""
            style={{ transform: `scale(${previewScale})` }}
            onClick={(event) => event.stopPropagation()}
            draggable={false}
          />
        </div>
      )}
      {editor && linkDialogOpen && (
        <div
          className="note-link-dialog-backdrop"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeLinkDialog();
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLinkDialog();
          }}
        >
          <section
            className="note-link-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-link-dialog-title"
          >
            <div className="note-link-dialog-heading">
              <div>
                <h2 id="note-link-dialog-title">Link to a note</h2>
                <p>Choose a note to link to from your workspace.</p>
              </div>
              <button
                type="button"
                aria-label="Close note picker"
                className="note-link-dialog-close"
                onClick={closeLinkDialog}
              >×</button>
            </div>
            <input
              autoFocus
              type="search"
              aria-label="Search notes"
              placeholder="Search notes and folders"
              value={linkSearch}
              onChange={(event) => setLinkSearch(event.target.value)}
            />
            <div className="note-link-results" role="listbox" aria-label="Notes">
              {filteredNotes.length ? filteredNotes.map((note) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={note.id}
                  className="note-link-result"
                  onClick={() => {
                    restoreLinkSelection(editor)
                      .setLink({ href: `${internalNoteLinkPrefix}${note.id}` })
                      .run();
                    closeLinkDialog();
                  }}
                >
                  <span>{note.title || "Untitled"}</span>
                  <small>{note.folderName}</small>
                </button>
              )) : (
                <p className="note-link-empty">
                  {notes.length ? "No notes match your search." : "There are no other notes to link to yet."}
                </p>
              )}
            </div>
            {editor.isActive("link") && (
              <button
                type="button"
                className="note-link-remove"
                onClick={() => {
                  restoreLinkSelection(editor).unsetLink().run();
                  closeLinkDialog();
                }}
              >Remove link</button>
            )}
          </section>
        </div>
      )}
    </>
  );
}
