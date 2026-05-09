import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpectraQ — Quantitative Finance Infrastructure",
  description:
    "Institutional-grade non-custodial trading infrastructure on Solana and Yellow Protocol. Private strategies. Verifiable returns. Cross-chain settlement.",
  metadataBase: new URL("https://spectraq.org"),
  openGraph: {
    title: "SpectraQ — Quantitative Finance Infrastructure",
    description:
      "Institutional-grade non-custodial trading infrastructure on Solana and Yellow Protocol.",
    type: "website",
    url: "https://spectraq.org",
    siteName: "SpectraQ",
  },
  twitter: {
    card: "summary_large_image",
    title: "SpectraQ — Quantitative Finance Infrastructure",
    description: "Private strategies. Verifiable returns. Cross-chain settlement on Solana.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
