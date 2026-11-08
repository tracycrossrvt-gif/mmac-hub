import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { demoMode } from "@/lib/demoMode";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Macon Moves Animal Care",
    template: "%s | Macon Moves Animal Care",
  },
  description:
    "Affordable veterinary care, resources, and support for families in Macon, Jackson, and Rabun Counties.",
  // Keep the portfolio demo out of search results next to MMAC's real site.
  ...(demoMode ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
