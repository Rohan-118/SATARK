export type CalamityType = 'FLOOD' | 'EARTHQUAKE';

export interface WorldCoordinate {
  x: number;
  z: number;
}

export interface NormalizedCoordinate {
  x: number;
  y: number;
}

export interface Zone {
  id: string;
  name?: string;
  center_world: WorldCoordinate;
  center_normalized?: NormalizedCoordinate;
  neighbors: string[];
}

export interface SafeZone {
  id: string;
  zoneId: string;
  capacity: number;
}

export * from './agent';

export interface Calamity {
  type: CalamityType;
  active: boolean;
}

export interface FloodEnvironment {
  flood_water_levels: Record<string, number>;
  rainfall_intensity: number;
}

export * from './simulation';
