'use client';

export type LocalTtsStatus = 'not-installed' | 'ready' | 'unsupported';

export interface AuriaLocalTtsProvider {
  id: string;
  synthesize(input: { text: string; language: 'id'; voice?: string }): Promise<Blob>;
}

declare global {
  interface Window { __AURIA_LOCAL_TTS__?: AuriaLocalTtsProvider; }
}

const BRIDGE = 'http://127.0.0.1:8787';
let bridgeToken: string | null = null;

async function bridgeReady() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    const res = await fetch(`${BRIDGE}/health`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch { return false; }
}

async function pairBridge() {
  if (bridgeToken) return bridgeToken;
  const res = await fetch(`${BRIDGE}/pair`, { method: 'POST', cache: 'no-store' });
  if (!res.ok) throw new Error('local_tts_pairing_failed');
  const data = await res.json();
  bridgeToken = String(data.token || '');
  if (!bridgeToken) throw new Error('local_tts_pairing_failed');
  return bridgeToken;
}

export async function detectLocalTts(): Promise<LocalTtsStatus> {
  if (typeof window === 'undefined') return 'unsupported';
  if (window.__AURIA_LOCAL_TTS__?.synthesize) return 'ready';
  if (await bridgeReady()) return 'ready';
  return typeof WebAssembly !== 'undefined' ? 'not-installed' : 'unsupported';
}

export async function synthesizeLocal(text: string, voice = 'F5'): Promise<Blob> {
  if (typeof window === 'undefined') throw new Error('local_tts_unavailable');
  if (window.__AURIA_LOCAL_TTS__?.synthesize) {
    return window.__AURIA_LOCAL_TTS__.synthesize({ text, language: 'id', voice });
  }

  try {
    const token = await pairBridge();
    const res = await fetch(`${BRIDGE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, language: 'id', voice: 'F5' })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) bridgeToken = null;
      throw new Error(data.error || 'local_tts_bridge_failed');
    }
    return await res.blob();
  } catch (error) {
    if (error instanceof Error && !['Failed to fetch', 'NetworkError when attempting to fetch resource.'].includes(error.message)) throw error;
    throw new Error('local_tts_not_installed');
  }
}
