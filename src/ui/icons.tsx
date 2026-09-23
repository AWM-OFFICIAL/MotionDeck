/** Line icons drawn at a 24px grid with a 1.7 stroke — one consistent family. */

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 16, children, ...rest }: P) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconRecord = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconImport = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V3" />
    <path d="m7 10 5 5 5-5" />
    <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
  </Svg>
);

export const IconTemplates = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
);

export const IconElements = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5" />
    <rect x="12" y="12" width="9" height="9" rx="2" />
  </Svg>
);

export const IconProject = (p: P) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" />
  </Svg>
);

export const IconPause = (p: P) => (
  <Svg {...p}>
    <rect x="6.5" y="4.5" width="3.8" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.7" y="4.5" width="3.8" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Svg>
);

export const IconRedo = (p: P) => (
  <Svg {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Svg>
);

export const IconExport = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Svg>
);

export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const IconEyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.3" />
    <path d="M6.3 7.8A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.9 9.9 0 0 0 4-.8" />
    <path d="m3 3 18 18" />
  </Svg>
);

export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Svg>
);

export const IconUnlock = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 7.5-2" />
  </Svg>
);

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
    <path d="M6 7l.9 12.1A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.9L18 7" />
  </Svg>
);

export const IconDuplicate = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="m8 5 7 7-7 7" />
  </Svg>
);

export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconText = (p: P) => (
  <Svg {...p}>
    <path d="M5 6.5V5h14v1.5" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </Svg>
);

export const IconShape = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="10" height="10" rx="2" />
    <circle cx="15.5" cy="15.5" r="4.5" />
  </Svg>
);

export const IconArrow = (p: P) => (
  <Svg {...p}>
    <path d="M5 19 19 5" />
    <path d="M11 5h8v8" />
  </Svg>
);

export const IconCallout = (p: P) => (
  <Svg {...p}>
    <path d="M20 5.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2l3 4 3-4h4a2 2 0 0 0 2-2z" />
  </Svg>
);

export const IconCursor = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.5 18 11l-5.6 1.6L10 19z" />
  </Svg>
);

export const IconDevice = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="13" height="10" rx="1.5" />
    <rect x="17" y="8" width="4.5" height="11" rx="1.2" />
  </Svg>
);

export const IconCamera = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="6.5" width="13" height="11" rx="2" />
    <path d="m15.5 11 6-3.5v9l-6-3.5z" />
  </Svg>
);

export const IconMedia = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="m3 15 4.5-4.5 4 4 3-3L21 17" />
    <circle cx="9" cy="9" r="1.4" />
  </Svg>
);

export const IconScenes = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="8" height="12" rx="1.5" />
    <rect x="13.5" y="6" width="8" height="12" rx="1.5" />
  </Svg>
);

export const IconAudio = (p: P) => (
  <Svg {...p}>
    <path d="M4 10v4M8 7v10M12 4.5v15M16 8v8M20 10.5v3" />
  </Svg>
);

export const IconSparkle = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13 4.5 11l5.6-2z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </Svg>
);

export const IconSplit = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v18" strokeDasharray="3 3" />
    <rect x="3" y="7" width="6" height="10" rx="1.5" />
    <rect x="15" y="7" width="6" height="10" rx="1.5" />
  </Svg>
);

export const IconZoomIn = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5M10.5 8v5M8 10.5h5" />
  </Svg>
);

export const IconZoomOut = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5M8 10.5h5" />
  </Svg>
);

export const IconFit = (p: P) => (
  <Svg {...p}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </Svg>
);

export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Svg>
);

export const IconMonitor = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 21h7M12 17v4" />
  </Svg>
);

export const IconWindow = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 9h18" />
    <circle cx="6" cy="6.7" r="0.7" fill="currentColor" />
  </Svg>
);

export const IconRegion = (p: P) => (
  <Svg {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1" strokeDasharray="2 2" />
  </Svg>
);

export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 18.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 8v5M12 16.5v.5" />
    <circle cx="12" cy="12" r="9" />
  </Svg>
);

export const IconKeyframe = (p: P) => (
  <Svg {...p}>
    <path d="M12 4.5 19.5 12 12 19.5 4.5 12z" />
  </Svg>
);

export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
);

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
  </Svg>
);

export const IconBackground = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <path d="m3 16 5-5 4.5 4.5L16 12l5 5" />
  </Svg>
);

export const IconHelp = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.7.35-1.1.85-1.1 1.65V14" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
  </Svg>
);
