import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, DbNotice } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { isUuid, readBlocks, type Block } from "@/lib/os/domain";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/website-designer";

// Text is rendered through React (escaped). Links were validated on save and are
// re-validated on read; external links open safely in a new tab.
function Button({ label, href }: { label: string; href: string }) {
  if (!label || !href) return null;
  const external = href.startsWith("https://");
  return <a className={s.pvButton} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{label}</a>;
}

function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "hero": return <section className={s.pvHero}>{block.heading && <h2>{block.heading}</h2>}{block.subheading && <p>{block.subheading}</p>}<Button label={block.buttonLabel} href={block.buttonHref} /></section>;
    case "text": return <section className={s.pvSection}>{block.heading && <h2>{block.heading}</h2>}{block.body && <p>{block.body}</p>}</section>;
    case "features": return <section className={s.pvSection}>{block.heading && <h2>{block.heading}</h2>}<ul className={s.pvList}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul></section>;
    case "cta": return <section className={s.pvCta}>{block.heading && <h2>{block.heading}</h2>}{block.body && <p>{block.body}</p>}<Button label={block.buttonLabel} href={block.buttonHref} /></section>;
  }
}

export default async function PagePreview({ params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await params;
  if (!isUuid(id) || !isUuid(pageId)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "website", id);
  const page = project.data ? await run<{ title: string; slug: string; blocks: unknown; status: string } | null>(
    supabase.from("os_website_pages").select("title,slug,blocks,status").eq("id", pageId).eq("project_id", id).maybeSingle()) : null;
  if ((!project.error && !project.data) || (page && !page.error && !page.data)) notFound();
  const row = page?.data ?? null;
  const blocks = row ? readBlocks(row.blocks) : [];
  const error = project.error ?? page?.error ?? null;
  return (
    <Suite active="website-designer">
      <PageHeader eyebrow={pick(lang, "Vista previa", "Preview")} title={row?.title ?? "—"}
        description={pick(lang, "Vista privada. No se publica en ningún dominio.", "Private view. Not published to any domain.")}
        crumbs={[{ href: BASE, label: "Website Designer" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "…" }, { href: `${BASE}/${id}/pages/${pageId}`, label: pick(lang, "Editor", "Editor") }]} />
      {error ? <DbNotice lang={lang} error={error} /> : (
        <div className={s.preview}>
          <div className={s.previewBar}><span /><span /><span />{project.data?.name} /{row?.slug}</div>
          {blocks.length ? blocks.map((block, i) => <RenderBlock key={i} block={block} />) : <div className={s.pvEmpty}>{pick(lang, "Página vacía.", "Empty page.")}</div>}
        </div>
      )}
    </Suite>
  );
}
