import { pick, type Lang } from "@/lib/i18n";
import { CHANNELS, CONTENT_STATUSES } from "@/lib/os/domain";
import { statusLabel } from "./ui";
import s from "./os.module.css";

export type MarketingItem = { id: string; title: string; channel: string; status: string; planned_for: string | null; body: string; asset_url: string; notes: string; updated_at: string; version: number };
export const CHANNEL_NAMES: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", youtube: "YouTube", email: "Email", blog: "Blog", ads: "Ads", other: "Other",
};

export function MarketingFields({ lang, item }: { lang: Lang; item?: MarketingItem }) {
  return (
    <>
      <label className={s.field}><span>{pick(lang, "Título", "Title")} *</span><input className={s.input} name="title" defaultValue={item?.title} required maxLength={200} /></label>
      <div className={s.row}>
        <label className={s.field}><span>{pick(lang, "Canal", "Channel")}</span>
          <select className={s.select} name="channel" defaultValue={item?.channel ?? "instagram"}>{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_NAMES[c]}</option>)}</select>
        </label>
        <label className={s.field}><span>{pick(lang, "Estado", "Status")}</span>
          <select className={s.select} name="status" defaultValue={item?.status ?? "idea"}>{CONTENT_STATUSES.map(c => <option key={c} value={c}>{statusLabel(lang, c)}</option>)}</select>
        </label>
        <label className={s.field}><span>{pick(lang, "Fecha prevista", "Planned date")}</span><input className={s.input} type="date" name="planned_for" defaultValue={item?.planned_for ?? ""} /></label>
      </div>
      <label className={s.field}><span>{pick(lang, "Borrador del contenido", "Content draft")}</span><textarea className={s.textarea} name="body" defaultValue={item?.body} maxLength={20000} rows={5} /></label>
      <label className={s.field}><span>{pick(lang, "Activo creativo (URL https)", "Creative asset (https URL)")}</span><input className={s.input} type="url" name="asset_url" defaultValue={item?.asset_url} maxLength={1000} placeholder="https://" /></label>
      <label className={s.field}><span>{pick(lang, "Notas internas", "Internal notes")}</span><textarea className={s.textarea} name="notes" defaultValue={item?.notes} maxLength={4000} rows={2} /></label>
    </>
  );
}
