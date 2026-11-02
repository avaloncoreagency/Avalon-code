import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getLang } from "@/lib/i18n-server";
import "./globals.css";

// Use existing system font stacks in globals.css. No network font download during CI builds.

export const metadata: Metadata = {
  title: "Avalon OS | Avalon Core Agency",
  description: "Panel privado de operaciones de Avalon Core Agency",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#050816", colorScheme: "dark", viewportFit: "cover" };

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const lang = await getLang();
  return <html lang={lang}><body>{children}</body></html>;
}
