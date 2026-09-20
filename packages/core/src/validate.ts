import type { CameraMotion, DirectorJson, DirectorScene, TemplateId, VideoDuration } from './types.js';

const TEMPLATES = new Set<TemplateId>([
  'problem_hook', 'product_hero', 'solution_reveal', 'feature_3', 'before_after', 'zoom_detail',
  'lifestyle', 'comparison', 'price_drop', 'social_proof', 'countdown_cta', 'final_cta'
]);
const CAMERAS = new Set<CameraMotion>(['push_in', 'pull_out', 'pan_left', 'pan_right', 'float', 'orbit', 'static']);
const TRANSITIONS = new Set<NonNullable<DirectorScene['transition']>>(['cut', 'fade', 'slide', 'zoom']);
const STYLES = new Set<DirectorJson['style']>(['fast-commerce', 'clean-product', 'social-proof']);

function cleanText(value: unknown, fallback: string, max: number) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function normalizeDurations(scenes: DirectorScene[], target: number) {
  if (!scenes.length) return scenes;
  let total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  let guard = 0;
  while (total < target && guard++ < 1000) {
    for (const scene of scenes) {
      if (total >= target) break;
      scene.duration += 1;
      total += 1;
    }
  }
  guard = 0;
  while (total > target && guard++ < 1000) {
    let changed = false;
    for (let i = scenes.length - 1; i >= 0 && total > target; i--) {
      if (scenes[i].duration > 1) {
        scenes[i].duration -= 1;
        total -= 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return scenes;
}

export function sanitizeDirector(raw: unknown, expectedProductName: string, expectedDuration: VideoDuration): DirectorJson {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_director_object');
  const input = raw as Record<string, any>;
  const sourceScenes = Array.isArray(input.scenes) ? input.scenes : [];
  if (!sourceScenes.length) throw new Error('director_has_no_scenes');

  // One-second minimum per scene prevents impossible timelines. 24 is the product max.
  const maxScenes = Math.min(24, expectedDuration);
  const scenes: DirectorScene[] = sourceScenes.slice(0, maxScenes).map((scene: any, index: number) => {
    const template = TEMPLATES.has(scene?.template) ? scene.template as TemplateId : (index === 0 ? 'problem_hook' : 'lifestyle');
    const camera = CAMERAS.has(scene?.camera) ? scene.camera as CameraMotion : 'push_in';
    const transition = TRANSITIONS.has(scene?.transition) ? scene.transition as NonNullable<DirectorScene['transition']> : 'cut';
    return {
      id: cleanText(scene?.id, `scene-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, '-'),
      duration: Math.max(1, Math.min(15, Math.round(Number(scene?.duration) || 3))),
      template,
      assetKeyword: cleanText(scene?.assetKeyword, expectedProductName, 100),
      headline: cleanText(scene?.headline, expectedProductName, 140),
      subheadline: scene?.subheadline ? cleanText(scene.subheadline, '', 180) : undefined,
      voice: cleanText(scene?.voice, `Lihat ${expectedProductName} ini.`, 500),
      camera,
      transition
    };
  });

  normalizeDurations(scenes, expectedDuration);

  return {
    version: '1.0',
    language: 'id',
    ratio: '9:16',
    duration: expectedDuration,
    productName: cleanText(expectedProductName, 'Produk', 120),
    style: STYLES.has(input.style) ? input.style : 'fast-commerce',
    scenes,
    cta: cleanText(input.cta, 'Cek produknya sekarang.', 220)
  };
}
