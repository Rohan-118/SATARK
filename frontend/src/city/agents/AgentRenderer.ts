import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Agent } from '../../types/domain';
import { CityRenderer } from '../CityRenderer';

export type AgentAnimationName = 'idle' | 'run';

export interface AgentRendererOptions {
  glbUrl?: string;
  defaultAnimation?: AgentAnimationName;
}

/**
 * Visual representation of an active agent in the 3D scene.
 */
interface RenderedAgentInstance {
  id: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: {
    idle: THREE.AnimationAction | null;
    run: THREE.AnimationAction | null;
  };
  currentAnimation: AgentAnimationName;
}

/**
 * AgentRenderer — Phase 4.1 Visual Agent Renderer Subsystem.
 *
 * Responsibilities:
 * - Load the master Capsule Character GLB asset once (/agents/capsule_character.glb)
 * - Safely clone independent visual instances using Three.js SkeletonUtils
 * - Manage independent AnimationMixers per agent with Armature|Idle and Armature|Run clips
 * - Position agents in world space using authoritative domain coordinates
 * - Update animation state on each render frame via CityRenderer.onTick()
 * - Cleanly manage agent lifecycle and resource disposal without leaking GPU resources
 */
export class AgentRenderer {
  private renderer: CityRenderer;
  private group: THREE.Group;
  private glbUrl: string;
  private defaultAnimation: AgentAnimationName;

  // Master asset state (loaded once)
  private masterScene: THREE.Group | null = null;
  private idleClip: THREE.AnimationClip | null = null;
  private runClip: THREE.AnimationClip | null = null;
  private masterGeometries: Set<THREE.BufferGeometry> = new Set();
  private masterMaterials: Set<THREE.Material> = new Set();

  private isLoading = false;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private isDisposed = false;

  // Active instances mapped by authoritative Agent ID
  private instances: Map<string, RenderedAgentInstance> = new Map();

  // Pending agents if state updates before GLB completes loading
  private pendingAgents: Agent[] | null = null;

  // Unsubscribe function for CityRenderer frame tick
  private unsubscribeTick: (() => void) | null = null;

  constructor(renderer: CityRenderer, options?: AgentRendererOptions) {
    this.renderer = renderer;
    this.glbUrl = options?.glbUrl ?? '/agents/capsule_character.glb';
    this.defaultAnimation = options?.defaultAnimation ?? 'idle';

    this.group = new THREE.Group();
    this.group.name = 'SATARK_AgentLayer';
    this.renderer.addOverlay(this.group);

    // Subscribe to unified frame render loop
    this.unsubscribeTick = this.renderer.onTick((delta) => {
      this.update(delta);
    });
  }

  // ────────────────────────────────────────────────────────────
  // Asset Loading
  // ────────────────────────────────────────────────────────────

  /**
   * Load the master character GLB asset once.
   */
  public async load(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.isLoading = true;
    const loader = new GLTFLoader();

    this.loadPromise = new Promise<void>((resolve, reject) => {
      loader.load(
        this.glbUrl,
        (gltf) => {
          if (this.isDisposed) {
            resolve();
            return;
          }

          this.masterScene = gltf.scene;

          // Extract and catalogue master geometries and materials for safe disposal
          this.masterScene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              if (mesh.geometry) this.masterGeometries.add(mesh.geometry);
              if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                  mesh.material.forEach((m) => this.masterMaterials.add(m));
                } else {
                  this.masterMaterials.add(mesh.material);
                }
              }
            }
          });

          // Identify authoritative animation clips
          this.idleClip = gltf.animations.find((clip) => clip.name === 'Armature|Idle') || null;
          this.runClip = gltf.animations.find((clip) => clip.name === 'Armature|Run') || null;

          if (!this.idleClip) {
            console.warn("AgentRenderer: 'Armature|Idle' animation clip not found in GLB");
          }
          if (!this.runClip) {
            console.warn("AgentRenderer: 'Armature|Run' animation clip not found in GLB");
          }

          this.isLoaded = true;
          this.isLoading = false;

