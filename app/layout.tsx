import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import Script from "next/script";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const barlow = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-barlow", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Apex Timing — 2026 F1 timing", template: "%s · Apex Timing" },
  description: "2026 Formula 1 timing, results and analysis with explicit data provenance: live, historical or simulated.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090A0D",
};

// Applies the saved theme before first paint to avoid a flash of the wrong palette.
const themeScript = `try{var s=JSON.parse(localStorage.getItem("apex.settings.v1")||"{}");if(s.theme==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-theme="dark" className={`${inter.variable} ${barlow.variable}`} suppressHydrationWarning>
      <body>
        <Script id="apex-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
