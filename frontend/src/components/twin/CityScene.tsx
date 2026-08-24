import React, { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../../city/CityRenderer';
import { ZoneRenderer } from '../../city/zones/ZoneRenderer';
import { AgentRenderer } from '../../city/agents/AgentRenderer';
import { CameraController } from '../../city/camera/CameraController';
import { CityStateAdapter } from '../../city/CityStateAdapter';
import { CityInteraction } from '../../city/CityInteraction';
import { DisasterRenderer } from '../../city/calamities/DisasterRenderer';
import { InfrastructureRenderer } from '../../city/infrastructure/InfrastructureRenderer';
import { fetchZones, fetchSafeZones, fetchWorldBounds } from '../../api/worldApi';
import { useStore } from '../../store';
import { WorldBounds } from '../../city/zones/voronoi';
import { DevSimulationControls } from '../simulation/DevSimulationControls';
import './CityScene.css';

export const CityScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const zoneRendererRef = useRef<ZoneRenderer | null>(null);
  const agentRendererRef = useRef<AgentRenderer | null>(null);
  const cameraControllerRef = useRef<CameraController | null>(null);
  const disasterRendererRef = useRef<DisasterRenderer | null>(null);
  const infrastructureRendererRef = useRef<InfrastructureRenderer | null>(null);
  const stateAdapterRef = useRef<CityStateAdapter | null>(null);
  const interactionRef = useRef<CityInteraction | null>(null);
  const worldBoundsRef = useRef<WorldBounds | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  // Load initial world data
  useEffect(() => {
    const loadWorldData = async () => {
      try {
        const [zones, safeZones, worldBounds] = await Promise.all([
          fetchZones(),
          fetchSafeZones(),
          fetchWorldBounds(),
        ]);
        useStore.getState().setZones(zones);
        useStore.getState().setSafeZones(safeZones);
        worldBoundsRef.current = worldBounds;

        // If zone renderer or camera controller already exists, set bounds now
        if (zoneRendererRef.current) {
          zoneRendererRef.current.setWorldBounds(worldBounds);
          zoneRendererRef.current.updateZones(zones, safeZones);
        }
        if (cameraControllerRef.current) {
          cameraControllerRef.current.setWorldBounds(worldBounds);
        }
      } catch (err) {
        console.error("Failed to load world data:", err);
      }
    };
    loadWorldData();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the renderer only once per mount
    const renderer = new CityRenderer(containerRef.current);
    rendererRef.current = renderer;

    renderer.onProgress = (percent) => {
      setProgress(percent);
    };

    renderer.onLoadComplete = () => {
      setLoading(false);
      
      // Initialize zone layer, agent layer, camera controller, interaction, and state sync AFTER city loads
      const zoneRenderer = new ZoneRenderer(renderer);
      zoneRendererRef.current = zoneRenderer;

      const agentRenderer = new AgentRenderer(renderer);
      agentRendererRef.current = agentRenderer;
      agentRenderer.load().catch((err) => {
        console.error("Failed to load agent model:", err);
      });

      const cameraController = new CameraController(renderer);
      cameraControllerRef.current = cameraController;

      const disasterRenderer = new DisasterRenderer(renderer, zoneRenderer);
      disasterRendererRef.current = disasterRenderer;

      const infrastructureRenderer = new InfrastructureRenderer(renderer.getScene());
      infrastructureRendererRef.current = infrastructureRenderer;

      // Pass terrain footprint for accurate zone boundary clipping and camera bounds
      const terrainFootprint = renderer.getTerrainFootprint();
      if (terrainFootprint) {
        zoneRenderer.setTerrainFootprint(terrainFootprint);
        cameraController.setTerrainFootprint(terrainFootprint);
      }

      // If world bounds already loaded, set them before state adapter syncs
      if (worldBoundsRef.current) {
        zoneRenderer.setWorldBounds(worldBoundsRef.current);
        cameraController.setWorldBounds(worldBoundsRef.current);
      }

      const stateAdapter = new CityStateAdapter(
        zoneRenderer, 
        agentRenderer, 
        cameraController,
        disasterRenderer,
        infrastructureRenderer
      );
      stateAdapterRef.current = stateAdapter;

      const interaction = new CityInteraction(containerRef.current!, renderer, zoneRenderer, cameraController);
      interactionRef.current = interaction;
    };

    renderer.onError = (err) => {
      console.error("Renderer failed to load assets:", err);
    };

    renderer.load();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            renderer.resize(width, height);
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      interactionRef.current?.dispose();
      stateAdapterRef.current?.dispose();
      cameraControllerRef.current?.dispose();
      agentRendererRef.current?.dispose();
      zoneRendererRef.current?.dispose();
      disasterRendererRef.current?.dispose();
      infrastructureRendererRef.current?.dispose();
      renderer.dispose();
      
      interactionRef.current = null;
      stateAdapterRef.current = null;
      cameraControllerRef.current = null;
      agentRendererRef.current = null;
      zoneRendererRef.current = null;
      disasterRendererRef.current = null;
      infrastructureRendererRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  return (
    <div className="city-scene-container" ref={containerRef}>
      {loading && (
        <div className="city-scene-loading">
          Loading city.glb... {progress.toFixed(0)}%
        </div>
      )}
      {!loading && <DevSimulationControls />}
    </div>
  );
};
