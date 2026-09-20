'use client';

import Link from 'next/link';
import { useLanguage, type UiLocale } from './LanguageProvider';

const NAV = {
  id: { video: 'Video Gratis', projects: 'Product Project', tools: 'Tools', fyp: 'Cari FYP ↗' },
  en: { video: 'Free Video', projects: 'Product Project', tools: 'Tools', fyp: 'Find FYP ↗' },
  zh: { video: '免费视频', projects: '产品项目', tools: '工具', fyp: '搜索 FYP ↗' }
} as const;

const LABELS: Record<UiLocale, string> = { id: 'Bahasa Indonesia', en: 'English', zh: '中文' };

export function Nav() {
  const fypUrl = process.env.NEXT_PUBLIC_FYP_URL || 'https://fyp.eco-velo.com';
  const { locale, setLocale } = useLanguage();
  const ui = NAV[locale];
  return (
    <header className="nav-shell">
      <Link href="/" className="brand">Free Video</Link>
      <nav className="nav-links">
        <Link href="/video">{ui.video}</Link>
        <Link href="/projects">{ui.projects}</Link>
        <Link href="/tools">{ui.tools}</Link>
      </nav>
      <div className="duration-row" aria-label="Language">
        {(['id', 'en', 'zh'] as UiLocale[]).map(code => (
          <button key={code} className={`duration-chip ${locale === code ? 'active' : ''}`} onClick={() => setLocale(code)}>
            {LABELS[code]}
          </button>
        ))}
      </div>
      <a className="ghost-btn" href={`${fypUrl}?utm_source=auria_tools&utm_medium=nav&utm_campaign=fyp`} target="_blank" rel="noreferrer">
        {ui.fyp}
      </a>
    </header>
  );
}
