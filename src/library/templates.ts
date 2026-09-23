/**
 * Template library.
 *
 * Templates are data + a pure `build` function. They never import UI, so new templates
 * can be dropped in without touching the editor.
 *
 * `build` receives the user's existing footage and places it into the composition
 * rather than discarding it — applying a template to an existing recording is the
 * primary path through the product.
 */

import {
  createScene,
  createShapeLayer,
  createTextLayer,
  defaultShadow,
} from '../core/defaults';
import type {
  BackgroundSpec,
  CalloutLayer,
  Scene,
  Size,
  TemplateBuildContext,
  TemplateCategory,
  TemplateDefinition,
  TextLayer,
  VideoLayer,
} from '../core/types';
import { uid } from '../core/ids';

const L: Size = { width: 1920, height: 1080 };
const P: Size = { width: 1080, height: 1920 };
const S: Size = { width: 1080, height: 1080 };

const val = (ctx: TemplateBuildContext, key: string, fallback: string) =>
  ctx.values[key]?.trim() || fallback;

/** Clones the incoming footage so a template never mutates the live document. */
function footage(ctx: TemplateBuildContext, patch: Partial<VideoLayer> = {}): VideoLayer | null {
  if (!ctx.footage) return null;
  const base: VideoLayer = JSON.parse(JSON.stringify(ctx.footage));
  return {
    ...base,
    ...patch,
    id: uid('ly'),
    motion: { ...base.motion, ...(patch.motion ?? {}) },
    camera: { ...base.camera, ...(patch.camera ?? {}) },
    cursor: { ...base.cursor, ...(patch.cursor ?? {}) },
    shadow: { ...base.shadow, ...(patch.shadow ?? {}) },
    frame: { ...base.frame, ...(patch.frame ?? {}) },
    appScreen: patch.appScreen ?? base.appScreen,
    crop: patch.crop ?? base.crop,
  };
}

function title(ctx: TemplateBuildContext, key: string, fallback: string, patch: Partial<TextLayer> = {}): TextLayer {
  return { ...createTextLayer(val(ctx, key, fallback)), ...patch, id: uid('ly') };
}

const GRADIENT = (from: string, to: string, angle = 135): BackgroundSpec => ({
  type: 'gradient',
  from,
  to,
  angle,
});

/* ------------------------------------------------------------- app demos */

const cleanAppDemo: TemplateDefinition = {
  id: 'clean-app-demo',
  name: 'Clean App Demo',
  category: 'appDemo',
  description: 'Your recording centred on a calm background with a gentle push in.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 12,
  fps: 30,
  background: GRADIENT('#1B2735', '#0B0F14'),
  accent: '#22D3EE',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Introducing MotionDeck' }],
  build: (ctx) => {
    const scene = createScene('Demo', 12);
    scene.background = GRADIENT('#1B2735', '#0B0F14');
    const clip = footage(ctx, {
      start: 0,
      duration: 12,
      cornerRadius: 20,
      shadow: { ...defaultShadow(), blur: 110, y: 36, opacity: 0.5 },
      motion: { entrance: 'scale', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.6, idle: 'smoothZoom', intensity: 0.7, feel: 'smooth' },
      camera: { mode: 'smoothFocus', zoom: 1.5, smoothing: 0.6, focusPoints: [] },
      position: { x: 0, y: 30 },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Introducing MotionDeck', {
        start: 0.3,
        duration: 3.2,
        fontSize: 76,
        position: { x: 0, y: -ctx.canvas.height * 0.4 },
        animation: 'slideUp',
        motion: { entrance: 'slideUp', entranceDuration: 0.7, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
      }),
    );
    return [scene];
  },
};

const saasDemo: TemplateDefinition = {
  id: 'saas-demo',
  name: 'SaaS Demo',
  category: 'appDemo',
  description: 'Browser frame, dark studio background, camera that follows your clicks.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 14,
  fps: 30,
  background: { type: 'mesh', colors: ['#0B0F14', '#14304F', '#0F766E', '#312E81'], seed: 11 },
  accent: '#38BDF8',
  textSlots: [
    { key: 'title', label: 'Headline', placeholder: 'Your dashboard, simplified' },
    { key: 'url', label: 'Address bar', placeholder: 'app.yourcompany.com' },
  ],
  build: (ctx) => {
    const scene = createScene('SaaS Demo', 14);
    scene.background = { type: 'mesh', colors: ['#0B0F14', '#14304F', '#0F766E', '#312E81'], seed: 11 };
    const clip = footage(ctx, {
      start: 0,
      duration: 14,
      frame: { kind: 'browserDark', url: val(ctx, 'url', 'app.yourcompany.com') },
      shadow: { ...defaultShadow(), blur: 130, y: 44, opacity: 0.55 },
      motion: { entrance: 'slideUp', entranceDuration: 0.85, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
      camera: { mode: 'followClicks', zoom: 1.7, smoothing: 0.6, focusPoints: [] },
      cursor: { style: 'softCircle', size: 1.1, smoothing: 0.7, shadow: true, highlightColor: '#38BDF8', highlightRadius: 52, click: 'ripple', clickColor: '#38BDF8' },
      position: { x: 0, y: 46 },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Your dashboard, simplified', {
        start: 0.2,
        duration: 3,
        fontSize: 68,
        position: { x: 0, y: -ctx.canvas.height * 0.405 },
        motion: { entrance: 'blurIn', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'cinematic' },
      }),
    );
    return [scene];
  },
};

