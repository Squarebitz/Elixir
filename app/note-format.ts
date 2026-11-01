import { stringify } from "yaml";
import type { NoteDocument } from "./storage";

export type EncodedNote = {
  id: string;
  markdown: string;
};

export function encodeDocument(note: NoteDocument): EncodedNote {
  const propertyOrder = [
    ...new Set([
      ...(note.propertyOrder ?? []).filter((key) =>
        Object.prototype.hasOwnProperty.call(note.properties ?? {}, key),
      ),
      ...Object.keys(note.properties ?? {}),
    ]),
  ];
  const serializedMetadata = stringify({
    ...note.properties,
    id: note.id,
    title: note.title,
    kind: note.kind,
    folderId: note.folderId,
    position: note.position,
    ...(note.icon ? { icon: note.icon } : {}),
    ...(note.bannerImage ? { bannerImage: note.bannerImage } : {}),
    ...(note.bannerWidth ? { bannerWidth: note.bannerWidth } : {}),
    ...(note.bannerPosition ? { bannerPosition: note.bannerPosition } : {}),
    propertyOrder,
    ...(note.createdAt ? { createdAt: note.createdAt } : {}),
    ...(note.updatedAt ? { updatedAt: note.updatedAt } : {}),
  });
  const metadata = note.icon
    ? serializedMetadata.replace(
        /^icon:.*$/m,
        `icon: ${JSON.stringify(note.icon)}`,
      )
    : serializedMetadata;
  return {
    id: note.id,
    markdown: `---\n${metadata}---\n${note.markdown}`,
  };
}
