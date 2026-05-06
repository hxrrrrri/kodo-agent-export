---
name: 3d-web-design
description: Use this skill for building 3D web experiences — Three.js, React Three Fiber (R3F), WebGL, scroll-driven 3D, interactive product viewers, particle systems, model loading, animation, and performance optimization. Triggers on "add 3D", "Three.js", "WebGL", "R3F", "3D scene", "product viewer", "scroll 3D", "particle system", "glTF", "GSAP 3D", "immersive experience". Different from ui-polish (polish existing UI) and motion-craft (2D CSS/JS animation). This skill covers the full pipeline from scene setup to production-ready 3D with performance budgets.
---

# 3D Web Design

Build performant 3D web experiences that load fast, run at 60fps, and degrade gracefully. The output is production-ready scenes with correct performance budgets, not demos that stutter on real devices.

## Orientation

3D web has three abstraction layers:

1. **WebGL** — raw GPU API. Never write directly unless you need custom shaders.
2. **Three.js** — WebGL abstraction. Scene graph, materials, lights, animation. Widest ecosystem.
3. **React Three Fiber (R3F)** — React-idiomatic Three.js. Declarative JSX scenes, hooks, Suspense. Use for React projects.

Decision: if you're in a React app → R3F. If vanilla/Vue/Svelte → Three.js directly. If you need planet-scale geo → Cesium/MapboxGL. If you need game-level physics → Babylon.js.

The 3D web failure modes:
- Scene that runs at 60fps on M2 MacBook, 8fps on mobile
- Models that ship at 50MB uncompressed
- No fallback when WebGL is unavailable
- First contentful paint blocked by model loading

All four are solved by decisions made before writing a single line of scene code.

---

## Execution Protocol

### Step 1 — Decide scene complexity budget FIRST

Before any code, categorize the scene:

| Budget tier | GPU draw calls | Triangle count | Texture memory | Target device |
|------------|---------------|----------------|----------------|---------------|
| **Hero accent** | <20 | <50K | <16MB | All devices |
| **Interactive product** | <50 | <200K | <32MB | Desktop + mid-range mobile |
| **Rich environment** | <100 | <500K | <64MB | Desktop + high-end mobile |
| **Immersive scene** | >100 | >500K | >64MB | Desktop only, WebGL 2 required |

If mobile is in the target, stay ≤ Hero accent or Interactive product.

### Step 2 — Set up canvas correctly

```jsx
// R3F setup — correct canvas configuration
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}                    // cap pixel ratio — never let retina explode draw calls
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 5], fov: 45 }}
      performance={{ min: 0.5 }}       // adaptive performance — drop dpr under load
    >
      <Suspense fallback={<LoadingFallback />}>
        <SceneContent />
      </Suspense>
    </Canvas>
  )
}
```

```js
// Raw Three.js setup
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // cap at 2x
renderer.setSize(container.clientWidth, container.clientHeight)
renderer.shadowMap.enabled = false // disable unless shadows explicitly needed
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)
```

### Step 3 — Load models correctly

```jsx
// R3F model loading with Suspense + Preload
import { useGLTF } from '@react-three/drei'

// Component inside Suspense boundary
function ProductModel() {
  const { scene } = useGLTF('/models/product.glb')
  return <primitive object={scene} />
}

// Preload at module level — downloads before component mounts
useGLTF.preload('/models/product.glb')
```

```js
// Raw Three.js model loading
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/') // local decoder, not CDN

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)
loader.load('/models/product.glb', (gltf) => {
  scene.add(gltf.scene)
})
```

**Model optimization checklist before loading:**
- Compress with Draco: `gltf-transform optimize input.glb output.glb --draco.method edgebreaker`
- Target size: <1MB per model for hero accent, <5MB for interactive product
- Texture formats: .ktx2 (GPU-compressed) or .webp (CPU-decoded). Never uncompressed PNG in 3D scenes.
- LOD: 3 levels (100% full, 50% mid, 20% distant) for complex models

### Step 4 — Lighting setup

