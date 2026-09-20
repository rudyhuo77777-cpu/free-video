'use client';

import { useEffect, useState } from 'react';
import type { AssetSearchResult, DirectorJson, SceneAssetAssignment, VideoDuration } from '@auria/core';
import { renderDirectorToMp4 } from '../../lib/client/video-renderer';
import { detectLocalTts, synthesizeLocal } from '../../lib/client/tts';
import { TurnstileBox } from '../../components/TurnstileBox';
import { useLanguage, type UiLocale } from '../../components/LanguageProvider';

const DURATIONS: VideoDuration[] = [15, 30, 60, 90, 120];

const UI = {
  id: {
    languageLabel: 'Bahasa Indonesia',
    eyebrow: 'VIDEO JUALAN GRATIS · v0.2.2.13',
    title: 'Masukkan produk. Free Video jadi director. HP kamu jadi studio.',
    lead: 'Director dan Media Broker ada di cloud; decoding stock footage, subtitle, animasi dan MP4 final dikerjakan di perangkat. Untuk seller yang ingin memburu pola video FYP, hasil diarahkan ke AURIA-FYP.',
    productName: 'Nama produk',
    productPhoto: 'Foto produk (opsional)',
    duration: 'Durasi',
    voiceUpload: 'Voice lokal WAV (opsional, untuk uji audio track)',
    voiceHelp: 'Renderer akan memotong/menambah silence agar audio tepat sepanjang video. Natural Voice Pack Supertonic tetap menjadi modul on-device terpisah, bukan API cloud berbayar.',
    projectActive: 'Product Project aktif.',
    projectActiveBody: 'Harga, target dan selling point tersimpan akan dipakai sebagai konteks script.',
    fypActive: 'FYP DNA aktif.',
    fypActiveBody: 'Director berikutnya akan mengadaptasi hasil analisis dari fyp.eco-velo.com.',
    freeScriptsSuffix: 'Script AI gratis tersisa.',
    freeRender: 'Render video dasar tidak mengurangi jatah script.',
    howTo: 'CARA MEMBUAT VIDEO',
    steps: [
      'Masukkan nama produk',
      'Upload foto produk jika ada',
      'Pilih durasi 15–120 detik',
      'Klik BUAT SCRIPT + VIDEO PLAN',
      'Tunggu footage dan voice siap',
      'Klik RENDER → setelah selesai klik DOWNLOAD MP4'
    ],
    creating: 'MEMBUAT…',
    createPlan: 'BUAT SCRIPT + VIDEO PLAN',
    searching: 'MENCARI…',
    prepareFootage: 'SIAPKAN FOOTAGE GRATIS',
    checkVoice: 'CEK LOCAL VOICE',
    makingVoice: 'MEMBUAT VOICE…',
    makeVoice: 'BUAT VOICE LOKAL F5',
    localTts: 'Local TTS',
    previewAlt: 'Produk',
    seconds: 'DETIK',
    previewFallback: 'Produk kamu',
    previewNote: 'Preview konsep. MP4 final dirender lokal.',
    sceneWord: 'scene',
    directorJson: 'DIRECTOR JSON',
    downloadMp4: 'UNDUH MP4',
    projectLoaded: 'Product Project dimuat. Script berikutnya memakai data produk yang sudah tersimpan.',
    fypReturned: 'Strategi AURIA-FYP sudah kembali ke Video Studio. Script berikutnya akan memakai Viral DNA ini sebagai konteks director.',
    localRender: 'LOCAL RENDER',
    mp4OnDevice: 'MP4 dibuat di device',
    renderBody: 'Free Video dapat mendecode footage Pixabay/Pexels langsung di browser melalui URL provider. Kalau CORS/codec suatu file gagal, scene otomatis jatuh kembali ke foto produk/template tanpa menggagalkan seluruh video.',
    render: 'RENDER',
    free: 'GRATIS',
    fallbackScenes: 'scene memakai fallback lokal karena stock file tidak bisa didecode di browser.',
    needFyp: 'BUTUH VIDEO YANG LEBIH FYP?',
    fypTitle: 'Jangan menebak pola viral.',
    fypBody: 'AURIA-FYP mencari kandidat referensi lalu membedah hook, emosi, struktur dan Viral DNA. Produkmu ikut dikirim sebagai konteks supaya alurnya nyambung.',
    fypButton: 'CARI POLA FYP UNTUK PRODUK INI ↗',
    mediaBroker: 'MEDIA BROKER',
    usedFootage: 'Footage yang benar-benar dipakai',
    productLocal: 'product/local',
    stock: 'stock',
    creator: 'creator',
    source: 'Lihat sumber ↗'
  },
  en: {
    languageLabel: 'English',
    eyebrow: 'FREE SALES VIDEO · v0.2.2.13',
    title: 'Enter your product. Free Video becomes the director. Your device becomes the studio.',
    lead: 'Director and Media Broker run in the cloud; stock-footage decoding, subtitles, animation, and the final MP4 are handled on your device. Sellers who want to study FYP patterns can continue to AURIA-FYP.',
    productName: 'Product name',
    productPhoto: 'Product photo (optional)',
    duration: 'Duration',
    voiceUpload: 'Local WAV voice (optional, for audio-track testing)',
    voiceHelp: 'The renderer trims or pads silence so the audio matches the video length. Supertonic Natural Voice Pack remains a separate on-device module, not a paid cloud TTS API.',
    projectActive: 'Product Project active.',
    projectActiveBody: 'Saved price, target audience, and selling points will be used as script context.',
    fypActive: 'FYP DNA active.',
    fypActiveBody: 'The next Director run will adapt analysis from fyp.eco-velo.com.',
    freeScriptsSuffix: 'free AI Scripts left.',
    freeRender: 'Basic video rendering does not reduce your script quota.',
    howTo: 'HOW TO MAKE A VIDEO',
    steps: [
      'Enter the product name',
      'Upload a product photo if available',
      'Choose 15–120 seconds',
      'Click CREATE SCRIPT + VIDEO PLAN',
      'Wait until footage and voice are ready',
      'Click RENDER → when finished, click DOWNLOAD MP4'
    ],
    creating: 'CREATING…',
    createPlan: 'CREATE SCRIPT + VIDEO PLAN',
    searching: 'SEARCHING…',
    prepareFootage: 'PREPARE FREE FOOTAGE',
    checkVoice: 'CHECK LOCAL VOICE',
    makingVoice: 'CREATING VOICE…',
    makeVoice: 'CREATE LOCAL F5 VOICE',
    localTts: 'Local TTS',
    previewAlt: 'Product',
    seconds: 'SECONDS',
    previewFallback: 'Your product',
    previewNote: 'Concept preview. Final MP4 is rendered locally.',
    sceneWord: 'scenes',
    directorJson: 'DIRECTOR JSON',
    downloadMp4: 'DOWNLOAD MP4',
    projectLoaded: 'Product Project loaded. The next script will use the saved product data.',
    fypReturned: 'The AURIA-FYP strategy is back in Video Studio. The next script will use this Viral DNA as director context.',
    localRender: 'LOCAL RENDER',
    mp4OnDevice: 'MP4 is made on your device',
    renderBody: 'Free Video can decode Pixabay/Pexels footage directly in the browser through provider URLs. If CORS or codec decoding fails for a file, that scene automatically falls back to the product photo/local template instead of failing the whole video.',
    render: 'RENDER',
    free: 'FREE',
    fallbackScenes: 'scenes used a local fallback because stock files could not be decoded in the browser.',
    needFyp: 'NEED A MORE FYP-READY VIDEO?',
    fypTitle: 'Do not guess what goes viral.',
    fypBody: 'AURIA-FYP finds reference candidates and breaks down hooks, emotion, structure, and Viral DNA. Your product is passed along as context so the workflow stays connected.',
    fypButton: 'FIND FYP PATTERNS FOR THIS PRODUCT ↗',
    mediaBroker: 'MEDIA BROKER',
    usedFootage: 'Footage actually used',
    productLocal: 'product/local',
    stock: 'stock',
    creator: 'creator',
    source: 'View source ↗'
  },
  zh: {
    languageLabel: '中文',
    eyebrow: '免费视频生成 · v0.2.2.13',
    title: '输入产品，Free Video 当导演，你的设备就是视频工作室。',
    lead: 'Director 和 Media Broker 在云端工作；第三方素材解码、字幕、动画和最终 MP4 合成在你的设备本地完成。如果需要研究 FYP 爆款结构，可以继续进入 AURIA-FYP。',
    productName: '产品名称',
    productPhoto: '产品图片（可选）',
    duration: '视频时长',
    voiceUpload: '本地 WAV 语音（可选，用于音轨测试）',
    voiceHelp: 'Renderer 会自动裁剪或补静音，让音频与视频时长一致。Supertonic Natural Voice Pack 仍然是独立的本地设备模块，不是付费云端 TTS API。',
    projectActive: 'Product Project 已启用。',
    projectActiveBody: '已保存的价格、目标客户和卖点会作为脚本生成的上下文。',
    fypActive: 'FYP DNA 已启用。',
    fypActiveBody: '下一次 Director 会参考并适配 fyp.eco-velo.com 的分析结果。',
    freeScriptsSuffix: '个免费 AI 脚本剩余。',
    freeRender: '基础视频渲染不会消耗脚本额度。',
    howTo: '视频生成操作说明',
    steps: [
      '输入产品名称',
      '有产品图就上传',
      '选择 15–120 秒',
      '点击 生成脚本 + 视频方案',
      '等待素材和语音准备完成',
      '点击 渲染 → 完成后点击 下载 MP4'
    ],
    creating: '生成中…',
    createPlan: '生成脚本 + 视频方案',
    searching: '搜索中…',
    prepareFootage: '准备免费素材',
    checkVoice: '检查本地语音',
    makingVoice: '生成语音中…',
    makeVoice: '生成本地 F5 语音',
    localTts: '本地 TTS',
    previewAlt: '产品',
    seconds: '秒',
    previewFallback: '你的产品',
    previewNote: '概念预览，最终 MP4 在本地设备生成。',
    sceneWord: '个场景',
    directorJson: '导演 JSON',
    downloadMp4: '下载 MP4',
    projectLoaded: 'Product Project 已加载。下一次生成脚本会使用已保存的产品数据。',
    fypReturned: 'AURIA-FYP 策略已返回 Video Studio。下一次生成脚本会把这份 Viral DNA 作为导演上下文。',
    localRender: '本地渲染',
    mp4OnDevice: 'MP4 在你的设备本地生成',
    renderBody: 'Free Video 可以通过素材提供方 URL 在浏览器中直接解码 Pixabay/Pexels 素材。如果某个文件因为 CORS 或编码格式无法读取，该场景会自动回退到产品图/本地模板，不会让整条视频失败。',
    render: '渲染',
    free: '免费',
    fallbackScenes: '个场景因为第三方素材无法在浏览器中解码，已使用本地回退方案。',
    needFyp: '需要更容易上 FYP 的视频？',
    fypTitle: '不要靠猜测判断爆款结构。',
    fypBody: 'AURIA-FYP 会寻找参考候选，并分析钩子、情绪、结构和 Viral DNA。产品信息也会作为上下文一起传递，让整个流程保持连贯。',
    fypButton: '搜索这个产品的 FYP 爆款结构 ↗',
    mediaBroker: '素材中心',
    usedFootage: '实际使用的第三方素材',
    productLocal: '产品/本地',
    stock: '素材',
    creator: '作者',
    source: '查看来源 ↗'
  }
} as const;

