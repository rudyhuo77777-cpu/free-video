'use client';

import Link from 'next/link';
import { useLanguage } from '../../components/LanguageProvider';

const fypUrl = process.env.NEXT_PUBLIC_FYP_URL || 'https://fyp.eco-velo.com';

const UI = {
  id: {
    eyebrow:'SELLER TOOLBOX', title:'Bukan puluhan tool yang terpisah.', lead:'Semua tool tumbuh dari Product Project yang sama. Video gratis adalah pintu masuk; AI premium dan automation menjadi monetisasi berikutnya.', open:'Buka tool →',
    tools:[['Video Jualan Gratis','15–120 detik','GRATIS','/video'],['3 Script AI Pertama','Director + script video jualan','GRATIS','/video'],['Product Project','Simpan data produk sekali','GRATIS','/projects'],['Deskripsi Marketplace','Shopee/TikTok/Tokopedia','COMING','#'],['Script LIVE','Script jualan panjang per produk','Rp12.000','#'],['Premium AI Video','UGC / virtual model / image-to-video','PREMIUM','#']],
    fypEyebrow:'FYP SPECIALIST',fypTitle:'Cari & bedah kandidat FYP',fypBody:'Pengguna yang membutuhkan ide viral/FYP diarahkan ke proyek khusus AURIA-FYP, bukan membebani platform tools utama.',fypButton:'BUKA AURIA-FYP ↗'
  },
  en: {
    eyebrow:'SELLER TOOLBOX', title:'Not dozens of disconnected tools.', lead:'Every tool grows from the same Product Project. Free Video is the entry point; premium AI and automation become the next monetization layer.', open:'Open tool →',
    tools:[['Free Sales Video','15–120 seconds','FREE','/video'],['First 3 AI Scripts','Director + sales-video script','FREE','/video'],['Product Project','Save product data once','FREE','/projects'],['Marketplace Description','Shopee/TikTok/Tokopedia','COMING','#'],['LIVE Script','Long-form sales script per product','Rp12.000','#'],['Premium AI Video','UGC / virtual model / image-to-video','PREMIUM','#']],
    fypEyebrow:'FYP SPECIALIST',fypTitle:'Find & analyze FYP candidates',fypBody:'Users who need viral/FYP ideas are sent to the dedicated AURIA-FYP project instead of burdening the main tools platform.',fypButton:'OPEN AURIA-FYP ↗'
  },
  zh: {
    eyebrow:'卖家工具箱', title:'不是一堆互相独立的工具。', lead:'所有工具都建立在同一个 Product Project 数据之上。免费视频是入口；高级 AI 和自动化功能用于后续变现。', open:'打开工具 →',
    tools:[['免费销售视频','15–120 秒','免费','/video'],['前 3 个 AI 脚本','导演方案 + 销售视频脚本','免费','/video'],['产品项目','产品数据只需保存一次','免费','/projects'],['商城商品描述','Shopee/TikTok/Tokopedia','即将推出','#'],['LIVE 直播脚本','按产品生成长篇销售脚本','Rp12.000','#'],['高级 AI 视频','UGC / 虚拟模特 / 图生视频','高级版','#']],
    fypEyebrow:'FYP 专项工具',fypTitle:'寻找并分析 FYP 候选视频',fypBody:'需要爆款/FYP 灵感的用户进入专门的 AURIA-FYP 项目，不增加主工具平台的负担。',fypButton:'打开 AURIA-FYP ↗'
  }
} as const;

export default function ToolsPage() {
  const { locale } = useLanguage(); const ui = UI[locale];
  return (
    <div className="container">
      <section className="section"><div className="eyebrow">{ui.eyebrow}</div><h2>{ui.title}</h2><p className="lead">{ui.lead}</p></section>
      <section className="grid-3">
        {ui.tools.map(([name, desc, price, href]) => (
          <div className="card tool-card" key={name}><div><h3>{name}</h3><p>{desc}</p></div><div><div className="price">{price}</div>{href !== '#' && <Link href={href} className="ghost-btn" style={{ marginTop: 10 }}>{ui.open}</Link>}</div></div>
        ))}
        <div className="card tool-card fyp-card"><div><div className="eyebrow">{ui.fypEyebrow}</div><h3>{ui.fypTitle}</h3><p>{ui.fypBody}</p></div><a href={`${fypUrl}?utm_source=auria_tools&utm_medium=tools&utm_campaign=fyp`} className="primary-btn" target="_blank" rel="noreferrer">{ui.fypButton}</a></div>
      </section>
    </div>
  );
}
