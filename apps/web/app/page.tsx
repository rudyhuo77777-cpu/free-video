'use client';

import Link from 'next/link';
import { useLanguage } from '../components/LanguageProvider';

const fypUrl = process.env.NEXT_PUBLIC_FYP_URL || 'https://fyp.eco-velo.com';

const UI = {
  id: {
    eyebrow: 'CHATGPT + FREE VIDEO',
    title: '120 Detik. Gratis. Tanpa Kredit Video.',
    lead: 'Masukkan nama produk, upload foto, pilih durasi. Free Video bantu bikin script, storyboard, footage, subtitle dan animasi. Render dasarnya dilakukan di perangkat kamu supaya tetap murah dan bisa gratis.',
    make: 'BUAT VIDEO GRATIS', project: 'Buat Product Project',
    badges: ['15 / 30 / 60 / 90 / 120 detik', '3 Script AI gratis', 'Video dasar tetap gratis', 'PWA-first'],
    cost: 'Strategi biaya', costBody: 'untuk render dasar di sisi pengguna. Server fokus ke Auth, script AI, credits, project data dan Media Broker.',
    notice: 'Butuh inspirasi video yang sedang ramai atau ingin membedah pola FYP? Gunakan proyek khusus FYP setelah video dasar kamu jadi.',
    fyp: 'Analisis FYP di fyp.eco-velo.com ↗',
    centerEyebrow: 'SATU PRODUK, BANYAK TOOL', centerTitle: 'Product Project adalah pusat datanya.',
    cards: [
      ['Video Gratis', 'Gunakan gambar produk, footage publik, template, subtitle dan animasi. AI hanya membuat keputusan kreatif.'],
      ['Script LIVE', 'Product data dipakai ulang. Tidak perlu input nama, harga dan selling point berkali-kali.'],
      ['Tools Penjual', 'Deskripsi marketplace, iklan, foto produk, kalkulator dan tool gratis lain tumbuh di atas data produk yang sama.']
    ],
    pillars: [
      ['AI = Director', 'AI mengeluarkan Director JSON, bukan kode video baru setiap kali.'],
      ['Device = Studio', 'Canvas/WebCodecs/Mediabunny melakukan render dasar di perangkat pengguna.'],
      ['Cloud = Control', 'Queue, credits, auth, media broker dan project data tetap ringan dan dapat diskalakan horizontal.']
    ],
    footer: 'Free Video · 120 Detik. Gratis. Tanpa Kredit Video.'
  },
  en: {
    eyebrow: 'CHATGPT + FREE VIDEO',
    title: '120 Seconds. Free. No Video Credits.',
    lead: 'Enter a product name, upload a photo, and choose the duration. Free Video helps create the script, storyboard, footage, subtitles, and animation. Basic rendering runs on your device so the service can stay inexpensive and free.',
    make: 'CREATE FREE VIDEO', project: 'Create Product Project',
    badges: ['15 / 30 / 60 / 90 / 120 seconds', '3 free AI Scripts', 'Basic video stays free', 'PWA-first'],
    cost: 'Cost strategy', costBody: 'for basic rendering on the user side. The server focuses on Auth, AI scripts, credits, project data, and the Media Broker.',
    notice: 'Need inspiration from trending videos or want to break down FYP patterns? Use the dedicated FYP project after your basic video is ready.',
    fyp: 'Analyze FYP at fyp.eco-velo.com ↗',
    centerEyebrow: 'ONE PRODUCT, MANY TOOLS', centerTitle: 'Product Project is the data hub.',
    cards: [
      ['Free Video', 'Use product images, public footage, templates, subtitles, and animation. AI only makes the creative decisions.'],
      ['LIVE Script', 'Reuse product data. No need to enter the name, price, and selling points again and again.'],
      ['Seller Tools', 'Marketplace descriptions, ads, product photos, calculators, and other free tools grow on the same product data.']
    ],
    pillars: [
      ['AI = Director', 'AI outputs Director JSON instead of generating new video code every time.'],
      ['Device = Studio', 'Canvas/WebCodecs/Mediabunny perform basic rendering on the user device.'],
      ['Cloud = Control', 'Queue, credits, auth, media broker, and project data stay lightweight and horizontally scalable.']
    ],
    footer: 'Free Video · Up to 120 seconds, free basic rendering.'
  },
  zh: {
    eyebrow: 'CHATGPT + FREE VIDEO',
    title: '全球首款免费生成超长视频120秒的网站',
    lead: '输入产品名称、上传照片、选择时长。Free Video 帮你生成脚本、故事板、素材、字幕和动画。基础渲染在你的设备本地完成，因此成本更低，也可以长期免费。',
    make: '制作免费视频', project: '创建产品项目',
    badges: ['15 / 30 / 60 / 90 / 120 秒', '前 3 个 AI 脚本免费', '基础视频永久免费', 'PWA 优先'],
    cost: '成本策略', costBody: '基础渲染在用户设备本地完成。服务器主要负责身份验证、AI 脚本、积分、项目数据和素材代理。',
    notice: '需要热门视频灵感，或者想分析 FYP 爆款结构？基础视频完成后，可以继续使用专门的 AURIA-FYP 项目。',
    fyp: '前往 fyp.eco-velo.com 分析 FYP ↗',
    centerEyebrow: '一个产品，多种工具', centerTitle: 'Product Project 是统一的数据中心。',
    cards: [
      ['免费视频', '使用产品图、公共素材、模板、字幕和动画。AI 只负责创意决策。'],
      ['LIVE 直播脚本', '重复使用产品数据，不需要反复填写名称、价格和卖点。'],
      ['卖家工具', '商城描述、广告、产品图、计算器以及其他免费工具，都建立在同一套产品数据之上。']
    ],
    pillars: [
      ['AI = 导演', 'AI 输出 Director JSON，而不是每次重新生成一套视频代码。'],
      ['设备 = 工作室', 'Canvas / WebCodecs / Mediabunny 在用户设备本地完成基础渲染。'],
      ['云端 = 控制层', '队列、积分、身份验证、素材代理和项目数据保持轻量，并可横向扩展。']
    ],
    footer: 'Free Video · 全球首款免费生成超长视频120秒的网站'
  }
} as const;

