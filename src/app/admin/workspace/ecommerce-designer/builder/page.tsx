import { ModuleBuilderLanding } from "@/components/os/module-sections";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function BuilderPage() {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  return <ModuleBuilderLanding module="ecommerce" supabase={supabase} lang={lang} />;
}