```jsx
// R3F — balanced lighting rig for product visualization
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        castShadow={false}   // shadows expensive — off unless required
      />
      <pointLight position={[-3, 2, -3]} intensity={0.6} color="#fff5e6" />
      {/* Optional: environment map for realistic reflections */}
      <Environment preset="studio" />
    </>
  )
}
```

**Lighting cost table:**
| Light type | Draw call cost | Shadow cost | Use when |
|-----------|---------------|------------|----------|
| AmbientLight | 0 | 0 | Always — base fill |
| DirectionalLight | Low | High (+1 shadow map) | Key light, avoid shadows on mobile |
| PointLight | Medium | High (+6 shadow maps) | Accent only |
| SpotLight | Medium | High (+1 shadow map) | Focused beam effects |
| HemisphereLight | Low | 0 | Sky/ground gradient — good for outdoor |
| Environment map | 0 | 0 | Best-quality, zero runtime cost — use for reflective materials |

Rule: one directional key light + ambient + environment map covers 90% of use cases. No shadows unless the art direction requires them.

### Step 5 — Animation setup

```jsx
// R3F procedural animation via useFrame
import { useFrame, useRef } from '@react-three/fiber'

function RotatingModel() {
  const meshRef = useRef()
  
  useFrame((state, delta) => {
    meshRef.current.rotation.y += delta * 0.5 // delta-time — framerate-independent
  })
  
  return <mesh ref={meshRef}><boxGeometry /><meshStandardMaterial /></mesh>
}
```

```jsx
// R3F keyframe animation from glTF
import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect } from 'react'

function AnimatedModel() {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/character.glb')
  const { actions } = useAnimations(animations, group)
  
  useEffect(() => {
    const action = actions['Idle']
    action?.play()
    return () => action?.stop()
  }, [actions])
  
  return <primitive ref={group} object={scene} />
}
```

### Step 6 — Scroll binding

```jsx
// R3F + @react-three/drei scroll-driven scene
import { ScrollControls, useScroll } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

function ScrollDrivenScene() {
  return (
    <Canvas>
      <ScrollControls pages={5} damping={0.3}>
        <SceneWithScroll />
      </ScrollControls>
    </Canvas>
  )
}

function SceneWithScroll() {
  const scroll = useScroll()
  const meshRef = useRef()
  
  useFrame(() => {
    const offset = scroll.offset // 0-1 normalized scroll position
    meshRef.current.rotation.y = offset * Math.PI * 2
    meshRef.current.position.z = -offset * 10
  })
  
  return <mesh ref={meshRef}><torusKnotGeometry /><meshStandardMaterial /></mesh>
}
```

```js
// GSAP ScrollTrigger + Three.js
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '#scene-container',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 1,
  }
})

tl.to(mesh.rotation, { y: Math.PI * 2 })
  .to(mesh.position, { z: -10 }, '<') // '<' = same time
```

---

## Domain Reference

### Three.js core objects

```
Scene                 — root container, holds all objects
PerspectiveCamera     — frustum camera. fov 45-60° typical. fov 35° for product closeup.
WebGLRenderer         — renders scene to canvas
Mesh                  — geometry + material pair. The drawable unit.
BufferGeometry        — vertex data (positions, normals, UVs)
Material              — how surfaces respond to light
Light                 — illumination source
Group                 — empty container for transformation hierarchy
```

### Material types (choose correctly)

| Material | When | Cost |
|---------|------|------|
| `MeshBasicMaterial` | UI overlays, wireframes, non-lit | Cheapest |
| `MeshLambertMaterial` | Simple diffuse only | Low |
| `MeshPhongMaterial` | Diffuse + specular, older spec | Medium |
| `MeshStandardMaterial` | PBR — correct for most scenes | Medium-High |
| `MeshPhysicalMaterial` | PBR + clearcoat, transmission, iridescence | High |
| `ShaderMaterial` | Custom GLSL shaders | Varies |
| `MeshMatcapMaterial` | Pre-baked lighting — zero light cost | Low |

For product visualization: `MeshStandardMaterial` with environment map.
For particles/backgrounds: `MeshBasicMaterial` or custom shader.
For non-lit 3D text/UI: `MeshMatcapMaterial` — looks lit, zero light needed.

### R3F hooks