const mobileAppDemo: TemplateDefinition = {
  id: 'mobile-app-demo',
  name: 'Mobile App Demo',
  category: 'appDemo',
  description: 'Portrait recording inside a phone, floating over a soft gradient.',
  canvas: P,
  aspectLabel: '9:16',
  duration: 12,
  fps: 30,
  background: GRADIENT('#312E81', '#0B0F14', 160),
  accent: '#A78BFA',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Now on mobile' }],
  build: (ctx) => {
    const scene = createScene('Mobile Demo', 12);
    scene.background = GRADIENT('#312E81', '#0B0F14', 160);
    const clip = footage(ctx, {
      start: 0,
      duration: 12,
      frame: { kind: 'phone' },
      position: { x: 0, y: 90 },
      shadow: { ...defaultShadow(), blur: 140, y: 50, opacity: 0.6 },
      motion: { entrance: 'slideUp', entranceDuration: 0.9, exit: 'fade', exitDuration: 0.5, idle: 'float', intensity: 0.6, feel: 'smooth' },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Now on mobile', {
        start: 0.2,
        duration: 3.4,
        fontSize: 92,
        maxWidth: 900,
        position: { x: 0, y: -ctx.canvas.height * 0.39 },
      }),
    );
    return [scene];
  },
};

function withAppScreen(clip: VideoLayer | null, patch: Partial<VideoLayer> = {}): VideoLayer | null {
  if (!clip) return null;
  return {
    ...clip,
    ...patch,
    name: patch.name ?? 'App Screen',
    appScreen: {
      enabled: true,
      mode: 'detected',
      lockedAspect: true,
      aspectRatio: 9 / 16,
      shape: 'rounded',
      cornerPreset: 'android',
      trackingEnabled: false,
      animateFullRecording: false,
      showSafeArea: false,
      originalCrop: clip.appScreen?.originalCrop ?? { x: 0, y: 0, width: 1, height: 1 },
      ...(patch.appScreen ?? {}),
    },
    crop: patch.crop ?? clip.crop,
  };
}

const floatingAndroid: TemplateDefinition = {
  id: 'floating-android',
  name: 'Floating Android',
  category: 'appDemo',
  description: 'Centred app screen with a soft floating shadow — ideal after Crop App Screen.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 10,
  fps: 30,
  background: GRADIENT('#0F172A', '#020617', 150),
  accent: '#22D3EE',
  textSlots: [],
  build: (ctx) => {
    const scene = createScene('Floating Android', 10);
    scene.background = GRADIENT('#0F172A', '#020617', 150);
    const clip = withAppScreen(
      footage(ctx, {
        duration: 10,
        frame: { kind: 'none' },
        cornerRadius: 36,
        scale: 0.92,
        shadow: { ...defaultShadow(), blur: 120, y: 44, opacity: 0.55 },
        background: { type: 'dynamic', blur: 56, scale: 1.4, brightness: 0.5 },
        motion: {
          entrance: 'floatIn',
          entranceDuration: 0.85,
          exit: 'fade',
          exitDuration: 0.5,
          idle: 'float',
          intensity: 0.45,
          feel: 'smooth',
        },
      }),
    );
    if (clip) scene.layers.push(clip);
    return [scene];
  },
};

const premiumApp: TemplateDefinition = {
  id: 'premium-app',
  name: 'Premium App',
  category: 'cinematic',
  description: 'Large mobile app with cinematic entrance and slow zoom.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 12,
  fps: 30,
  background: GRADIENT('#111827', '#030712', 140),
  accent: '#22D3EE',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Built for mobile' }],
  build: (ctx) => {
    const scene = createScene('Premium App', 12);
    scene.background = GRADIENT('#111827', '#030712', 140);
    const clip = withAppScreen(
      footage(ctx, {
        duration: 12,
        frame: { kind: 'phoneAndroid' },
        shadow: { ...defaultShadow(), blur: 140, y: 52, opacity: 0.6 },
        motion: {
          entrance: 'blurIn',
          entranceDuration: 1,
          exit: 'fade',
          exitDuration: 0.6,
          idle: 'cinematic',
          intensity: 0.85,
          feel: 'cinematic',
        },
        camera: { mode: 'smoothFocus', zoom: 1.35, smoothing: 0.65, focusPoints: [] },
      }),
    );
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Built for mobile', {
        start: 0.25,
        duration: 3.5,
        fontSize: 72,
        position: { x: 0, y: -ctx.canvas.height * 0.38 },
      }),
    );
    return [scene];
  },
};

const featureFocusMobile: TemplateDefinition = {
  id: 'feature-focus-mobile',
  name: 'Feature Focus',
  category: 'appDemo',
  description: 'App screen ready for Focus clicks and tap highlights.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 14,
  fps: 30,
  background: GRADIENT('#0B1220', '#020617'),
  accent: '#22D3EE',
  textSlots: [{ key: 'title', label: 'Feature', placeholder: 'Tap to explore' }],
  build: (ctx) => {
    const scene = createScene('Feature Focus', 14);
    scene.background = GRADIENT('#0B1220', '#020617');
    const clip = withAppScreen(
      footage(ctx, {
        duration: 14,
        frame: { kind: 'phoneAndroid' },
        cornerRadius: 32,
        shadow: { ...defaultShadow(), blur: 100, y: 36, opacity: 0.5 },
        motion: {
          entrance: 'scale',
          entranceDuration: 0.7,
          exit: 'fade',
          exitDuration: 0.5,
          idle: 'smoothZoom',
          intensity: 0.7,
          feel: 'smooth',
        },
        camera: { mode: 'smoothFocus', zoom: 1.55, smoothing: 0.6, focusPoints: [] },
        cursor: {
          style: 'softCircle',
          size: 1,
          smoothing: 0.6,
          shadow: true,
          highlightColor: '#FFE066',
          highlightRadius: 42,
          click: 'ripple',
          clickColor: '#22D3EE',
        },
      }),
    );
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Tap to explore', {
        start: 0.3,
        duration: 3,
        fontSize: 56,
        position: { x: 0, y: -ctx.canvas.height * 0.4 },
      }),
    );
    return [scene];
  },
};

