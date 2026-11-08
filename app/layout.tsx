import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import InAppDialogHost from '../components/InAppDialogHost';
import './style.css';
import './design-system.css';
import './settings.css';
import './composer.css';

export const metadata: Metadata = {
  applicationName: 'HEIKA',
  title: 'HEIKA',
  description: '从感兴趣的方向出发，发现每天精选的五张内容卡片。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/heika-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/heika-512.png', sizes: '512x512', type: 'image/png' },
    ],
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
  themeColor: '#ffffff',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Script id="heika-preference-bootstrap" strategy="beforeInteractive">{`try {
          const theme = localStorage.getItem('heika-theme');
          if (theme === 'dark' || theme === 'light' || theme === 'system') document.documentElement.dataset.theme = theme;
          const font = localStorage.getItem('heika-font');
          if (font === 'oppo' || font === 'system') document.documentElement.dataset.font = font;
        } catch {}`}</Script>
        {children}
        <InAppDialogHost />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
