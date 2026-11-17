import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldAlert } from "lucide-react";
import styles from "./link-warning.module.css";

export const metadata: Metadata = {
  title: "即将离开黑卡 · 外部链接提示",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ u?: string }> };

function parseTarget(raw: string | undefined) {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export default async function LinkWarningPage({ searchParams }: Props) {
  const params = await searchParams;
  const target = parseTarget(params.u);
  const host = target?.hostname ?? "";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.mark} aria-hidden="true">
          <ShieldAlert size={26} />
        </span>
        <h1>你正在离开黑卡</h1>
        {target ? (
          <>
            <p className={styles.lead}>
              接下来要打开的是站外地址，它不属于黑卡，也不受黑卡管理。
            </p>
            <p className={styles.target} title={target.href}>
              <span>{host}</span>
              <small>{decodeURI(target.pathname).slice(0, 80) || "/"}</small>
            </p>
            <ul className={styles.risks}>
              <li>站外页面可能要求你登录、付款或下载文件，请先确认来源可信。</li>
              <li>不要在任何站外页面输入黑卡账号、密码或恢复码。</li>
              <li>下载可执行文件前请自行确认安全性，尤其是安装包与脚本。</li>
            </ul>
            <p className={styles.disclaimer}>
              继续访问即表示你理解并自行承担由此产生的风险，黑卡不对站外内容负责。
            </p>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href={target.href}
                target="_blank"
                rel="nofollow noopener noreferrer"
              >
                继续访问
                <ExternalLink size={16} />
              </a>
              <Link className={styles.secondary} href="/">
                返回黑卡
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className={styles.lead}>这个链接无效，或者不是可以打开的站外地址。</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/">
                返回黑卡
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