const mobileProductDemo: TemplateDefinition = {
  id: 'mobile-product-demo',
  name: 'Mobile Product Demo',
  category: 'showcase',
  description: 'App screen with headline and feature callout.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 12,
  fps: 30,
  background: GRADIENT('#1E293B', '#0F172A'),
  accent: '#22D3EE',
  textSlots: [
    { key: 'title', label: 'Headline', placeholder: 'Your feature name' },
    { key: 'body', label: 'Callout', placeholder: 'One short benefit' },
  ],
  build: (ctx) => {
    const scene = createScene('Product Demo', 12);
    scene.background = GRADIENT('#1E293B', '#0F172A');
    const clip = withAppScreen(
      footage(ctx, {
        duration: 12,
        position: { x: ctx.canvas.width * 0.18, y: 40 },
        frame: { kind: 'phoneAndroid' },
        shadow: { ...defaultShadow(), blur: 110, y: 40, opacity: 0.5 },
        motion: {
          entrance: 'slideLeft',
          entranceDuration: 0.75,
          exit: 'fade',
          exitDuration: 0.5,
          idle: 'breathe',
          intensity: 0.55,
          feel: 'smooth',
        },
      }),
    );
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Your feature name', {
        start: 0.35,
        duration: 10,
        fontSize: 64,
        align: 'left',
        maxWidth: ctx.canvas.width * 0.36,
        position: { x: -ctx.canvas.width * 0.28, y: -80 },
      }),
      title(ctx, 'body', 'One short benefit', {
        start: 0.55,
        duration: 9.8,
        fontSize: 32,
        fontWeight: 400,
        color: '#94A3B8',
        align: 'left',
        letterSpacing: 0,
        maxWidth: ctx.canvas.width * 0.34,
        position: { x: -ctx.canvas.width * 0.28, y: 20 },
      }),
    );
    return [scene];
  },
};

const appWalkthrough: TemplateDefinition = {
  id: 'app-walkthrough',
  name: 'App Walkthrough',
  category: 'appDemo',
  description: 'Two-beat mobile presentation: intro, then focused walkthrough.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 16,
  fps: 30,
  background: GRADIENT('#0B0F14', '#111827'),
  accent: '#22D3EE',
  textSlots: [
    { key: 'title', label: 'Intro', placeholder: 'How it works' },
    { key: 'step', label: 'Step', placeholder: 'Step 1' },
  ],
  build: (ctx) => {
    const intro = createScene('Intro', 5);
    intro.background = GRADIENT('#0B0F14', '#111827');
    intro.layers.push(
      title(ctx, 'title', 'How it works', {
        start: 0.2,
        duration: 4.5,
        fontSize: 88,
        position: { x: 0, y: 0 },
      }),
    );
    const walk = createScene('Walkthrough', 11);
    walk.background = GRADIENT('#0B0F14', '#111827');
    const clip = withAppScreen(
      footage(ctx, {
        duration: 11,
        frame: { kind: 'phoneAndroid' },
        motion: {
          entrance: 'scale',
          entranceDuration: 0.65,
          exit: 'fade',
          exitDuration: 0.45,
          idle: 'smoothZoom',
          intensity: 0.8,
          feel: 'smooth',
        },
        camera: { mode: 'smoothFocus', zoom: 1.5, smoothing: 0.6, focusPoints: [] },
      }),
    );
    if (clip) walk.layers.push(clip);
    walk.layers.push(
      title(ctx, 'step', 'Step 1', {
        start: 0.3,
        duration: 4,
        fontSize: 48,
        position: { x: 0, y: -ctx.canvas.height * 0.4 },
      }),
    );
    return [intro, walk];
  },
};

const fullscreenApp: TemplateDefinition = {
  id: 'fullscreen-app',
  name: 'Fullscreen App',
  category: 'quick',
  description: 'App screen fills the composition — great for portrait exports.',
  canvas: P,
  aspectLabel: '9:16',
  duration: 10,
  fps: 30,
  background: { type: 'solid', color: '#000000' },
  accent: '#22D3EE',
  textSlots: [],
  build: (ctx) => {
    const scene = createScene('Fullscreen', 10);
    scene.background = { type: 'solid', color: '#000000' };
    const clip = withAppScreen(
      footage(ctx, {
        duration: 10,
        frame: { kind: 'none' },
        cornerRadius: 0,
        scale: 1.05,
        shadow: { ...defaultShadow(), enabled: false, opacity: 0 },
        motion: {
          entrance: 'fade',
          entranceDuration: 0.4,
          exit: 'fade',
          exitDuration: 0.4,
          idle: 'smoothZoom',
          intensity: 0.6,
          feel: 'smooth',
        },
      }),
      { appScreen: { enabled: true, mode: 'detected', lockedAspect: true, aspectRatio: 9 / 16, shape: 'rect', cornerPreset: 'edge', trackingEnabled: false, animateFullRecording: false, showSafeArea: true } },
    );
    if (clip) scene.layers.push(clip);
    return [scene];
  },
};

const appPlusPhoneFrame: TemplateDefinition = {
  id: 'app-phone-frame',
  name: 'App + Phone Frame',
  category: 'appDemo',
  description: 'Clean Android device presentation with your cropped app screen.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 11,
  fps: 30,
  background: GRADIENT('#1B2735', '#0B0F14'),
  accent: '#22D3EE',
  textSlots: [],
  build: (ctx) => {
    const scene = createScene('Phone Frame', 11);
    scene.background = GRADIENT('#1B2735', '#0B0F14');
    const clip = withAppScreen(
      footage(ctx, {
        duration: 11,
        frame: { kind: 'phoneAndroid' },
        shadow: { ...defaultShadow(), blur: 130, y: 48, opacity: 0.58 },
        motion: {
          entrance: 'slideUp',
          entranceDuration: 0.8,
          exit: 'fade',
          exitDuration: 0.5,
          idle: 'breathe',
          intensity: 0.5,
          feel: 'smooth',
        },
      }),
    );
    if (clip) scene.layers.push(clip);
    return [scene];
  },
};

