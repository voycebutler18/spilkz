// src/lib/profileName.ts
export type BasicProfile = {
  id?: string | null;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export function bestProfileName(p?: BasicProfile | null): string {
  const u = (p?.username || "").trim();
  const d = (p?.display_name || "").trim();
  const f = (p?.first_name || "").trim();
  const l = (p?.last_name || "").trim();
  if (u) return u;
  if (d) return d;
  const full = [f, l].filter(Boolean).join(" ").trim();
  if (full) return full;
  return `user_${(p?.id || "").slice(0, 6) || "anon"}`;
}

export function profileSlug(p?: BasicProfile | null): string {
  return (p?.username && p.username.trim()) || (p?.id || "");
}
