import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicFunnel, validSlug, FUNNEL_TEMPLATES } from "@/lib/growth/funnel";
import { FunnelForm } from "./form";
import styles from "../funnel.module.css";

export const dynamic = "force-dynamic";
// A funnel is never indexed automatically by a PR/Preview or an unpublished draft.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function FunnelLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  let raw: unknown = null;
  try {
    const supabase = await createClient();
    const response = await supabase.rpc("crm_growth_funnel_view", { p_slug: slug });
    if (!response.error) raw = response.data;
  } catch { /* fail closed when the isolated schema is not installed */ }
  const funnel = publicFunnel(raw);
  if (!funnel) notFound();
  const template = FUNNEL_TEMPLATES[funnel.template];
  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>AVALON <small>CORE AGENCY</small></span>
        <span className={styles.tag}>{template.label} · Solicitud</span>
      </header>
      <div className={styles.layout}>
        <section className={styles.intro} aria-labelledby="funnel-title">
          <span className={styles.eyebrow}>CRECE CON INTELIGENCIA</span>
          <h1 id="funnel-title">{funnel.title}</h1>
          <p>{funnel.subheading}</p>
          <div className={styles.trust}>
            <strong>Sin compromisos automáticos.</strong>
            <span>Revisaremos tu información antes de ofrecer un servicio. No hay cargos ni anuncios automáticos.</span>
          </div>
        </section>
        <section className={styles.formPanel} aria-label="Formulario de contacto">
          <h2>Cuéntanos sobre tu proyecto</h2>
          <p>Un formulario seguro conectado a nuestro CRM.</p>
          <FunnelForm slug={funnel.slug} cta={funnel.cta} />
        </section>
      </div>
      <footer className={styles.footer}>© {new Date().getFullYear()} Avalon Core Agency · Datos utilizados únicamente para esta solicitud.</footer>
    </div>
  </main>;
}
