import type { Metadata } from 'next';
import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import { headers } from 'next/headers';
import { AlertTriangle, Clock3, Download, Info, ShieldCheck, Smartphone } from 'lucide-react';
import styles from './download.module.css';

export const dynamic = 'force-dynamic';

type Release = {
  label: string;
  version: string;
  code?: number;
  file: string;
  size: number;
  sha256?: string;
  min_sdk?: number;
  updated?: string;
  frozen?: boolean;
  notes?: string[];
};

type Manifest = {
  updated_at?: string;
  native?: Release;
  webview?: Release;
  lite?: Release;
};

type ReleaseKind = 'native' | 'webview' | 'lite';

export const metadata: Metadata = {
  title: '下载黑卡 HEIKA',
  description: '黑卡 HEIKA 安卓客户端下载：原生版、轻量版与兼容版安装包。',
};

const ANDROID_NAMES: Record<number, string> = {
  21: '5.0', 22: '5.1', 23: '6.0', 24: '7.0', 25: '7.1', 26: '8.0',
  27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L', 33: '13',
  34: '14', 35: '15', 36: '16',
};

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const androidLabel = (sdk?: number) => (sdk ? `Android ${ANDROID_NAMES[sdk] || sdk} 以上` : '安卓设备');

const dateLabel = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await readFile('/srv/dl/manifest.json', 'utf8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return null;
  }
}

/** 三类安装包的角标，Lite 不描述为功能残缺版本。 */
function badgeOf(kind: ReleaseKind, release: Release) {
  if (release.frozen) return { text: '兼容版 · 已停止更新', icon: <Clock3 size={12} /> };
  if (kind === 'lite') return { text: '轻量版 · 低配与平板', icon: <Download size={12} /> };
  if (kind === 'webview') return { text: '兼容版', icon: <Clock3 size={12} /> };
  return { text: '原生版 · 推荐', icon: <Smartphone size={12} /> };
}

