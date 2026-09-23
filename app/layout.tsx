import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Little Lens — Visual skills practice",
  description: "Explore visual skills, practise together, and track progress privately on your device. For individual or shared practice; children should have adult help.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
