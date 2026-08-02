import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ThankBot — Who thanked you",
  description:
    "An appreciation board where teammates thank each other after signing in with Google.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${sans.variable} font-[family-name:var(--font-sans)] antialiased`}
      >
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
