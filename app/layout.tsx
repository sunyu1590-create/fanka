import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import InAppDialogHost from '../components/InAppDialogHost';
import NativeSessionBridge from '../components/NativeSessionBridge';
import './style.css';
import './design-system.css';
import './motion.css';
import './settings.css';
import './composer.css';
import './publish-tasks.css';
import './admin-bento.css';
import './public-profile.css';
import './community-access.css';
import './profile.css';
import './decor.css';
import './decor-center.css';
import './drafts.css';

export const metadata: Metadata = {
  applicationName: 'HEIKA',
  title: 'HEIKA',
  description: '从感兴趣的方向出发，发现每天精选的五张内容卡片。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/heika-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/heika-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/heika-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/heika-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/heika-32.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'HEIKA',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#101115',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Script id="heika-preference-bootstrap" strategy="beforeInteractive">{`try {
          const stored = localStorage.getItem('heika-theme');
          const mode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark';
          // 「跟随系统」必须在这一步就解析成 light / dark：CSS 只有两套令牌，
          // 原样写 "system" 匹配不到任何一组，会回落到 :root 深色，浅色机器上先黑后白。
          const resolved = mode === 'system'
            ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
            : mode;
          document.documentElement.dataset.theme = resolved;
          document.documentElement.dataset.themeMode = mode;
          const meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute('content', resolved === 'light' ? '#F6F5F1' : '#101115');
          const font = localStorage.getItem('heika-font');
          if (font === 'oppo' || font === 'system') document.documentElement.dataset.font = font;
        } catch {}`}</Script>
        {children}
        <NativeSessionBridge />
        <InAppDialogHost />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