```jsx
useThree()        // access { camera, gl, scene, size, viewport }
useFrame(cb)      // called every frame — render loop hook
useLoader(Loader, url)  // suspense-compatible asset loading
useRef()          // mutable ref to Three.js objects
```

```jsx
// useThree: access renderer and camera
import { useThree } from '@react-three/fiber'

function AdaptiveScene() {
  const { gl, camera, viewport } = useThree()
  // viewport.width/height in world units — responsive positioning
  return <mesh position={[viewport.width / 2 - 1, 0, 0]} />
}
```

### R3F drei helpers (use liberally)

```
OrbitControls     — camera mouse/touch rotation
PerspectiveCamera — declarative camera
Environment       — HDR environment maps (presets: studio, city, forest, etc.)
useGLTF           — Suspense GLTF loading
useTexture        — Suspense texture loading
Html              — HTML elements in 3D space (for labels/tooltips)
Text              — 3D text via troika-three-text
MeshReflectorMaterial — reflective floor
ContactShadows    — fake but cheap shadow plane
Float             — gentle float animation
Sparkles          — GPU particle system
Stars             — starfield background
GradientTexture   — programmatic gradient materials
ScrollControls    — scroll-driven scenes
useScroll         — scroll position hook (inside ScrollControls)
useProgress       — loading progress (for custom loaders)
Preload           — preload assets before mount
```

### glTF/GLB format

- `.gltf` = JSON + separate binary/textures. Use for debugging.
- `.glb` = binary-packed single file. Use for production.
- Embedded textures: PNG default, convert to KTX2 for GPU compression
- Draco compression: geometry-only, 70-90% size reduction
- MeshOpt compression: geometry + morph targets, often better than Draco

Pipeline: Blender → export GLB → gltf-transform optimize → Draco/MeshOpt compress → web-ready

---

## Decision Framework

### Three.js vs. R3F

| Situation | Use |
|-----------|-----|
| React app, any complexity | R3F (ergonomics, Suspense, ecosystem) |
| Vanilla/Vue/Svelte/Angular | Three.js directly |
| Sharing 3D state with React state | R3F (useThree, context bridge) |
| Maximum performance, fine-grained control | Three.js directly |
| Rapid prototyping with components | R3F + drei |

### Three.js vs. Babylon.js vs. Cesium

| Use case | Recommended |
|----------|------------|
| General web 3D | Three.js / R3F |
| Game-level physics, complex collision | Babylon.js |
| Geospatial / mapping / globe visualization | Cesium / Mapbox |
| AR/VR WebXR experiences | Babylon.js or Three.js with WebXR addon |

### Scroll-driven vs. interactive

| Mode | When | Tech |
|------|------|------|
| Scroll-driven | Hero sections, storytelling, product reveals | ScrollControls, GSAP ScrollTrigger |
| Click/hover interactive | Product configurators, games, data exploration | OrbitControls, raycasting events |
| Idle ambient | Background scenes, decorative | useFrame procedural animation |
| Video-replacement | Hero backgrounds | Looping glb + MeshBasicMaterial |

### When to use fallback to 2D

Use WebGL fallback detection:

```js
function webglSupported() {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    )
  } catch {
    return false
  }
}

// Check performance tier
function isMidRangeOrBetter() {
  // Heuristic: mobile Safari on iPhone 11+ = OK, older = fallback
  const gl = document.createElement('canvas').getContext('webgl')
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info')
  const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : ''
  return !renderer.toLowerCase().includes('mali-4') && !renderer.toLowerCase().includes('adreno 3')
}
```

Fallback options ranked by fidelity:
1. `CSS 3D transforms` — perspective + rotateY/X, zero GPU overhead
2. `Spline.design embed` — pre-rendered 3D as interactive embed
3. `Lottie animation` — pre-rendered 3D as vector animation
4. `Video loop` — pre-rendered 3D as .webm video

---

## Quality Gates

Performance targets (measure with Chrome DevTools → Rendering → FPS Meter):

