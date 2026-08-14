import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sales CRM",
  description: "AI Sales CRM for Facebook Messenger + LINE OA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
