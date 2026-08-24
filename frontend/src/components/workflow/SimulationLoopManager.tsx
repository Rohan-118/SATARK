import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { stepSimulation, resetSimulation } from '../../api/simulationApi';

const FLOOD_STEP_INTERVAL_MS = 1000;

export const SimulationLoopManager: React.FC = () => {
  const workflowState = useStore(state => state.workflowState);
  const activeCalamity = useStore(state => state.activeCalamity);
  const applyWorldSnapshot = useStore(state => state.applyWorldSnapshot);

  const isStepping = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Only run automatic loop for FLOOD when disaster is active
    if (workflowState !== 'disaster-active' || activeCalamity?.type !== 'FLOOD') {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const tick = async () => {
      if (!isMounted) return;
      if (isStepping.current) return; // Prevent overlapping requests
      if (useStore.getState().isSimulationMutating) {
        // Wait, skip this tick, try again next tick
        timerRef.current = window.setTimeout(tick, FLOOD_STEP_INTERVAL_MS);
        return;
      }
      
      isStepping.current = true;
      useStore.getState().setIsSimulationStepping(true);
      try {
        const snapshot = await stepSimulation();
        if (!isMounted) return;
        
        applyWorldSnapshot(snapshot);
        
        if (snapshot.simulation.complete) {
          useStore.getState().setFinalEnvironment(snapshot.environment);
          
          const resetSnapshot = await resetSimulation();
          
          // Preserve existing agents instead of letting the backend reset wipe them out
          resetSnapshot.agents = {
             agents: Object.values(useStore.getState().agents),
             timestamp: Date.now(),
             tick: 0
          };
          
          useStore.getState().applyWorldSnapshot(resetSnapshot);
          
          useStore.getState().setWorkflowState('disaster-finished');
          return; // Stop loop
        }
        
        // Schedule next tick
        timerRef.current = window.setTimeout(tick, FLOOD_STEP_INTERVAL_MS);
      } catch (err) {
        console.error('[SimulationLoop] Step failed:', err);
        // On error, try again after interval
        if (isMounted) {
            timerRef.current = window.setTimeout(tick, FLOOD_STEP_INTERVAL_MS);
        }
      } finally {
        isStepping.current = false;
        useStore.getState().setIsSimulationStepping(false);
      }
    };

    // Start the loop
    timerRef.current = window.setTimeout(tick, FLOOD_STEP_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [workflowState, activeCalamity?.type, applyWorldSnapshot]);

  return null;
};