| Metric | Target | Critical threshold |
|--------|--------|-------------------|
| Frame rate | 60fps desktop, 30fps mobile | < 24fps = fail |
| Frame time | <16.6ms desktop, <33ms mobile | > 50ms = jank |
| Initial JS bundle | < 150KB (Three.js core is ~140KB minified) | > 500KB = blocking |
| Model download size | < 1MB hero, < 5MB interactive | > 10MB = unacceptable |
| Texture memory | < 16MB mobile, < 64MB desktop | > 128MB = crash risk |
| Draw calls | < 20 mobile, < 100 desktop | > 200 = GPU bottleneck |
| Triangles | < 50K mobile, < 500K desktop | > 1M = render bottleneck |
| Canvas pixel ratio | ≤ 2.0 | > 2.5 = fill-rate limited |

Core Web Vitals targets:
- FCP < 2.5s (model loading must not block first paint)
- LCP < 3.5s (largest content — often the 3D canvas)
- CLS < 0.1 (reserve canvas space with aspect-ratio CSS before WebGL init)
- INP < 200ms (user interactions must respond fast even with 3D running)

Profiling commands:
```js
// Three.js built-in stats
import Stats from 'three/addons/libs/stats.module.js'
const stats = new Stats()
document.body.appendChild(stats.dom)
// in render loop: stats.update()

// R3F — enable perf panel
import { Perf } from 'r3f-perf'
// <Perf position="top-left" /> inside Canvas
```

---

## Worked Examples

### Example 1: Scroll-driven 3D text reveal

```jsx
import { Canvas, useFrame } from '@react-three/fiber'
import { Text, ScrollControls, useScroll, Float } from '@react-three/drei'
import { useRef } from 'react'

function HeroText() {
  const ref = useRef()
  const scroll = useScroll()
  
  useFrame(() => {
    const t = scroll.offset
    ref.current.position.y = -t * 3           // drift down on scroll
    ref.current.material.opacity = 1 - t * 2  // fade out
    ref.current.rotation.x = t * 0.5          // slight tilt
  })
  
  return (
    <Float speed={1} rotationIntensity={0.1} floatIntensity={0.2}>
      <Text
        ref={ref}
        font="/fonts/Druk-Wide-Bold.woff"
        fontSize={1.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        transparent
      >
        KODO
      </Text>
    </Float>
  )
}

export function HeroScene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 45 }}>
      <ScrollControls pages={3} damping={0.3}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <HeroText />
      </ScrollControls>
    </Canvas>
  )
}
```

### Example 2: Interactive product viewer (360° orbit)

```jsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Environment, ContactShadows } from '@react-three/drei'
import { Suspense } from 'react'

function Product() {
  const { scene } = useGLTF('/models/sneaker.glb')
  return <primitive object={scene} scale={1.5} position={[0, -0.5, 0]} />
}
useGLTF.preload('/models/sneaker.glb')

function LoadingPlaceholder() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color="#333" wireframe />
    </mesh>
  )
}

export function ProductViewer() {
  return (
    <div style={{ width: '100%', aspectRatio: '1 / 1' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4], fov: 35 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={<LoadingPlaceholder />}>
          <Environment preset="studio" />
          <Product />
          <ContactShadows
            position={[0, -0.8, 0]}
            opacity={0.4}
            scale={4}
            blur={2}
          />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.5}
          autoRotate
          autoRotateSpeed={2}
        />
      </Canvas>
    </div>
  )
}
```

### Example 3: GPU particle system

```jsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function Particles({ count = 5000 }) {
  const mesh = useRef()
  
  const [positions, colors] = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
      
      colors[i * 3] = Math.random()
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.5
      colors[i * 3 + 2] = 1.0
    }
    
    return [positions, colors]
  }, [count])
  
  useFrame((state) => {
    mesh.current.rotation.y = state.clock.elapsedTime * 0.05
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.03) * 0.1
  })
  
  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={colors} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  )
}
```

### Example 4: GSAP animation on model load

```js
// Raw Three.js + GSAP model animation
import { gsap } from 'gsap'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
loader.load('/models/logo.glb', (gltf) => {
  const model = gltf.scene
  model.position.y = -2 // start below view
  model.scale.setScalar(0) // start invisible
  scene.add(model)
  
  // Reveal animation on load
  gsap.timeline({ delay: 0.3 })
    .to(model.position, { y: 0, duration: 1.2, ease: 'expo.out' })
    .to(model.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'back.out(1.7)' }, '<0.2')
})
```

