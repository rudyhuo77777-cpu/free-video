import type { TemplateId } from './types.js';

export interface SceneTemplateDefinition {
  id: TemplateId;
  label: string;
  minDuration: number;
  maxDuration: number;
  purpose: string;
}

export const SCENE_TEMPLATES: SceneTemplateDefinition[] = [
  { id: 'problem_hook', label: 'Problem Hook', minDuration: 2, maxDuration: 5, purpose: 'Stop scroll dengan masalah yang langsung terasa.' },
  { id: 'product_hero', label: 'Product Hero', minDuration: 3, maxDuration: 7, purpose: 'Tampilkan produk sebagai fokus utama.' },
  { id: 'solution_reveal', label: 'Solution Reveal', minDuration: 3, maxDuration: 7, purpose: 'Perlihatkan solusi setelah masalah.' },
  { id: 'feature_3', label: '3 Fitur', minDuration: 4, maxDuration: 9, purpose: 'Tiga fitur utama secara cepat.' },
  { id: 'before_after', label: 'Before / After', minDuration: 4, maxDuration: 8, purpose: 'Bandingkan sebelum dan sesudah.' },
  { id: 'zoom_detail', label: 'Zoom Detail', minDuration: 3, maxDuration: 7, purpose: 'Sorot detail produk.' },
  { id: 'lifestyle', label: 'Lifestyle', minDuration: 3, maxDuration: 8, purpose: 'Masukkan produk ke konteks penggunaan.' },
  { id: 'comparison', label: 'Comparison', minDuration: 4, maxDuration: 9, purpose: 'Bandingkan solusi lama dengan produk.' },
  { id: 'price_drop', label: 'Price', minDuration: 3, maxDuration: 6, purpose: 'Tekankan harga atau value.' },
  { id: 'social_proof', label: 'Social Proof', minDuration: 3, maxDuration: 8, purpose: 'Bangun kepercayaan.' },
  { id: 'countdown_cta', label: 'Countdown CTA', minDuration: 3, maxDuration: 6, purpose: 'Dorong tindakan sekarang.' },
  { id: 'final_cta', label: 'Final CTA', minDuration: 3, maxDuration: 7, purpose: 'Tutup video dengan ajakan jelas.' }
];
