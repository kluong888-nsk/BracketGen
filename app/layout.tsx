import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle, { THEME_INIT_SCRIPT } from "./theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BracketGen",
  description: "Round-robin tournament tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sets the .dark class before first paint to avoid a theme flash;
            see app/theme-toggle.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/[.08] dark:border-white/[.145]">
          <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <span className="font-semibold tracking-tight">BracketGen</span>
              <Link
                href="/"
                className="text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
              >
                Home
              </Link>
              <Link
                href="/users"
                className="text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
              >
                Users
              </Link>
            </div>
            <ThemeToggle />
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
