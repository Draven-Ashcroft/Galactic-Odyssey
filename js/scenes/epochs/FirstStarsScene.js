/**
 * scenes/epochs/FirstStarsScene.js
 * ------------------------------------------------------------------
 * The First Stars epoch's dedicated scene, replacing PlaceholderScene
 * for 'first-stars' in sceneRegistry.js. Follows the standard
 * enter()/update()/exit() contract from BaseScene exactly — `this.root`
 * is the THREE.Group BaseScene's constructor already creates; nothing
 * here creates a second THREE.Scene or THREE.Camera, and SceneManager
 * remains solely responsible for adding/removing `this.root`. This
 * file does not modify CosmicWebScene.js or CosmicWebData.js — it only
 * imports and reuses the latter's exported generator (see
 * FirstStarsData.js for how).
 *
 * SCIENTIFIC PURPOSE (stylized, not a hydrodynamic simulation):
 * Population III stars — the universe's first stars — form from
 * primordial (essentially metal-free) hydrogen and helium gas that
 * collapses inside dark-matter minihalos, once cooling (e.g. via
 * molecular hydrogen) allows it to fragment and contract. They are
 * thought to have generally been far more massive, hotter, and
 * shorter-lived than typical stars today, though the exact mass
 * distribution remains an open research question. Their strong UV
 * radiation began reionizing the surrounding gas, and their deaths —
 * not universally understood to follow one identical pathway — produced
 * the universe's first significant metal enrichment. This scene is an
 * educational visualization of that broad picture, not a claim that
 * every dark-matter halo produces a star, or that every star's death
 * is resolved or identical — see FirstStarsData.js for how that
 * variability is represented.
 *
 * VISUAL REDESIGN (this pass): the star, its glow, its halo, and its
 * supernova remnant were previously rendered with low-subdivision
 * IcosahedronGeometry + flat MeshBasicMaterial — at close range or
 * small scale this reads as a faceted polygon, not a glowing star.
 * All of that is replaced with layered, GPU-cheap THREE.Points using
 * one shared soft radial-gradient CanvasTexture (`createGlowTexture()`
 * below, generated once per scene instance) instead of any polygon
 * geometry at all:
 *   - `_starCorePoints` — one point per site, small, intensely bright
 *     white-blue: the hot core.
 *   - `_starGlowPoints` — one point per site, larger, softer, the
 *     epoch's own blue-white: the volumetric glow around the core.
 *   - `_starHaloPoints` — a handful of small, seeded, ASYMMETRIC
 *     offset points per site (see FirstStarsData.js's `haloPoints`) —
 *     an irregular gaseous halo, deliberately not a perfect sphere.
 *   - `_ejectaPoints` — many seeded points per site (see
 *     FirstStarsData.js's `ejectaPoints`), each with its OWN outward
 *     direction/speed/fade timing — the supernova shell/ejecta. A
 *     ragged, asymmetric expanding cloud, not one smooth geometric
 *     shell, and not a bomb-style fireball (restrained blue-white
 *     palette throughout, shifting only slightly warmer — a subtle
 *     nod to heavy-element enrichment, see `_updateEjecta()` — never
 *     into orange/red "fire" territory).
 * None of these layers use per-vertex size variation (THREE's
 * PointsMaterial.size is material-wide, not per-point, and a custom
 * shader was judged more risk than this scene needs) — instead, each
 * layer's apparent "growing/shrinking" comes entirely from per-point
 * BRIGHTNESS (vertexColors), same technique every other Points system
 * in this codebase already uses. This works because the soft gradient
 * texture's falloff means a brighter point's visible glow genuinely
 * covers more pixels than a dim one at the identical literal size —
 * brightness modulation alone produces a real apparent-size effect.
 *
 * PROTOSTAR TRANSITION: `resolveStarPhase()`'s new `protostarT` (see
 * FirstStarsData.js) drives a dim, warm-tinted glow at the star's
 * position during the LAST part of gas collapse, before true
 * ignition — so the sequence reads as gas clump -> protostar -> full
 * star, not a cloud suddenly snapping to a bright dot.
 *
 * COSMIC-TIME BEHAVIOR:
 * Everything structural is driven by `context.state.epochProgress`
 * (0..1) — no second timeline. The faint backdrop (an embryonic
 * version of the large-scale structure the later 'cosmic-web' epoch
 * renders in full) is static, built once in enter(): the gravitational
 * clustering it represents already began during the Dark Ages, so it
 * isn't re-animated here — only the star sites' formation/life/death
 * responds to progress. Each of a small, deterministically-chosen set
 * of dense regions runs its own gas-collapse -> ignition -> shining ->
 * (possible) supernova -> faint remnant timeline, staggered so nothing
 * "spawns" all at once — see FirstStarsData.js's `resolveStarPhase()`
 * for the phase math, kept there so it's testable without Three.js.
 *
 * The camera ease-in on enter() is, like CosmicWebScene, a local UI
 * transition using its own short elapsed-time counter — not part of
 * the scientific timeline.
 *
 * PERFORMANCE:
 * Backdrop (~150 static points), gas-collapse points (~300, one shared
 * BufferGeometry) — plus, replacing the old 2 InstancedMesh objects,
 * 4 new THREE.Points layers for the star/glow/halo/ejecta (7+7+42+350
 * points respectively at desktop counts — see "VISUAL REDESIGN"
 * above). Every layer is ONE shared BufferGeometry/draw call; no
 * per-object Mesh instances anywhere, no per-frame allocation — all
 * typed arrays allocated once in enter() and mutated in place in
 * update().
 *
 * SPIRAL COLLAPSE: gas points no longer fall in a dead-straight radial
 * line toward ignition — `_updateGasPoints()` adds a perpendicular
 * swirl (zero at both endpoints, peaking partway through), the same
 * angular-momentum-motivated technique DarkAgesScene.js uses for gas
 * falling into a halo, and the same reason real collapsing gas clouds
 * form rotating disks around a forming star. The formula is inlined
 * for performance rather than calling FirstStarsData.js's per-point
 * math — see the comment inside `_updateGasPoints()`.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...), never reaches into
 * another scene, and keeps no module-level/global state — everything
 * it owns lives on `this`, created in enter() and disposed in exit().
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateFirstStarsData, resolveStarPhase, SWIRL_TURNS } from './FirstStarsData.js';
import { easeInOutCubic } from '../../utils/mathUtils.js';

const FIRST_STARS_SEED = 41500001; // fixed -> same structure every load; distinct from Cosmic Web's seed
const HALF_EXTENT = 9;
const BACKDROP_COLOR = new THREE.Color('#3d4a66'); // dim, desaturated — structure, not the star of the show
const CORE_COLOR = new THREE.Color('#ffffff'); // hot core - blended toward the epoch's own color per-star, see _updateStarCore()
const PROTOSTAR_COLOR = new THREE.Color('#ff9d66'); // warm/reddish - a compressing core not yet hot enough to shine blue-white, before true ignition
const ENRICHMENT_TINT = new THREE.Color('#e8c98a'); // subtle warm tint mixed into fading ejecta - a restrained nod to heavy-element enrichment, never a literal "fire" color
const CAMERA_TARGET_POSITION = new THREE.Vector3(6, 4, 15);
const CAMERA_LOOKAT = new THREE.Vector3(0, 0, 0);
const CAMERA_EASE_TIME_CONSTANT = 1.4; // seconds; local UI transition, not scientific time

// Point sizes (world units, sizeAttenuation:true) for each star-related
// layer - see "VISUAL REDESIGN" in the file header for why these stay
// FIXED per layer, with all dynamic "growing/fading" carried entirely
// by per-point brightness instead of per-point size.
const CORE_POINT_SIZE = 0.16;
const GLOW_POINT_SIZE = 0.55;
const HALO_POINT_SIZE = 0.22;
const EJECTA_POINT_SIZE = 0.13;
const PROTOSTAR_PEAK_BRIGHTNESS = 0.22; // how bright the pre-ignition protostar glow gets, well short of a fully "on" star

/**
 * A small (64x64), soft, white-to-transparent radial gradient, used as
 * every star-related Points layer's `map` — this is what makes them
 * read as soft round glows instead of THREE's default hard-edged
 * square/circle point rendering, with ZERO polygon geometry involved
 * anywhere. Generated once per scene instance (see enter()), not a
 * module-level singleton, so it's cleanly disposed in exit() like
 * everything else this scene owns.
 */
function createGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

export class FirstStarsScene extends BaseScene {
  enter(context) {
    const { epoch, camera } = context;
    const narrow = isNarrowViewport();

    this._data = generateFirstStarsData({
      seed: FIRST_STARS_SEED,
      halfExtent: HALF_EXTENT,
      backdropNodeCount: narrow ? 8 : 12,
      backdropFilamentPointsPerUnit: narrow ? 2 : 3,
      starSiteCount: narrow ? 5 : 7,
      gasPointsPerSite: narrow ? 28 : 45,
      haloPointsPerSite: narrow ? 4 : 6,
      ejectaPointsPerSite: narrow ? 32 : 50,
    });

    this._starColor = new THREE.Color(epoch.color);
    this._reusableColor = new THREE.Color(); // scratch, reused every frame — never reallocated
    this._glowTexture = createGlowTexture();

    this._buildBackdrop();
    this._buildGasPoints();
    this._buildStarCore();
    this._buildStarGlow();
    this._buildStarHalo();
    this._buildEjecta();

    this._cameraStartPosition = camera.position.clone();
    this._cameraEaseElapsed = 0;
    this._elapsed = 0;
  }

  _buildBackdrop() {
    const points = this._data.backdropFilamentPoints;
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      // Static and faint — this structure already formed during the
      // Dark Ages; it isn't the subject of this scene, just its context.
      const b = 0.08 + p.brightness * 0.1;
      colors[i * 3] = BACKDROP_COLOR.r * b;
      colors[i * 3 + 1] = BACKDROP_COLOR.g * b;
      colors[i * 3 + 2] = BACKDROP_COLOR.b * b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._backdropPoints = new THREE.Points(geometry, material);
    this.root.add(this._backdropPoints);
  }

