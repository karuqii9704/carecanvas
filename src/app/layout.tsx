import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CareCanvas — Human-gated AI illustration pipeline",
  description: "A traceable multi-agent workflow for safer wellbeing illustrations, built by Rifqi Sigwan Nugraha.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