const dashboardDemo: TemplateDefinition = {
  id: 'dashboard-demo',
  name: 'Dashboard Demo',
  category: 'appDemo',
  description: 'Wide laptop mockup with a slow cinematic camera.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 15,
  fps: 30,
  background: { type: 'solid', color: '#0E1013' },
  accent: '#34D399',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Every metric in one place' }],
  build: (ctx) => {
    const scene = createScene('Dashboard', 15);
    scene.background = { type: 'solid', color: '#0E1013' };
    const clip = footage(ctx, {
      start: 0,
      duration: 15,
      frame: { kind: 'laptop' },
      position: { x: 0, y: 24 },
      motion: { entrance: 'scale', entranceDuration: 1.1, exit: 'fade', exitDuration: 0.6, idle: 'slowPush', intensity: 0.5, feel: 'cinematic' },
      camera: { mode: 'smoothFocus', zoom: 1.35, smoothing: 0.75, focusPoints: [] },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Every metric in one place', {
        start: 0.4,
        duration: 3.6,
        fontSize: 64,
        color: '#E6E8EB',
        position: { x: 0, y: -ctx.canvas.height * 0.415 },
        motion: { entrance: 'fade', entranceDuration: 1, exit: 'fade', exitDuration: 0.7, idle: 'none', intensity: 1, feel: 'cinematic' },
      }),
    );
    return [scene];
  },
};

