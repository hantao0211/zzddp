import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./assistant.css";
import "./homework.css";
import "./admin.css";
import "./status.css";
import "./reading.css";

export const metadata: Metadata = {
  title: "小步学习 · 每一步，都算数",
  description: "家庭学习助手：上传备忘录和纸质作业，自动分科、整理清单与检查缺项。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#995f7b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