  _buildGasPoints() {
    // Flatten every site's gas points into one shared BufferGeometry,
    // tracking which site (and index within that site) each point
    // belongs to so update() can look up its current collapse/fade state.
    const sites = this._data.starSites;
    let total = 0;
    for (const s of sites) total += s.gasPoints.length;

    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    this._gasOrigins = new Float32Array(total * 3);
    this._gasTargets = new Float32Array(total * 3);
    this._gasBasisU = new Float32Array(total * 3);
    this._gasBasisV = new Float32Array(total * 3);
    this._gasSwirlPhase = new Float32Array(total);
    this._gasSwirlDirection = new Float32Array(total);
    this._gasSwirlAmplitude = new Float32Array(total);
    this._gasBrightness = new Float32Array(total);
    this._gasSiteIndex = new Int32Array(total); // which starSites[] entry each point belongs to

    let cursor = 0;
    sites.forEach((site, siteIndex) => {
      for (const gp of site.gasPoints) {
        const i3 = cursor * 3;
        this._gasOrigins[i3] = gp.originX;
        this._gasOrigins[i3 + 1] = gp.originY;
        this._gasOrigins[i3 + 2] = gp.originZ;
        this._gasTargets[i3] = gp.targetX;
        this._gasTargets[i3 + 1] = gp.targetY;
        this._gasTargets[i3 + 2] = gp.targetZ;
        this._gasBasisU[i3] = gp.basisUX;
        this._gasBasisU[i3 + 1] = gp.basisUY;
        this._gasBasisU[i3 + 2] = gp.basisUZ;
        this._gasBasisV[i3] = gp.basisVX;
        this._gasBasisV[i3 + 1] = gp.basisVY;
        this._gasBasisV[i3 + 2] = gp.basisVZ;
        this._gasSwirlPhase[cursor] = gp.swirlPhase;
        this._gasSwirlDirection[cursor] = gp.swirlDirection;
        this._gasSwirlAmplitude[cursor] = gp.swirlAmplitude;
        this._gasBrightness[cursor] = gp.brightness;
        this._gasSiteIndex[cursor] = siteIndex;

        positions[i3] = gp.originX;
        positions[i3 + 1] = gp.originY;
        positions[i3 + 2] = gp.originZ;
        cursor++;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.1,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // soft volumetric gas glow, not hard dots
    });

    this._gasPoints = new THREE.Points(geometry, material);
    this.root.add(this._gasPoints);
  }

  _buildStarCore() {
    const sites = this._data.starSites;
    const positions = new Float32Array(sites.length * 3);
    const colors = new Float32Array(sites.length * 3);

    sites.forEach((site, i) => {
      positions[i * 3] = site.x;
      positions[i * 3 + 1] = site.y;
      positions[i * 3 + 2] = site.z;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: CORE_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._starCorePoints = new THREE.Points(geometry, material);
    this.root.add(this._starCorePoints);
  }

  _buildStarGlow() {
    const sites = this._data.starSites;
    const positions = new Float32Array(sites.length * 3);
    const colors = new Float32Array(sites.length * 3);

    sites.forEach((site, i) => {
      positions[i * 3] = site.x;
      positions[i * 3 + 1] = site.y;
      positions[i * 3 + 2] = site.z;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: GLOW_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._starGlowPoints = new THREE.Points(geometry, material);
    this.root.add(this._starGlowPoints);
  }

  _buildStarHalo() {
    // A handful of small, ASYMMETRIC offset points per site - see
    // FirstStarsData.js's `haloPoints` and "VISUAL REDESIGN" above.
    const sites = this._data.starSites;
    let total = 0;
    for (const s of sites) total += s.haloPoints.length;

    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    this._haloOffsets = new Float32Array(total * 3);
    this._haloBrightness = new Float32Array(total);
    this._haloPulsePhase = new Float32Array(total);
    this._haloSiteIndex = new Int32Array(total);

    let cursor = 0;
    sites.forEach((site, siteIndex) => {
      for (const hp of site.haloPoints) {
        const i3 = cursor * 3;
        this._haloOffsets[i3] = hp.offsetX;
        this._haloOffsets[i3 + 1] = hp.offsetY;
        this._haloOffsets[i3 + 2] = hp.offsetZ;
        this._haloBrightness[cursor] = hp.brightness;
        this._haloPulsePhase[cursor] = hp.pulsePhase;
        this._haloSiteIndex[cursor] = siteIndex;

        positions[i3] = site.x + hp.offsetX;
        positions[i3 + 1] = site.y + hp.offsetY;
        positions[i3 + 2] = site.z + hp.offsetZ;
        cursor++;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: HALO_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._starHaloPoints = new THREE.Points(geometry, material);
    this.root.add(this._starHaloPoints);
  }

  _buildEjecta() {
    // Supernova shell/ejecta - many seeded points per site, each with
    // its OWN outward direction/speed/fade timing (see
    // FirstStarsData.js's `ejectaPoints`), so the expanding shell
    // reads as ragged and asymmetric rather than one smooth geometric
    // sphere. See "VISUAL REDESIGN" above.
    const sites = this._data.starSites;
    let total = 0;
    for (const s of sites) total += s.ejectaPoints.length;

    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    this._ejectaDir = new Float32Array(total * 3);
    this._ejectaSpeedMult = new Float32Array(total);
    this._ejectaFadeOffset = new Float32Array(total);
    this._ejectaBrightness = new Float32Array(total);
    this._ejectaSiteIndex = new Int32Array(total);

    let cursor = 0;
    sites.forEach((site, siteIndex) => {
      for (const ep of site.ejectaPoints) {
        const i3 = cursor * 3;
        this._ejectaDir[i3] = ep.dirX;
        this._ejectaDir[i3 + 1] = ep.dirY;
        this._ejectaDir[i3 + 2] = ep.dirZ;
        this._ejectaSpeedMult[cursor] = ep.speedMult;
        this._ejectaFadeOffset[cursor] = ep.fadeOffset;
        this._ejectaBrightness[cursor] = ep.brightness;
        this._ejectaSiteIndex[cursor] = siteIndex;

        positions[i3] = site.x;
        positions[i3 + 1] = site.y;
        positions[i3 + 2] = site.z;
        cursor++;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: EJECTA_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._ejectaPoints = new THREE.Points(geometry, material);
    this.root.add(this._ejectaPoints);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress; // the ONE scientific timeline

    this._phasesCache = this._data.starSites.map((site) => resolveStarPhase(site, progress));

    this._updateGasPoints();
    this._updateStarCore();
    this._updateStarGlow();
    this._updateStarHalo();
    this._updateEjecta();
    this._updateCamera(deltaTime, context.camera);

    this.root.rotation.y = this._elapsed * 0.015; // slow ambient rotation for depth cues, subtle
  }

  _updateGasPoints() {
    const posAttr = this._gasPoints.geometry.attributes.position;
    const colAttr = this._gasPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const origins = this._gasOrigins;
    const targets = this._gasTargets;
    const basisU = this._gasBasisU;
    const basisV = this._gasBasisV;
    const swirlPhase = this._gasSwirlPhase;
    const swirlDirection = this._gasSwirlDirection;
    const swirlAmplitude = this._gasSwirlAmplitude;
    const baseBrightness = this._gasBrightness;
    const siteIndex = this._gasSiteIndex;
    const starColor = this._starColor;
    const phases = this._phasesCache;

    // Same spiral-collapse formula as DarkAgesScene.js's particle
    // update (see that file's comment for why this is inlined rather
    // than calling a per-point function - same reasoning applies here
    // at ~300 gas points/frame). FirstStarsData.js is the source of
    // truth for this formula; keep both in sync if it changes.
    const count = baseBrightness.length;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const phase = phases[siteIndex[i]];
      const t = easeInOutCubic(phase.collapseT);

      const baseX = origins[i3] + (targets[i3] - origins[i3]) * t;
      const baseY = origins[i3 + 1] + (targets[i3 + 1] - origins[i3 + 1]) * t;
      const baseZ = origins[i3 + 2] + (targets[i3 + 2] - origins[i3 + 2]) * t;

      const bump = 4 * t * (1 - t); // 0 at t=0 and t=1, peaks at t=0.5
      const windAngle = swirlPhase[i] + swirlDirection[i] * t * SWIRL_TURNS * Math.PI * 2;
      const swirlR = swirlAmplitude[i] * bump;
      const cosA = Math.cos(windAngle);
      const sinA = Math.sin(windAngle);

      pos[i3] = baseX + (cosA * basisU[i3] + sinA * basisV[i3]) * swirlR;
      pos[i3 + 1] = baseY + (cosA * basisU[i3 + 1] + sinA * basisV[i3 + 1]) * swirlR;
      pos[i3 + 2] = baseZ + (cosA * basisU[i3 + 2] + sinA * basisV[i3 + 2]) * swirlR;

      // Brightens as gas concentrates toward ignition, then fades out
      // once the star itself has taken over as the visible light source.
      const preIgnitionGlow = t * baseBrightness[i];
      const fadeAfterIgnition = Math.max(0, 1 - phase.starBrightness * 1.5);
      const b = preIgnitionGlow * fadeAfterIgnition * 0.8;
      col[i3] = starColor.r * b;
      col[i3 + 1] = starColor.g * b;
      col[i3 + 2] = starColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateStarCore() {
    const sites = this._data.starSites;
    const colAttr = this._starCorePoints.geometry.attributes.color;
    const col = colAttr.array;
    const starColor = this._starColor;
    const phases = this._phasesCache;

    for (let i = 0; i < sites.length; i++) {
      const phase = phases[i];
      const igniteBrightness = Math.max(0, phase.starBrightness);
      const i3 = i * 3;

      if (igniteBrightness > 0.001) {
        // Ignited: blend toward near-white for an intensely hot core,
        // on top of the epoch's own blue-white.
        this._reusableColor.copy(starColor).lerp(CORE_COLOR, Math.min(1, igniteBrightness * 0.5)).multiplyScalar(0.7 + igniteBrightness * 0.5);
      } else {
        // Pre-ignition: a dim, warm protostar glow - see
        // "PROTOSTAR TRANSITION" in the file header.
        this._reusableColor.copy(PROTOSTAR_COLOR).multiplyScalar(phase.protostarT * PROTOSTAR_PEAK_BRIGHTNESS);
      }
      col[i3] = this._reusableColor.r;
      col[i3 + 1] = this._reusableColor.g;
      col[i3 + 2] = this._reusableColor.b;
    }
    colAttr.needsUpdate = true;
  }

  _updateStarGlow() {
    const sites = this._data.starSites;
    const colAttr = this._starGlowPoints.geometry.attributes.color;
    const col = colAttr.array;
    const starColor = this._starColor;
    const phases = this._phasesCache;

    for (let i = 0; i < sites.length; i++) {
      const phase = phases[i];
      const igniteBrightness = Math.max(0, phase.starBrightness);
      const i3 = i * 3;
      const ignited = igniteBrightness > 0.001;
      const b = ignited ? igniteBrightness * 0.55 : phase.protostarT * PROTOSTAR_PEAK_BRIGHTNESS * 0.6;
      const color = ignited ? starColor : PROTOSTAR_COLOR;
      col[i3] = color.r * b;
      col[i3 + 1] = color.g * b;
      col[i3 + 2] = color.b * b;
    }
    colAttr.needsUpdate = true;
  }

  _updateStarHalo() {
    const posAttr = this._starHaloPoints.geometry.attributes.position;
    const colAttr = this._starHaloPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const offsets = this._haloOffsets;
    const brightness = this._haloBrightness;
    const pulsePhase = this._haloPulsePhase;
    const siteIndex = this._haloSiteIndex;
    const sites = this._data.starSites;
    const starColor = this._starColor;
    const phases = this._phasesCache;
    const elapsed = this._elapsed;

    const count = brightness.length;
    for (let i = 0; i < count; i++) {
      const site = sites[siteIndex[i]];
      const phase = phases[siteIndex[i]];
      const igniteBrightness = Math.max(0, phase.starBrightness);
      const i3 = i * 3;

      // Gentle pulsing offset magnitude - subtle "flickering gas"
      // life, not a literal physical simulation.
      const pulse = 0.85 + Math.sin(elapsed * 1.5 + pulsePhase[i]) * 0.15;
      pos[i3] = site.x + offsets[i3] * pulse;
      pos[i3 + 1] = site.y + offsets[i3 + 1] * pulse;
      pos[i3 + 2] = site.z + offsets[i3 + 2] * pulse;

      // Only visible once truly ignited - an "irregular gaseous halo"
      // around an actual shining star, not the collapse stage.
      const b = igniteBrightness > 0.001 ? Math.min(1, igniteBrightness) * brightness[i] * 0.5 : 0;
      col[i3] = starColor.r * b;
      col[i3 + 1] = starColor.g * b;
      col[i3 + 2] = starColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateEjecta() {
    const posAttr = this._ejectaPoints.geometry.attributes.position;
    const colAttr = this._ejectaPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const dir = this._ejectaDir;
    const speedMult = this._ejectaSpeedMult;
    const fadeOffset = this._ejectaFadeOffset;
    const brightness = this._ejectaBrightness;
    const siteIndex = this._ejectaSiteIndex;
    const sites = this._data.starSites;
    const starColor = this._starColor;
    const phases = this._phasesCache;

    const count = brightness.length;
    for (let i = 0; i < count; i++) {
      const site = sites[siteIndex[i]];
      const phase = phases[siteIndex[i]];
      const i3 = i * 3;

      // During 'shining', keep the shell mostly uniform (real
      // ionization fronts expand smoothly) with only a light touch of
      // per-point variance; during 'supernova'/'remnant', use the FULL
      // seeded speed variance for a genuinely ragged, asymmetric
      // ejecta shape - see FirstStarsData.js's "VISUAL REDESIGN" note.
      const effectiveSpeedMult = phase.phase === 'shining' ? 0.7 + speedMult[i] * 0.3 : speedMult[i];
      const radius = phase.shellRadius * effectiveSpeedMult;

      pos[i3] = site.x + dir[i3] * radius;
      pos[i3 + 1] = site.y + dir[i3 + 1] * radius;
      pos[i3 + 2] = site.z + dir[i3 + 2] * radius;

      let b = phase.shellOpacity * brightness[i];
      this._reusableColor.copy(starColor);
      if (phase.phase === 'supernova') {
        // Brief flash toward near-white right at the brightness spike.
        const flashBlend = Math.min(1, Math.max(0, phase.starBrightness - 1) * 0.8);
        this._reusableColor.lerp(CORE_COLOR, flashBlend);
      } else if (phase.phase === 'remnant') {
        // Gradually shifts toward a subtle warm tint as it disperses -
        // heavy-element enrichment, staggered per point via
        // fadeOffset so dispersal doesn't read as one synchronized
        // fade. shellOpacity's own decay already carries the "how long
        // ago" signal; fadeOffset just spreads individual points
        // around that average rather than moving them in lockstep.
        const dispersal = Math.min(1, Math.max(0, 1 - phase.shellOpacity / 0.14 + fadeOffset[i] * 0.3));
        this._reusableColor.lerp(ENRICHMENT_TINT, dispersal);
        b *= Math.max(0.15, 1 - fadeOffset[i] * 0.4);
      }

      col[i3] = this._reusableColor.r * b;
      col[i3 + 1] = this._reusableColor.g * b;
      col[i3 + 2] = this._reusableColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateCamera(deltaTime, camera) {
    this._cameraEaseElapsed += deltaTime;
    const t = 1 - Math.exp(-this._cameraEaseElapsed / CAMERA_EASE_TIME_CONSTANT);
    camera.position.lerpVectors(this._cameraStartPosition, CAMERA_TARGET_POSITION, t);
    camera.lookAt(CAMERA_LOOKAT);
  }

  exit() {
    this._backdropPoints.geometry.dispose();
    this._backdropPoints.material.dispose();
    this._gasPoints.geometry.dispose();
    this._gasPoints.material.dispose();
    this._starCorePoints.geometry.dispose();
    this._starCorePoints.material.dispose();
    this._starGlowPoints.geometry.dispose();
    this._starGlowPoints.material.dispose();
    this._starHaloPoints.geometry.dispose();
    this._starHaloPoints.material.dispose();
    this._ejectaPoints.geometry.dispose();
    this._ejectaPoints.material.dispose();
    this._glowTexture.dispose();
    // No eventBus listeners were registered by this scene, so there is
    // nothing to unsubscribe.
  }
}
