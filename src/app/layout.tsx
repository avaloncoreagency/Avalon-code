import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import { getLang } from "@/lib/i18n-server";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Avalon OS | Avalon Core Agency",
  description: "Panel privado de operaciones de Avalon Core Agency",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#050816", colorScheme: "dark" };

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const lang = await getLang();
  return <html lang={lang} className={`${sans.variable} ${display.variable}`}><body>{children}</body></html>;
}
