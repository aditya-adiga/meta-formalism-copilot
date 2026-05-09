import type { Metadata } from "next";
import { EB_Garamond, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt this layout into dynamic rendering so Next.js injects the per-request
  // nonce (set by proxy.ts) into its own bootstrap <script> tags during render.
  // The proxy already runs per request via its matcher; the dynamic-rendering
  // switch is what lets the rendered HTML pick up the nonce.
  await headers();

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
