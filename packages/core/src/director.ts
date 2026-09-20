import type { DirectorJson, DirectorScene, VideoDuration } from './types.js';

const scenePlans: Record<VideoDuration, number> = {
  15: 4,
  30: 7,
  60: 11,
  90: 16,
  120: 20
};

const templates: DirectorScene['template'][] = [
  'problem_hook', 'product_hero', 'solution_reveal', 'feature_3', 'lifestyle',
  'zoom_detail', 'comparison', 'social_proof', 'price_drop', 'countdown_cta', 'final_cta'
];

export function makeMockDirector(productName: string, duration: VideoDuration): DirectorJson {
  const count = scenePlans[duration];
  const seconds = duration / count;
  const scenes: DirectorScene[] = Array.from({ length: count }, (_, index) => {
    const template = index === count - 1 ? 'final_cta' : templates[index % (templates.length - 1)];
    const isFirst = index === 0;
    const isLast = index === count - 1;
    return {
      id: `scene-${index + 1}`,
      duration: Number(seconds.toFixed(2)),
      template,
      assetKeyword: index % 3 === 0 ? `${productName} lifestyle` : undefined,
      headline: isFirst
        ? `Masih ribet jual ${productName}?`
        : isLast
          ? `Coba ${productName} sekarang`
          : `${productName} • manfaat #${index}`,
      subheadline: isLast ? 'Buat keputusan lebih cepat.' : undefined,
      voice: isFirst
        ? `Kalau kamu jual ${productName}, jangan mulai dari penjelasan panjang. Tunjukkan masalahnya dulu.`
        : isLast
          ? `Kalau cocok untuk kebutuhanmu, cek produknya sekarang.`
          : `Ini salah satu alasan ${productName} lebih gampang dipahami calon pembeli dalam beberapa detik.`,
      camera: index % 2 === 0 ? 'push_in' : 'float',
      transition: index % 3 === 0 ? 'zoom' : 'cut'
    };
  });

  return {
    version: '1.0',
    language: 'id',
    ratio: '9:16',
    duration,
    productName,
    style: 'fast-commerce',
    scenes,
    cta: 'Cek produk sekarang.'
  };
}

export function normalizeAssetSearchQuery(input: string): string {
  return input.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

export function normalizeAssetKeyword(input: string): string {
  // Stable order-insensitive cache key only. Do not send this sorted form to providers.
  return normalizeAssetSearchQuery(input).split(' ').filter(Boolean).sort().join(' ');
}
