import { describe, expect, it } from 'vitest'
import { profileForQuality, suggestQuality, type DeviceHints } from '../src/engine/quality'

const desktop: DeviceHints = { coarse: false, cores: 8, memoryGB: 16, dpr: 2, saveData: false }
const phone: DeviceHints = { coarse: true, cores: 4, memoryGB: 4, dpr: 3, saveData: false }

describe('mobile quality tiers', () => {
  it('selects a conservative tier for constrained devices', () => {
    expect(suggestQuality({ ...phone, memoryGB: 2 })).toBe('low')
    expect(suggestQuality(phone)).toBe('medium')
    expect(suggestQuality(desktop)).toBe('high')
    expect(suggestQuality({ ...desktop, saveData: true })).toBe('low')
  })

  it('limits mobile GPU and streaming pressure', () => {
    const low = profileForQuality('low', phone)
    const medium = profileForQuality('medium', phone)
    const highDesktop = profileForQuality('high', desktop)
    expect(low.renderScale).toBeLessThan(medium.renderScale)
    expect(low.shadows).toBe(false)
    expect(medium.bloom).toBe(false)
    expect(medium.assetConcurrency).toBe(2)
    expect(medium.anisotropy).toBe(2)
    expect(highDesktop.bloom).toBe(true)
    expect(highDesktop.shadowMap).toBe(2048)
  })
})
