export interface TexturePreset {
  id: string;
  name: string;
  category: string;
  icon: string;
  dataUrl: string;
}

// Generate SVG pattern data URLs
function createSvgDataUrl(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

export const PRESET_TEXTURES: TexturePreset[] = [
  {
    id: "parchment",
    name: "Ancient Parchment",
    category: "Historical",
    icon: "📜",
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
        <defs>
          <filter id="paper" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
            <feDiffuseLighting in="noise" lighting-color="#eed8a1" surfaceScale="2" result="light">
              <feDistantLight azimuth="45" elevation="60" />
            </feDiffuseLighting>
            <feBlend mode="multiply" in="SourceGraphic" in2="light" />
          </filter>
          <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stop-color="#dfc488"/>
            <stop offset="100%" stop-color="#a88242"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#vignette)" filter="url(#paper)"/>
        <circle cx="150" cy="150" r="100" fill="#caa560" opacity="0.15" filter="blur(20px)"/>
        <circle cx="450" cy="400" r="120" fill="#8f6927" opacity="0.2" filter="blur(30px)"/>
      </svg>
    `),
  },
  {
    id: "gold",
    name: "Gold Leaf",
    category: "Luxury",
    icon: "✨",
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#bf953f" />
            <stop offset="25%" stop-color="#fcf6ba" />
            <stop offset="50%" stop-color="#b38728" />
            <stop offset="75%" stop-color="#fbf5b7" />
            <stop offset="100%" stop-color="#aa771c" />
          </linearGradient>
          <filter id="goldNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" result="noise"/>
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.3 0"/>
            <feBlend mode="overlay" in="SourceGraphic"/>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#goldGrad)" filter="url(#goldNoise)"/>
      </svg>
    `),
  },
  {
    id: "marble",
    name: "Imperial Marble",
    category: "Stone",
    icon: "🏛️",
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
        <defs>
          <linearGradient id="marbleBase" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="50%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
          <filter id="veins">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="6" result="turb"/>
            <feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 0 0.4  0 0 0 0.6 0" result="veinColor"/>
            <feBlend mode="multiply" in="SourceGraphic" in2="veinColor"/>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#marbleBase)" filter="url(#veins)"/>
      </svg>
    `),
  },
  {
    id: "topography",
    name: "Contour Lines",
    category: "Map",
    icon: "🗺️",
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
        <rect width="100%" height="100%" fill="#1e293b"/>
        <g stroke="#f59e0b" stroke-width="1.5" fill="none" opacity="0.45">
          <ellipse cx="300" cy="300" rx="260" ry="240" />
          <ellipse cx="300" cy="300" rx="220" ry="200" />
          <ellipse cx="300" cy="300" rx="180" ry="160" />
          <ellipse cx="300" cy="300" rx="140" ry="120" />
          <ellipse cx="300" cy="300" rx="100" ry="80" />
          <ellipse cx="300" cy="300" rx="60" ry="40" />
          <ellipse cx="180" cy="180" rx="90" ry="80" stroke="#38bdf8" />
          <ellipse cx="180" cy="180" rx="60" ry="50" stroke="#38bdf8" />
          <ellipse cx="420" cy="420" rx="110" ry="90" stroke="#34d399" />
          <ellipse cx="420" cy="420" rx="70" ry="50" stroke="#34d399" />
        </g>
      </svg>
    `),
  },
  {
    id: "cosmic",
    name: "Cosmic Nebula",
    category: "Abstract",
    icon: "🌌",
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
        <defs>
          <radialGradient id="nebula1" cx="30%" cy="30%" r="60%">
            <stop offset="0%" stop-color="#ec4899" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="nebula2" cx="70%" cy="70%" r="60%">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="nebula3" cx="50%" cy="50%" r="40%">
            <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="#090d16"/>
        <rect width="100%" height="100%" fill="url(#nebula1)"/>
        <rect width="100%" height="100%" fill="url(#nebula2)"/>
        <rect width="100%" height="100%" fill="url(#nebula3)"/>
        <circle cx="120" cy="80" r="2" fill="#ffffff" opacity="0.8"/>
        <circle cx="280" cy="140" r="1.5" fill="#ffffff" opacity="0.9"/>
        <circle cx="450" cy="220" r="2.5" fill="#ffffff" opacity="0.7"/>
        <circle cx="190" cy="420" r="1.5" fill="#ffffff" opacity="0.8"/>
        <circle cx="390" cy="510" r="2" fill="#ffffff" opacity="0.9"/>
        <circle cx="520" cy="380" r="1" fill="#ffffff" opacity="0.7"/>
      </svg>
    `),
  },
  {
    id: "geometric",
    name: "Islamic Geometric",
    category: "Pattern",
    icon: "🔷",
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <rect width="100%" height="100%" fill="#064e3b"/>
        <g stroke="#fbbf24" stroke-width="2" fill="none" opacity="0.75">
          <path d="M0,50 L50,0 L100,50 L50,100 Z" />
          <path d="M100,50 L150,0 L200,50 L150,100 Z" />
          <path d="M0,150 L50,100 L100,150 L50,200 Z" />
          <path d="M100,150 L150,100 L200,150 L150,200 Z" />
          <circle cx="50" cy="50" r="25" stroke="#34d399"/>
          <circle cx="150" cy="50" r="25" stroke="#34d399"/>
          <circle cx="50" cy="150" r="25" stroke="#34d399"/>
          <circle cx="150" cy="150" r="25" stroke="#34d399"/>
          <polygon points="100,75 125,100 100,125 75,100" stroke="#f59e0b" fill="#047857" fill-opacity="0.3"/>
        </g>
      </svg>
    `),
  },
];
