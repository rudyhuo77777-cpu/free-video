'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../components/LanguageProvider';

type Project = {
  id: string;
  name: string;
  price?: string;
  sku?: string;
  targetAudience?: string;
  sellingPoints?: string[];
  painPoints?: string[];
  createdAt: string;
};
const DEMO_KEY = 'auria.product-projects.demo.v2';

const UI = {
  id: {
    eyebrow:'PRODUCT PROJECT · v0.2.2.13', title:'Satu kali input. Dipakai semua tool.', lead:'Pada mode production, Product Project sekarang disimpan server-side per signed session. Demo tetap memakai penyimpanan lokal supaya bisa dicoba tanpa Postgres.',
    product:'Nama produk', price:'Harga', sku:'SKU', target:'Target pembeli', selling:'Selling point', pain:'Pain point', save:'SIMPAN PROJECT', my:'Project saya', empty:'Belum ada project.', noPrice:'Harga belum diisi', noSelling:'Selling point belum diisi', video:'Buat video →', demo:'Demo mode: project disimpan di browser. Production mode memakai Postgres.',
    loadingError:'Gagal memuat project.', storeError:'Project store tidak tersedia.', saving:'Menyimpan Product Project…', saveError:'Gagal menyimpan project.', saved:'Project tersimpan. Data ini bisa dipakai lagi oleh Video, LIVE, foto produk dan tool lain.', targetPlaceholder:'Ibu muda, pekerja kantor, gym…', sellingPlaceholder:'Portable\nUSB-C\nMudah dicuci', painPlaceholder:'Ribet bikin jus\nTidak ada waktu'
  },
  en: {
    eyebrow:'PRODUCT PROJECT · v0.2.2.13', title:'Enter it once. Use it across every tool.', lead:'In production mode, Product Project is stored server-side per signed session. Demo mode keeps local browser storage so it can be tested without Postgres.',
    product:'Product name', price:'Price', sku:'SKU', target:'Target customer', selling:'Selling points', pain:'Pain points', save:'SAVE PROJECT', my:'My projects', empty:'No projects yet.', noPrice:'Price not entered', noSelling:'Selling points not entered', video:'Create video →', demo:'Demo mode: projects are stored in the browser. Production mode uses Postgres.',
    loadingError:'Failed to load projects.', storeError:'Project store is unavailable.', saving:'Saving Product Project…', saveError:'Failed to save project.', saved:'Project saved. This data can be reused by Video, LIVE, product-photo and other tools.', targetPlaceholder:'Young mothers, office workers, gym users…', sellingPlaceholder:'Portable\nUSB-C\nEasy to clean', painPlaceholder:'Making juice is a hassle\nNo time'
  },
  zh: {
    eyebrow:'产品项目 · v0.2.2.13', title:'只输入一次，所有工具重复使用。', lead:'正式环境中，Product Project 会按登录会话保存在服务器端。Demo 模式仍使用浏览器本地存储，因此没有 Postgres 也可以测试。',
    product:'产品名称', price:'价格', sku:'SKU', target:'目标客户', selling:'产品卖点', pain:'客户痛点', save:'保存项目', my:'我的项目', empty:'还没有项目。', noPrice:'尚未填写价格', noSelling:'尚未填写卖点', video:'制作视频 →', demo:'Demo 模式：项目保存在浏览器中。正式环境使用 Postgres。',
    loadingError:'项目加载失败。', storeError:'项目存储当前不可用。', saving:'正在保存 Product Project…', saveError:'项目保存失败。', saved:'项目已保存。这些数据可以继续用于视频、LIVE、产品图以及其他工具。', targetPlaceholder:'年轻妈妈、上班族、健身人群…', sellingPlaceholder:'便携\nUSB-C\n容易清洗', painPlaceholder:'做果汁太麻烦\n没有时间'
  }
} as const;

export default function ProjectsPage() {
  const { locale } = useLanguage(); const ui = UI[locale];
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [message, setMessage] = useState('');
  const [demo, setDemo] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ui.loadingError);
      if (data.demo) {
        setDemo(true);
        try { setProjects(JSON.parse(localStorage.getItem(DEMO_KEY) || '[]')); } catch { setProjects([]); }
      } else {
        setDemo(false);
        setProjects(data.projects || []);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : ui.storeError); }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (name.trim().length < 2) return;
    setMessage(ui.saving);
    const payload = { name, price, sku, targetAudience, sellingPoints, painPoints };
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ui.saveError);
      const project = data.project as Project;
      if (data.demo) { const next = [project, ...projects]; setProjects(next); localStorage.setItem(DEMO_KEY, JSON.stringify(next)); }
      else setProjects(current => [project, ...current]);
      setName(''); setPrice(''); setSku(''); setTargetAudience(''); setSellingPoints(''); setPainPoints('');
      setMessage(ui.saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : ui.saveError); }
  }

  return (
    <div className="container">
      <section className="section"><div className="eyebrow">{ui.eyebrow}</div><h2>{ui.title}</h2><p className="lead">{ui.lead}</p></section>
      <section className="grid-2">
        <div className="card">
          <div className="field"><label>{ui.product}</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field" style={{ marginTop: 12 }}><label>{ui.price}</label><input className="input" value={price} onChange={e => setPrice(e.target.value)} placeholder="Rp99.000" /></div>
          <div className="field" style={{ marginTop: 12 }}><label>{ui.sku}</label><input className="input" value={sku} onChange={e => setSku(e.target.value)} placeholder="BLEND-001" /></div>
          <div className="field" style={{ marginTop: 12 }}><label>{ui.target}</label><input className="input" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder={ui.targetPlaceholder} /></div>
          <div className="field" style={{ marginTop: 12 }}><label>{ui.selling}</label><textarea className="textarea" value={sellingPoints} onChange={e => setSellingPoints(e.target.value)} rows={4} placeholder={ui.sellingPlaceholder} /></div>
          <div className="field" style={{ marginTop: 12 }}><label>{ui.pain}</label><textarea className="textarea" value={painPoints} onChange={e => setPainPoints(e.target.value)} rows={3} placeholder={ui.painPlaceholder} /></div>
          <button className="primary-btn" onClick={save} style={{ marginTop: 14 }}>{ui.save}</button>
          {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}
          {demo && <div className="small" style={{ marginTop: 8 }}>{ui.demo}</div>}
        </div>
        <div className="card">
          <h3>{ui.my}</h3>
          <div className="scene-list">
            {projects.length === 0 && <p>{ui.empty}</p>}
            {projects.map((p, i) => (
              <div className="scene" key={p.id}>
                <div className="scene-num">{i + 1}</div>
                <div style={{ flex: 1 }}><strong>{p.name}</strong><div className="meta">{p.price || ui.noPrice} · {(p.sellingPoints || []).join(', ') || ui.noSelling}</div></div>
                <Link className="ghost-btn" href={`/video?project=${encodeURIComponent(p.id)}&product=${encodeURIComponent(p.name)}`}>{ui.video}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
