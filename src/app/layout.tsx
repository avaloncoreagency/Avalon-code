import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avalon OS | Avalon Core Agency",
  description: "Panel privado de operaciones de Avalon Core Agency",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