export default function VideoPage() {
  const [productName, setProductName] = useState('Portable Blender');
  const [duration, setDuration] = useState<VideoDuration>(30);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [narrationWav, setNarrationWav] = useState<Blob | null>(null);
  const [narrationSource, setNarrationSource] = useState<'manual' | 'auto' | null>(null);
  const [director, setDirector] = useState<DirectorJson | null>(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('free-video.mp4');
  const [assets, setAssets] = useState<AssetSearchResult[]>([]);
  const [sceneAssets, setSceneAssets] = useState<Record<string, AssetSearchResult | null>>({});
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetFallbacks, setAssetFallbacks] = useState<string[]>([]);
  const [ttsStatus, setTtsStatus] = useState<string>('unknown');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [fypContext, setFypContext] = useState('');
  const [productProjectId, setProductProjectId] = useState<string | null>(null);
  const [productContext, setProductContext] = useState('');

  const [scriptsRemaining, setScriptsRemaining] = useState(3);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const { locale, setLocale } = useLanguage();
  const ui = UI[locale];
  const msg = (id: string, en: string, zh: string) => locale === 'id' ? id : locale === 'en' ? en : zh;
  const startupLocale = () => {
    try {
      const stored = localStorage.getItem('auria.ui.locale');
      if (stored === 'id' || stored === 'en' || stored === 'zh') return stored as UiLocale;
    } catch { /* fall through to context locale */ }
    return locale;
  };
  const startupText = (key: 'projectLoaded' | 'fypReturned') => UI[startupLocale()][key];

  async function refreshQuota() {
    try {
      const res = await fetch('/api/scripts/quota', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && typeof data.remaining === 'number') setScriptsRemaining(data.remaining);
    } catch { /* UI hint only; server remains authoritative. */ }
  }

  useEffect(() => {
    void refreshQuota();
    const params = new URLSearchParams(window.location.search);
    const product = params.get('product');
    if (product) setProductName(product.slice(0, 120));
    const project = params.get('project');
    if (project) {
      fetch('/api/projects', { cache: 'no-store' })
        .then(async res => ({ ok: res.ok, data: await res.json() }))
        .then(({ ok, data }) => {
          if (!ok) return;
          const found = (data.projects || []).find((p: any) => p.id === project);
          if (!found) return;
          setProductProjectId(found.id);
          setProductName(found.name);
          setProductContext([
            found.price ? `Harga: ${found.price}` : '',
            found.targetAudience ? `Target: ${found.targetAudience}` : '',
            Array.isArray(found.sellingPoints) && found.sellingPoints.length ? `Selling points: ${found.sellingPoints.join(', ')}` : '',
            Array.isArray(found.painPoints) && found.painPoints.length ? `Pain points: ${found.painPoints.join(', ')}` : ''
          ].filter(Boolean).join('\n'));
          setMessage(startupText('projectLoaded'));
        }).catch(() => undefined);
    }
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('fyp_token');
    if (token) {
      fetch('/api/fyp/handoff/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store'
      })
        .then(async res => ({ ok: res.ok, data: await res.json() }))
        .then(({ ok, data }) => {
          if (!ok || !data.handoff) return;
          const h = data.handoff;
          if (h.productName) setProductName(String(h.productName).slice(0, 120));
          if ([15, 30, 60, 90, 120].includes(Number(h.duration))) setDuration(Number(h.duration) as VideoDuration);
          const context = [h.viralHook, h.directorHints].filter(Boolean).join('\n');
          setFypContext(context);
          setMessage(startupText('fypReturned'));
          history.replaceState({}, '', `/video?product=${encodeURIComponent(String(h.productName || productName))}`);
        })
        .catch(() => undefined);
    }
  }, []);

  async function onImage(file?: File) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setMessage(msg('Ukuran foto terlalu besar. Maksimal 12 MB untuk MVP.', 'The product photo is too large. Maximum 12 MB for the MVP.', '产品图片太大，MVP 版本最大支持 12 MB。'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  function onNarration(file?: File) {
    if (!file) {
      setNarrationWav(null);
      setNarrationSource(null);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setMessage(msg('File voice terlalu besar. Maksimal 30 MB untuk uji local voice.', 'The voice file is too large. Maximum 30 MB for local-voice testing.', '语音文件太大，本地语音测试最大支持 30 MB。'));
      return;
    }
    setNarrationWav(file);
    setNarrationSource('manual');
  }

  async function checkLocalVoice() {
    const result = await detectLocalTts();
    setTtsStatus(result);
    setMessage(result === 'ready'
      ? msg('Natural Voice Pack siap dipakai.', 'Natural Voice Pack is ready.', 'Natural Voice Pack 已可使用。')
      : result === 'not-installed'
        ? msg('Perangkat mendukung local TTS, tetapi Natural Voice Pack belum dipasang. Untuk v0.2.2 kamu bisa uji mux audio dengan WAV lokal.', 'This device supports local TTS, but Natural Voice Pack is not installed. In v0.2.2 you can still test audio muxing with a local WAV.', '此设备支持本地 TTS，但尚未安装 Natural Voice Pack。v0.2.2 仍可使用本地 WAV 测试音轨合成。')
        : msg('Perangkat ini belum cocok untuk Natural Voice Pack. Video tetap bisa dibuat dengan subtitle.', 'This device is not compatible with Natural Voice Pack yet. Video can still be made with subtitles.', '此设备暂不适配 Natural Voice Pack，但仍可制作带字幕的视频。'));
  }

  async function createLocalVoice() {
    if (!director) return;
    setVoiceLoading(true);
    setMessage(msg('Membuat voice Bahasa Indonesia di perangkat lokal…', 'Creating the local Indonesian voice…', '正在本地设备生成印尼语语音…'));
    try {
      const text = director.scenes.map(scene => scene.voice.trim()).filter(Boolean).join('. ');
      const wav = await synthesizeLocal(text, 'F5');
      setNarrationWav(wav);
      setNarrationSource('auto');
      setTtsStatus('ready');
      setMessage(msg('Voice lokal F5 selesai. WAV siap dimasukkan ke MP4 tanpa API TTS cloud.', 'Local F5 voice is ready. The WAV can be muxed into MP4 without a cloud TTS API.', '本地 F5 语音已生成，可直接合成进 MP4，不需要云端 TTS API。'));
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'local_tts_not_installed'
        ? msg('Local Voice belum tersedia. Untuk Windows, jalankan START-VOICE-BRIDGE-WINDOWS.ps1. Di PWA produksi, pasang Natural Voice Pack browser.', 'Local Voice is not available. On Windows, run START-VOICE-BRIDGE-WINDOWS.ps1. In the production PWA, install the browser Natural Voice Pack.', '本地语音尚不可用。Windows 请运行 START-VOICE-BRIDGE-WINDOWS.ps1；正式 PWA 需安装浏览器 Natural Voice Pack。')
        : (error instanceof Error ? error.message : msg('Gagal membuat voice lokal.', 'Failed to create local voice.', '本地语音生成失败。')));
    } finally {
      setVoiceLoading(false);
    }
  }

  async function createDirector() {
    setStatus('creating');
    setMessage(msg('Membuat script dan Director JSON…', 'Creating the script and Director JSON…', '正在生成脚本和 Director JSON…'));
    setDirector(null);
    setAssets([]);
    setSceneAssets({});
    setAssetFallbacks([]);
    if (narrationSource === 'auto') {
      setNarrationWav(null);
      setNarrationSource(null);
    }
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch('/api/scripts/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, duration, idempotencyKey, fypContext, productContext, productProjectId, turnstileToken })
      });
      const first = await res.json();
      if (!res.ok) {
        if (first.error === 'free_script_limit_reached') throw new Error(msg('3 Script AI gratis sudah digunakan. Video dari script lama tetap bisa dibuat gratis.', 'All 3 free AI Scripts have been used. Videos from existing scripts can still be rendered for free.', '3 个免费 AI 脚本已经用完，但已有脚本仍然可以继续免费生成视频。'));
        if (first.error === 'rate_limited') throw new Error(msg('Terlalu banyak permintaan. Coba beberapa saat lagi.', 'Too many requests. Please try again shortly.', '请求过多，请稍后再试。'));
        if (['turnstile_required','turnstile_failed'].includes(first.error)) throw new Error(msg('Verifikasi anti-bot belum selesai. Silakan centang verifikasi lalu coba lagi.', 'Anti-bot verification is not complete. Finish the verification and try again.', '人机验证尚未完成，请完成验证后再试。'));
        if (first.error === 'turnstile_unavailable') throw new Error(msg('Verifikasi anti-bot sementara tidak tersedia. Coba lagi sebentar.', 'Anti-bot verification is temporarily unavailable. Please try again shortly.', '人机验证暂时不可用，请稍后再试。'));
        if (first.error === 'queue_busy') throw new Error(msg('Antrean AI sedang penuh. Video gratis tetap tersedia dari project/script lama; coba script baru beberapa saat lagi.', 'The AI queue is full. Free video rendering from existing projects/scripts is still available; try a new script shortly.', 'AI 队列当前繁忙；已有项目/脚本仍可免费视频生成，请稍后再生成新脚本。'));
        if (first.error === 'daily_free_ai_budget_reached') throw new Error(msg('Batas biaya AI gratis harian sudah tercapai. Video dari script lama tetap GRATIS; script AI baru dibuka lagi setelah kapasitas tersedia.', 'The daily free-AI budget has been reached. Videos from existing scripts remain FREE; new AI Scripts reopen when capacity is available.', '当天免费 AI 预算已达到上限；已有脚本仍可免费视频生成，新 AI 脚本将在容量恢复后开放。'));
        if (['queue_unavailable','quota_database_unavailable','rate_limit_infrastructure_unavailable'].includes(first.error)) throw new Error(msg('Layanan AI sementara diamankan karena infrastruktur belum sehat. Tidak ada kredit gratis yang dibakar. Coba lagi nanti.', 'AI service is temporarily protected because infrastructure is not healthy. No free quota is consumed. Please try again later.', '由于基础设施暂未恢复，AI 服务已临时保护性关闭，不会消耗免费额度，请稍后再试。'));
        throw new Error(first.error || msg('Gagal membuat script.', 'Failed to create the script.', '脚本生成失败。'));
      }

      let result = first.result as DirectorJson | undefined;
      if (!result && first.jobId) {
        let delay = Number(first.pollAfterMs || 1500);
        setMessage(msg('Masuk antrean AI. Menunggu worker…', 'Queued for AI. Waiting for the worker…', '已进入 AI 队列，正在等待 Worker…'));
        for (let i = 0; i < 60; i++) {
          const jitter = Math.floor(Math.random() * 350);
          await new Promise(r => setTimeout(r, Math.min(6000, delay) + jitter));
          const poll = await fetch(`/api/scripts/jobs/${encodeURIComponent(first.jobId)}`, { cache: 'no-store' });
          const state = await poll.json();
          if (state.status === 'completed') { result = state.result; break; }
          if (state.status === 'failed') throw new Error(state.failedReason || msg('AI worker gagal.', 'AI worker failed.', 'AI Worker 执行失败。'));
          delay = Math.min(6000, Number(state.pollAfterMs || Math.round(delay * 1.35)));
          setMessage(`${msg('AI sedang bekerja…', 'AI is working…', 'AI 正在处理…')} ${typeof state.progress === 'number' ? state.progress : ''}`);
        }
      }
      if (!result) throw new Error(msg('Job belum selesai. Coba buka lagi beberapa saat lagi.', 'The job has not finished yet. Please try again shortly.', '任务尚未完成，请稍后再试。'));
      setDirector(result);
      if (first.demo) setScriptsRemaining(current => Math.max(0, current - 1));
      else if (typeof first.remaining === 'number') setScriptsRemaining(first.remaining);
      else void refreshQuota();

      // v0.2.2.6 behavior-only hotfix: prepare visuals and local F5 automatically.
      // Existing buttons/UI stay unchanged and remain available for manual retry.
      const [prepared, voice] = await Promise.allSettled([
        fetchFootageFor(result),
        synthesizeLocal(result.scenes.map(scene => scene.voice.trim()).filter(Boolean).join('. '), 'F5')
      ]);
      if (prepared.status === 'fulfilled') {
        setSceneAssets(prepared.value.map);
        setAssets(prepared.value.unique);
      }
      if (voice.status === 'fulfilled') {
        setNarrationWav(voice.value);
        setNarrationSource('auto');
        setTtsStatus('ready');
      }
      setStatus('ready');
      if (prepared.status === 'rejected' || voice.status === 'rejected') {
        setMessage(msg('Director siap. Free Video akan mencoba lagi menyiapkan footage/voice otomatis saat tombol Render ditekan.', 'Director is ready. Free Video will retry preparing footage/voice automatically when Render is pressed.', 'Director 已准备好。点击“渲染”时，Free Video 会再次自动尝试准备素材和语音。'));
      } else {
        setMessage(msg('Director, footage, dan voice lokal F5 siap. Video bisa langsung dirender.', 'Director, footage, and local F5 voice are ready. The video can be rendered now.', 'Director、素材和本地 F5 语音都已准备完成，可以直接渲染视频。'));
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : msg('Terjadi kesalahan.', 'An error occurred.', '发生错误。'));
    } finally {
      setTurnstileReset(value => value + 1);
    }
  }

  async function fetchFootageFor(target: DirectorJson) {
    const res = await fetch('/api/assets/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: target.productName,
        scenes: target.scenes.map(scene => ({
          id: scene.id,
          duration: scene.duration,
          template: scene.template,
          assetKeyword: scene.assetKeyword
        }))
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error === 'rate_limited' ? msg('Terlalu banyak pencarian footage. Coba lagi sebentar.', 'Too many footage searches. Please try again shortly.', '素材搜索请求过多，请稍后再试。') : (data.error || msg('Gagal mencari footage.', 'Failed to search for footage.', '素材搜索失败。')));
    const assignments = (data.assignments || []) as SceneAssetAssignment[];
    const map: Record<string, AssetSearchResult | null> = {};
    const unique = new Map<string, AssetSearchResult>();
    for (const item of assignments) {
      map[item.sceneId] = item.asset;
      if (item.asset) unique.set(`${item.asset.source}:${item.asset.id}`, item.asset);
    }
    return { map, unique: [...unique.values()] };
  }

  async function prepareFootage() {
    if (!director) return;
    setAssetLoading(true);
    setMessage(msg('Mencari sedikit footage yang benar-benar dibutuhkan. Query yang sama akan memakai cache.', 'Searching only for the footage that is actually needed. Repeated queries use cache.', '只搜索真正需要的素材；相同搜索词会使用缓存。'));
    try {
      const prepared = await fetchFootageFor(director);
      setSceneAssets(prepared.map);
      setAssets(prepared.unique);
      if (prepared.unique.length === 0) setMessage(msg('Tidak ada footage eksternal yang cocok. Renderer akan memakai foto produk + template lokal.', 'No suitable external footage was found. The renderer will use the product photo + local template.', '没有找到合适的第三方素材，Renderer 将使用产品图 + 本地模板。'));
      else setMessage(msg(`${prepared.unique.length} footage dipilih. Scene produk tetap memakai foto produk supaya hasil lebih relevan.`, `${prepared.unique.length} footage items selected. Product scenes still use the product photo for better relevance.`, `已选择 ${prepared.unique.length} 个素材。产品场景仍优先使用产品图，以提高相关性。`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : msg('Gagal menyiapkan footage.', 'Failed to prepare footage.', '素材准备失败。'));
    } finally {
      setAssetLoading(false);
    }
  }

  async function renderVideo() {
    if (!director) return;
    setStatus('rendering');
    setRenderProgress(0);
    setAssetFallbacks([]);
    setMessage(msg('Render dilakukan di perangkat kamu. Stock footage diambil langsung oleh browser, bukan diproxy server AURIA.', 'Rendering happens on your device. Stock footage is fetched directly by the browser, not proxied through Free Video servers.', '视频在你的设备本地渲染；第三方素材由浏览器直接获取，不经过 Free Video 服务器代理。'));
    try {
      let renderAssets = sceneAssets;
      if (!Object.values(renderAssets).some(Boolean)) {
        setMessage(msg('Menyiapkan foto produk / footage pihak ketiga secara otomatis…', 'Automatically preparing the product photo / third-party footage…', '正在自动准备产品图 / 第三方素材…'));
        const prepared = await fetchFootageFor(director);
        renderAssets = prepared.map;
        setSceneAssets(prepared.map);
        setAssets(prepared.unique);
      }

      if (!imageDataUrl && !Object.values(renderAssets).some(Boolean)) {
        throw new Error(msg('Tidak ada visual yang bisa dipakai. Sambungkan internet untuk footage gratis atau unggah foto produk.', 'No usable visual is available. Connect to the internet for free footage or upload a product photo.', '没有可用画面。请联网获取免费素材，或上传产品图片。'));
      }

      let renderNarration = narrationWav;
      if (!renderNarration) {
        setVoiceLoading(true);
        setMessage(msg('Membuat voice lokal Supertonic F5 otomatis sebelum render…', 'Automatically creating local Supertonic F5 voice before rendering…', '渲染前正在自动生成本地 Supertonic F5 语音…'));
        const text = director.scenes.map(scene => scene.voice.trim()).filter(Boolean).join('. ');
        renderNarration = await synthesizeLocal(text, 'F5');
        setNarrationWav(renderNarration);
        setNarrationSource('auto');
        setTtsStatus('ready');
        setVoiceLoading(false);
      }
      if (!renderNarration) throw new Error(msg('Voice lokal belum siap. Free Video tidak akan membuat MP4 tanpa suara.', 'Local voice is not ready. Free Video will not create a silent MP4.', '本地语音尚未准备完成，Free Video 不会生成无声 MP4。'));

      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const result = await renderDirectorToMp4(director, {
        imageDataUrl,
        sceneAssets: renderAssets,
        narrationWav: renderNarration,
        onProgress: setRenderProgress,
        onAssetFallback: sceneId => setAssetFallbacks(current => current.includes(sceneId) ? current : [...current, sceneId]),
        preferDiskForLongVideo: true
      });
      if (result.mode === 'memory' || result.mode === 'opfs') {
        const url = URL.createObjectURL(result.blob);
        setVideoUrl(url);
        setDownloadName(result.filename);
        setMessage(result.mode === 'opfs' ? msg('Video selesai. MP4 dirender streaming ke penyimpanan lokal browser (OPFS), bukan ditahan penuh di RAM.', 'Video complete. The MP4 was streamed into local browser storage (OPFS) instead of being held entirely in RAM.', '视频已完成。MP4 以流式方式写入浏览器本地存储（OPFS），不会全部占用内存。') : msg('Video selesai. MP4 dibuat secara lokal di perangkat ini.', 'Video complete. The MP4 was created locally on this device.', '视频已完成，MP4 已在本地设备生成。'));
      } else {
        setVideoUrl(null);
        setDownloadName(result.filename);
        setMessage(msg(`Video selesai dan langsung disimpan ke disk: ${result.filename}`, `Video complete and saved directly to disk: ${result.filename}`, `视频已完成并直接保存到磁盘：${result.filename}`));
      }
      setStatus('done');
    } catch (error) {
      setVoiceLoading(false);
      setStatus('error');
      const raw = error instanceof Error ? error.message : 'Render gagal. Browser ini mungkin belum mendukung codec yang diperlukan.';
      if (raw === 'local_tts_not_installed' || raw === 'supertonic_not_found') {
        setMessage(msg('Supertonic F5 belum terhubung. START-DEMO-WINDOWS.ps1 sudah mencoba menyalakan Voice Bridge otomatis; pastikan Supertonic 3 terpasang lalu jalankan Demo lagi.', 'Supertonic F5 is not connected. START-DEMO-WINDOWS.ps1 already tried to start Voice Bridge automatically; make sure Supertonic 3 is installed and restart the Demo.', 'Supertonic F5 尚未连接。START-DEMO-WINDOWS.ps1 已尝试自动启动 Voice Bridge；请确认已安装 Supertonic 3，然后重新启动 Demo。'));
      } else if (raw === 'narration_decode_failed' || raw === 'audio_decode_unavailable' || raw === 'narration_missing') {
        setMessage(msg('Voice sudah dibuat tetapi browser gagal membaca audio WAV. Free Video menghentikan render supaya tidak menghasilkan MP4 tanpa suara.', 'The voice was created, but the browser could not decode the WAV. Free Video stopped rendering to avoid producing a silent MP4.', '语音已经生成，但浏览器无法读取 WAV。Free Video 已停止渲染，避免生成无声 MP4。'));
      } else if (raw === 'external_visual_unavailable') {
        setMessage(msg('Footage sudah dicari tetapi semua visual pihak ketiga gagal dimuat/didecode. Free Video menghentikan render supaya tidak menghasilkan video template kosong. Coba lagi atau unggah foto produk.', 'Footage was found, but every third-party visual failed to load/decode. Free Video stopped rendering to avoid producing an empty template video. Try again or upload a product photo.', '已搜索到素材，但所有第三方画面都加载/解码失败。Free Video 已停止渲染，避免生成空模板视频。请重试或上传产品图。'));
      } else if (raw === 'video_encoder_unsupported') {
        setMessage(msg('Browser/perangkat ini belum menyediakan encoder H.264 yang dibutuhkan untuk MP4 lokal. Gunakan Chrome/Edge/Android Chrome atau Safari/iOS yang lebih baru.', 'This browser/device does not provide the H.264 encoder required for local MP4 rendering. Use a newer Chrome/Edge/Android Chrome or Safari/iOS.', '当前浏览器/设备没有提供本地 MP4 所需的 H.264 编码器。请使用较新的 Chrome/Edge/Android Chrome 或 Safari/iOS。'));
      } else if (raw === 'aac_encoder_unsupported') {
        setMessage(msg('Encoder audio AAC tidak tersedia di perangkat ini, jadi render dihentikan agar MP4 tidak menjadi tanpa suara.', 'AAC audio encoding is unavailable on this device, so rendering stopped instead of producing a silent MP4.', '当前设备无法进行 AAC 音频编码，因此已停止渲染，避免生成无声 MP4。'));
      } else {
        setMessage(raw);
      }
    }
  }

  return (
    <div className="container">
      <section className="section">
        <div className="eyebrow">{ui.eyebrow}</div>
        <h2>{ui.title}</h2>
        <p className="lead">{ui.lead}</p>
        <div className="duration-row" style={{ marginTop: 14 }} aria-label="Language">
          {(['id', 'en', 'zh'] as UiLocale[]).map(code => (
            <button key={code} className={`duration-chip ${locale === code ? 'active' : ''}`} onClick={() => setLocale(code)}>
              {UI[code].languageLabel}
            </button>
          ))}
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label>{ui.productName}</label>
              <input className="input" value={productName} onChange={e => setProductName(e.target.value)} maxLength={120} />
            </div>
            <div className="field">
              <label>{ui.productPhoto}</label>
              <input className="input" type="file" accept="image/*" onChange={e => onImage(e.target.files?.[0])} />
            </div>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label>{ui.duration}</label>
            <div className="duration-row">
              {DURATIONS.map(d => (
                <button key={d} className={`duration-chip ${duration === d ? 'active' : ''}`} onClick={() => setDuration(d)}>{d}s</button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label>{ui.voiceUpload}</label>
            <input className="input" type="file" accept="audio/wav,audio/*" onChange={e => onNarration(e.target.files?.[0])} />
            <div className="small" style={{ marginTop: 8 }}>{ui.voiceHelp}</div>
          </div>

          {productContext && <div className="notice" style={{ marginTop: 18 }}><strong>{ui.projectActive}</strong><br />{ui.projectActiveBody}</div>}

          {fypContext && <div className="notice" style={{ marginTop: 18 }}><strong>{ui.fypActive}</strong><br />{ui.fypActiveBody}</div>}

          <div className="notice" style={{ marginTop: 18 }}>
            <strong>{scriptsRemaining} {ui.freeScriptsSuffix}</strong><br />
            {ui.freeRender}
          </div>

          <div className="notice" style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{ui.howTo}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {ui.steps.map((step, index) => (
                <div key={step}><strong>{index + 1}.</strong> {step} {index < ui.steps.length - 1 ? <span aria-hidden="true">→</span> : null}</div>
              ))}
            </div>
          </div>

          <div className="hero-actions">
            <TurnstileBox onToken={setTurnstileToken} resetKey={turnstileReset} />
            <button className="primary-btn" onClick={createDirector} disabled={status === 'creating' || productName.trim().length < 2}>
              {status === 'creating' ? ui.creating : ui.createPlan}
            </button>
            {director && <button className="secondary-btn" onClick={prepareFootage} disabled={assetLoading}>{assetLoading ? ui.searching : ui.prepareFootage}</button>}
            <button className="ghost-btn" onClick={checkLocalVoice}>{ui.checkVoice}</button>
            {director && <button className="ghost-btn" onClick={createLocalVoice} disabled={voiceLoading}>{voiceLoading ? ui.makingVoice : ui.makeVoice}</button>}
          </div>
          {ttsStatus !== 'unknown' && <div className="small" style={{ marginTop: 10 }}>{ui.localTts}: {ttsStatus}</div>}
          {message && <div className={`notice ${status === 'error' ? 'error' : ''}`} style={{ marginTop: 16 }}>{message}</div>}
        </div>

        <div className="card" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="preview-box">
            {imageDataUrl ? <img src={imageDataUrl} alt={ui.previewAlt} /> : null}
            <div className="preview-overlay">
              <span className="eyebrow">{duration} {ui.seconds} · 9:16</span>
              <strong>{director?.scenes[0]?.headline || productName || ui.previewFallback}</strong>
              <span className="small">{ui.previewNote}</span>
            </div>
          </div>
        </div>
      </section>

      {director && (
        <section className="section grid-2">
          <div className="card">
            <div className="section-head"><div><div className="eyebrow">{ui.directorJson}</div><h3>{director.scenes.length} {ui.sceneWord}</h3></div></div>
            <div className="scene-list">
              {director.scenes.map((scene, index) => {
                const stock = sceneAssets[scene.id];
                return (
                  <div className="scene" key={scene.id}>
                    <div className="scene-num">{index + 1}</div>
                    <div>
                      <strong>{scene.headline}</strong>
                      <div className="meta">{scene.template} · {scene.duration}s · {scene.camera}</div>
                    </div>
                    <span className="badge">{stock ? `${stock.source} ${ui.stock}` : ui.productLocal}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="card">
              <div className="eyebrow">{ui.localRender}</div>
              <h3>{ui.mp4OnDevice}</h3>
              <p>{ui.renderBody}</p>
              <button className="primary-btn" onClick={renderVideo} disabled={status === 'rendering'}>
                {status === 'rendering' ? `${ui.render} ${Math.round(renderProgress * 100)}%` : `${ui.render} ${duration} ${ui.seconds} ${ui.free}`}
              </button>
              {status === 'rendering' && <div style={{ height: 8, borderRadius: 999, background: '#18332a', marginTop: 14, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round(renderProgress * 100)}%`, background: '#0ee6a8' }} /></div>}
              {assetFallbacks.length > 0 && <div className="small" style={{ marginTop: 10 }}>{assetFallbacks.length} {ui.fallbackScenes}</div>}
              {videoUrl && (
                <div style={{ marginTop: 18 }}>
                  <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 18, background: '#000' }} />
                  <a className="secondary-btn" href={videoUrl} download={downloadName} style={{ marginTop: 12 }}>{ui.downloadMp4}</a>
                </div>
              )}
            </div>

            <div className="card fyp-card" style={{ marginTop: 16 }}>
              <div className="eyebrow">{ui.needFyp}</div>
              <h3>{ui.fypTitle}</h3>
              <p>{ui.fypBody}</p>
              <a className="primary-btn" href={`/api/fyp/start?product=${encodeURIComponent(productName)}&duration=${duration}`}  target="_blank" rel="noreferrer">
                {ui.fypButton}
              </a>
            </div>
          </div>
        </section>
      )}

      {assets.length > 0 && (
        <section className="section">
          <div className="section-head"><div><div className="eyebrow">{ui.mediaBroker}</div><h3>{ui.usedFootage}</h3></div></div>
          <div className="grid-3">
            {assets.map(asset => (
              <div className="card" key={`${asset.source}-${asset.id}`}>
                {asset.previewUrl ? <img src={asset.previewUrl} alt={asset.author || asset.source} style={{ width: '100%', aspectRatio: '9 / 12', objectFit: 'cover', borderRadius: 14 }} /> : null}
                <p className="small">{asset.source.toUpperCase()} · {asset.author || ui.creator}</p>
                {asset.sourcePage && <a href={asset.sourcePage} className="ghost-btn" target="_blank" rel="noreferrer">{ui.source}</a>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
