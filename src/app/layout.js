import './globals.css';

export const metadata = {
  title: 'DocEx · 智能结构化提取文档信息',
  description: '基于大语言模型的通用文档信息提取工具，支持双路多模态解析与多维表格推送',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
