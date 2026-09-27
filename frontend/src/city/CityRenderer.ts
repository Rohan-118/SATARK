import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { extractTerrainFootprint } from './utils/terrainFootprint';
import type { Point2D } from './zones/voronoi';

// ============================================================
// HOLOGRAPHIC SHADERS
// ============================================================

const holoVertexShader = `
uniform float uTime;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    float glitchWave = sin(modelPosition.y * 0.035 + uTime * 3.0);
    float glitchWave2 = sin(modelPosition.x * 0.08 + uTime * 4.0);

    float glitch = glitchWave * glitchWave2 * 0.35;

    modelPosition.x += glitch * 0.12;
    modelPosition.z += glitch * 0.08;

    vPosition = modelPosition.xyz;
    vWorldPosition = modelPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * modelPosition;
}
`;

const holoFragmentShader = `
uniform float uTime;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main()
{
    float stripe = fract(vPosition.y * 0.055);
    float stripeLine = smoothstep(0.47, 0.50, stripe) * (1.0 - smoothstep(0.50, 0.53, stripe));

    float fineStripe = fract(vPosition.y * 0.25 - uTime * 0.15);
    float fineLine = smoothstep(0.47, 0.50, fineStripe) * (1.0 - smoothstep(0.50, 0.53, fineStripe));

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - abs(dot(normalize(vNormal), viewDirection));
    fresnel = pow(fresnel, 2.0);

    vec3 purple = vec3(0.12, 0.005, 0.30);
    vec3 violet = vec3(0.75, 0.08, 1.0);
    vec3 cyan = vec3(0.0, 0.85, 1.0);

    vec3 color = purple;
    color = mix(color, cyan, fresnel * 0.9);
    color += violet * stripeLine * 2.5;
    color += cyan * fineLine * 0.35;

    float glitchBand = sin(vPosition.y * 0.12 + uTime * 2.5);
    glitchBand = smoothstep(0.88, 0.98, glitchBand);
    color += cyan * glitchBand * 1.5;

    color += cyan * fresnel * 0.75;

    color *= 0.55 + fresnel * 0.65 + stripeLine * 0.9;

    float alpha = 0.22 + fresnel * 0.30 + stripeLine * 0.22 + fineLine * 0.03;
    alpha = clamp(alpha, 0.12, 0.95);

    gl_FragColor = vec4(color, alpha);
}
`;

// ============================================================
// ROAD SHADERS
// ============================================================

const roadFlowVertexShader = `
varying vec3 vWorldPosition;
void main()
{
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const roadFlowFragmentShader = `
uniform float uTime;
varying vec3 vWorldPosition;