const productWalkthrough: TemplateDefinition = {
  id: 'product-walkthrough',
  name: 'Product Walkthrough',
  category: 'appDemo',
  description: 'Three scenes: title card, the walkthrough, then a call to action.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 20,
  fps: 30,
  background: GRADIENT('#111827', '#030712'),
  accent: '#22D3EE',
  textSlots: [
    { key: 'title', label: 'Opening title', placeholder: "Here's how it works" },
    { key: 'cta', label: 'Closing line', placeholder: 'Try it free today' },
  ],
  build: (ctx) => {
    const bg = GRADIENT('#111827', '#030712');

    const intro = createScene('Intro', 3);
    intro.background = bg;
    intro.transitionIn = { kind: 'fade', duration: 0.5 };
    intro.layers.push(
      title(ctx, 'title', "Here's how it works", {
        start: 0,
        duration: 3,
        fontSize: 104,
        motion: { entrance: 'blurIn', entranceDuration: 0.9, exit: 'scaleDown', exitDuration: 0.6, idle: 'smoothZoom', intensity: 0.4, feel: 'cinematic' },
      }),
    );

    const main = createScene('Walkthrough', 13);
    main.background = bg;
    main.transitionIn = { kind: 'fade', duration: 0.45 };
    const clip = footage(ctx, {
      start: 0,
      duration: 13,
      cornerRadius: 18,
      camera: { mode: 'followClicks', zoom: 1.75, smoothing: 0.6, focusPoints: [] },
      motion: { entrance: 'scale', entranceDuration: 0.7, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
    });
    if (clip) main.layers.push(clip);

    const outro = createScene('Call to action', 4);
    outro.background = bg;
    outro.transitionIn = { kind: 'zoom', duration: 0.6 };
    outro.layers.push(
      title(ctx, 'cta', 'Try it free today', {
        start: 0,
        duration: 4,
        fontSize: 96,
        motion: { entrance: 'pop', entranceDuration: 0.6, exit: 'fade', exitDuration: 0.8, idle: 'float', intensity: 0.5, feel: 'smooth' },
      }),
    );

    return [intro, main, outro];
  },
};

/* ------------------------------------------------------------ social media */

function socialTemplate(
  id: string,
  name: string,
  canvas: Size,
  aspectLabel: string,
  background: BackgroundSpec,
  accent: string,
  defaultTitle: string,
): TemplateDefinition {
  return {
    id,
    name,
    category: 'social',
    description: `${aspectLabel} composition sized for ${name}, with bold text and a punchy camera.`,
    canvas,
    aspectLabel,
    duration: 10,
    fps: 30,
    background,
    accent,
    textSlots: [{ key: 'title', label: 'Hook', placeholder: defaultTitle }],
    build: (ctx) => {
      const scene = createScene(name, 10);
      scene.background = background;
      const portrait = canvas.height >= canvas.width;
      const clip = footage(ctx, {
        start: 0,
        duration: 10,
        cornerRadius: 24,
        position: { x: 0, y: portrait ? 70 : 40 },
        motion: { entrance: 'pop', entranceDuration: 0.5, exit: 'scaleDown', exitDuration: 0.4, idle: 'punchIn', intensity: 0.9, feel: 'snappy' },
        camera: { mode: 'followClicks', zoom: 1.9, smoothing: 0.4, focusPoints: [] },
        cursor: { style: 'highlight', size: 1.25, smoothing: 0.8, shadow: true, highlightColor: accent, highlightRadius: 56, click: 'shockwave', clickColor: accent },
      });
      if (clip) scene.layers.push(clip);
      scene.layers.push(
        title(ctx, 'title', defaultTitle, {
          start: 0,
          duration: 10,
          fontSize: portrait ? 96 : 72,
          maxWidth: canvas.width * 0.84,
          position: { x: 0, y: -canvas.height * (portrait ? 0.35 : 0.4) },
          animation: 'wordReveal',
          motion: { entrance: 'slideUp', entranceDuration: 0.55, exit: 'none', exitDuration: 0.4, idle: 'none', intensity: 1, feel: 'snappy' },
        }),
      );
      return [scene];
    },
  };
}

const socialTemplates: TemplateDefinition[] = [
  socialTemplate('tiktok', 'TikTok', P, '9:16', GRADIENT('#0F172A', '#4C1D95', 150), '#F472B6', 'You need to see this'),
  socialTemplate('instagram-reel', 'Instagram Reel', P, '9:16', GRADIENT('#7C2D12', '#BE185D', 140), '#FDE68A', 'Built this in a weekend'),
  socialTemplate('youtube-shorts', 'YouTube Shorts', P, '9:16', GRADIENT('#111827', '#7F1D1D', 160), '#FB7185', 'Watch this in 30 seconds'),
  socialTemplate('linkedin', 'LinkedIn', S, '1:1', GRADIENT('#0B2545', '#0E1B2C', 135), '#38BDF8', 'We just shipped something'),
  socialTemplate('x-post', 'X', L, '16:9', { type: 'solid', color: '#000000' }, '#FFFFFF', 'New: our fastest release yet'),
];

/* -------------------------------------------------------- product showcase */

const featureHighlight: TemplateDefinition = {
  id: 'feature-highlight',
  name: 'Feature Highlight',
  category: 'showcase',
  description: 'Spotlights one part of your UI with a dimmed background and a label.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 10,
  fps: 30,
  background: GRADIENT('#0F172A', '#020617'),
  accent: '#FACC15',
  textSlots: [{ key: 'label', label: 'Callout label', placeholder: 'One-click export' }],
  build: (ctx) => {
    const scene = createScene('Feature Highlight', 10);
    scene.background = GRADIENT('#0F172A', '#020617');
    const clip = footage(ctx, {
      start: 0,
      duration: 10,
      camera: { mode: 'smoothFocus', zoom: 1.6, smoothing: 0.6, focusPoints: [] },
      motion: { entrance: 'fade', entranceDuration: 0.6, exit: 'fade', exitDuration: 0.5, idle: 'smoothZoom', intensity: 0.5, feel: 'smooth' },
    });
    if (clip) scene.layers.push(clip);

    const callout: CalloutLayer = {
      id: uid('ly'),
      type: 'callout',
      name: 'Spotlight',
      start: 2,
      duration: 5,
      locked: false,
      hidden: false,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      opacity: 1,
      keyframes: {},
      motion: { entrance: 'fade', entranceDuration: 0.5, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
      callout: 'spotlight',
      size: { width: 620, height: 380 },
      color: '#FACC15',
      label: val(ctx, 'label', 'One-click export'),
      dim: 0.6,
      strokeWidth: 5,
      pulse: true,
    };
    scene.layers.push(callout);
    return [scene];
  },
};

const productLaunch: TemplateDefinition = {
  id: 'product-launch',
  name: 'Product Launch',
  category: 'showcase',
  description: 'Logo, product, feature, CTA — a four-beat launch film.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 22,
  fps: 30,
  background: { type: 'solid', color: '#06070A' },
  accent: '#22D3EE',
  textSlots: [
    { key: 'brand', label: 'Brand', placeholder: 'YourApp' },
    { key: 'feature', label: 'Feature line', placeholder: 'Built for speed' },
    { key: 'cta', label: 'Call to action', placeholder: 'Available today' },
  ],
  build: (ctx) => {
    const bg: BackgroundSpec = { type: 'solid', color: '#06070A' };

    const brand = createScene('Brand', 3);
    brand.background = bg;
    brand.layers.push(
      title(ctx, 'brand', 'YourApp', {
        start: 0,
        duration: 3,
        fontSize: 132,
        letterSpacing: -4,
        motion: { entrance: 'blurIn', entranceDuration: 1.1, exit: 'blurOut', exitDuration: 0.7, idle: 'smoothZoom', intensity: 0.3, feel: 'cinematic' },
      }),
    );

    const product = createScene('Product', 9);
    product.background = bg;
    product.transitionIn = { kind: 'fade', duration: 0.6 };
    const clip = footage(ctx, {
      start: 0,
      duration: 9,
      cornerRadius: 16,
      shadow: { ...defaultShadow(), blur: 160, y: 60, opacity: 0.7 },
      motion: { entrance: 'scale', entranceDuration: 1.2, exit: 'fade', exitDuration: 0.6, idle: 'slowPush', intensity: 0.5, feel: 'cinematic' },
      camera: { mode: 'smoothFocus', zoom: 1.4, smoothing: 0.8, focusPoints: [] },
    });
    if (clip) product.layers.push(clip);

    const feature = createScene('Feature', 5);
    feature.background = bg;
    feature.transitionIn = { kind: 'blur', duration: 0.55 };
    feature.layers.push(
      title(ctx, 'feature', 'Built for speed', {
        start: 0,
        duration: 5,
        fontSize: 110,
        motion: { entrance: 'slideUp', entranceDuration: 0.8, exit: 'slideUp', exitDuration: 0.6, idle: 'none', intensity: 1, feel: 'cinematic' },
      }),
    );
    const rule = createShapeLayer('rect');
    rule.size = { width: 220, height: 6 };
    rule.cornerRadius = 3;
    rule.position = { x: 0, y: 110 };
    rule.start = 0.6;
    rule.duration = 4.4;
    rule.motion = { entrance: 'scale', entranceDuration: 0.6, exit: 'fade', exitDuration: 0.4, idle: 'none', intensity: 1, feel: 'smooth' };
    feature.layers.push(rule);

    const cta = createScene('CTA', 5);
    cta.background = bg;
    cta.transitionIn = { kind: 'zoom', duration: 0.6 };
    cta.layers.push(
      title(ctx, 'cta', 'Available today', {
        start: 0,
        duration: 5,
        fontSize: 96,
        motion: { entrance: 'pop', entranceDuration: 0.7, exit: 'fade', exitDuration: 1, idle: 'float', intensity: 0.4, feel: 'smooth' },
      }),
    );

    return [brand, product, feature, cta];
  },
};

const beforeAfter: TemplateDefinition = {
  id: 'before-after',
  name: 'Before / After',
  category: 'showcase',
  description: 'Two side-by-side panels with labels — great for redesigns.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 10,
  fps: 30,
  background: { type: 'solid', color: '#0B0F14' },
  accent: '#34D399',
  textSlots: [
    { key: 'before', label: 'Left label', placeholder: 'Before' },
    { key: 'after', label: 'Right label', placeholder: 'After' },
  ],
  build: (ctx) => {
    const scene = createScene('Before / After', 10);
    scene.background = { type: 'solid', color: '#0B0F14' };
    const halfX = ctx.canvas.width * 0.24;

    const left = footage(ctx, {
      name: 'Before',
      start: 0,
      duration: 10,
      scale: 0.46,
      position: { x: -halfX, y: 40 },
      cornerRadius: 14,
      cursor: { ...(ctx.footage?.cursor ?? {}), style: 'hidden' } as VideoLayer['cursor'],
      motion: { entrance: 'slideRight', entranceDuration: 0.7, exit: 'fade', exitDuration: 0.4, idle: 'none', intensity: 1, feel: 'smooth' },
    });
    const right = footage(ctx, {
      name: 'After',
      start: 0,
      duration: 10,
      scale: 0.46,
      position: { x: halfX, y: 40 },
      cornerRadius: 14,
      motion: { entrance: 'slideLeft', entranceDuration: 0.7, exit: 'fade', exitDuration: 0.4, idle: 'none', intensity: 1, feel: 'smooth' },
    });
    if (left) scene.layers.push(left);
    if (right) scene.layers.push(right);

    for (const [key, fallback, x] of [
      ['before', 'Before', -halfX],
      ['after', 'After', halfX],
    ] as const) {
      scene.layers.push(
        title(ctx, key, fallback, {
          start: 0.4,
          duration: 9.6,
          fontSize: 48,
          maxWidth: 600,
          position: { x, y: -ctx.canvas.height * 0.33 },
          motion: { entrance: 'fade', entranceDuration: 0.6, exit: 'fade', exitDuration: 0.4, idle: 'none', intensity: 1, feel: 'smooth' },
        }),
      );
    }
    return [scene];
  },
};

const uiShowcase: TemplateDefinition = {
  id: 'ui-showcase',
  name: 'UI Showcase',
  category: 'showcase',
  description: 'Tilted floating window over a mesh gradient. Design-portfolio energy.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 12,
  fps: 30,
  background: { type: 'mesh', colors: ['#0B0F14', '#4C1D95', '#BE185D', '#0891B2'], seed: 3 },
  accent: '#F0ABFC',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Designed with care' }],
  build: (ctx) => {
    const scene = createScene('UI Showcase', 12);
    scene.background = { type: 'mesh', colors: ['#0B0F14', '#4C1D95', '#BE185D', '#0891B2'], seed: 3 };
    const clip = footage(ctx, {
      start: 0,
      duration: 12,
      rotation: -4,
      scale: 0.92,
      cornerRadius: 22,
      shadow: { ...defaultShadow(), blur: 150, y: 56, opacity: 0.6 },
      motion: { entrance: 'blurIn', entranceDuration: 1, exit: 'fade', exitDuration: 0.6, idle: 'drift', intensity: 0.5, feel: 'cinematic' },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Designed with care', {
        start: 0.3,
        duration: 4,
        fontSize: 80,
        position: { x: 0, y: -ctx.canvas.height * 0.39 },
      }),
    );
    return [scene];
  },
};

const newFeature: TemplateDefinition = {
  id: 'new-feature',
  name: 'New Feature',
  category: 'showcase',
  description: 'Badge, headline and your recording — the classic changelog clip.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 11,
  fps: 30,
  background: GRADIENT('#052E2B', '#020617', 140),
  accent: '#2DD4BF',
  textSlots: [
    { key: 'badge', label: 'Badge', placeholder: 'NEW' },
    { key: 'title', label: 'Headline', placeholder: 'Instant exports' },
  ],
  build: (ctx) => {
    const scene = createScene('New Feature', 11);
    scene.background = GRADIENT('#052E2B', '#020617', 140);
    const clip = footage(ctx, {
      start: 0.6,
      duration: 10.4,
      position: { x: 0, y: 70 },
      scale: 0.86,
      cornerRadius: 18,
      motion: { entrance: 'slideUp', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.5, idle: 'smoothZoom', intensity: 0.5, feel: 'smooth' },
      camera: { mode: 'followClicks', zoom: 1.65, smoothing: 0.55, focusPoints: [] },
    });
    if (clip) scene.layers.push(clip);

    const badge = title(ctx, 'badge', 'NEW', {
      start: 0,
      duration: 4,
      fontSize: 30,
      fontWeight: 800,
      letterSpacing: 4,
      color: '#031A18',
      maxWidth: 400,
      position: { x: 0, y: -ctx.canvas.height * 0.4 },
      background: { color: '#2DD4BF', padding: 18, radius: 999 },
      motion: { entrance: 'pop', entranceDuration: 0.5, exit: 'fade', exitDuration: 0.4, idle: 'none', intensity: 1, feel: 'snappy' },
    });
    scene.layers.push(badge);
    scene.layers.push(
      title(ctx, 'title', 'Instant exports', {
        start: 0.35,
        duration: 3.8,
        fontSize: 82,
        position: { x: 0, y: -ctx.canvas.height * 0.31 },
      }),
    );
    return [scene];
  },
};

/* ---------------------------------------------------------------- cinematic */

const darkCinematic: TemplateDefinition = {
  id: 'dark-cinematic',
  name: 'Dark Cinematic',
  category: 'cinematic',
  description: 'Near-black stage, deep shadow, and a camera that never stops moving.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 16,
  fps: 30,
  background: { type: 'solid', color: '#050507' },
  accent: '#E5E7EB',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Precision, by default' }],
  build: (ctx) => {
    const scene = createScene('Cinematic', 16);
    scene.background = { type: 'solid', color: '#050507' };
    const clip = footage(ctx, {
      start: 0,
      duration: 16,
      cornerRadius: 14,
      shadow: { enabled: true, blur: 200, y: 80, opacity: 0.85, color: '#000000', spread: 0 },
      motion: { entrance: 'blurIn', entranceDuration: 1.6, exit: 'blurOut', exitDuration: 1.2, idle: 'cinematic', intensity: 0.8, feel: 'cinematic' },
      camera: { mode: 'smoothFocus', zoom: 1.3, smoothing: 0.85, focusPoints: [] },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Precision, by default', {
        start: 1,
        duration: 4,
        fontSize: 60,
        fontWeight: 300,
        letterSpacing: 2,
        color: '#D4D4D8',
        position: { x: 0, y: -ctx.canvas.height * 0.4 },
        motion: { entrance: 'fade', entranceDuration: 1.4, exit: 'fade', exitDuration: 1.2, idle: 'none', intensity: 1, feel: 'cinematic' },
      }),
    );
    return [scene];
  },
};

