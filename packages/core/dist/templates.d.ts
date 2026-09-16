import type { TemplateId } from './types.js';
export interface SceneTemplateDefinition {
    id: TemplateId;
    label: string;
    minDuration: number;
    maxDuration: number;
    purpose: string;
}
export declare const SCENE_TEMPLATES: SceneTemplateDefinition[];
