import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: '方卡 · 每日五次发现', description: '短而美的兴趣内容社区' };
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
