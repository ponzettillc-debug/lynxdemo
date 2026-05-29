import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  title: "4Play",
  description: "Pick four golfers, use each only once, and compete for the lowest total score.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="fourplay-cartoon-footer" aria-label="4Play Golf cartoon footer">
          <Image
            src="/4play-cartoon-footer.png"
            alt="Cartoon golfer celebrating with 4Play Golf characters on a golf course"
            width={2048}
            height={768}
            sizes="100vw"
          />
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
