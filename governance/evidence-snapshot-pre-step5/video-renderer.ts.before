'use client';

import type { AssetSearchResult, DirectorJson } from '@auria/core';
import {
  ALL_FORMATS,
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  UrlSource,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo
} from 'mediabunny';
let aacFallbackRegistered = false;

export type RenderResult =
  | { mode: 'memory'; blob: Blob; filename: string }
  | { mode: 'opfs'; blob: Blob; filename: string }
  | { mode: 'disk'; filename: string };

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, zoom = 1) {
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const w = image.naturalWidth * ratio;
  const h = image.naturalHeight * ratio;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  director: DirectorJson,
  sceneIndex: number,
  sceneProgress: number,
  overallProgress: number,
  productImage: HTMLImageElement | null,
  stockCanvas: HTMLCanvasElement | null
) {
  const { width, height } = canvas;
  const scene = director.scenes[sceneIndex];

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#07110f');
  gradient.addColorStop(.55, '#0d261f');
  gradient.addColorStop(1, '#063e2c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (stockCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.78;
    const zoom = 1 + sceneProgress * 0.025;
    const cropW = width / zoom;
    const cropH = height / zoom;
    ctx.drawImage(
      stockCanvas,
      (width - cropW) / 2,
      (height - cropH) / 2,
      cropW,
      cropH,
      0,
      0,
      width,
      height
    );
    ctx.restore();
  } else if (productImage) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    const zoom = 1 + sceneProgress * 0.04;
    drawCoverImage(ctx, productImage, width, height, zoom);
    ctx.restore();
  }

  if (stockCanvas || productImage) {
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, 'rgba(0,0,0,.16)');
    shade.addColorStop(.48, 'rgba(0,0,0,.28)');
    shade.addColorStop(1, 'rgba(0,0,0,.90)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  }

  const pulse = .5 + Math.sin(sceneProgress * Math.PI) * .5;
  ctx.fillStyle = `rgba(14,230,168,${0.05 + pulse * .08})`;
  ctx.beginPath();
  ctx.arc(width * (.75 - sceneProgress * .05), height * .22, width * .46, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0ee6a8';
  ctx.font = `800 ${Math.round(width * .032)}px system-ui`;
  ctx.fillText(`${String(sceneIndex + 1).padStart(2, '0')} / ${String(director.scenes.length).padStart(2, '0')}`, width * .07, height * .08);

  const baseY = height * .61;
  ctx.fillStyle = '#f1fff9';
  ctx.font = `900 ${Math.round(width * .076)}px system-ui`;
  const headlineLines = wrapText(ctx, scene.headline, width * .84).slice(0, 3);
  headlineLines.forEach((line, i) => ctx.fillText(line, width * .07, baseY + i * width * .09));

  const voiceY = baseY + headlineLines.length * width * .09 + height * .035;
  const boxX = width * .06;
  const boxW = width * .88;
  const boxH = height * .18;
  ctx.fillStyle = 'rgba(4,15,12,.76)';
  roundedRect(ctx, boxX, voiceY, boxW, boxH, width * .025);
  ctx.fill();
  ctx.strokeStyle = 'rgba(142,247,214,.22)';
  ctx.stroke();

  ctx.fillStyle = '#d8eee6';
  ctx.font = `600 ${Math.round(width * .034)}px system-ui`;
  const voiceLines = wrapText(ctx, scene.voice, boxW - width * .08).slice(0, 4);
  voiceLines.forEach((line, i) => ctx.fillText(line, boxX + width * .04, voiceY + height * .045 + i * width * .045));

  const barX = width * .06;
  const barY = height * .955;
  const barW = width * .88;
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  roundedRect(ctx, barX, barY, barW, height * .006, height * .003);
  ctx.fill();
  ctx.fillStyle = '#0ee6a8';
  roundedRect(ctx, barX, barY, Math.max(2, barW * overallProgress), height * .006, height * .003);
  ctx.fill();
}

async function loadImage(dataUrl?: string | null, crossOrigin = false) {
  if (!dataUrl) return null;
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('product_image_load_failed'));
    image.src = dataUrl;
  });
}