const minimalApple: TemplateDefinition = {
  id: 'minimal-apple',
  name: 'Minimal',
  category: 'cinematic',
  description: 'White stage, generous space, one confident line of type.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 12,
  fps: 30,
  background: { type: 'solid', color: '#F5F5F7' },
  accent: '#1D1D1F',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Simply better.' }],
  build: (ctx) => {
    const scene = createScene('Minimal', 12);
    scene.background = { type: 'solid', color: '#F5F5F7' };
    const clip = footage(ctx, {
      start: 0,
      duration: 12,
      scale: 0.82,
      position: { x: 0, y: 60 },
      cornerRadius: 20,
      shadow: { enabled: true, blur: 90, y: 34, opacity: 0.18, color: '#000000', spread: 0 },
      motion: { entrance: 'scale', entranceDuration: 1.2, exit: 'fade', exitDuration: 0.8, idle: 'smoothZoom', intensity: 0.35, feel: 'cinematic' },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Simply better.', {
        start: 0.4,
        duration: 4,
        fontSize: 88,
        fontWeight: 600,
        color: '#1D1D1F',
        letterSpacing: -2,
        position: { x: 0, y: -ctx.canvas.height * 0.37 },
        motion: { entrance: 'slideUp', entranceDuration: 1, exit: 'fade', exitDuration: 0.7, idle: 'none', intensity: 1, feel: 'cinematic' },
      }),
    );
    return [scene];
  },
};