export default function HomePage() {
  const { locale } = useLanguage();
  const ui = UI[locale];
  return (
    <div className="container">
      <section className="hero">
        <div>
          <div className="eyebrow">{ui.eyebrow}</div>
          <h1>{ui.title}</h1>
          <p className="lead">{ui.lead}</p>
          <div className="hero-actions">
            <Link href="/video" className="primary-btn">{ui.make}</Link>
            <Link href="/projects" className="secondary-btn">{ui.project}</Link>
          </div>
          <div className="badges">{ui.badges.map(x => <span className="badge" key={x}>{x}</span>)}</div>
        </div>
        <div className="hero-card">
          <div>
            <div className="small">{ui.cost}</div>
            <div className="metric">≈ Rp0</div>
            <p>{ui.costBody}</p>
          </div>
          <div className="notice">{ui.notice}</div>
          <a className="ghost-btn" href={`${fypUrl}?utm_source=auria_tools&utm_medium=landing&utm_campaign=fyp`} target="_blank" rel="noreferrer">{ui.fyp}</a>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><div><div className="eyebrow">{ui.centerEyebrow}</div><h2>{ui.centerTitle}</h2></div></div>
        <div className="grid-3">{ui.cards.map(([t,b]) => <div className="card" key={t}><h3>{t}</h3><p>{b}</p></div>)}</div>
      </section>

      <section className="section">
        <div className="grid-3">{ui.pillars.map(([t,b], i) => <div className="card" key={t}><div className="eyebrow">0{i+1}</div><h3>{t}</h3><p>{b}</p></div>)}</div>
      </section>

      <footer className="footer">{ui.footer}</footer>
    </div>
  );
}
