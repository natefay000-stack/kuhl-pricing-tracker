import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KÜHL Pricing Tracker",
  description: "Track MSRP, Wholesale, and Cost by Season",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
