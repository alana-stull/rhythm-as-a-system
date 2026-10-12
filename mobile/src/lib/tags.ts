import type { Area } from "../api/endpoints";
import { pastel, type PastelKey, type Tag } from "../design";

export function toTag(area: Area | undefined): Tag | undefined {
  if (!area?.color_family || !(area.color_family in pastel)) return undefined;
  return { id: area.id, name: area.name, color: area.color_family as PastelKey };
}
