import { StateCreator } from 'zustand';
import { Agent, AgentSnapshot } from '../types/domain';

export interface AgentSlice {
  /** Normalized map of agents indexed by ID for O(1) lookup */
  agents: Record<string, Agent>;

  /** Deterministic ordered list of agent IDs */
  agentIds: string[];

  /** Timestamp of the last successful snapshot update (ms) */
  lastUpdated: number | null;

  /** Authoritative simulation tick associated with the current agent snapshot */
  snapshotTick: number | null;

  // ── Actions ──

  /**
   * Replace current agents collection with a new array of validated domain agents.
   */
  setAgents: (agents: Agent[]) => void;

  /**
   * Ingest a full AgentSnapshot including tick and timestamp metadata.
   */
  setAgentSnapshot: (snapshot: AgentSnapshot) => void;

  /**
   * Apply a partial update to an existing agent by ID.
   */
  updateAgent: (id: string, updates: Partial<Agent>) => void;

  /**
   * Reset the agent store to empty state.
   */
  clearAgents: () => void;

  /**
   * Reset all agents to NORMAL state (used when disasters end).
   */
  resetAgentsToNormal: () => void;
}

export const createAgentSlice: StateCreator<AgentSlice> = (set, get) => ({
  agents: {},
  agentIds: [],
  lastUpdated: null,
  snapshotTick: null,

  setAgents: (agents: Agent[]) => {
    const agentsMap: Record<string, Agent> = {};
    const agentIds: string[] = [];

    for (const agent of agents) {
      agentsMap[agent.id] = agent;
      agentIds.push(agent.id);
    }

    set({
      agents: agentsMap,
      agentIds,
      lastUpdated: Date.now(),
    });
  },

  setAgentSnapshot: (snapshot: AgentSnapshot) => {
    const agentsMap: Record<string, Agent> = {};
    const agentIds: string[] = [];

    for (const agent of snapshot.agents) {
      agentsMap[agent.id] = agent;
      agentIds.push(agent.id);
    }

    set({
      agents: agentsMap,
      agentIds,
      lastUpdated: snapshot.timestamp ?? Date.now(),
      snapshotTick: snapshot.tick ?? null,
    });
  },

  updateAgent: (id: string, updates: Partial<Agent>) => {
    const current = get().agents[id];
    if (!current) return;

    set((state) => ({
      agents: {
        ...state.agents,
        [id]: { ...current, ...updates },
      },
    }));
  },

  clearAgents: () => {
    set({
      agents: {},
      agentIds: [],
      lastUpdated: null,
      snapshotTick: null,
    });
  },

  resetAgentsToNormal: () => {
    set((state) => {
      const newAgents: Record<string, Agent> = {};
      for (const [id, agent] of Object.entries(state.agents)) {
        newAgents[id] = { ...agent, state: 'NORMAL' };
      }
      return { agents: newAgents };
    });
  },
});
