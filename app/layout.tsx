import type { Metadata } from 'next';
import './style.css';
import './design-system.css';
export const metadata: Metadata = { title: '晶选 · 黑卡 HEIKA', description: '从感兴趣的方向出发，发现每天精选的五张内容卡片。' };
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
