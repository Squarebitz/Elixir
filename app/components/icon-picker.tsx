import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  Code2,
  Flag,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  Lightbulb,
  Pencil,
  Rocket,
  Star,
  Target,
  X,
  BookOpen,
  Dice5,
  Shapes,
} from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const iconEntries = [
  ["briefcase", "Briefcase", Briefcase],
  ["book-open", "Book", BookOpen],
  ["flask-conical", "Research", FlaskConical],
  ["lightbulb", "Idea", Lightbulb],
  ["rocket", "Rocket", Rocket],
  ["target", "Target", Target],
  ["chart-bar", "Chart", BarChart3],
  ["calendar", "Calendar", CalendarDays],
  ["folder", "Folder", Folder],
  ["star", "Star", Star],
  ["flag", "Flag", Flag],
  ["code", "Code", Code2],
  ["globe", "Globe", Globe],
  ["graduation-cap", "Study", GraduationCap],
  ["pencil", "Pencil", Pencil],
  ["bookmark", "Bookmark", Bookmark],
] as const;

const iconColors = [
  ["Muted gray", "#9ca3af"],
  ["Purple", "#8b5cf6"],
  ["Red", "#ef4444"],
  ["Orange", "#f97316"],
  ["Yellow", "#eab308"],
  ["Green", "#22c55e"],
  ["Blue", "#3b82f6"],
] as const;

function decodeIcon(value?: string) {
  if (!value?.startsWith("lucide:")) return null;
  const [name, color] = value.slice("lucide:".length).split("#");
  return { name, color: color ? `#${color}` : undefined };
}

export function NoteIcon({
  value,
  className = "h-4 w-4",
}: {
  value?: string;
  className?: string;
}) {
  const icon = decodeIcon(value);
  if (!icon) {
    return value ? (
      <span className={className} aria-hidden="true">
        {value}
      </span>
    ) : null;
  }
  const entry = iconEntries.find(([name]) => name === icon.name);
  if (!entry) return null;
  const Icon = entry[2];
  return (
    <Icon
      className={className}
      aria-hidden="true"
      style={{ color: icon.color ?? "currentColor" }}
    />
  );
}

export function IconPicker({
  value,
  onChange,
  open,
  onOpenChange,
  trigger,
  triggerLabel = "Add icon",
  triggerClassName,
  iconClassName,
  compact = false,
}: {
  value?: string;
  onChange: (value?: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  triggerLabel?: string;
  triggerClassName?: string;
  iconClassName?: string;
  compact?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<string>(iconColors[0][1]);
  const gridRef = useRef<HTMLDivElement>(null);
  const isOpen = open ?? internalOpen;

  function setIsOpen(next: boolean) {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setQuery("");
  }

  const filteredIcons = useMemo(
    () =>
      iconEntries.filter(([, label, name]) =>
        `${label} ${name}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  function chooseIcon(icon: string) {
    onChange(icon);
    setIsOpen(false);
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const buttons = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-picker-option]") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 :
      event.key === "ArrowUp" ? -4 : 4;
    buttons[(index + offset + buttons.length) % buttons.length]?.focus();
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          trigger ?? (
            <button
              type="button"
              aria-label={triggerLabel}
              title={triggerLabel}
              className={triggerClassName ?? "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground"}
            >
              {value ? (
                <NoteIcon value={value} className={iconClassName ?? (compact ? "h-4 w-4" : "h-12 w-12")} />
              ) : (
                <Shapes className="h-4 w-4" />
              )}
              {!value && triggerLabel}
            </button>
          )
        }
      />
      <PopoverContent
        align="start"
        className="w-80 border border-border bg-popover p-3 font-mono text-xs"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
          } else if (
            event.key === "ArrowDown" &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
            gridRef.current
              ?.querySelector<HTMLButtonElement>("[data-picker-option]")
              ?.focus();
          } else {
            handleGridKeyDown(event);
          }
        }}
      >
        <Input
          autoFocus
          aria-label="Search icons"
          placeholder="Search icons..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 px-3 text-xs"
        />
        <div className="flex items-center gap-1 border-b border-border py-2">
          {value && <button
            type="button"
            aria-label="Remove icon"
            title="Remove"
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
            className="ml-auto rounded px-2 py-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>}
          <button
            type="button"
            onClick={() => {
              const [name] = iconEntries[Math.floor(Math.random() * iconEntries.length)];
              chooseIcon(`lucide:${name}#${color.slice(1)}`);
            }}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-muted"
          >
            <Dice5 className="h-3.5 w-3.5" /> Random
          </button>
        </div>
        <>
          <div className="flex justify-between gap-1 py-1" aria-label="Icon color">
            {iconColors.map(([label, value]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
                className={`h-5 w-5 rounded-full border ${color === value ? "border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>
          <div
            ref={gridRef}
            role="grid"
            aria-label="Lucide icons"
            className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto"
          >
            {filteredIcons.map(([name, label, Icon]) => (
              <button
                key={name}
                type="button"
                data-picker-option
                aria-label={label}
                onClick={() => chooseIcon(`lucide:${name}#${color.slice(1)}`)}
                className="flex flex-col items-center gap-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-5 w-5" />
                <span className="text-[9px]">{label}</span>
              </button>
            ))}
          </div>
          {query && filteredIcons.length === 0 ? (
            <p className="py-2 text-muted-foreground">No icons found</p>
          ) : null}
        </>
      </PopoverContent>
    </Popover>
  );
}
