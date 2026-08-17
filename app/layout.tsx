import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const socialImage = host
    ? `${protocol}://${host}/og-v2.png`
    : "/og-v2.png";

  return {
    title: "PhysioTwin | AI-guided home rehabilitation",
    description:
      "Private on-device pose tracking with Cloudflare-powered session scoring, real-time coaching and clinician-ready rehabilitation summaries.",
    openGraph: {
      title: "PhysioTwin | Move with confidence",
      description:
        "AI-guided home rehabilitation with private video and cloud-calculated movement summaries.",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: "PhysioTwin | Move with confidence",
      description:
        "AI-guided home rehabilitation with private video and cloud-calculated movement summaries.",
      images: [socialImage],
    },
  };
}

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
