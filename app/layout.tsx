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
  // Read the per-request CSP nonce that middleware.ts forwards via x-nonce.
  // Next.js automatically applies it to its own bootstrap script tags when a
  // CSP with 'strict-dynamic' + nonce-... is present on the response, so we
  // just need to opt this layout out of static rendering by reading headers.
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
