import type { OrgChartEdge } from "./model";

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Viewport extends Point { scale: number }

const LAYOUT_PADDING = 64;
const DEFAULT_ITERATIONS = 300;
const MIN_ALPHA = 1e-3;
const VELOCITY_DECAY = 0.6;
const NODE_RADIUS = 56;
const COLLISION_PASSES = 2;
const LINK_DISTANCE = 160;
const REPULSION = -900;
const REPULSION_RADIUS = 480;
const CENTERING = 0.06;
const MAX_ASPECT_BIAS = 2.5;

function deterministicAngle(left: number, right: number): number {
  return ((left * 7919 + right * 104729) % 628) / 100;
}

export function layoutOrgChart({
  nodeIds,
  edges,
  width,
  height,
  iterations = DEFAULT_ITERATIONS
}: {
  nodeIds: readonly string[];
  edges: readonly OrgChartEdge[];
  width: number;
  height: number;
  iterations?: number;
}): Map<string, Point> {
  const centerX = width / 2;
  const centerY = height / 2;
  const points = new Map<string, Point>();
  const count = nodeIds.length;
  if (count === 0) return points;
  if (count === 1) {
    const id = nodeIds[0];
    if (id != null) points.set(id, { x: centerX, y: centerY });
    return points;
  }

  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const velocityX = new Float64Array(count);
  const velocityY = new Float64Array(count);
  const indexById = new Map<string, number>();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  nodeIds.forEach((id, index) => {
    indexById.set(id, index);
    const radius = NODE_RADIUS * Math.sqrt(0.5 + index);
    const angle = index * goldenAngle;
    x[index] = radius * Math.cos(angle);
    y[index] = radius * Math.sin(angle);
  });

  const sources: number[] = [];
  const targets: number[] = [];
  const degrees = new Float64Array(count);
  for (const edge of edges) {
    const source = indexById.get(edge.sourceId);
    const target = indexById.get(edge.targetId);
    if (source == null || target == null || source === target) continue;
    sources.push(source);
    targets.push(target);
    degrees[source] = (degrees[source] ?? 0) + 1;
    degrees[target] = (degrees[target] ?? 0) + 1;
  }

  const linkStrength = new Float64Array(sources.length);
  const sourceBias = new Float64Array(sources.length);
  for (let index = 0; index < sources.length; index += 1) {
    const sourceDegree = degrees[sources[index] ?? 0] ?? 1;
    const targetDegree = degrees[targets[index] ?? 0] ?? 1;
    linkStrength[index] = 1 / Math.min(sourceDegree, targetDegree);
    sourceBias[index] = sourceDegree / (sourceDegree + targetDegree);
  }

  const aspect = Math.min(MAX_ASPECT_BIAS, Math.max(1 / MAX_ASPECT_BIAS, width / height));
  const centerXStrength = CENTERING / aspect;
  const centerYStrength = CENTERING * aspect;
  const alphaDecay = 1 - Math.pow(MIN_ALPHA, 1 / iterations);
  let alpha = 1;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    alpha += (0 - alpha) * alphaDecay;
    for (let edgeIndex = 0; edgeIndex < sources.length; edgeIndex += 1) {
      const source = sources[edgeIndex] ?? 0;
      const target = targets[edgeIndex] ?? 0;
      let deltaX = (x[target] ?? 0) + (velocityX[target] ?? 0) - (x[source] ?? 0) - (velocityX[source] ?? 0);
      let deltaY = (y[target] ?? 0) + (velocityY[target] ?? 0) - (y[source] ?? 0) - (velocityY[source] ?? 0);
      if (deltaX === 0 && deltaY === 0) {
        const angle = deterministicAngle(source, target);
        deltaX = Math.cos(angle) * 1e-6;
        deltaY = Math.sin(angle) * 1e-6;
      }
      const distance = Math.hypot(deltaX, deltaY);
      const strength = (distance - LINK_DISTANCE) / distance * alpha * (linkStrength[edgeIndex] ?? 1);
      const forceX = deltaX * strength;
      const forceY = deltaY * strength;
      const bias = sourceBias[edgeIndex] ?? 0.5;
      velocityX[target] = (velocityX[target] ?? 0) - forceX * bias;
      velocityY[target] = (velocityY[target] ?? 0) - forceY * bias;
      velocityX[source] = (velocityX[source] ?? 0) + forceX * (1 - bias);
      velocityY[source] = (velocityY[source] ?? 0) + forceY * (1 - bias);
    }

    for (let left = 0; left < count; left += 1) for (let right = left + 1; right < count; right += 1) {
      let deltaX = (x[right] ?? 0) - (x[left] ?? 0);
      let deltaY = (y[right] ?? 0) - (y[left] ?? 0);
      if (deltaX === 0 && deltaY === 0) {
        const angle = deterministicAngle(left, right);
        deltaX = Math.cos(angle) * 1e-6;
        deltaY = Math.sin(angle) * 1e-6;
      }
      const squaredDistance = Math.max(1, deltaX * deltaX + deltaY * deltaY);
      if (squaredDistance >= REPULSION_RADIUS * REPULSION_RADIUS) continue;
      const force = REPULSION * alpha / squaredDistance;
      velocityX[left] = (velocityX[left] ?? 0) + deltaX * force;
      velocityY[left] = (velocityY[left] ?? 0) + deltaY * force;
      velocityX[right] = (velocityX[right] ?? 0) - deltaX * force;
      velocityY[right] = (velocityY[right] ?? 0) - deltaY * force;
    }

    for (let index = 0; index < count; index += 1) {
      velocityX[index] = (velocityX[index] ?? 0) - (x[index] ?? 0) * centerXStrength * alpha;
      velocityY[index] = (velocityY[index] ?? 0) - (y[index] ?? 0) * centerYStrength * alpha;
    }

    for (let pass = 0; pass < COLLISION_PASSES; pass += 1) for (let left = 0; left < count; left += 1) for (let right = left + 1; right < count; right += 1) {
      let deltaX = (x[left] ?? 0) + (velocityX[left] ?? 0) - (x[right] ?? 0) - (velocityX[right] ?? 0);
      let deltaY = (y[left] ?? 0) + (velocityY[left] ?? 0) - (y[right] ?? 0) - (velocityY[right] ?? 0);
      const diameter = NODE_RADIUS * 2;
      let squaredDistance = deltaX * deltaX + deltaY * deltaY;
      if (squaredDistance >= diameter * diameter) continue;
      if (squaredDistance === 0) {
        const angle = deterministicAngle(left, right);
        deltaX = Math.cos(angle) * 1e-6;
        deltaY = Math.sin(angle) * 1e-6;
        squaredDistance = deltaX * deltaX + deltaY * deltaY;
      }
      const distance = Math.sqrt(squaredDistance);
      const strength = (diameter - distance) / distance;
      const forceX = deltaX * strength * 0.5;
      const forceY = deltaY * strength * 0.5;
      velocityX[left] = (velocityX[left] ?? 0) + forceX;
      velocityY[left] = (velocityY[left] ?? 0) + forceY;
      velocityX[right] = (velocityX[right] ?? 0) - forceX;
      velocityY[right] = (velocityY[right] ?? 0) - forceY;
    }

    for (let index = 0; index < count; index += 1) {
      velocityX[index] = (velocityX[index] ?? 0) * VELOCITY_DECAY;
      velocityY[index] = (velocityY[index] ?? 0) * VELOCITY_DECAY;
      x[index] = (x[index] ?? 0) + (velocityX[index] ?? 0);
      y[index] = (y[index] ?? 0) + (velocityY[index] ?? 0);
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < count; index += 1) {
    minX = Math.min(minX, x[index] ?? 0); maxX = Math.max(maxX, x[index] ?? 0);
    minY = Math.min(minY, y[index] ?? 0); maxY = Math.max(maxY, y[index] ?? 0);
  }
  const availableWidth = Math.max(1, width - LAYOUT_PADDING * 2);
  const availableHeight = Math.max(1, height - LAYOUT_PADDING * 2);
  const scale = Math.min(1, availableWidth / Math.max(1, maxX - minX), availableHeight / Math.max(1, maxY - minY));
  const midpointX = (minX + maxX) / 2;
  const midpointY = (minY + maxY) / 2;
  nodeIds.forEach((id, index) => points.set(id, {
    x: centerX + ((x[index] ?? 0) - midpointX) * scale,
    y: centerY + ((y[index] ?? 0) - midpointY) * scale
  }));
  return points;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeViewport(viewport: Viewport, size: Size, overscroll = 0): Viewport {
  const scale = clamp(viewport.scale, 1, 3);
  const extraX = size.width * overscroll;
  const extraY = size.height * overscroll;
  return {
    scale,
    x: clamp(viewport.x, size.width * (1 - scale) - extraX, extraX),
    y: clamp(viewport.y, size.height * (1 - scale) - extraY, extraY)
  };
}

export function panViewport(viewport: Viewport, delta: Point, size: Size, overscroll = 0): Viewport {
  return normalizeViewport({ scale: viewport.scale, x: viewport.x + delta.x, y: viewport.y + delta.y }, size, overscroll);
}

export function zoomViewport(viewport: Viewport, multiplier: number, origin: Point, size: Size): Viewport {
  const scale = clamp(viewport.scale * multiplier, 1, 3);
  const ratio = scale / viewport.scale;
  return normalizeViewport({ scale, x: origin.x - (origin.x - viewport.x) * ratio, y: origin.y - (origin.y - viewport.y) * ratio }, size);
}

export function wheelZoomFactor(deltaY: number, deltaMode: number, isPinch: boolean): number {
  const modeScale = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1;
  return Math.exp(-deltaY * modeScale * (isPinch ? 0.01 : 0.002));
}
