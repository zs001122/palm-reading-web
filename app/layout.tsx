import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "掌心小读",
  description: "上传手掌照片，获得娱乐向的掌纹观察、能量评分与温暖解析。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