void main()
{
    vec2 position = vWorldPosition.xz;

    vec2 dir1 = normalize(vec2(1.0, 0.25));
    vec2 dir2 = normalize(vec2(-0.35, 1.0));
    vec2 dir3 = normalize(vec2(0.75, -0.65));

    float flow1 = dot(position, dir1) * 0.010 - uTime * 0.55;
    float flow2 = dot(position, dir2) * 0.008 - uTime * 0.40;
    float flow3 = dot(position, dir3) * 0.012 - uTime * 0.48;

    float pulse1 = fract(flow1);
    float pulse2 = fract(flow2);
    float pulse3 = fract(flow3);

    float energy1 = smoothstep(0.00, 0.18, pulse1) * (1.0 - smoothstep(0.18, 0.48, pulse1));
    float energy2 = smoothstep(0.00, 0.16, pulse2) * (1.0 - smoothstep(0.16, 0.42, pulse2));
    float energy3 = smoothstep(0.00, 0.16, pulse3) * (1.0 - smoothstep(0.16, 0.40, pulse3));

    float trail1 = smoothstep(0.00, 0.55, pulse1) * 0.35;
    float trail2 = smoothstep(0.00, 0.50, pulse2) * 0.25;
    float trail3 = smoothstep(0.00, 0.45, pulse3) * 0.25;

    float energy = energy1 + energy2 + energy3;
    float trail = trail1 + trail2 + trail3;

    vec3 baseColor = vec3(0.0, 0.35, 0.75);
    vec3 energyColor = vec3(0.0, 0.95, 1.0);
    vec3 whiteCore = vec3(0.65, 1.0, 1.0);

    vec3 color = baseColor * 2.5;
    color += energyColor * trail * 2.5;
    color += energyColor * energy * 8.0;
    color += whiteCore * energy * energy * 3.5;

    float alpha = 0.65 + trail * 0.20 + energy * 0.35;
    alpha = clamp(alpha, 0.55, 1.0);

    gl_FragColor = vec4(color, alpha);
}
`;

// ============================================================
// SEA SHADERS
// ============================================================

const seaVertexShader = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main()
{
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const seaFragmentShader = `
uniform float uTime;
uniform sampler2D normalMap0;
uniform sampler2D normalMap1;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main()
{
    vec2 uv = vWorldPosition.xz * 0.0018;

    vec2 uv0 = uv * 2.4 + vec2(uTime * 0.040, uTime * 0.024);
    vec2 uv1 = uv * 4.2 + vec2(-uTime * 0.028, uTime * 0.040);

    vec3 n0 = texture2D(normalMap0, uv0).xyz * 2.0 - 1.0;
    vec3 n1 = texture2D(normalMap1, uv1).xyz * 2.0 - 1.0;

    vec3 waveNormal = normalize(vec3((n0.x * 0.65 + n1.x * 0.35) * 1.9, 1.0, (n0.z * 0.65 + n1.z * 0.35) * 1.9));

    vec3 deepBlue = vec3(0.015, 0.095, 0.22);
    vec3 waterBlue = vec3(0.02, 0.25, 0.42);
    vec3 brightCyan = vec3(0.04, 0.62, 0.68);

    vec3 lightDirection = normalize(vec3(0.35, 1.0, 0.25));
    float diffuse = max(dot(waveNormal, lightDirection), 0.0);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

    float fresnel = 1.0 - max(dot(waveNormal, viewDirection), 0.0);
    fresnel = pow(fresnel, 2.5);

    float highlight = pow(max(dot(reflect(-lightDirection, waveNormal), viewDirection), 0.0), 18.0);

    vec3 color = mix(deepBlue, waterBlue, 0.55 + diffuse * 0.45);
    color += brightCyan * fresnel * 0.38;
    color += brightCyan * highlight * 3.0;

    float waveBand = smoothstep(0.52, 0.82, n0.x * 0.5 + 0.5);
    color += brightCyan * waveBand * 0.12;
    color += vec3(0.0, 0.025, 0.045);

    gl_FragColor = vec4(color, 1.0);
}
`;

// ============================================================
// CITY RENDERER CLASS
// ============================================================

export class CityRenderer {
    private container: HTMLElement;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    
    // Dual camera system: Orthographic (strategic map) + Perspective (freecam 3D inspection)
    private orthographicCamera: THREE.OrthographicCamera;
    private perspectiveCamera: THREE.PerspectiveCamera;
    private activeCamera: THREE.Camera;
    private cameraMode: 'orthographic' | 'freecam' = 'orthographic';

    private controls!: OrbitControls;
    private composer!: EffectComposer;
    private renderPass!: RenderPass;
    private gtaoPass!: GTAOPass;
    private animationFrameId: number | null = null;
    private clock = new THREE.Clock();
    private isDisposed = false;
    
    // Shared materials/textures across the class
    private toonMaterialCache = new Map<string, THREE.MeshToonMaterial>();
    private toonGradient!: THREE.DataTexture;
    private groundTexture!: THREE.CanvasTexture;
    private skyTexture!: THREE.Texture;
    private buildingFacadeTexture!: THREE.Texture;
    private seaNormalMap0!: THREE.DataTexture;
    private seaNormalMap1!: THREE.DataTexture;
    private roadLineMaterial!: THREE.MeshBasicMaterial;
    
    private directionalLight!: THREE.DirectionalLight;
    private hemisphereLight!: THREE.HemisphereLight;
    private baseDirectionalIntensity = 2.35;
    private baseHemisphereIntensity = 0.82;
    private baseFogColor = new THREE.Color(0xa8d7ef);
    private stormFogColor = new THREE.Color(0x0f172a);
    private lightningSkyColor = new THREE.Color(0x7ea9d4);
    private baseFogDensity = 0.00038;

    // ── Terrain footprint and meshes (extracted once after GLB loads) ──
    private terrainMeshes: THREE.Mesh[] = [];
    private terrainFootprint: Point2D[] | null = null;
    private terrainCentroid: THREE.Vector3 | null = null;

    // ── Collision meshes: solid city geometry (buildings, roads) for freecam collision ──
    private collisionMeshes: THREE.Object3D[] = [];

    /**
     * Returns the scene instance for attaching additional render layers.
     */
    public getScene(): THREE.Scene {
        return this.scene;
    }

    // ── City bounds and default camera view metadata ──
    private defaultCameraPosition: THREE.Vector3 | null = null;
    private defaultControlsTarget: THREE.Vector3 | null = null;
    private cityCenter: THREE.Vector3 | null = null;
    private citySize: THREE.Vector3 | null = null;
    private cityMaxDimension = 0;

    public onProgress?: (percent: number) => void;
    public onError?: (error: unknown) => void;
    public onLoadComplete?: () => void;

    /**
     * Returns the terrain boundary polygon in world X/Z coordinates,
     * extracted from MAT_TERRAIN meshes after city.glb loads.
     * Returns null before load completes or if no terrain was found.
     */
    public getTerrainFootprint(): Point2D[] | null {
        return this.terrainFootprint;
    }

    /**
     * Returns the terrain meshes collected during GLB load for raycasting.
     */
    public getTerrainMeshes(): THREE.Mesh[] {
        return this.terrainMeshes;
    }

    /**
     * Returns the collision meshes (buildings, roads, trees) for freecam camera collision.
     */
    public getCollisionMeshes(): THREE.Object3D[] {
        return this.collisionMeshes;
    }

    /**
     * O(1) set of animated shader materials holding a uTime uniform.
     * Prevents O(N) full-scene traversal on every 60 FPS animation frame.
     */
    private timeUniformMaterials = new Set<THREE.ShaderMaterial>();

    public registerTimeUniformMaterial(material: THREE.Material | THREE.ShaderMaterial): void {
        if ((material as any)?.uniforms?.uTime) {
            this.timeUniformMaterials.add(material as THREE.ShaderMaterial);
        }
    }

    /**
     * Raycasts from `origin` in `direction` against collision meshes.
     * Returns the nearest intersection within `maxDistance`, or null.
     */
    private collisionRaycaster = new THREE.Raycaster();

    public raycastCollision(
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        maxDistance: number
    ): THREE.Intersection | null {
        if (this.collisionMeshes.length === 0) return null;
        this.collisionRaycaster.set(origin, direction);
        this.collisionRaycaster.far = maxDistance;
        this.collisionRaycaster.near = 0;
        const intersects = this.collisionRaycaster.intersectObjects(this.collisionMeshes, true);
        if (intersects.length > 0) {
            return intersects[0];
        }
        return null;
    }

    /**
     * Returns the centroid of the terrain footprint in world coordinates.
     */
    public getTerrainCentroid(): THREE.Vector3 | null {
        return this.terrainCentroid ? this.terrainCentroid.clone() : null;
    }

    /**
     * Returns current camera mode ('orthographic' or 'freecam').
     */
    public getCameraMode(): 'orthographic' | 'freecam' {
        return this.cameraMode;
    }

    /**
     * Set active camera mode.
     */
    public setCameraMode(mode: 'orthographic' | 'freecam'): void {
        this.cameraMode = mode;
        this.activeCamera = mode === 'orthographic' ? this.orthographicCamera : this.perspectiveCamera;
        if (this.renderPass) this.renderPass.camera = this.activeCamera;
        if (this.gtaoPass) this.gtaoPass.camera = this.activeCamera;
        if (this.controls) {
            this.controls.enabled = mode === 'orthographic';
            if (mode === 'orthographic') {
                this.controls.object = this.orthographicCamera;
            }
        }
    }

    /**
     * Returns the active camera instance.
     */
    public getActiveCamera(): THREE.Camera {
        return this.activeCamera;
    }

    /**
     * Returns the orthographic camera.
     */
    public getOrthographicCamera(): THREE.OrthographicCamera {
        return this.orthographicCamera;
    }

    /**
     * Returns the perspective camera.
     */
    public getPerspectiveCamera(): THREE.PerspectiveCamera {
        return this.perspectiveCamera;
    }

    /**
     * Get current camera position without exposing camera internals directly.
     */
    public getCameraPosition(out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
        return out.copy(this.activeCamera.position);
    }

    /**
     * Set active camera position.
     */
    public setCameraPosition(x: number, y: number, z: number): void {
        this.activeCamera.position.set(x, y, z);
    }

    /**
     * Get OrbitControls target without exposing OrbitControls directly.
     */
    public getControlsTarget(out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
        return out.copy(this.controls.target);
    }

    /**
     * Set OrbitControls target.
     */
    public setControlsTarget(x: number, y: number, z: number): void {
        this.controls.target.set(x, y, z);
    }

    /**
     * Set OrbitControls constraints.
     */
    public setControlsLimits(limits: {
        minDistance?: number;
        maxDistance?: number;
        minPolarAngle?: number;
        maxPolarAngle?: number;
    }): void {
        if (limits.minDistance !== undefined) this.controls.minDistance = limits.minDistance;
        if (limits.maxDistance !== undefined) this.controls.maxDistance = limits.maxDistance;
        if (limits.minPolarAngle !== undefined) this.controls.minPolarAngle = limits.minPolarAngle;
        if (limits.maxPolarAngle !== undefined) this.controls.maxPolarAngle = limits.maxPolarAngle;
    }

    /**
     * Enable or disable OrbitControls (e.g. during animated camera transitions or in freecam).
     */
    public setControlsEnabled(enabled: boolean): void {
        this.controls.enabled = enabled;
    }

    /**
     * Update OrbitControls state.
     */
    public updateControls(): void {
        if (this.controls && this.controls.enabled && this.cameraMode === 'orthographic') {
            this.controls.update();
        }
    }

    /**
     * Returns the default overview camera position, target, and max dimension.
     */
    public getDefaultView(): { position: THREE.Vector3; target: THREE.Vector3; maxDimension: number } | null {
        if (!this.defaultCameraPosition || !this.defaultControlsTarget) return null;
        return {
            position: this.defaultCameraPosition.clone(),
            target: this.defaultControlsTarget.clone(),
            maxDimension: this.cityMaxDimension,
        };
    }

    /**
     * Returns the bounding box metadata of the loaded city.
     */
    public getCityBounds(): { center: THREE.Vector3; size: THREE.Vector3; maxDimension: number } | null {
        if (!this.cityCenter || !this.citySize) return null;
        return {
            center: this.cityCenter.clone(),
            size: this.citySize.clone(),
            maxDimension: this.cityMaxDimension,
        };
    }

    private tickCallbacks = new Set<(delta: number, elapsedTime: number) => void>();

    /**
     * Subscribe a callback to be invoked on every animation frame with delta time (seconds)
     * and total elapsed time (seconds). Returns an unsubscribe function.
     */
    public onTick(callback: (delta: number, elapsedTime: number) => void): () => void {
        this.tickCallbacks.add(callback);
        return () => {
            this.tickCallbacks.delete(callback);
        };
    }

    public addOverlay(object: THREE.Object3D): void {
        this.scene.add(object);
    }

    public removeOverlay(object: THREE.Object3D): void {
        this.scene.remove(object);
    }

    public raycast(mouse: THREE.Vector2, objects: THREE.Object3D[]): THREE.Intersection[] {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.activeCamera);
        return raycaster.intersectObjects(objects, false);
    }

    public raycastTerrain(mouse: THREE.Vector2): THREE.Intersection[] {
        if (this.terrainMeshes.length === 0) return [];
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.activeCamera);
        return raycaster.intersectObjects(this.terrainMeshes, true);
    }

    private terrainHeightRaycaster = new THREE.Raycaster();
    private terrainDownVector = new THREE.Vector3(0, -1, 0);

    /**
     * Samples the exact terrain mesh surface height (Y coordinate) at world (x, z).
     * Falls back to terrainCentroid.y, cityCenter.y, or fallbackY if raycast misses or terrain not loaded.
     */
    public getTerrainHeightAt(x: number, z: number, fallbackY = 0): number {
        const defaultY = this.terrainCentroid
            ? this.terrainCentroid.y
            : (this.cityCenter ? this.cityCenter.y : fallbackY);

        if (this.terrainMeshes.length === 0) {
            return defaultY;
        }

        const originY = (this.cityCenter ? this.cityCenter.y : 0) + (this.cityMaxDimension ? this.cityMaxDimension : 5000);
        this.terrainHeightRaycaster.set(
            new THREE.Vector3(x, originY, z),
            this.terrainDownVector
        );
        this.terrainHeightRaycaster.far = (this.cityMaxDimension ? this.cityMaxDimension * 2.5 : 20000);

        const intersects = this.terrainHeightRaycaster.intersectObjects(this.terrainMeshes, true);
        if (intersects.length > 0 && intersects[0].point) {
            return intersects[0].point.y;
        }

        return defaultY;
    }

    constructor(container: HTMLElement) {
        this.container = container;
        
        this.scene = new THREE.Scene();

        const aspect = this.container.clientWidth / Math.max(this.container.clientHeight, 1);

        // Perspective camera for freecam 3D exploration
        this.perspectiveCamera = new THREE.PerspectiveCamera(55, aspect, 0.1, 50000);
        this.perspectiveCamera.position.set(700, 700, 700);

        // Orthographic camera for strategic overview (starts as active)
        this.orthographicCamera = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, 10, 50000);
        this.orthographicCamera.position.set(700, 700, 700);

        this.activeCamera = this.orthographicCamera;
        this.cameraMode = 'orthographic';

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        
        this.initialize();
    }

    private initialize() {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = false;

        this.renderer.toneMapping = THREE.AgXToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.container.appendChild(this.renderer.domElement);

        // Assets Generation
        this.skyTexture = this.createSkyTexture();
        this.scene.background = this.skyTexture;

        this.toonGradient = this.createToonGradient();
        this.groundTexture = this.createGroundTexture();
        this.buildingFacadeTexture = this.createBuildingFacadeTexture();
        this.seaNormalMap0 = this.createSeaNormalMap(128, 7.0, 1.80, 0.0);
        this.seaNormalMap1 = this.createSeaNormalMap(128, 11.0, 1.20, 2.7);

        this.roadLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide });

        // Environment
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        const reflectionEnvironment = new RoomEnvironment();
        this.scene.environment = pmremGenerator.fromScene(reflectionEnvironment, 0.04).texture;
        reflectionEnvironment.dispose();
        pmremGenerator.dispose();

        // Controls
        this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 20000;
        this.controls.maxPolarAngle = Math.PI * 0.47;
        this.controls.minPolarAngle = Math.PI * 0.05;

        // Depth + Post-Processing
        this.scene.fog = new THREE.FogExp2(0xa8d7ef, 0.00038);

        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(1.0);
        this.composer.setSize(this.container.clientWidth, this.container.clientHeight);

        this.renderPass = new RenderPass(this.scene, this.activeCamera);
        this.composer.addPass(this.renderPass);

        this.gtaoPass = new GTAOPass(this.scene, this.activeCamera, this.container.clientWidth, this.container.clientHeight);
        this.gtaoPass.updateGtaoMaterial({
            radius: 3.5,
            distanceExponent: 1.4,
            thickness: 1.0,
            distanceFallOff: 1.0,
            scale: 1.25,
            samples: 8,
            screenSpaceRadius: true
        });
        this.gtaoPass.blendIntensity = 0.75;
        this.composer.addPass(this.gtaoPass);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
            0.18, 0.38, 0.82
        );
        this.composer.addPass(bloomPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);

        // Lighting
        this.hemisphereLight = new THREE.HemisphereLight(0x9bbcff, 0x162016, this.baseHemisphereIntensity);
        this.scene.add(this.hemisphereLight);
        
        this.directionalLight = new THREE.DirectionalLight(0xffffff, this.baseDirectionalIntensity);
        this.directionalLight.position.set(500, 1200, 350);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.set(2048, 2048);
        this.directionalLight.shadow.bias = -0.00025;
        this.directionalLight.shadow.normalBias = 0.12;
        this.scene.add(this.directionalLight);

        this.animate = this.animate.bind(this);
        this.animate();
    }

    /**
     * Smoothly adjusts atmospheric storm lighting and fog.
     * stormRatio: 0 = clear sunny daylight, 1 = maximum overcast storm.
     */
    public setStormAtmosphere(stormRatio: number): void {
        const t = Math.max(0, Math.min(1, stormRatio));
        if (this.directionalLight) {
            this.directionalLight.intensity = THREE.MathUtils.lerp(this.baseDirectionalIntensity, 1.15, t);
        }
        if (this.hemisphereLight) {
            this.hemisphereLight.intensity = THREE.MathUtils.lerp(this.baseHemisphereIntensity, 0.45, t);
        }
        if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.color.lerpColors(this.baseFogColor, this.stormFogColor, t);
            const targetDensity = this.baseFogDensity * (1.0 + t * 0.75);
            this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, targetDensity, 0.1);
        }
        if (t > 0.4) {
            this.scene.background = this.stormFogColor;
        } else {
            this.scene.background = this.skyTexture;
        }
    }

    /**
     * Momentarily flashes lighting and sky fog for lightning discharges.
     * flashIntensity: 0 to 1 multiplier for flash boost.
     */
    public flashLightning(flashIntensity: number): void {
        if (flashIntensity <= 0.01) return;
        if (this.directionalLight) {
            this.directionalLight.intensity = this.baseDirectionalIntensity * (1.0 + flashIntensity * 2.8);
        }
        if (this.hemisphereLight) {
            this.hemisphereLight.intensity = this.baseHemisphereIntensity * (1.0 + flashIntensity * 3.4);
        }
        if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.color.lerpColors(this.stormFogColor, this.lightningSkyColor, Math.min(1.0, flashIntensity * 1.1));
        }
        if (flashIntensity > 0.45) {
            this.scene.background = this.lightningSkyColor;
        } else {
            this.scene.background = this.stormFogColor;
        }
    }

    /**
     * Resets atmosphere to baseline daylight conditions.
     */
    public resetAtmosphere(): void {
        if (this.directionalLight) this.directionalLight.intensity = this.baseDirectionalIntensity;
        if (this.hemisphereLight) this.hemisphereLight.intensity = this.baseHemisphereIntensity;
        if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.color.copy(this.baseFogColor);
            this.scene.fog.density = this.baseFogDensity;
        }
        this.scene.background = this.skyTexture;
    }



    /**
     * Recomputes and applies the OrthographicCamera frustum based on the actual
     * terrain footprint and the current viewport aspect ratio.
     * Ensures the landmass fills most of the screen (~88%) with comfortable margins.
     */
    public updateOrthographicFrustum(width?: number, height?: number): void {
        const w = width ?? this.container.clientWidth;
        const h = height ?? Math.max(this.container.clientHeight, 1);
        const aspect = w / h;

        if (!this.terrainFootprint || this.terrainFootprint.length === 0) {
            // Fallback before terrain footprint is loaded
            const halfSize = (this.cityMaxDimension || 8000) * 0.5;
            if (aspect >= 1) {
                this.orthographicCamera.left = -halfSize * aspect;
                this.orthographicCamera.right = halfSize * aspect;
                this.orthographicCamera.top = halfSize;
                this.orthographicCamera.bottom = -halfSize;
            } else {
                this.orthographicCamera.left = -halfSize;
                this.orthographicCamera.right = halfSize;
                this.orthographicCamera.top = halfSize / aspect;
                this.orthographicCamera.bottom = -halfSize / aspect;
            }
            this.orthographicCamera.updateProjectionMatrix();
            return;
        }

        // Project all terrain footprint points into the orthographic camera's view space
        this.orthographicCamera.updateMatrixWorld(true);
        const mat = this.orthographicCamera.matrixWorldInverse;
        const yTarget = this.terrainCentroid ? this.terrainCentroid.y : (this.cityCenter ? this.cityCenter.y : 0);

        let minVx = Infinity;
        let maxVx = -Infinity;
        let minVy = Infinity;
        let maxVy = -Infinity;
        const v = new THREE.Vector3();

        for (const p of this.terrainFootprint) {
            v.set(p.x, yTarget, p.z);
            v.applyMatrix4(mat);
            if (v.x < minVx) minVx = v.x;
            if (v.x > maxVx) maxVx = v.x;
            if (v.y < minVy) minVy = v.y;
            if (v.y > maxVy) maxVy = v.y;
        }

        const projW = maxVx - minVx;
        const projH = maxVy - minVy;
        const projCenterX = (minVx + maxVx) / 2;
        const projCenterY = (minVy + maxVy) / 2;

        // 12% margin so the landmass fills ~88% of the viewport
        const marginFactor = 1.12;
        let halfW = (projW * marginFactor) / 2;
        let halfH = (projH * marginFactor) / 2;

        if (halfW / halfH > aspect) {
            halfH = halfW / aspect;
        } else {
            halfW = halfH * aspect;
        }

        this.orthographicCamera.left = projCenterX - halfW;
        this.orthographicCamera.right = projCenterX + halfW;
        this.orthographicCamera.top = projCenterY + halfH;
        this.orthographicCamera.bottom = projCenterY - halfH;
        this.orthographicCamera.near = 10;
        this.orthographicCamera.far = 50000;
        this.orthographicCamera.updateProjectionMatrix();
    }

    public load() {
        const loader = new GLTFLoader();
        
        loader.load(
            "/city/city.glb",
            (gltf) => {
                if (this.isDisposed) return;
                
                const city = gltf.scene;
                this.scene.add(city);

                const terrainMeshes: THREE.Mesh[] = [];
                const collisionMeshes: THREE.Object3D[] = [];

                city.traverse((object: any) => {
                    if (!object.isMesh) return;

                    const materialName = object.material?.name || "";

                    if (materialName === "MAT_BUILDINGS_HOLO") {
                        object.material = this.createBuildingToonMaterial(object);
                        object.castShadow = true;
                        collisionMeshes.push(object);
                    } else if (materialName === "MAT_BUILDINGS_HOLO_LINES") {
                        object.visible = false;
                    } else if (materialName === "MAT_ROAD_LINES") {
                        object.material = this.roadLineMaterial;
                    } else if (materialName === "MAT_TERRAIN") {
                        terrainMeshes.push(object);
                        object.material = this.createTerrainMaterial();
                        object.receiveShadow = true;
                    } else if (materialName === "MAT_SEA") {
                        object.material = this.createSeaMaterial();
                        object.renderOrder = -10;
                    } else if (materialName.startsWith("Leaf_") || materialName.startsWith("Trunk_") || materialName.startsWith("Twig_")) {
                        object.material = this.createTreeToonMaterial(object.material);
                    } else if (materialName.includes("ROAD")) {
                        object.receiveShadow = true;
                    } else {
                        object.material = this.createTreeToonMaterial(object.material);
                    }

                    if (object.material) {
                        this.registerTimeUniformMaterial(object.material);
                    }
                });

                // Extract terrain footprint for zone boundary clipping and camera framing
                this.terrainMeshes = terrainMeshes;
                this.collisionMeshes = collisionMeshes;
                this.terrainFootprint = extractTerrainFootprint(terrainMeshes);

                const box = new THREE.Box3().setFromObject(city);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDimension = Math.max(size.x, size.y, size.z);

                // Calculate landmass centroid from terrain footprint
                if (this.terrainFootprint && this.terrainFootprint.length > 0) {
                    let sumX = 0;
                    let sumZ = 0;
                    for (const p of this.terrainFootprint) {
                        sumX += p.x;
                        sumZ += p.z;
                    }
                    this.terrainCentroid = new THREE.Vector3(
                        sumX / this.terrainFootprint.length,
                        center.y,
                        sumZ / this.terrainFootprint.length
                    );
                } else {
                    this.terrainCentroid = center.clone();
                }

                const shadowCenter = center.clone();
                const shadowFootprint = Math.max(size.x, size.z);
                const shadowRadius = Math.max(shadowFootprint * 0.42, 100);

                this.directionalLight.position.set(
                    shadowCenter.x + maxDimension * 0.55,
                    shadowCenter.y + maxDimension * 1.20,
                    shadowCenter.z + maxDimension * 0.40
                );
                this.directionalLight.target.position.copy(shadowCenter);
                this.scene.add(this.directionalLight.target);

                const shadowCamera = this.directionalLight.shadow.camera as THREE.OrthographicCamera;
                shadowCamera.left = -shadowRadius;
                shadowCamera.right = shadowRadius;
                shadowCamera.top = shadowRadius;
                shadowCamera.bottom = -shadowRadius;
                shadowCamera.near = 1;
                shadowCamera.far = Math.max(maxDimension * 3.0, 1000);
                shadowCamera.updateProjectionMatrix();

                this.directionalLight.shadow.needsUpdate = true;
                this.renderer.shadowMap.needsUpdate = true;

                (this.scene.fog as THREE.FogExp2).density = 0.55 / maxDimension;
                this.gtaoPass.setSceneClipBox(box);

                // Store city metadata
                this.cityCenter = center.clone();
                this.citySize = size.clone();
                this.cityMaxDimension = maxDimension;

                // Strategic angled orientation (elevation angle ~35-40°, azimuth 45°)
                const target = this.terrainCentroid.clone();
                const camDir = new THREE.Vector3(0.55, 0.60, 0.55).normalize();
                const orthoCamDist = 12000;
                const defaultPos = target.clone().add(camDir.multiplyScalar(orthoCamDist));

                this.defaultCameraPosition = defaultPos.clone();
                this.defaultControlsTarget = target.clone();

                // Position orthographic camera and orient towards landmass centroid
                this.orthographicCamera.position.copy(defaultPos);
                this.orthographicCamera.lookAt(target);
                this.orthographicCamera.zoom = 1.0;
                this.updateOrthographicFrustum();

                // Setup perspective camera as well for seamless switch
                this.perspectiveCamera.position.copy(defaultPos);
                this.perspectiveCamera.lookAt(target);
                this.perspectiveCamera.updateProjectionMatrix();

                // OrbitControls configuration for orthographic mode
                this.controls.minDistance = 100;
                this.controls.maxDistance = maxDimension * 2.0;
                this.controls.target.copy(target);
                this.controls.object = this.activeCamera;
                this.controls.update();

                if (this.onLoadComplete) this.onLoadComplete();
            },
            (xhr) => {
                if (xhr.total && this.onProgress) {
                    const percent = (xhr.loaded / xhr.total) * 100;
                    this.onProgress(percent);
                }
            },
            (error) => {
                console.error("GLB loading error:", error);
                if (this.onError) this.onError(error);
            }
        );
    }

    public resize(width: number, height: number) {
        if (this.isDisposed) return;
        
        this.perspectiveCamera.aspect = width / Math.max(height, 1);
        this.perspectiveCamera.updateProjectionMatrix();

        this.updateOrthographicFrustum(width, height);
        
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.gtaoPass.setSize(width, height);
    }

    private updateHolograms() {
        const time = this.clock.getElapsedTime();
        for (const material of this.timeUniformMaterials) {
            if (material.uniforms?.uTime) {
                material.uniforms.uTime.value = time;
            }
        }
    }

    private animate() {
        if (this.isDisposed) return;
        
        this.animationFrameId = requestAnimationFrame(this.animate);
        
        const delta = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        for (const cb of this.tickCallbacks) {
            try {
                cb(delta, elapsedTime);
            } catch (err) {
                console.error("Error in render tick callback:", err);
            }
        }
        
        if (this.controls && this.controls.enabled && this.cameraMode === 'orthographic') {
            this.controls.update();
        }
        this.updateHolograms();
        this.composer.render();
    }

    public dispose() {
        this.isDisposed = true;
        this.tickCallbacks.clear();
        this.timeUniformMaterials.clear();
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Track disposed resources to avoid double-disposal of shared objects
        const disposed = new Set<unknown>();

        const safeDispose = (resource: { dispose(): void } | null | undefined) => {
            if (!resource || disposed.has(resource)) return;
            disposed.add(resource);
            resource.dispose();
        };

        const disposeMaterialTextures = (material: THREE.Material) => {
            const mat = material as unknown as Record<string, unknown>;
            const textureKeys = [
                'map', 'normalMap', 'alphaMap', 'aoMap', 'bumpMap',
                'displacementMap', 'emissiveMap', 'envMap', 'lightMap',
                'metalnessMap', 'roughnessMap', 'gradientMap'
            ];
            for (const key of textureKeys) {
                const tex = mat[key];
                if (tex && (tex as THREE.Texture).isTexture) {
                    safeDispose(tex as THREE.Texture);
                }
            }
        };

        // Dispose scene-owned GPU resources (geometries, materials, textures)
        this.scene.traverse((object) => {
            if (
                object instanceof THREE.Mesh ||
                object instanceof THREE.Line ||
                object instanceof THREE.Points
            ) {
                if (object.geometry) {
                    safeDispose(object.geometry);
                }

                if (object.material) {
                    const materials = Array.isArray(object.material)
                        ? object.material
                        : [object.material];
                    for (const material of materials) {
                        disposeMaterialTextures(material);
                        safeDispose(material);
                    }
                }
            }
        });

        // Dispose environment map (PMREM-generated texture)
        if (this.scene.environment) {
            safeDispose(this.scene.environment);
            this.scene.environment = null;
        }

        // Dispose renderer-owned textures (Set prevents double-disposal
        // if already caught during scene traversal)
        safeDispose(this.toonGradient);
        safeDispose(this.groundTexture);
        safeDispose(this.buildingFacadeTexture);
        safeDispose(this.skyTexture);
        safeDispose(this.seaNormalMap0);
        safeDispose(this.seaNormalMap1);

        // Dispose renderer-owned standalone materials
        safeDispose(this.roadLineMaterial);

        // Dispose and clear toon material cache
        this.toonMaterialCache.forEach((material) => {
            disposeMaterialTextures(material);
            safeDispose(material);
        });
        this.toonMaterialCache.clear();

        // Remove DOM element
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }

        // Dispose post-processing, controls, and renderer (existing cleanup preserved)
        this.composer.dispose();
        this.controls.dispose();
        this.renderer.dispose();
    }

    // ============================================================
    // RESOURCE CREATORS
    // ============================================================

    private createSkyTexture(): THREE.Texture {
        const texture = new THREE.TextureLoader().load("/city/sky_texture.jpg");
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    private createBuildingFacadeTexture(): THREE.Texture {
        const texture = new THREE.TextureLoader().load("/city/building_facade.png");
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.0, 1.0);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 4);
        return texture;
    }

    private createGroundTexture(): THREE.CanvasTexture {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;

        let seed = 73921;
        function random() {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        }

        ctx.fillStyle = "#203b18";
        ctx.fillRect(0, 0, size, size);

        function addPatch(x: number, y: number, radius: number, rgb: string, alpha: number) {
            const g = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
            g.addColorStop(0, rgb.replace(")", `, ${alpha})`));
            g.addColorStop(0.6, rgb.replace(")", `, ${alpha * 0.55})`));
            g.addColorStop(1, rgb.replace(")", ", 0)"));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 60; i++) {
            addPatch(random() * size, random() * size, 45 + random() * 100, random() > 0.5 ? "rgb(54,82,31)" : "rgb(9,28,7)", 0.35 + random() * 0.25);
        }

        for (let i = 0; i < 190; i++) {
            addPatch(random() * size, random() * size, 8 + random() * 28, random() > 0.5 ? "rgb(66,94,39)" : "rgb(16,43,10)", 0.12 + random() * 0.18);
        }

        for (let i = 0; i < 1500; i++) {
            const x = random() * size;
            const y = random() * size;
            const r = 0.4 + random() * 1.0;
            ctx.fillStyle = random() > 0.5 ? "rgba(90,110,51,0.22)" : "rgba(4,18,5,0.20)";
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 5);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 4);
        texture.needsUpdate = true;
        return texture;
    }

    private createToonGradient(): THREE.DataTexture {
        const data = new Uint8Array([38, 38, 38, 255, 84, 84, 84, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
        const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    private createSeaNormalMap(size: number, scale: number, strength: number, phase: number): THREE.DataTexture {
        const data = new Uint8Array(size * size * 4);
        function height(x: number, y: number) {
            return (
                Math.sin(x * scale + Math.sin(y * scale * 0.71 + phase) * 1.7) * 0.55 +
                Math.sin(y * scale * 1.31 + Math.cos(x * scale * 0.83 - phase) * 1.4) * 0.30 +
                Math.sin((x + y) * scale * 0.47 + phase * 0.7) * 0.15
            );
        }

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x / size;
                const v = y / size;
                const du = 1.0 / size;
                const dv = 1.0 / size;
                const hL = height(u - du, v);
                const hR = height(u + du, v);
                const hD = height(u, v - dv);
                const hU = height(u, v + dv);
                const dx = (hR - hL) * strength;
                const dy = (hU - hD) * strength;
                const nx = -dx;
                const ny = 1.0;
                const nz = -dy;
                const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
                const index = (y * size + x) * 4;
                data[index + 0] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
                data[index + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
                data[index + 2] = Math.round(((nz / length) * 0.5 + 0.5) * 255);
                data[index + 3] = 255;
            }
        }
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
    }

    private createToonMaterial(options: any = {}) {
        const colorObject = new THREE.Color(options.color ?? 0xffffff);
        const key = [
            colorObject.getHexString(),
            options.map ? options.map.uuid : "none",
            options.normalMap ? options.normalMap.uuid : "none",
            options.alphaMap ? options.alphaMap.uuid : "none",
            options.transparent ? "t" : "o",
            options.alphaTest ?? 0,
            options.side ?? THREE.FrontSide,
            options.opacity ?? 1.0
        ].join(":");

        if (this.toonMaterialCache.has(key)) {
            return this.toonMaterialCache.get(key)!;
        }

        const material = new THREE.MeshToonMaterial({
            color: colorObject,
            map: options.map || null,
            gradientMap: this.toonGradient,
            normalMap: options.normalMap || null,
            alphaMap: options.alphaMap || null,
            transparent: options.transparent ?? false,
            alphaTest: options.alphaTest ?? 0,
            opacity: options.opacity ?? 1.0,
            side: options.side ?? THREE.FrontSide
        });
        
        this.toonMaterialCache.set(key, material);
        return material;
    }

    private createTerrainMaterial() {
        return this.createToonMaterial({
            color: 0xffffff,
            map: this.groundTexture,
            side: THREE.DoubleSide
        });
    }

    private createTreeToonMaterial(original: any) {
        return this.createToonMaterial({
            color: original && original.color ? original.color : 0xffffff,
            map: original?.map || null,
            normalMap: original?.normalMap || null,
            alphaMap: original?.alphaMap || null,
            transparent: original?.transparent === true,
            alphaTest: original?.alphaTest || 0.15,
            opacity: original?.opacity ?? 1.0,
            side: original?.side ?? THREE.FrontSide
        });
    }

    // @ts-ignore
    private createHologramMaterial() {
        const mat = new THREE.ShaderMaterial({
            vertexShader: holoVertexShader,
            fragmentShader: holoFragmentShader,
            uniforms: {
                uTime: { value: 0.0 }
            },
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.timeUniformMaterials.add(mat);
        return mat;
    }

    // @ts-ignore
    private createRoadFlowMaterial() {
        const mat = new THREE.ShaderMaterial({
            vertexShader: roadFlowVertexShader,
            fragmentShader: roadFlowFragmentShader,
            uniforms: {
                uTime: { value: 0.0 }
            },
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.timeUniformMaterials.add(mat);
        return mat;
    }

    private createSeaMaterial() {
        const mat = new THREE.ShaderMaterial({
            vertexShader: seaVertexShader,
            fragmentShader: seaFragmentShader,
            uniforms: {
                uTime: { value: 0.0 },
                normalMap0: { value: this.seaNormalMap0 },
                normalMap1: { value: this.seaNormalMap1 }
            },
            transparent: false,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 4,
            side: THREE.DoubleSide
        });
        this.timeUniformMaterials.add(mat);
        return mat;
    }

    // UNION-FIND & BUILDINGS
    
    private nextBuildingComponentId = 1;
    private buildingPalette = [0xc9b38c, 0xa99f92, 0xd7c7a7, 0xc88f83, 0x9ba8aa, 0xb8a06c, 0x8f867c, 0xd1b89a];

    private hashNumber(n: number) {
        let x = Math.sin(n * 12.9898) * 43758.5453;
        return x - Math.floor(x);
    }

    private buildBuildingComponents(geometry: THREE.BufferGeometry) {
        const position = geometry.attributes.position;
        if (!position) return null;
        
        const count = position.count;
        const index = geometry.index;
        const ids = new Float32Array(count);
        
        const parent = new Int32Array(count);
        const rank = new Uint8Array(count);
        for (let i = 0; i < count; i++) parent[i] = i;

        function find(a: number) {
            let root = a;
            while (parent[root] !== root) root = parent[root];
            while (parent[a] !== a) {
                const next = parent[a];
                parent[a] = root;
                a = next;
            }
            return root;
        }

        function union(a: number, b: number) {
            let ra = find(a);
            let rb = find(b);
            if (ra === rb) return;
            if (rank[ra] < rank[rb]) parent[ra] = rb;
            else if (rank[ra] > rank[rb]) parent[rb] = ra;
            else {
                parent[rb] = ra;
                rank[ra]++;
            }
        }

        const positionToVertex = new Map<string, number>();
        const vertex = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            vertex.fromBufferAttribute(position as THREE.BufferAttribute, i);
            const key = vertex.x + "," + vertex.y + "," + vertex.z;
            const previous = positionToVertex.get(key);
            if (previous === undefined) positionToVertex.set(key, i);
            else union(i, previous);
        }

        if (index) {
            const indexCount = index.count;
            for (let i = 0; i < indexCount; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);
                union(a, b);
                union(b, c);
                union(c, a);
            }
        }

        const rootToId = new Map<number, number>();
        for (let i = 0; i < count; i++) {
            const root = find(i);
            let componentId = rootToId.get(root);
            if (componentId === undefined) {
                componentId = this.nextBuildingComponentId++;
                rootToId.set(root, componentId);
            }
            ids[i] = componentId;
        }

        geometry.setAttribute("aBuildingColorId", new THREE.BufferAttribute(ids, 1));
        return rootToId.size;
    }

    private applyBuildingVertexColors(geometry: THREE.BufferGeometry) {
        const idAttribute = geometry.getAttribute("aBuildingColorId");
        if (!idAttribute) return;
        
        const count = idAttribute.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            const componentId = idAttribute.getX(i);
            const paletteIndex = Math.floor(this.hashNumber(componentId) * this.buildingPalette.length) % this.buildingPalette.length;
            color.setHex(this.buildingPalette[paletteIndex]);
            colors[i * 3 + 0] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    private applyBuildingFacadeUVs(geometry: THREE.BufferGeometry) {
        const position = geometry.getAttribute("position");
        const normal = geometry.getAttribute("normal");
        if (!position || !normal) return;

        const uv = new Float32Array(position.count * 2);
        const scale = 0.055;

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            const nx = Math.abs(normal.getX(i));
            const ny = Math.abs(normal.getY(i));
            const nz = Math.abs(normal.getZ(i));

            let u, v;
            if (ny > nx && ny > nz) {
                u = 1070.0 / 2048.0;
                v = 470.0 / 1147.0;
            } else if (nx > nz) {
                u = z * scale;
                v = y * scale;
            } else {
                u = x * scale;
                v = y * scale;
            }
            uv[i * 2 + 0] = u;
            uv[i * 2 + 1] = v;
        }

        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }

    private createBuildingToonMaterial(object: THREE.Mesh) {
        const geometry = object.geometry;

        if (!geometry.getAttribute("aBuildingColorId")) {
            this.buildBuildingComponents(geometry);
        }

        this.applyBuildingVertexColors(geometry);
        this.applyBuildingFacadeUVs(geometry);

        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            map: this.buildingFacadeTexture,
            metalness: 0.55,
            roughness: 0.52,
            envMapIntensity: 0.75,
            side: THREE.DoubleSide
        });

        material.name = "BUILDINGS_FACADE_TEXTURED";
        return material;
    }
}
