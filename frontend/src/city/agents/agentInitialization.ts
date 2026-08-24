import { Agent, Zone } from '../../types/domain';
import { VoronoiCell } from '../zones/voronoi';

interface PopulationData {
  zones: {
    zone_id: string;
    resident_population_estimate: number;
  }[];
}

/**
 * Generate a random point inside a convex/concave 2D polygon defined by vertices.
 * Uses a simple bounding box rejection sampling method for irregular polygons.
 */
export function getRandomPointInPolygon(vertices: { x: number; z: number }[]): { x: number; z: number } | null {
  if (vertices.length < 3) return null;

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }

  // Ray-casting algorithm to check if point is inside polygon
  const isInside = (x: number, z: number) => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, zi = vertices[i].z;
      const xj = vertices[j].x, zj = vertices[j].z;

      const intersect = ((zi > z) !== (zj > z))
          && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Try up to 100 times to find a point inside the polygon
  for (let attempt = 0; attempt < 100; attempt++) {
    const rx = minX + Math.random() * (maxX - minX);
    const rz = minZ + Math.random() * (maxZ - minZ);
    if (isInside(rx, rz)) {
      return { x: rx, z: rz };
    }
  }

  // Fallback to center of bounding box if we couldn't find a point
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

export async function generateInitialAgents(
  zones: Zone[], 
  cells: Map<string, VoronoiCell>,
  representativeAgentCount: number = 250
): Promise<Agent[]> {
  try {
    const res = await fetch('/data/population.json');
    if (!res.ok) throw new Error('Failed to fetch population.json');
    const populationData: PopulationData = await res.json();

    // 1. Calculate target counts per zone based on population weights
    const normalized: { zone_id: string, population: number }[] = [];
    for (const z of populationData.zones) {
      if (zones.find(zone => zone.id === z.zone_id) && z.resident_population_estimate > 0) {
        normalized.push({ zone_id: z.zone_id, population: z.resident_population_estimate });
      }
    }

    if (normalized.length === 0) return [];

    const totalPopulation = normalized.reduce((sum, n) => sum + n.population, 0);
    const targetCount = Math.max(normalized.length, representativeAgentCount);

    const raw: Record<string, number> = {};
    for (const n of normalized) {
      raw[n.zone_id] = (n.population / totalPopulation) * targetCount;
    }

    const counts: Record<string, number> = {};
    let currentCount = 0;
    for (const [id, val] of Object.entries(raw)) {
      counts[id] = Math.max(1, Math.floor(val));
      currentCount += counts[id];
    }

    // Adjust counts to match target exactly (same algorithm as backend)
    while (currentCount > targetCount) {
      const candidates = Object.keys(counts).filter(id => counts[id] > 1);
      if (candidates.length === 0) break;
      const zoneId = candidates.reduce((a, b) => (raw[a] - Math.floor(raw[a])) < (raw[b] - Math.floor(raw[b])) ? a : b);
      counts[zoneId]--;
      currentCount--;
    }

    const remainders = Object.keys(counts).sort((a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])));
    let idx = 0;
    while (currentCount < targetCount) {
      const zoneId = remainders[idx % remainders.length];
      counts[zoneId]++;
      currentCount++;
      idx++;
    }

    // 2. Generate agents in random positions within their zone's Voronoi cell
    const agents: Agent[] = [];
    for (const n of normalized) {
      const count = counts[n.zone_id];
      const cell = cells.get(n.zone_id);
      
      const center = zones.find(z => z.id === n.zone_id)?.center_world;
      const fallbackPos = center ? { x: center.x, z: center.z } : { x: 0, z: 0 };

      for (let i = 0; i < count; i++) {
        let agentPos = { x: fallbackPos.x, z: fallbackPos.z };
        
        if (cell && cell.vertices.length >= 3) {
           const p = getRandomPointInPolygon(cell.vertices);
           if (p) {
               agentPos = p;
           }
        } else if (count > 1) {
            // Fallback for no voronoi: simple scatter
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 30;
            agentPos.x += Math.cos(angle) * radius;
            agentPos.z += Math.sin(angle) * radius;
        }

        agents.push({
          id: `agent_${n.zone_id}_${String(i + 1).padStart(3, '0')}`,
          position: { x: agentPos.x, y: 0.0, z: agentPos.z },
          zoneId: n.zone_id,
          state: 'NORMAL'
        });
      }
    }

    return agents;

  } catch (err) {
    console.error("Failed to generate initial agents:", err);
    return [];
  }
}
