import type { Quality } from './save'

export interface DeviceHints {
  coarse: boolean
  cores: number
  memoryGB: number | undefined
  dpr: number
  saveData: boolean
}

export interface QualityProfile {
  quality: Quality
  mobile: boolean
  pixelRatio: number
  splitPixelRatio: number
  renderScale: number
  minRenderScale: number
  shadows: boolean
  shadowMap: number
  bloom: boolean
  antialias: boolean
  anisotropy: number
  particleBudget: number
  assetConcurrency: number
}

export function deviceHintsFromNavigator(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    cores: nav.hardwareConcurrency ?? 4,
    memoryGB: nav.deviceMemory,
    dpr: window.devicePixelRatio || 1,
    saveData: nav.connection?.saveData === true,
  }
}

export function suggestQuality(hints: DeviceHints): Quality {
  if (hints.saveData || hints.memoryGB !== undefined && hints.memoryGB <= 2 || hints.cores <= 2) return 'low'
  if (hints.coarse || hints.memoryGB !== undefined && hints.memoryGB <= 4 || hints.cores <= 4) return 'medium'
  return 'high'
}

export function profileForQuality(quality: Quality, hints: DeviceHints): QualityProfile {
  const mobile = hints.coarse || hints.memoryGB !== undefined && hints.memoryGB <= 4 || hints.cores <= 4
  const low = quality === 'low'
  const high = quality === 'high'
  return {
    quality,
    mobile,
    pixelRatio: low ? 1 : mobile ? (high ? 1.5 : 1.25) : high ? 2 : 1.5,
    splitPixelRatio: low ? 0.75 : mobile ? 0.85 : high ? 1.15 : 1,
    renderScale: low ? (mobile ? 0.72 : 0.85) : mobile ? (high ? 0.9 : 0.82) : 1,
    minRenderScale: low ? 0.58 : mobile ? 0.68 : 0.8,
    shadows: high || !mobile && quality === 'medium',
    shadowMap: low ? 512 : mobile ? 768 : high ? 2048 : 1024,
    bloom: high && !mobile,
    antialias: !low,
    anisotropy: mobile ? 2 : high ? 4 : 3,
    particleBudget: low ? 0.42 : mobile ? (high ? 0.72 : 0.62) : quality === 'medium' ? 0.8 : 1,
    assetConcurrency: mobile ? 2 : 4,
  }
}
