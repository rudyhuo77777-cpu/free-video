// Deterministic Director fixture. Clearly-labelled audit fixture, NOT AI output.
// Scene durations sum exactly to the requested duration and the Indonesian voice text
// stays inside the product's own word budget so the ORIGINAL validateDirector accepts it.
const SCENE_RANGES = { 15: [4, 6], 30: [6, 10], 60: [10, 16], 90: [14, 20], 120: [18, 24] };
// CR-002: keep harness fixtures inside the measured narration budget so they remain valid
// against the ORIGINAL validateDirector. Mirrors worker/director.js maxNarrationWords().
const NARRATION_FIXED_OVERHEAD_SECONDS = 1.33;
const NARRATION_WORDS_PER_SECOND = 1.8925;
const maxNarrationWords = duration => Math.floor((duration - NARRATION_FIXED_OVERHEAD_SECONDS) * NARRATION_WORDS_PER_SECOND);
const VOICE = [
  'Cek bentuk dan detail produk ini sebelum kamu memilih.',
  'Bahan stainless tebal membuat botol ini awet dipakai setiap hari.',
  'Tutupnya rapat sehingga air tidak tumpah di dalam tas.',
  'Ukurannya pas untuk dibawa ke kantor maupun ke kampus.',
  'Bagian dalam mudah dibersihkan tanpa meninggalkan bau.',
  'Suhu air tetap terjaga selama beberapa jam pemakaian.'
];
const TEMPLATES = ['problem_hook', 'lifestyle', 'feature_3', 'zoom_detail', 'comparison', 'price_drop', 'countdown_cta', 'final_cta'];

export function fixtureDirector(duration, productName = 'Botol minum stainless') {
  const [lo] = SCENE_RANGES[duration] || [4];
  const count = lo;
  const base = Math.floor(duration / count);
  const durations = Array.from({ length: count }, () => base);
  let remainder = duration - base * count;
  for (let i = 0; remainder > 0; i = (i + 1) % count) { durations[i] += 1; remainder--; }
  // Narration is sized to ~70% of the measured budget and split evenly across scenes.
  const budget = Math.max(count, Math.floor(maxNarrationWords(duration) * 0.7));
  const perScene = Array.from({ length: count }, () => 1);
  let left = budget - count;
  for (let i = 0; left > 0; i = (i + 1) % count) { perScene[i] += 1; left--; }
  const voiceFor = i => {
    const source = VOICE[i % VOICE.length].replace(/\.$/, '').split(/\s+/);
    const out = [];
    while (out.length < perScene[i]) out.push(source[out.length % source.length]);
    return out.join(' ') + '.';
  };
  return {
    version: '1.0', language: 'id', ratio: '9:16', duration, productName, style: 'fast-commerce',
    cta: 'Cek detail produknya sekarang.',
    scenes: durations.map((d, i) => ({
      id: `scene-${i + 1}`, duration: d,
      template: i === 0 ? 'problem_hook' : TEMPLATES[(i % (TEMPLATES.length - 1)) + 1],
      assetKeyword: 'stainless water bottle', headline: 'Lihat detail produknya',
      voice: voiceFor(i), camera: 'push_in', transition: 'cut'
    }))
  };
}

export function durationFromRequest(request) {
  const text = JSON.stringify(request || {});
  const m = text.match(/total durasi tepat (\d+) detik/);
  return m ? Number(m[1]) : 15;
}

export function makeFixtureAi(counter = { calls: 0, durations: [] }) {
  return {
    counter,
    binding: {
      run: async (_model, request) => {
        counter.calls++;
        const duration = durationFromRequest(request);
        counter.durations.push(duration);
        return { response: fixtureDirector(duration) };
      }
    }
  };
}