---

## Anti-Patterns

**1. Loading all models upfront**
Blocking: load 3 models (15MB) before any canvas renders. Use Suspense + lazy loading. Preload only the above-fold model. Lazy-load others on interaction.

**2. Unbounded particle count**
`count = 100000` on mobile = 8fps. Budget: ≤5,000 particles for mobile tier, ≤50,000 for desktop. Test on actual mid-range Android, not M2 MacBook.

**3. `setPixelRatio(window.devicePixelRatio)` without cap**
iPhone 15 Pro = 3x DPR. At 3x, fill rate 9x that of 1x. Cap at 2.0: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`.

**4. Shadow maps on every light**
Each shadow-casting light = 1-6 additional render passes. For a 3-light rig = 4-18 extra passes per frame. Disable unless shadows are explicitly required by art direction. Use `ContactShadows` (rendered once, not per frame) as substitute.

**5. Recreating geometry/material in render loop**
```js
// WRONG — allocates new geometry every frame
function update() {
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  requestAnimationFrame(update)
}
```
Create geometry/materials once. Reuse refs. Dispose when removing.

**6. No `dispose()` on unmount**
Three.js doesn't garbage collect geometry, materials, textures automatically. Memory leak in SPA navigation.
```js
// R3F — dispose on unmount
useEffect(() => {
  return () => {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }
}, [])
```

**7. No `CLS` fix for canvas**
Canvas without reserved space shifts layout when initialized. Fix:
```css
.canvas-container {
  aspect-ratio: 16 / 9;
  width: 100%;
  /* canvas fills this before WebGL inits */
}
```

**8. OrbitControls without damping**
Without `enableDamping: true`, camera snaps instantly = feels cheap. Always: `controls.enableDamping = true; controls.dampingFactor = 0.05`.

---

## Weak Model Fallbacks

When device/browser lacks WebGL or performance budget exceeded:

```jsx
// R3F adaptive fallback
import { useDetectGPU } from '@react-three/drei'

function AdaptiveHero() {
  const gpu = useDetectGPU()
  
  if (!gpu.isMobile && gpu.tier >= 2) {
    return <FullScene />
  }
  
  if (gpu.tier >= 1) {
    return <LiteScene />  // no particles, no shadows, lower poly
  }
  
  // CSS 3D fallback — zero WebGL
  return <CSS3DFallback />
}
```

```css
/* CSS 3D fallback — perspective transforms, zero GPU 3D cost */
.css3d-hero {
  perspective: 1000px;
  perspective-origin: 50% 50%;
}

.css3d-card {
  transform: rotateY(-15deg) rotateX(5deg) translateZ(20px);
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.css3d-card:hover {
  transform: rotateY(0deg) rotateX(0deg) translateZ(40px);
}
```

```jsx
// Spline fallback (pre-rendered interactive 3D, CDN-hosted)
// Use when building actual 3D is out of scope
import Spline from '@splinetool/react-spline'

function SplineFallback() {
  return (
    <Spline
      scene="https://prod.spline.design/[scene-id]/scene.splinecode"
      style={{ width: '100%', height: '100vh' }}
    />
  )
}
```

---

## Output Template

When this skill is active, deliverable structure:

```
Scene: [one-line description]
Budget tier: [Hero accent / Interactive product / Rich environment / Immersive]
Tech: [R3F / Three.js / R3F + drei]

Setup:
  [Canvas config, dpr cap, camera position]

Assets:
  [Model URLs, sizes, compression method]
  [Textures, formats, memory footprint]

Lighting rig:
  [Light types, positions, intensity, shadow: on/off]

Animation:
  [useFrame, GSAP, AnimationMixer, scroll binding]

Performance:
  Draw calls estimate: [N]
  Triangle count: [N]
  Mobile safe: [yes/no — reason if no]
  Fallback: [CSS 3D / Spline / video / none needed]

Code:
  [Full scene component(s)]
```