          // Process any domain agents that were queued while model was loading
          if (this.pendingAgents) {
            const queued = this.pendingAgents;
            this.pendingAgents = null;
            this.updateAgents(queued);
          }

          resolve();
        },
        undefined,
        (err) => {
          this.isLoading = false;
          console.error('AgentRenderer: Failed to load capsule character GLB from', this.glbUrl, err);
          reject(err);
        }
      );
    });

    return this.loadPromise;
  }

  // ────────────────────────────────────────────────────────────
  // Agent State Synchronization
  // ────────────────────────────────────────────────────────────

  /**
   * Synchronize visual agent instances with authoritative domain agent entities.
   * Handles additions, position updates, and removals.
   */
  public updateAgents(agents: Agent[]): void {
    console.log('[DEBUG AGENTS] AgentRenderer.updateAgents called with:', agents.length);
    if (this.isDisposed) return;

    if (!this.isLoaded) {
      console.log('[DEBUG AGENTS] AgentRenderer not loaded yet. Queuing', agents.length, 'agents.');
      // Store pending agents until GLB finishes loading
      this.pendingAgents = agents;
      return;
    }


    const activeIds = new Set<string>();

    for (const agent of agents) {
      activeIds.add(agent.id);
      const existing = this.instances.get(agent.id);

      if (existing) {
        // Update world position directly from domain coordinates
        existing.root.position.set(agent.position.x, agent.position.y, agent.position.z);
        // Couple agent state to animation: PANIC -> run, NORMAL / SAFE -> idle
        const targetAnimation = this.getTargetAnimation(agent);
        this.setAgentAnimation(agent.id, targetAnimation);
      } else {
        // Create new visual instance
        const instance = this.createAgentInstance(agent);
        if (instance) {
          this.instances.set(agent.id, instance);
        }
      }
    }

    // Clean up instances no longer present in authoritative state
    for (const [id] of this.instances) {
      if (!activeIds.has(id)) {
        this.removeAgentInstance(id);
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // Animation API
  // ────────────────────────────────────────────────────────────

  /**
   * Set animation state ('idle' | 'run') for a specific agent with smooth cross-fade.
   */
  public setAgentAnimation(
    agentId: string,
    animation: AgentAnimationName,
    crossFadeDuration = 0.25
  ): void {
    const instance = this.instances.get(agentId);
    if (!instance || instance.currentAnimation === animation) return;

    const currentAction = instance.actions[instance.currentAnimation];
    const targetAction = instance.actions[animation];

    if (targetAction && currentAction) {
      targetAction.reset();
      targetAction.fadeIn(crossFadeDuration);
      targetAction.play();
      currentAction.fadeOut(crossFadeDuration);
    } else if (targetAction) {
      targetAction.reset().play();
    }

    instance.currentAnimation = animation;
  }

  /**
   * Set animation state for all currently rendered agents.
   */
  public setAllAgentAnimations(
    animation: AgentAnimationName,
    crossFadeDuration = 0.25
  ): void {
    for (const id of this.instances.keys()) {
      this.setAgentAnimation(id, animation, crossFadeDuration);
    }
  }

  /**
   * Query current animation of an agent instance.
   */
  public getAgentAnimation(agentId: string): AgentAnimationName | null {
    const instance = this.instances.get(agentId);
    return instance ? instance.currentAnimation : null;
  }

  /**
   * Query the number of active visual agent instances.
   */
  public getInstanceCount(): number {
    return this.instances.size;
  }

  /**
   * Check whether the master asset is currently loading.
   */
  public isLoadingAsset(): boolean {
    return this.isLoading;
  }

  /**
   * Check whether the master asset is ready.
   */
  public isReady(): boolean {
    return this.isLoaded && !this.isDisposed;
  }

  // ────────────────────────────────────────────────────────────
  // Per-Frame Animation Update
  // ────────────────────────────────────────────────────────────

  /**
   * Advance all agent animation mixers by delta time.
   * Driven directly by CityRenderer.onTick().
   */
  private update(delta: number): void {
    if (this.isDisposed || this.instances.size === 0) return;

    for (const instance of this.instances.values()) {
      instance.mixer.update(delta);
    }
  }

  // ────────────────────────────────────────────────────────────
  // Instance Lifecycle Helpers
  // ────────────────────────────────────────────────────────────

  /**
   * Determine target animation from authoritative domain agent state:
   * NORMAL → idle
   * SAFE   → idle
   * PANIC  → run
   */
  private getTargetAnimation(agent: Agent): AgentAnimationName {
    if (agent.state === 'PANIC') return 'run';
    if (agent.state === 'NORMAL' || agent.state === 'SAFE') return 'idle';
    return this.defaultAnimation;
  }

  /**
   * Clone master character and initialize instance transforms, actions, and mixer.
   */
  private createAgentInstance(agent: Agent): RenderedAgentInstance | null {
    if (!this.masterScene) return null;

    // Use SkeletonUtils.clone to properly clone skeleton, bones, and skinned mesh bindings
    const root = SkeletonUtils.clone(this.masterScene) as THREE.Object3D;
    root.name = `Agent_${agent.id}`;
    root.position.set(agent.position.x, agent.position.y, agent.position.z);
    root.userData = { isAgent: true, agentId: agent.id };

    // Enable shadows and fix frustum culling for skinned meshes
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });
    
    // Scale up the agents so they are clearly visible on the large city map
    // The capsule character is ~2 units tall. Scale 3x makes them ~6 units tall,
    // which keeps them visible in overview while looking more human-sized in freecam.
    root.scale.set(3, 3, 3);

    // Create an independent AnimationMixer for this agent instance
    const mixer = new THREE.AnimationMixer(root);

    let idleAction: THREE.AnimationAction | null = null;
    let runAction: THREE.AnimationAction | null = null;

    if (this.idleClip) {
      idleAction = mixer.clipAction(this.idleClip);
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (this.runClip) {
      runAction = mixer.clipAction(this.runClip);
      runAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    // Play target animation based on authoritative agent state (PANIC -> run, NORMAL/SAFE -> idle)
    const targetAnimation = this.getTargetAnimation(agent);
    const initialAction = targetAnimation === 'run' ? runAction : idleAction;
    if (initialAction) {
      initialAction.play();
    }

    this.group.add(root);

    return {
      id: agent.id,
      root,
      mixer,
      actions: {
        idle: idleAction,
        run: runAction,
      },
      currentAnimation: targetAnimation,
    };
  }

  /**
   * Safely remove and dispose a single agent instance.
   */
  private removeAgentInstance(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    this.disposeInstance(instance);
    this.instances.delete(id);
  }

  /**
   * Dispose instance mixer, actions, and remove from parent group.
   */
  private disposeInstance(instance: RenderedAgentInstance): void {
    // Stop all mixer actions and uncache root
    instance.mixer.stopAllAction();
    instance.mixer.uncacheRoot(instance.root);

    // Remove from group
    this.group.remove(instance.root);
  }

  // ────────────────────────────────────────────────────────────
  // Renderer Disposal
  // ────────────────────────────────────────────────────────────

  /**
   * Complete teardown of AgentRenderer.
   * Cleans up all instances, mixers, frame subscriptions, and master asset references.
   */
  public dispose(): void {
    this.isDisposed = true;

    // Unsubscribe from frame loop
    if (this.unsubscribeTick) {
      this.unsubscribeTick();
      this.unsubscribeTick = null;
    }

    // Dispose all active agent instances
    for (const instance of this.instances.values()) {
      this.disposeInstance(instance);
    }
    this.instances.clear();

    // Remove overlay group from city scene
    this.renderer.removeOverlay(this.group);

    // Dispose master geometries and materials
    for (const geom of this.masterGeometries) {
      geom.dispose();
    }
    this.masterGeometries.clear();

    for (const mat of this.masterMaterials) {
      mat.dispose();
    }
    this.masterMaterials.clear();

    this.masterScene = null;
    this.idleClip = null;
    this.runClip = null;
    this.pendingAgents = null;
    this.loadPromise = null;
  }
}