function ReleaseCard({ release, primary, kind }: { release: Release; primary: boolean; kind: ReleaseKind }) {
  const href = `/dl/${release.file}`;
  const badge = badgeOf(kind, release);
  return (
    <section className={`${styles.card} ${primary ? styles.cardPrimary : ''}`}>
      <div className={styles.cardHead}>
        <div className={styles.version}>
          {release.version}
          {release.code ? <small>build {release.code}</small> : null}
        </div>
        <span className={`${styles.badge} ${primary ? '' : styles.badgeMuted}`}>
          {badge.icon}
          {badge.text}
        </span>
      </div>
      <div className={styles.meta}>
        <span><b>{sizeLabel(release.size)}</b></span>
        {release.updated ? <span>更新于 {dateLabel(release.updated)}</span> : null}
        <span>{androidLabel(release.min_sdk)}</span>
      </div>
      <a className={`${styles.download} ${primary ? '' : styles.downloadGhost}`} href={href} download>
        <Download size={17} />
        {kind === 'lite'
          ? `下载轻量版（${sizeLabel(release.size)}）`
          : primary
            ? `下载安装包（${sizeLabel(release.size)}）`
            : '下载兼容版'}
      </a>
      {release.notes?.length ? (
        <details className={styles.notes}>
          <summary>本版更新</summary>
          <ul>
            {release.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export default async function DownloadPage() {
  const manifest = await loadManifest();
  const ua = (await headers()).get('user-agent') || '';
  const inWeChat = /MicroMessenger/i.test(ua);
  const onIOS = /iPhone|iPad|iPod/i.test(ua);
  const native = manifest?.native;
  const webview = manifest?.webview;
  const lite = manifest?.lite;
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.top}>
          <Link href="/" className={styles.brand}>黑卡<span>HEIKA</span></Link>
          <Link href="/" className={styles.back}>返回首页</Link>
        </div>
        <div className={styles.hero}>
          <div className={styles.heroText}>
            {/* 品牌图标 + 标题，去掉原先标题上方的英文小标 */}
            <img className={styles.appIcon} src="/icons/heika-192.png" alt="黑卡应用图标" width={56} height={56} />
            <h1>下载黑卡</h1>
            <p>翻开未知，遇见新的想法。原生客户端更顺滑，支持离线缓存与消息推送。</p>
          </div>
          <figure className={styles.qr}>
            {/* 二维码由构建时生成，指向本页地址 */}
            <img src="/qr-download.png" alt="扫码打开下载页" width={396} height={396} />
            <figcaption>扫码在手机打开</figcaption>
          </figure>
        </div>
        {inWeChat ? (
          <div className={styles.notice}>
            <AlertTriangle size={16} />
            <span><strong>正在微信内打开。</strong>微信不允许直接下载安装包，请点右上角「···」，选择「在浏览器打开」后再下载。</span>
          </div>
        ) : null}
        {onIOS ? (
          <div className={styles.notice}>
            <AlertTriangle size={16} />
            <span><strong>当前是 iPhone / iPad。</strong>iOS 无法安装安卓安装包，直接<Link href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>用网页版</Link>即可，功能一致。</span>
          </div>
        ) : null}
        {!onIOS ? (
          <div className={styles.notice}>
            <Info size={16} />
            <span><strong>网络连接提示。</strong>黑卡服务器位于新加坡。部分地区直连下载可能较慢或中断；如果下载停滞，可以切换到能够稳定连接新加坡地区的网络后重新下载，通常会更顺畅。已下载的部分支持续传。</span>
          </div>
        ) : null}
        {native ? <ReleaseCard release={native} primary kind="native" /> : null}
        {lite ? <ReleaseCard release={lite} primary={false} kind="lite" /> : null}
        {webview ? <ReleaseCard release={webview} primary={false} kind="webview" /> : null}
        {!native && !webview && !lite ? (
          <div className={styles.empty}>
            安装包暂未发布。请稍后再来，或先<Link href="/" style={{ color: 'inherit' }}>使用网页版</Link>。
          </div>
        ) : null}
        <div className={styles.sectionTitle}><ShieldCheck size={13} />版本怎么选</div>
        <ul className={styles.steps}>
          <li><b>原生版</b>：完整原生体验，功能最全，安装包约 30 MB。</li>
          <li><b>轻量版</b>：安装包很小，适合低性能手机、旧设备与平板；与原生版共用同一账号，可同时安装。</li>
          <li><b>兼容版</b>：早期设备的备用安装包，已停止更新。</li>
        </ul>
        <div className={styles.sectionTitle}><ShieldCheck size={13} />安装说明</div>
        <ol className={styles.steps}>
          <li>点击下载后，浏览器会提示「<b>下载文件</b>」，确认保存。</li>
          <li>打开下载好的 APK，系统可能提示「<b>未知来源</b>」，需要允许浏览器安装应用。</li>
          <li>安装完成后打开，用你的<b>邮箱和密码</b>登录，原有的收藏与会员权益都在。</li>
        </ol>
        {native?.sha256 ? (
          <div className={styles.hash}>
            SHA-256 · {native.sha256}
          </div>
        ) : null}
        {lite?.sha256 ? (
          <div className={styles.hash}>
            轻量版 SHA-256 · {lite.sha256}
          </div>
        ) : null}
        <div className={styles.notice} style={{ marginTop: 18 }}>
          <Info size={16} />
          <span>安装包由 moonclean.shop 直接分发，不经过第三方网盘。若下载中断，重新点击即可从断点继续。</span>
        </div>
        <div className={styles.footer}>
          <span>HEIKA · 黑卡</span>
          <span>{manifest?.updated_at ? `安装包更新于 ${dateLabel(manifest.updated_at)}` : 'moonclean.shop'}</span>
        </div>
      </div>
    </main>
  );
}