function imageToCanvas(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  ctx.fillStyle = '#07110f';
  ctx.fillRect(0, 0, width, height);
  drawCoverImage(ctx, image, width, height, 1);
  return canvas;
}

async function decodeNarration(blob: Blob | null | undefined, durationSeconds: number): Promise<AudioBuffer | null> {
  if (!blob) return null;
  if (typeof AudioContext === 'undefined') throw new Error('audio_decode_unavailable');
  const audioContext = new AudioContext();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    } catch {
      throw new Error('narration_decode_failed');
    }
    if (!Number.isFinite(decoded.duration) || decoded.duration < 0.08 || decoded.numberOfChannels < 1) {
      throw new Error('narration_decode_failed');
    }

    // Keep the UI promise true: the audio track spans the selected video duration.
    // Longer narration is trimmed; shorter narration is padded with silence.
    const targetFrames = Math.max(1, Math.ceil(durationSeconds * decoded.sampleRate));
    if (Math.abs(decoded.length - targetFrames) <= Math.ceil(decoded.sampleRate * 0.05)) return decoded;
    const exact = audioContext.createBuffer(decoded.numberOfChannels, targetFrames, decoded.sampleRate);
    const copyFrames = Math.min(targetFrames, decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      exact.getChannelData(channel).set(decoded.getChannelData(channel).subarray(0, copyFrames));
    }
    return exact;
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export async function renderDirectorToMp4(
  director: DirectorJson,
  options: {
    imageDataUrl?: string | null;
    sceneAssets?: Record<string, AssetSearchResult | null>;
    narrationWav?: Blob | null;
    onProgress?: (value: number) => void;
    onAssetFallback?: (sceneId: string) => void;
    preferDiskForLongVideo?: boolean;
  } = {}
): Promise<RenderResult> {
  const longVideo = director.duration >= 90;
  const width = longVideo ? 540 : Number(process.env.NEXT_PUBLIC_DEFAULT_RENDER_WIDTH || 720);
  const height = longVideo ? 960 : Number(process.env.NEXT_PUBLIC_DEFAULT_RENDER_HEIGHT || 1280);
  const fps = longVideo ? 12 : 15;
  const frameDuration = 1 / fps;

  // Mobile/browser preflight: fail with a precise reason instead of discovering the
  // missing codec after a long render. H.264 keeps the final MP4 broadly playable.
  if (!(await canEncodeVideo('avc', { width, height, quality: new Quality(longVideo ? 'medium' : 'high') }))) {
    throw new Error('video_encoder_unsupported');
  }
  if (!(await canEncodeAudio('aac'))) {
    if (!aacFallbackRegistered) {
      const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
      registerAacEncoder();
      aacFallbackRegistered = true;
    }
    if (!(await canEncodeAudio('aac'))) throw new Error('aac_encoder_unsupported');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas_not_available');

  const renderId = crypto.randomUUID();
  const safeProduct = director.productName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'video';
  const filename = `free-video-${safeProduct}-${director.duration}s-${renderId.slice(0, 8)}.mp4`;
  const canStreamToDisk = typeof (window as any).showSaveFilePicker === 'function';
  const canUseOpfs = Boolean((navigator as any).storage?.getDirectory);
  const useDisk = Boolean(longVideo && options.preferDiskForLongVideo !== false && canStreamToDisk);
  const useOpfs = Boolean(longVideo && !useDisk && canUseOpfs);

  let target: BufferTarget | StreamTarget;
  let opfsHandle: any = null;
  if (useDisk) {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }]
    });
    const writable = await handle.createWritable();
    target = new StreamTarget(writable, { chunked: true, chunkSize: 2 ** 20 });
  } else if (useOpfs) {
    // Safari/iPhone do not expose showSaveFilePicker. OPFS keeps the growing MP4
    // out of the JS heap, so 90/120s renders do not require one giant BufferTarget.
    const root = await (navigator as any).storage.getDirectory();
    const dir = await root.getDirectoryHandle('free-video-renders', { create: true });
    opfsHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await opfsHandle.createWritable({ keepExistingData: false });
    target = new StreamTarget(writable, { chunked: true, chunkSize: 2 ** 20 });
  } else {
    target = new BufferTarget();
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: useDisk || useOpfs ? 'reserve' : 'in-memory' }),
    target
  });
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality(longVideo ? 'medium' : 'high'),
    hardwareAcceleration: 'prefer-hardware'
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  const narration = await decodeNarration(options.narrationWav, director.duration);
  if (!narration) throw new Error('narration_missing');
  const audioSource = new AudioBufferSource({ codec: 'aac', quality: new Quality('medium') });
  output.addAudioTrack(audioSource);

  const image = await loadImage(options.imageDataUrl).catch(() => null);
  const remoteImageCache = new Map<string, Promise<HTMLImageElement | null>>();
  const fallbackImageAsset = Object.values(options.sceneAssets || {}).find(asset => asset?.type === 'image' && asset.downloadUrl) || null;
  let fallbackImageCanvas: HTMLCanvasElement | null = null;
  if (fallbackImageAsset?.downloadUrl) {
    const pending = loadImage(fallbackImageAsset.downloadUrl, true).catch(() => null);
    remoteImageCache.set(fallbackImageAsset.downloadUrl, pending);
    const fallbackImage = await pending;
    fallbackImageCanvas = fallbackImage ? imageToCanvas(fallbackImage, width, height) : null;
  }

  output.setMetadataTags({ title: `${director.productName} — Free Video`, artist: 'Free Video' });
  await output.start();

  // Important for long multi-track MP4s: Mediabunny may buffer packets while waiting
  // for the other track. When we cannot interleave scene-by-scene, feed the much
  // smaller audio track first so video packets can then stream to disk/OPFS.
  if (audioSource && narration) {
    await audioSource.add(narration);
    audioSource.close();
  }

  const totalFrames = Math.ceil(director.duration * fps);
  let frameNo = 0;
  let timestamp = 0;
  let usedAnyExternalVisual = false;

  const emitFrame = async (sceneIndex: number, sceneFrameNo: number, sceneFrames: number, stockCanvas: HTMLCanvasElement | null) => {
    const sceneProgress = sceneFrames <= 1 ? 1 : sceneFrameNo / (sceneFrames - 1);
    const overall = Math.min(1, frameNo / Math.max(1, totalFrames - 1));
    drawFrame(ctx, canvas, director, sceneIndex, sceneProgress, overall, image, stockCanvas);
    await videoSource.add(timestamp, frameDuration, { keyFrame: frameNo % (fps * 2) === 0 });
    timestamp += frameDuration;
    frameNo++;
    if (frameNo % Math.max(1, Math.floor(fps / 2)) === 0) options.onProgress?.(overall);
  };

  for (let sceneIndex = 0; sceneIndex < director.scenes.length; sceneIndex++) {
    const scene = director.scenes[sceneIndex];
    const sceneFrames = Math.max(1, Math.round(scene.duration * fps));
    const productImageTemplates = new Set(['product_hero', 'feature_3', 'zoom_detail', 'comparison', 'price_drop', 'countdown_cta', 'final_cta']);
    const asset = image && productImageTemplates.has(scene.template) ? null : options.sceneAssets?.[scene.id];
    let rendered = 0;
    let usedStock = false;

    if (asset?.type === 'image' && asset.downloadUrl) {
      try {
        let pending = remoteImageCache.get(asset.downloadUrl);
        if (!pending) {
          pending = loadImage(asset.downloadUrl, true).catch(() => null);
          remoteImageCache.set(asset.downloadUrl, pending);
        }
        const stockImage = await pending;
        const stockCanvas = stockImage ? imageToCanvas(stockImage, width, height) : null;
        if (stockCanvas) {
          while (rendered < sceneFrames && frameNo < totalFrames) {
            await emitFrame(sceneIndex, rendered, sceneFrames, stockCanvas);
            rendered++;
          }
          usedStock = rendered > 0;
          if (usedStock) usedAnyExternalVisual = true;
        } else {
          options.onAssetFallback?.(scene.id);
        }
      } catch {
        options.onAssetFallback?.(scene.id);
      }
    }

    if (!usedStock && asset?.type === 'video' && asset.downloadUrl) {
      let input: Input | null = null;
      try {
        input = new Input({
          formats: ALL_FORMATS,
          source: new UrlSource(asset.downloadUrl, { maxCacheSize: 8 * 1024 * 1024 })
        });
        if (await input.canRead()) {
          const track = await input.getPrimaryVideoTrack();
          if (track && await track.canDecode()) {
            const sink = new VideoSampleSink(track);
            const firstTimestamp = Number(await (track as any).getFirstTimestamp?.() ?? 0);
            const clipDuration = Number(await (track as any).computeDuration?.() ?? scene.duration);
            const endTimestamp = firstTimestamp + Math.max(0.1, Math.min(scene.duration, clipDuration || scene.duration));
            const stockCanvas = document.createElement('canvas');
            stockCanvas.width = width;
            stockCanvas.height = height;
            const stockCtx = stockCanvas.getContext('2d', { alpha: false });
            if (stockCtx) {
              let nextSourceTimestamp = firstTimestamp;
              for await (const sample of sink.samples(firstTimestamp, endTimestamp)) {
                if (rendered >= sceneFrames || frameNo >= totalFrames) {
                  sample.close();
                  break;
                }
                if (sample.timestamp + frameDuration * 0.35 < nextSourceTimestamp) {
                  sample.close();
                  continue;
                }
                sample.drawWithFit(stockCtx, { fit: 'cover' });
                sample.close();
                await emitFrame(sceneIndex, rendered, sceneFrames, stockCanvas);
                rendered++;
                nextSourceTimestamp = firstTimestamp + rendered * frameDuration;
              }
              // If the stock clip is shorter than the scene, freeze the last decoded frame.
              while (rendered < sceneFrames && frameNo < totalFrames) {
                await emitFrame(sceneIndex, rendered, sceneFrames, stockCanvas);
                rendered++;
              }
              usedStock = rendered > 0;
              if (usedStock) usedAnyExternalVisual = true;
            }
          }
        }
      } catch {
        options.onAssetFallback?.(scene.id);
      } finally {
        (input as any)?.dispose?.();
      }
    }

    if (!usedStock && fallbackImageCanvas) {
      if (asset?.downloadUrl) options.onAssetFallback?.(scene.id);
      while (rendered < sceneFrames && frameNo < totalFrames) {
        await emitFrame(sceneIndex, rendered, sceneFrames, fallbackImageCanvas);
        rendered++;
      }
      usedStock = rendered > 0;
      if (usedStock) usedAnyExternalVisual = true;
    }

    if (!usedStock) {
      if (asset?.downloadUrl) options.onAssetFallback?.(scene.id);
      while (rendered < sceneFrames && frameNo < totalFrames) {
        await emitFrame(sceneIndex, rendered, sceneFrames, null);
        rendered++;
      }
    }
  }

  // Rounding scene durations to frames can leave a small tail. Fill it with the final
  // scene so the container duration remains exactly the user-selected duration.
  const lastSceneIndex = Math.max(0, director.scenes.length - 1);
  const lastSceneFrames = Math.max(1, Math.round((director.scenes[lastSceneIndex]?.duration || 1) * fps));
  while (frameNo < totalFrames) {
    await emitFrame(lastSceneIndex, Math.min(lastSceneFrames - 1, frameNo), lastSceneFrames, null);
  }

  videoSource.close();
  await output.finalize();
  options.onProgress?.(1);

  // Do not report a template-only render as success when the user did not upload a product image.
  // Assigned assets can still fail at browser/CORS/codec time, so this must be checked after decode.
  if (!image && !usedAnyExternalVisual) throw new Error('external_visual_unavailable');

  if (useDisk) return { mode: 'disk', filename };
  if (useOpfs && opfsHandle) {
    const file = await opfsHandle.getFile();
    return { mode: 'opfs', blob: file, filename };
  }
  const buffer = (target as BufferTarget).buffer;
  if (!buffer) throw new Error('render_buffer_missing');
  return { mode: 'memory', blob: new Blob([buffer], { type: 'video/mp4' }), filename };
}
