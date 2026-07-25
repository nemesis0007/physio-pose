import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PhysioTwin | Movement intelligence for home rehabilitation",
  description:
    "Private movement intelligence with local video pose tracking, temporal form analysis and adaptive exercise scoring.",
  openGraph: {
    title: "PhysioTwin | Movement intelligence for rehabilitation",
    description:
      "Private video movement assessment with transparent pose tracking and therapist-owned rules.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PhysioTwin | Movement intelligence for rehabilitation",
    description:
      "Private video movement assessment with transparent pose tracking and therapist-owned rules.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
