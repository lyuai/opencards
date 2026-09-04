import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "OpenCards AI Coach",
  description: "Review matches, practise decisions, and improve with evidence."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