const premiumProduct: TemplateDefinition = {
  id: 'premium-product',
  name: 'Premium Product',
  category: 'cinematic',
  description: 'Warm spotlight, tilted frame, luxurious slow motion.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 14,
  fps: 30,
  background: { type: 'mesh', colors: ['#0A0908', '#3F2D12', '#7C2D12', '#1C1917'], seed: 42 },
  accent: '#FBBF24',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Crafted to last' }],
  build: (ctx) => {
    const scene = createScene('Premium', 14);
    scene.background = { type: 'mesh', colors: ['#0A0908', '#3F2D12', '#7C2D12', '#1C1917'], seed: 42 };
    const clip = footage(ctx, {
      start: 0,
      duration: 14,
      rotation: 2.5,
      cornerRadius: 18,
      shadow: { enabled: true, blur: 180, y: 70, opacity: 0.75, color: '#000000', spread: 0 },
      motion: { entrance: 'blurIn', entranceDuration: 1.4, exit: 'fade', exitDuration: 0.9, idle: 'slowPush', intensity: 0.45, feel: 'cinematic' },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Crafted to last', {
        start: 0.8,
        duration: 4.4,
        fontSize: 74,
        color: '#FDE68A',
        position: { x: 0, y: -ctx.canvas.height * 0.4 },
        motion: { entrance: 'fade', entranceDuration: 1.3, exit: 'fade', exitDuration: 0.9, idle: 'none', intensity: 1, feel: 'cinematic' },
      }),
    );
    return [scene];
  },
};

const techShowcase: TemplateDefinition = {
  id: 'tech-showcase',
  name: 'Tech Showcase',
  category: 'cinematic',
  description: 'Cool blues, dynamic background from your own footage.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 13,
  fps: 30,
  background: { type: 'solid', color: '#03070F' },
  accent: '#60A5FA',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Engineered for scale' }],
  build: (ctx) => {
    const scene = createScene('Tech', 13);
    scene.background = { type: 'solid', color: '#03070F' };
    const clip = footage(ctx, {
      start: 0,
      duration: 13,
      scale: 0.86,
      cornerRadius: 18,
      background: { type: 'dynamic', blur: 70, scale: 1.45, brightness: 0.42 },
      motion: { entrance: 'scale', entranceDuration: 1, exit: 'fade', exitDuration: 0.7, idle: 'smoothZoom', intensity: 0.5, feel: 'cinematic' },
      camera: { mode: 'dynamic', zoom: 1.28, smoothing: 0.8, focusPoints: [] },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Engineered for scale', {
        start: 0.5,
        duration: 4,
        fontSize: 72,
        color: '#DBEAFE',
        position: { x: 0, y: -ctx.canvas.height * 0.4 },
      }),
    );
    return [scene];
  },
};

const softMotion: TemplateDefinition = {
  id: 'soft-motion',
  name: 'Soft Motion',
  category: 'cinematic',
  description: 'Pastel gradient, rounded everything, weightless float.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 12,
  fps: 30,
  background: GRADIENT('#E0E7FF', '#FCE7F3', 120),
  accent: '#6366F1',
  textSlots: [{ key: 'title', label: 'Headline', placeholder: 'Calm by design' }],
  build: (ctx) => {
    const scene = createScene('Soft Motion', 12);
    scene.background = GRADIENT('#E0E7FF', '#FCE7F3', 120);
    const clip = footage(ctx, {
      start: 0,
      duration: 12,
      scale: 0.84,
      position: { x: 0, y: 50 },
      cornerRadius: 30,
      shadow: { enabled: true, blur: 100, y: 40, opacity: 0.16, color: '#312E81', spread: 0 },
      motion: { entrance: 'scale', entranceDuration: 1, exit: 'scaleDown', exitDuration: 0.7, idle: 'float', intensity: 0.7, feel: 'smooth' },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Calm by design', {
        start: 0.3,
        duration: 4,
        fontSize: 78,
        color: '#312E81',
        position: { x: 0, y: -ctx.canvas.height * 0.38 },
      }),
    );
    return [scene];
  },
};

