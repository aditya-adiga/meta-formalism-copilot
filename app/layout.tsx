import type { Metadata } from "next";
import { EB_Garamond, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meta-Formalism Copilot",
  description: "Two-panel interface for input and AI-assisted output editing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ebGaramond.variable} ${geistMono.variable} font-serif antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
