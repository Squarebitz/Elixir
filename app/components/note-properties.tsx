import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CircleUserRound,
  Hash,
  Link2,
  ListChecks,
  Plus,
  Star,
  Tag,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import type {
  NoteStorage,
  PropertyDefinition,
  PropertyStateUpdate,
  PropertyType,
} from "../storage";

const PRESETS: PropertyDefinition[] = [
  { key: "tags", label: "Tags", type: "tags" },
  { key: "category", label: "Category", type: "category" },
  { key: "date", label: "Date", type: "date" },
  { key: "author", label: "Author", type: "text" },
  { key: "source", label: "Source", type: "url" },
  { key: "status", label: "Status", type: "choice" },
  { key: "rating", label: "Rating", type: "rating" },
  { key: "related", label: "Related", type: "related" },
  { key: "summary", label: "Summary", type: "summary" },
];

const TYPE_OPTIONS: { label: string; value: PropertyType }[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Checkbox", value: "checkbox" },
  { label: "Choice", value: "choice" },
  { label: "Multi-choice", value: "multi-choice" },
  { label: "URL", value: "url" },
];

const ALL_TYPE_OPTIONS: { label: string; value: PropertyType }[] = [
  ...TYPE_OPTIONS,
  { label: "Tags", value: "tags" },
  { label: "Category", value: "category" },
  { label: "Rating", value: "rating" },
  { label: "Related", value: "related" },
  { label: "Summary", value: "summary" },
];

const ICONS = {
  tags: Tag,
  category: ListChecks,
  date: CalendarDays,
  text: Type,
  url: Link2,
  choice: ChevronDown,
  rating: Star,
  related: CircleUserRound,
  summary: AlignLeft,
  number: Hash,
  checkbox: Check,
  "multi-choice": ListChecks,
} satisfies Record<PropertyType, typeof Tag>;

const RESERVED_KEYS = new Set([
  "id",
  "title",
  "kind",
  "folderid",
  "position",
  "bannerimage",
  "bannerwidth",
  "bannerposition",
  "propertyorder",
  "createdat",
  "updatedat",
]);
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

function isPropertyDefinition(value: unknown): value is PropertyDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    typeof value.key === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "type" in value &&
    ALL_TYPE_OPTIONS.some((option) => option.value === value.type) &&
    PROPERTY_KEY_PATTERN.test(value.key) &&
    !RESERVED_KEYS.has(value.key.toLowerCase())
  );
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function propertyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asDisplayValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return "";
}

