export type VideoDuration = 15 | 30 | 60 | 90 | 120;
export type TemplateId = 'problem_hook' | 'product_hero' | 'solution_reveal' | 'feature_3' | 'before_after' | 'zoom_detail' | 'lifestyle' | 'comparison' | 'price_drop' | 'social_proof' | 'countdown_cta' | 'final_cta';
export type CameraMotion = 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'float' | 'orbit' | 'static';
export interface ProductProject {
    id: string;
    name: string;
    price?: string;
    sku?: string;
    targetAudience?: string;
    sellingPoints?: string[];
    painPoints?: string[];
    createdAt: string;
}
export interface DirectorScene {
    id: string;
    duration: number;
    template: TemplateId;
    assetKeyword?: string;
    headline: string;
    subheadline?: string;
    voice: string;
    camera: CameraMotion;
    transition?: 'cut' | 'fade' | 'slide' | 'zoom';
}
export interface DirectorJson {
    version: '1.0';
    language: 'id';
    ratio: '9:16';
    duration: VideoDuration;
    productName: string;
    style: 'fast-commerce' | 'clean-product' | 'social-proof';
    scenes: DirectorScene[];
    cta: string;
}
export interface SceneAssetAssignment {
    sceneId: string;
    keyword: string;
    asset: AssetSearchResult | null;
}
export interface AssetSearchResult {
    source: 'pixabay' | 'pexels' | 'openverse' | 'commons' | 'local';
    id: string;
    type: 'image' | 'video';
    previewUrl: string;
    downloadUrl?: string;
    sourcePage?: string;
    author?: string;
    width?: number;
    height?: number;
    duration?: number;
}
