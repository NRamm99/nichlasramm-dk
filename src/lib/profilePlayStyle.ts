export type PlaySide = "left" | "right";
export type PlayStyleChoice = PlaySide | "unset";

export const HANDED_OPTIONS: ReadonlyArray<{
  id: PlayStyleChoice;
  label: string;
}> = [
  { id: "unset", label: "Ikke sat" },
  { id: "left", label: "Venstrehåndet" },
  { id: "right", label: "Højrehåndet" },
];

export const SIDE_OPTIONS: ReadonlyArray<{
  id: PlayStyleChoice;
  label: string;
}> = [
  { id: "unset", label: "Ikke sat" },
  { id: "left", label: "Venstre" },
  { id: "right", label: "Højre" },
];

export function parsePlaySide(value: string | null | undefined): PlaySide | null {
  if (value === "left" || value === "right") return value;
  return null;
}

export function toPlayStyleChoice(value: PlaySide | null | undefined): PlayStyleChoice {
  return value ?? "unset";
}

export function fromPlayStyleChoice(value: PlayStyleChoice): PlaySide | null {
  return value === "unset" ? null : value;
}

export function handedLabel(value: PlaySide | null | undefined) {
  if (value === "left") return "Venstrehåndet";
  if (value === "right") return "Højrehåndet";
  return null;
}

export function preferredSideLabel(value: PlaySide | null | undefined) {
  if (value === "left") return "Venstre side";
  if (value === "right") return "Højre side";
  return null;
}

export type HeroChipKind =
  | "handed-left"
  | "handed-right"
  | "side-left"
  | "side-right"
  | "seeking";

export type HeroChip = {
  kind: HeroChipKind;
  label: string;
};

export function playStyleChips(profile: {
  handed?: PlaySide | null;
  preferred_side?: PlaySide | null;
}): HeroChip[] {
  const chips: HeroChip[] = [];
  if (profile.handed === "left") {
    chips.push({ kind: "handed-left", label: "Venstrehåndet" });
  } else if (profile.handed === "right") {
    chips.push({ kind: "handed-right", label: "Højrehåndet" });
  }
  if (profile.preferred_side === "left") {
    chips.push({ kind: "side-left", label: "Venstre side" });
  } else if (profile.preferred_side === "right") {
    chips.push({ kind: "side-right", label: "Højre side" });
  }
  return chips;
}

export function profileHeroChips(profile: {
  handed?: PlaySide | null;
  preferred_side?: PlaySide | null;
  partner_id?: string | null;
  seeking_partner?: boolean;
}): HeroChip[] {
  const chips = playStyleChips(profile);
  if (!profile.partner_id && profile.seeking_partner) {
    chips.push({ kind: "seeking", label: "Søger partner" });
  }
  return chips;
}

export function formatMemberSince(createdAt: string | null | undefined) {
  if (!createdAt) return null;
  const formatted = new Intl.DateTimeFormat("da-DK", {
    month: "long",
    year: "numeric",
  }).format(new Date(createdAt));
  return `Medlem siden ${formatted}`;
}

export function formatPartnerSince(partneredAt: string | null | undefined) {
  if (!partneredAt) return null;
  const formatted = new Intl.DateTimeFormat("da-DK", {
    month: "long",
    year: "numeric",
  }).format(new Date(partneredAt));
  return `Sammen siden ${formatted}`;
}