/* ------------------------------------------------------------------- quick */

function quickFrame(
  id: string,
  name: string,
  description: string,
  frame: VideoLayer['frame']['kind'],
  canvas: Size,
  aspectLabel: string,
  background: BackgroundSpec,
): TemplateDefinition {
  return {
    id,
    name,
    category: 'quick',
    description,
    canvas,
    aspectLabel,
    duration: 10,
    fps: 30,
    background,
    accent: '#22D3EE',
    textSlots: [],
    build: (ctx) => {
      const scene = createScene(name, 10);
      scene.background = background;
      const clip = footage(ctx, {
        start: 0,
        duration: 10,
        frame: { kind: frame, url: 'app.example.com' },
        motion: { entrance: 'fade', entranceDuration: 0.6, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
      });
      if (clip) scene.layers.push(clip);
      return [scene];
    },
  };
}

const quickTemplates: TemplateDefinition[] = [
  quickFrame('floating-window', 'Floating Window', 'Just your recording, floating, with a soft shadow.', 'none', L, '16:9', GRADIENT('#1B2735', '#0B0F14')),
  quickFrame('browser-demo', 'Browser Demo', 'Recording inside a browser chrome.', 'browser', L, '16:9', GRADIENT('#E2E8F0', '#94A3B8', 150)),
  quickFrame('laptop-mockup', 'Laptop Mockup', 'Recording inside a laptop.', 'laptop', L, '16:9', GRADIENT('#111827', '#020617')),
  quickFrame('phone-mockup', 'Phone Mockup', 'Portrait recording inside a phone.', 'phone', P, '9:16', GRADIENT('#312E81', '#0B0F14', 160)),
];

const screenshotText: TemplateDefinition = {
  id: 'screenshot-text',
  name: 'Screenshot + Text',
  category: 'quick',
  description: 'Text on the left, your recording on the right. Explain and show at once.',
  canvas: L,
  aspectLabel: '16:9',
  duration: 10,
  fps: 30,
  background: { type: 'solid', color: '#0B0F14' },
  accent: '#22D3EE',
  textSlots: [
    { key: 'title', label: 'Headline', placeholder: 'Made simple' },
    { key: 'body', label: 'Supporting line', placeholder: 'Record, choose a template, export.' },
  ],
  build: (ctx) => {
    const scene = createScene('Split', 10);
    scene.background = { type: 'solid', color: '#0B0F14' };
    const clip = footage(ctx, {
      start: 0,
      duration: 10,
      scale: 0.58,
      position: { x: ctx.canvas.width * 0.21, y: 0 },
      cornerRadius: 16,
      motion: { entrance: 'slideLeft', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
    });
    if (clip) scene.layers.push(clip);
    scene.layers.push(
      title(ctx, 'title', 'Made simple', {
        start: 0.2,
        duration: 9.8,
        fontSize: 72,
        align: 'left',
        maxWidth: ctx.canvas.width * 0.34,
        position: { x: -ctx.canvas.width * 0.24, y: -60 },
        motion: { entrance: 'slideUp', entranceDuration: 0.7, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
      }),
      title(ctx, 'body', 'Record, choose a template, export.', {
        start: 0.45,
        duration: 9.55,
        fontSize: 34,
        fontWeight: 400,
        color: '#9CA3AF',
        align: 'left',
        letterSpacing: 0,
        lineHeight: 1.4,
        maxWidth: ctx.canvas.width * 0.32,
        position: { x: -ctx.canvas.width * 0.24, y: 40 },
        motion: { entrance: 'slideUp', entranceDuration: 0.7, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' },
      }),
    );
    return [scene];
  },
};

/* ------------------------------------------------------------------ export */

export const TEMPLATES: TemplateDefinition[] = [
  cleanAppDemo,
  saasDemo,
  mobileAppDemo,
  floatingAndroid,
  premiumApp,
  featureFocusMobile,
  mobileProductDemo,
  appWalkthrough,
  fullscreenApp,
  appPlusPhoneFrame,
  dashboardDemo,
  productWalkthrough,
  ...socialTemplates,
  featureHighlight,
  newFeature,
  productLaunch,
  uiShowcase,
  beforeAfter,
  darkCinematic,
  premiumProduct,
  minimalApple,
  softMotion,
  techShowcase,
  ...quickTemplates,
  screenshotText,
];

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string; blurb: string }[] = [
  { id: 'appDemo', label: 'App Demos', blurb: 'Show your product doing its job.' },
  { id: 'social', label: 'Social Media', blurb: 'Sized and paced for feeds.' },
  { id: 'showcase', label: 'Product Showcase', blurb: 'Launches, features, comparisons.' },
  { id: 'cinematic', label: 'Cinematic', blurb: 'Slow, premium, confident.' },
  { id: 'quick', label: 'Quick Templates', blurb: 'One decision and you are done.' },
];

export const getTemplate = (id: string): TemplateDefinition | undefined =>
  TEMPLATES.find((t) => t.id === id);

export const templatesByCategory = (category: TemplateCategory): TemplateDefinition[] =>
  TEMPLATES.filter((t) => t.category === category);

/** Applies a template to a project, carrying existing footage and media across. */
export function applyTemplate(
  template: TemplateDefinition,
  current: { scenes: Scene[]; canvas: Size },
  values: Record<string, string> = {},
): { scenes: Scene[]; canvas: Size } {
  const existingFootage = current.scenes
    .flatMap((s) => s.layers)
    .find((l): l is VideoLayer => l.type === 'video');

  const scenes = template.build({
    footage: existingFootage,
    canvas: template.canvas,
    values,
    makeId: () => uid('ly'),
  });

  return { scenes, canvas: template.canvas };
}
