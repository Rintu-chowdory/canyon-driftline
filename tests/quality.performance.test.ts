import { describe, expect, it } from 'vitest'
import { profileForQuality, suggestQuality, type DeviceHints } from '../src/engine/quality'

const desktop: DeviceHints = { coarse: false, cores: 8, memoryGB: 16, dpr: 2, saveData: false }
const mobile: DeviceHints = { coarse: true, cores: 4, memoryGB: 4, dpr: 3, saveData: false }

function benchmark(iterations: number): { elapsedMs: number; checksum: number } {
  let checksum = 0
  const started = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    const hints = i % 2 === 0 ? desktop : mobile
    const quality = suggestQuality(hints)
    const profile = profileForQuality(quality, hints)
    checksum += profile.renderScale + profile.particleBudget + profile.assetConcurrency
  }
  return { elapsedMs: performance.now() - started, checksum }
}

describe('quality-tier CI performance', () => {
  it('keeps quality decisions and profile generation within the CPU budget', () => {
    const iterations = 250_000
    const result = benchmark(iterations)

    // Guards against dead-code elimination and invalid benchmark output.
    expect(result.checksum).toBeGreaterThan(iterations)
    expect(Number.isFinite(result.elapsedMs)).toBe(true)

    // This measures pure policy overhead, not GPU FPS or physical-device performance.
    // A generous limit avoids false failures on shared CI runners.
    expect(result.elapsedMs).toBeLessThan(1_500)
    console.log(`quality-tier benchmark: ${iterations} iterations in ${result.elapsedMs.toFixed(2)} ms`)
  })
})
