import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, normalizeLang, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  return normalizeLang((await cookies()).get(LANG_COOKIE)?.value);
}