export function NoteProperties({
  noteId,
  properties,
  propertyOrder,
  storage,
  existingNotes,
  onChange,
  onFilter,
  onOpenRelatedNote,
  onStorageError,
  legacyProperties,
  onConvertLegacy,
}: {
  noteId: string;
  properties: Record<string, unknown>;
  propertyOrder: string[];
  storage: NoteStorage;
  existingNotes: { id: string; title: string; properties: Record<string, unknown> }[];
  onChange: (update: PropertyStateUpdate) => void;
  onFilter: (key: string, value: string) => void;
  onOpenRelatedNote: (noteId: string) => void;
  onStorageError: (message: string) => void;
  legacyProperties?: { category?: string; tags?: string[] };
  onConvertLegacy: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<PropertyType>("text");
  const [storedDefinitions, setStoredDefinitions] = useState<PropertyDefinition[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const storageErrorHandler = useRef(onStorageError);
  storageErrorHandler.current = onStorageError;
  const lastRemoved = useRef<{
    key: string;
    value: unknown;
    index: number;
  } | null>(null);

  const definitionsByKey = useMemo(() => {
    const merged = new Map(PRESETS.map((item) => [item.key, item]));
    for (const definition of storedDefinitions) merged.set(definition.key, definition);
    for (const key of Object.keys(properties)) {
      if (!merged.has(key)) {
        merged.set(key, { key, label: key, type: "text" });
      }
    }
    return merged;
  }, [properties, storedDefinitions]);
  const visibleKeys = useMemo(() => {
    const current = propertyOrder.filter(
      (key) => Object.hasOwn(properties, key) && definitionsByKey.has(key),
    );
    const remaining = Object.keys(properties).filter(
      (key) => !current.includes(key) && definitionsByKey.has(key),
    );
    return [...current, ...remaining];
  }, [definitionsByKey, properties, propertyOrder]);
  const availableDefinitions = [...definitionsByKey.values()].filter(
    (definition) => !Object.hasOwn(properties, definition.key),
  );

  useEffect(() => {
    let active = true;
    async function loadDefinitions() {
      try {
        const contents = await storage.readVaultFile(".nerabit/properties.json");
        if (!contents) return;
        const parsed: unknown = JSON.parse(contents);
        if (!Array.isArray(parsed) || !parsed.every(isPropertyDefinition)) {
          throw new Error("Custom property definitions file is invalid.");
        }
        if (active) setStoredDefinitions(parsed);
      } catch (error) {
        setPropertyError(
          error instanceof Error ? error.message : "Could not load property definitions.",
        );
        storageErrorHandler.current(
          error instanceof Error ? error.message : "Could not load property definitions.",
        );
      }
    }
    void loadDefinitions();
    const reload = () => void loadDefinitions();
    window.addEventListener("nerabit-property-definitions-changed", reload);
    return () => {
      active = false;
      window.removeEventListener("nerabit-property-definitions-changed", reload);
    };
  }, [storage]);

  useEffect(() => {
    function undoRemoval(event: globalThis.KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        !lastRemoved.current
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      const removed = lastRemoved.current;
      lastRemoved.current = null;
      onChange((currentProperties, currentOrder) => {
        const next = { ...currentProperties, [removed.key]: removed.value };
        const order = [...currentOrder];
        order.splice(Math.min(removed.index, order.length), 0, removed.key);
        return { properties: next, propertyOrder: order };
      });
    }
    window.addEventListener("keydown", undoRemoval);
    return () => window.removeEventListener("keydown", undoRemoval);
  }, [onChange, properties, propertyOrder]);

  function updateProperty(
    key: string,
    value: unknown,
    transform?: (currentValue: unknown) => unknown,
  ) {
    onChange((currentProperties, currentOrder) => ({
      properties: {
        ...currentProperties,
        [key]: transform ? transform(currentProperties[key]) : value,
      },
      propertyOrder: [
        ...currentOrder.filter((item) => item !== key),
        ...(currentOrder.includes(key) ? [] : [key]),
      ],
    }));
  }

  function addProperty(definition: PropertyDefinition) {
    const initialValue =
      definition.type === "tags" ||
      definition.type === "related" ||
      definition.type === "multi-choice"
        ? []
        : definition.type === "checkbox"
          ? false
          : definition.type === "rating"
            ? 0
            : "";
    updateProperty(definition.key, initialValue);
    setAddOpen(false);
    setQuery("");
  }

  async function saveDefinitions(next: PropertyDefinition[]): Promise<boolean> {
    try {
      await storage.writeVaultFile(
        ".nerabit/properties.json",
        JSON.stringify(next, null, 2),
      );
      setStoredDefinitions(next);
      setPropertyError(null);
      window.dispatchEvent(new CustomEvent("nerabit-property-definitions-changed"));
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save property definitions.";
      setPropertyError(message);
      onStorageError(message);
      return false;
    }
  }

  function editDefinition(key: string, changes: Partial<PropertyDefinition>) {
    const current = definitionsByKey.get(key);
    if (!current) return;
    const next = storedDefinitions.filter((item) => item.key !== key);
    next.push({ ...current, ...changes });
    void saveDefinitions(next);
  }

  function removeProperty(key: string) {
    const index = visibleKeys.indexOf(key);
    lastRemoved.current = { key, value: properties[key], index: Math.max(0, index) };
    onChange((currentProperties, currentOrder) => {
      const next = { ...currentProperties };
      delete next[key];
      return {
        properties: next,
        propertyOrder: currentOrder.filter((item) => item !== key),
      };
    });
  }

  async function addCustomProperty() {
    const label = customName.trim();
    const key = propertyKey(label);
    if (
      !label ||
      !key ||
      RESERVED_KEYS.has(key.toLowerCase()) ||
      definitionsByKey.has(key)
    ) {
      return;
    }
    const definition = { key, label, type: customType };
    const next = [...storedDefinitions, definition];
    if (!(await saveDefinitions(next))) return;
    addProperty(definition);
    setCustomName("");
    setCustomType("text");
  }

  function reorder(draggedKey: string, targetKey: string) {
    onChange((currentProperties, currentOrder) => {
      const next = [
        ...currentOrder.filter((key) => Object.hasOwn(currentProperties, key)),
        ...Object.keys(currentProperties).filter((key) => !currentOrder.includes(key)),
      ];
      const draggedIndex = next.indexOf(draggedKey);
      const targetIndex = next.indexOf(targetKey);
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return { properties: currentProperties, propertyOrder: next };
      }
      next.splice(targetIndex, 0, ...next.splice(draggedIndex, 1));
      return { properties: currentProperties, propertyOrder: next };
    });
  }

  function renderValue(key: string, definition: PropertyDefinition) {
    const value = properties[key];
    if (definition.type === "tags" || definition.type === "related" || definition.type === "multi-choice") {
      const values = getStringList(value);
      const placeholder =
        definition.type === "related" ? "Link a note" : `Add ${definition.label.toLowerCase()}`;
      const suggestions = definition.type === "related"
        ? existingNotes.map((note) => note.title)
        : definition.type === "tags"
          ? existingNotes.flatMap((note) => getStringList(note.properties.tags))
          : [];
      const addValue = (raw: string) => {
        const next = raw.trim().replace(/,$/, "").trim();
        if (!next) return;
        const stored = definition.type === "related" && !next.startsWith("[[")
          ? `[[${next}]]`
          : next;
        updateProperty(key, undefined, (currentValue) => {
          const currentValues = getStringList(currentValue);
          const exists = currentValues.some(
            (item) =>
              item.replace(/^\[\[|\]\]$/g, "").toLowerCase() ===
              next.replace(/^\[\[|\]\]$/g, "").toLowerCase(),
          );
          return exists ? currentValues : [...currentValues, stored];
        });
        setEditValue("");
      };
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {values.map((item) => {
            const label = item.replace(/^\[\[|\]\]$/g, "");
            return (
              <span key={item} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {definition.type === "related" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = existingNotes.find(
                        (note) => note.title.toLowerCase() === label.toLowerCase(),
                      );
                      if (target) onOpenRelatedNote(target.id);
                    }}
                  >
                    <span data-text-selectable>{label}</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => onFilter(key, item)}>
                    <span data-text-selectable>{label}</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() =>
                    updateProperty(key, undefined, (currentValue) =>
                      getStringList(currentValue).filter((entry) => entry !== item),
                    )
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <Input
            aria-label={`Add ${definition.label}`}
            placeholder={placeholder}
            list={suggestions.length ? `${noteId}-${key}-suggestions` : undefined}
            value={editingKey === key ? editValue : ""}
            onFocus={() => {
              setEditingKey(key);
              if (editingKey !== key) setEditValue("");
            }}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addValue(editValue);
              }
              if (event.key === "Backspace" && !editValue && values.length) {
                updateProperty(
                  key,
                  undefined,
                  (currentValue) => getStringList(currentValue).slice(0, -1),
                );
              }
            }}
            onBlur={() => {
              if (editValue.trim()) addValue(editValue);
            }}
            className="h-7 w-28 border-transparent bg-transparent px-2 text-xs shadow-none"
          />
          {suggestions.length > 0 && (
            <datalist id={`${noteId}-${key}-suggestions`}>
              {[...new Set(suggestions)].map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          )}
        </div>
      );
    }

    if (definition.type === "checkbox") {
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={value === true}
          onClick={() =>
            updateProperty(key, undefined, (currentValue) => currentValue !== true)
          }
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-primary"
        >
          {value === true && <Check className="h-4 w-4" />}
        </button>
      );
    }

    if (definition.type === "rating") {
      const rating = typeof value === "number" ? value : Number(value) || 0;
      return (
        <span className="flex items-center gap-0.5" aria-label={`Rating ${rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              onClick={() =>
                updateProperty(key, undefined, (currentValue) => {
                  const currentRating =
                    typeof currentValue === "number" ? currentValue : Number(currentValue) || 0;
                  return star === currentRating ? 0 : star;
                })
              }
              className="rounded-sm text-primary hover:text-primary/70"
            >
              <Star className={`h-4 w-4 ${star <= rating ? "fill-current" : ""}`} />
            </button>
          ))}
        </span>
      );
    }

    if (definition.type === "choice" || definition.type === "category") {
      const current = asDisplayValue(value);
      const options = existingNotes
        .map((note) => asDisplayValue(note.properties[key]))
        .filter(Boolean);
      if (key === "status") options.push("To read", "Reading", "Done");
      if (current) options.push(current);
      const uniqueOptions = [...new Set(options)].sort((left, right) => left.localeCompare(right));
      return (
        <div className="flex min-w-0 items-center gap-2">
          {editingKey === `choice:${key}` ? (
            <select
              autoFocus
              aria-label={definition.label}
              value={current}
              onChange={(event) => {
                if (event.target.value === "__new__") {
                  setEditingKey(key);
                  setEditValue("");
                } else {
                  updateProperty(key, event.target.value);
                  setEditingKey(null);
                }
              }}
              onBlur={() =>
                setEditingKey((currentKey) =>
                  currentKey === `choice:${key}` ? null : currentKey,
                )
              }
              className="h-7 max-w-48 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">Choose {definition.label.toLowerCase()}</option>
              {uniqueOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value="__new__">Create new…</option>
            </select>
          ) : (
            current ? (
              <>
                <button
                  type="button"
                  onClick={() => onFilter(key, current)}
                  className="truncate rounded-full bg-muted px-2 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  <span data-text-selectable>{current}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Edit ${definition.label}`}
                  onClick={() => setEditingKey(`choice:${key}`)}
                >
                  <Type className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingKey(`choice:${key}`)}
                className="truncate text-left text-xs text-muted-foreground"
              >
                {`Choose ${definition.label.toLowerCase()}`}
              </button>
            )
          )}
          {editingKey === key && (
            <Input
              autoFocus
              aria-label={`Create ${definition.label.toLowerCase()} value`}
              value={editValue}
              placeholder="New value"
              onChange={(event) => setEditValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && editValue.trim()) {
                  updateProperty(key, editValue.trim());
                  setEditingKey(null);
                }
                if (event.key === "Escape") setEditingKey(null);
              }}
              onBlur={() => {
                if (editValue.trim()) updateProperty(key, editValue.trim());
                setEditingKey(null);
              }}
              className="h-7 w-32 text-xs"
            />
          )}
        </div>
      );
    }

    if (definition.type === "url" && editingKey !== key) {
      const url = asDisplayValue(value);
      return (
        <span className="flex items-center gap-2 text-xs">
          {url ? <a href={url} target="_blank" rel="noreferrer" className="text-primary underline" data-text-selectable>{url}</a> : <span className="text-muted-foreground">—</span>}
          <button type="button" onClick={() => { setEditingKey(key); setEditValue(url); }} aria-label="Edit URL">
            <Type className="h-3.5 w-3.5" />
          </button>
        </span>
      );
    }

    if (definition.type === "text" && value) {
      return (
        <span className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onFilter(key, asDisplayValue(value))}
            className="rounded-full bg-muted px-2 py-0.5 text-left text-muted-foreground hover:text-foreground"
          >
            <span data-text-selectable>{asDisplayValue(value)}</span>
          </button>
          <button
            type="button"
            aria-label={`Edit ${definition.label}`}
            onClick={() => {
              setEditingKey(key);
              setEditValue(asDisplayValue(value));
            }}
          >
            <Type className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </span>
      );
    }

    const isEditing = editingKey === key;
    const inputType =
      definition.type === "date"
        ? "date"
        : definition.type === "number"
          ? "number"
          : definition.type === "url"
            ? "url"
            : "text";
    return isEditing ? (
      <Input
        type={inputType}
        aria-label={definition.label}
        value={isEditing ? editValue : asDisplayValue(value)}
        onFocus={() => {
          setEditingKey(key);
          setEditValue(asDisplayValue(value));
        }}
        onChange={(event) => setEditValue(event.target.value)}
        onBlur={() => {
          if (editValue !== asDisplayValue(value)) {
            updateProperty(key, inputType === "number" && editValue ? Number(editValue) : editValue);
          }
          setEditingKey(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditingKey(null);
        }}
        placeholder={definition.type === "summary" ? "Add a short summary" : definition.label}
        className={`h-7 border-transparent bg-transparent px-2 text-xs shadow-none ${definition.type === "summary" ? "w-full" : "w-48"}`}
      />
    ) : (
      <button
        type="button"
        onClick={() => {
          setEditingKey(key);
          setEditValue(asDisplayValue(value));
        }}
        className={`truncate text-left text-xs ${value ? "text-foreground" : "text-muted-foreground"}`}
      >
        {asDisplayValue(value) ? (
          <span data-text-selectable>{asDisplayValue(value)}</span>
        ) : (
          definition.type === "summary" ? "Add a short summary" : `Add ${definition.label.toLowerCase()}`
        )}
      </button>
    );
  }

  return (
    <section className="group/properties mt-2 max-w-3xl font-mono" aria-label="Note properties">
      {visibleKeys.map((key) => {
        const definition = definitionsByKey.get(key);
        if (!definition) return null;
        const Icon = ICONS[definition.type];
        return (
          <div
            key={key}
            draggable
            onDragStart={(event: DragEvent<HTMLDivElement>) => {
              event.dataTransfer.setData("text/property-key", key);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              reorder(event.dataTransfer.getData("text/property-key"), key);
            }}
            className="group/property flex min-h-8 items-center gap-2 rounded-md px-1 hover:bg-muted/50"
          >
            <span
              className="cursor-grab text-muted-foreground/60 opacity-0 transition-opacity group-hover/property:opacity-100 group-focus-within/property:opacity-100"
              aria-hidden="true"
            >
              ⋮⋮
            </span>
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button type="button" className="max-w-28 truncate text-left text-xs text-muted-foreground hover:text-foreground data-popup-open:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring">
                    {definition.label}
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="font-mono">
                <DropdownMenuItem
                  onClick={() => {
                    setEditingKey(`rename:${key}`);
                    setEditValue(definition.label);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setEditingKey(`type:${key}`);
                    setEditValue(definition.type);
                  }}
                >
                  Change type
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => removeProperty(key)} className="text-destructive">
                  <Trash2 /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {editingKey === `rename:${key}` ? (
              <Input
                autoFocus
                value={editValue}
                aria-label={`Rename ${definition.label}`}
                onChange={(event) => setEditValue(event.target.value)}
                onBlur={() => {
                  if (editValue.trim()) editDefinition(key, { label: editValue.trim() });
                  setEditingKey(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setEditingKey(null);
                }}
                className="h-7 w-36 px-3 text-xs"
              />
            ) : editingKey === `type:${key}` ? (
              <select
                autoFocus
                aria-label={`Change ${definition.label} type`}
                value={editValue}
                onChange={(event) => {
                  const type = TYPE_OPTIONS.find((option) => option.value === event.target.value)?.value;
                  if (type) {
                    editDefinition(key, { type });
                    updateProperty(
                      key,
                      type === "tags" || type === "related" || type === "multi-choice"
                        ? getStringList(properties[key])
                        : type === "checkbox"
                          ? properties[key] === true
                          : type === "rating"
                            ? Number(properties[key]) || 0
                            : asDisplayValue(properties[key]),
                    );
                  }
                  setEditingKey(null);
                }}
                onBlur={() => setEditingKey(null)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                {ALL_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0 flex-1">{renderValue(key, definition)}</div>
              </div>
            )}
          </div>
        );
      })}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="pointer-events-none inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground opacity-0 transition-colors group-hover/properties:pointer-events-auto group-hover/properties:opacity-100 group-focus-within/properties:pointer-events-auto group-focus-within/properties:opacity-100 hover:bg-muted hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Add property
            </button>
          }
        />
        <PopoverContent align="start" className="w-72 p-0 font-mono">
          <Command>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Find a property..." />
            <CommandList>
              <CommandEmpty>No properties found.</CommandEmpty>
              <CommandGroup heading="Properties">
                {availableDefinitions.map((definition) => {
                  const Icon = ICONS[definition.type];
                  return (
                    <CommandItem
                      key={definition.key}
                      value={`${definition.label} ${definition.type}`}
                      onSelect={() => addProperty(definition)}
                    >
                      <Icon className="h-4 w-4" />
                      {definition.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <div className="border-t border-border p-3">
                <p className="mb-2 text-xs text-muted-foreground">Create custom property</p>
                <div className="flex gap-2">
                  <Input
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="Property name"
                    aria-label="Custom property name"
                    className="h-8 min-w-0 text-xs"
                  />
                  <select
                    value={customType}
                    onChange={(event) => setCustomType(event.target.value as PropertyType)}
                    aria-label="Custom property type"
                    className="h-8 max-w-28 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={
                    !customName.trim() ||
                    !PROPERTY_KEY_PATTERN.test(propertyKey(customName)) ||
                    RESERVED_KEYS.has(propertyKey(customName)) ||
                    definitionsByKey.has(propertyKey(customName))
                  }
                  onClick={addCustomProperty}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create property
                </button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {legacyProperties && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onConvertLegacy}
            className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Convert old Category/Tags lines
          </button>
        </div>
      )}
      {propertyError && (
        <p role="alert" className="mt-2 text-[11px] text-destructive">
          Could not load or save properties: {propertyError}
        </p>
      )}
    </section>
  );
}
