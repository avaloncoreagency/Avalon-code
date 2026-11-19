import { Unavailable } from "@/components/sales/ui";
import { pick, type Lang } from "@/lib/i18n";
import { ERROR_TEXT } from "@/lib/quotes/text";
import s from "@/components/sales/sales.module.css";

/** Until the Quoting Studio migration is approved and applied, say exactly that instead of a generic error. */
export function QuoteUnavailable({ lang, code }: { lang: Lang; code: string }) {
  if (code === "schema_pending") return <p className={s.flash} data-tone="warn" role="status">{pick(lang, ...ERROR_TEXT.schema)}</p>;
  return <Unavailable lang={lang} code={code} />;
}
