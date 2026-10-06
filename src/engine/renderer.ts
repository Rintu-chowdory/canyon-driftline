import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Quality } from './save'
import { deviceHintsFromNavigator, profileForQuality, suggestQuality as suggestDeviceQuality, type QualityProfile } from './quality'

export { profileForQuality }
export const QUALITY_PRESETS = { low: profileForQuality('low', { coarse: false, cores: 8, memoryGB: undefined, dpr: 1, saveData: false }), medium: profileForQuality('medium', { coarse: false, cores: 8, memoryGB: undefined, dpr: 1, saveData: false }), high: profileForQuality('high', { coarse: false, cores: 8, memoryGB: undefined, dpr: 1, saveData: false }) } as const
export function suggestQuality(): Quality { return suggestDeviceQuality(deviceHintsFromNavigator()) }

/** A camera drawn into a rectangle of the canvas (fractions, origin bottom-left). */
export interface View {
  camera: THREE.PerspectiveCamera
  x: number
  y: number
  w: number
  h: number
  /** Called right before this view renders (per-player highlights, shadow focus). */
  before?: () => void
}

/**
 * Owns WebGL plus the mobile quality policy. The saved low/medium/high setting controls
 * feature availability; renderScale adapts within that tier when sustained frame time changes.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private preset: QualityProfile
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera
  private split = false
  private renderScale: number
  private frameEma = 1 / 60
  private slowFrames = 0
  private fastFrames = 0
  private adjustCooldown = 0

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = profileForQuality(quality, deviceHintsFromNavigator())
    this.renderScale = this.preset.renderScale
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.0
    this.gl.shadowMap.type = THREE.PCFShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize(), { passive: true })
  }

  get qualityProfile(): QualityProfile { return this.preset }
  get shadowsEnabled(): boolean { return this.preset.shadows }
  get shadowMapSize(): number { return this.preset.shadowMap }
  get anisotropyLimit(): number { return this.preset.anisotropy }
  get assetConcurrency(): number { return this.preset.assetConcurrency }
  get effectBudget(): number { return Math.max(0.28, this.preset.particleBudget * (this.renderScale / this.preset.renderScale) ** 2) }
  get currentRenderScale(): number { return this.renderScale }

  applyQuality(quality: Quality): void {
    this.preset = profileForQuality(quality, deviceHintsFromNavigator())
    this.renderScale = this.preset.renderScale
    this.slowFrames = 0
    this.fastFrames = 0
    this.adjustCooldown = 0
    this.gl.shadowMap.enabled = this.preset.shadows
    this.bloom?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.updatePixelRatio()
    this.resize()
  }

  /** Feed measured frame time once per animation frame; only sustained pressure changes scale. */
  sampleFrame(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.5) return
    this.frameEma = this.frameEma * 0.92 + dt * 0.08
    this.adjustCooldown = Math.max(0, this.adjustCooldown - dt)
    if (this.adjustCooldown > 0) return
    if (this.frameEma > 1 / 43) {
      this.slowFrames += 1
      this.fastFrames = 0
    } else if (this.frameEma < 1 / 57) {
      this.fastFrames += 1
      this.slowFrames = 0
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1)
      this.fastFrames = Math.max(0, this.fastFrames - 1)
    }
    if (this.slowFrames >= 24 && this.renderScale > this.preset.minRenderScale + 0.001) {
      this.setRenderScale(Math.max(this.preset.minRenderScale, this.renderScale - 0.08))
      this.slowFrames = 0
      this.adjustCooldown = 1.5
    } else if (this.fastFrames >= 120 && this.renderScale < this.preset.renderScale - 0.001) {
      this.setRenderScale(Math.min(this.preset.renderScale, this.renderScale + 0.05))
      this.fastFrames = 0
      this.adjustCooldown = 2
    }
  }

  private setRenderScale(scale: number): void {
    this.renderScale = Math.max(this.preset.minRenderScale, Math.min(this.preset.renderScale, scale))
    this.updatePixelRatio()
    this.resize()
  }

  private updatePixelRatio(): void {
    const pr = this.split ? this.preset.splitPixelRatio : this.preset.pixelRatio
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr * this.renderScale))
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer | undefined {
    if (!this.preset.bloom) return undefined
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.composer?.dispose()
    this.bloom?.dispose()
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloom = new UnrealBloomPass(size, 0.42, 0.4, 2.0)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
  }

  render(scene: THREE.Scene, views: View[]): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    const split = views.length > 1
    if (split !== this.split) {
      this.split = split
      this.updatePixelRatio()
      this.resize()
    }
    if (!split) {
      const v = views[0]
      const aspect = w / h
      if (Math.abs(v.camera.aspect - aspect) > 1e-3) {
        v.camera.aspect = aspect
        v.camera.updateProjectionMatrix()
      }
      v.before?.()
      this.gl.setScissorTest(false)
      this.gl.setViewport(0, 0, w, h)
      const composer = this.ensureComposer(scene, v.camera)
      if (composer) composer.render()
      else this.gl.render(scene, v.camera)
      return
    }
    this.gl.setScissorTest(true)
    for (const v of views) {
      const px = Math.round(v.x * w)
      const py = Math.round(v.y * h)
      const pw = Math.round(v.w * w)
      const ph = Math.round(v.h * h)
      const aspect = pw / Math.max(1, ph)
      if (Math.abs(v.camera.aspect - aspect) > 1e-3) {
        v.camera.aspect = aspect
        v.camera.updateProjectionMatrix()
      }
      v.before?.()
      this.gl.setViewport(px, py, pw, ph)
      this.gl.setScissor(px, py, pw, ph)
      this.gl.render(scene, v.camera)
    }
    this.gl.setScissorTest(false)
  }
}
