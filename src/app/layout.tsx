import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google"
import "./globals.css";
import { Providers } from "@/components/providers";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Pulse",
  title: {
    default: "Pulse - Personal, Private, and AI Chat",
    template: "%s | Pulse",
  },
  description:
    "Pulse is a chat workspace for personal conversations, temporary private rooms, and AI assistant threads.",
  openGraph: {
    title: "Pulse - Personal, Private, and AI Chat",
    description:
      "A chat workspace for personal conversations, temporary private rooms, and AI assistant threads.",
    url: "/",
    siteName: "Pulse",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pulse - Personal, Private, and AI Chat",
    description:
      "A chat workspace for personal conversations, temporary private rooms, and AI assistant threads.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>

      </body>
    </html>
  );
}
