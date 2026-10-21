export type Vertex = { x: number; y: number };

export type GeometryErrorCode =
  | 'invalid_vertex_coordinates'
  | 'invalid_vertex_count'
  | 'non_orthogonal_edge'
  | 'zero_length_edge'
  | 'duplicate_closing_vertex'
  | 'repeated_vertex'
  | 'self_intersecting'
  | 'not_anticlockwise'
  | 'degenerate_polygon';

export type GeometryDiagnostic = {
  code: GeometryErrorCode;
  message: string;
  vertexIndex?: number;
  edgeIndex?: number;
};

export function snapToEditingScale(value: number, scale: number): number {
  if (!Number.isInteger(scale) || scale < 1) {
    return Math.round(value);
  }
  return Math.round(value / scale) * scale;
}

export function polygonBounds(vertices: Vertex[]): {
  width: number;
  height: number;
} {
  if (vertices.length === 0) {
    return { width: 0, height: 0 };
  }
  let minX = vertices[0]!.x;
  let minY = vertices[0]!.y;
  let maxX = vertices[0]!.x;
  let maxY = vertices[0]!.y;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

export function accessibleGeometrySummary(vertices: Vertex[]): string {
  if (vertices.length === 0) {
    return 'No vertices yet. Closure is implicit between the last and first vertex.';
  }
  const bounds = polygonBounds(vertices);
  const edges = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    const axis = next.x === vertex.x ? 'vertical' : 'horizontal';
    const length = Math.abs(next.x - vertex.x) + Math.abs(next.y - vertex.y);
    return `${axis} ${length}`;
  });
  return (
    `${vertices.length} vertices; ${bounds.width} by ${bounds.height} world units (10 cm each); ` +
    `edges: ${edges.join(', ')}. Closure is implicit.`
  );
}

function signedDoubleArea(vertices: Vertex[]): number {
  let area = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area;
}

/** Advisory client-side checks — backend remains authoritative. */
export function diagnoseOrthogonalPolygon(raw: Vertex[]): GeometryDiagnostic[] {
  const diagnostics: GeometryDiagnostic[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const vertex = raw[index]!;
    if (!Number.isInteger(vertex.x) || !Number.isInteger(vertex.y)) {
      diagnostics.push({
        code: 'invalid_vertex_coordinates',
        message: 'Vertex coordinates must be integers.',
        vertexIndex: index,
      });
    }
  }
  if (diagnostics.length > 0) return diagnostics;

  if (raw.length >= 2) {
    const first = raw[0]!;
    const last = raw[raw.length - 1]!;
    if (first.x === last.x && first.y === last.y) {
      return [
        {
          code: 'duplicate_closing_vertex',
          message: 'Do not repeat the first vertex to close the polygon.',
          vertexIndex: raw.length - 1,
        },
      ];
    }
  }

  if (raw.length < 4 || raw.length > 100) {
    return [
      {
        code: 'invalid_vertex_count',
        message: 'Polygons must have between 4 and 100 vertices.',
      },
    ];
  }

  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index]!;
    const next = raw[(index + 1) % raw.length]!;
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    if (dx === 0 && dy === 0) {
      diagnostics.push({
        code: 'zero_length_edge',
        message: 'Edge length must be non-zero.',
        edgeIndex: index,
        vertexIndex: index,
      });
    } else if (dx !== 0 && dy !== 0) {
      diagnostics.push({
        code: 'non_orthogonal_edge',
        message: 'Edges must be horizontal or vertical.',
        edgeIndex: index,
        vertexIndex: index,
      });
    }
  }
  if (diagnostics.length > 0) return diagnostics;

  const area = signedDoubleArea(raw);
  if (area === 0) {
    return [{ code: 'degenerate_polygon', message: 'Polygon area must be non-zero.' }];
  }
  if (area < 0) {
    diagnostics.push({
      code: 'not_anticlockwise',
      message: 'Vertices must be ordered anticlockwise.',
    });
  }
  return diagnostics;
}

export const PERMITTED_ROTATION_DEGREES = [0, 90, 180, 270] as const;
export type PermittedRotationDegrees = (typeof PERMITTED_ROTATION_DEGREES)[number];

export function transformVertices(
  vertices: Vertex[],
  translation: Vertex,
  rotationDegrees: number = 0,
): Vertex[] {
  if (![0, 90, 180, 270].includes(rotationDegrees)) {
    throw new Error(`Invalid rotation degrees: ${rotationDegrees}. Must be 0, 90, 180, or 270.`);
  }

  return vertices.map((v) => {
    let rx = v.x;
    let ry = v.y;
    if (rotationDegrees === 90) {
      rx = -v.y;
      ry = v.x;
    } else if (rotationDegrees === 180) {
      rx = -v.x;
      ry = -v.y;
    } else if (rotationDegrees === 270) {
      rx = v.y;
      ry = -v.x;
    }
    return {
      x: translation.x + rx,
      y: translation.y + ry,
    };
  });
}

export function segmentsCrossProperly(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const aHorizontal = a1.y === a2.y;
  const bHorizontal = b1.y === b2.y;
  if (aHorizontal === bHorizontal) {
    return false;
  }
  const h1 = aHorizontal ? a1 : b1;
  const h2 = aHorizontal ? a2 : b2;
  const v1 = aHorizontal ? b1 : a1;
  const v2 = aHorizontal ? b2 : a2;
  const y = h1.y;
  const x = v1.x;
  const hMin = Math.min(h1.x, h2.x);
  const hMax = Math.max(h1.x, h2.x);
  const vMin = Math.min(v1.y, v2.y);
  const vMax = Math.max(v1.y, v2.y);
  return x > hMin && x < hMax && y > vMin && y < vMax;
}

export function isPointOnPolygonBoundary(point: { x: number; y: number }, polygon: Vertex[]): boolean {
  const count = polygon.length;
  for (let i = 0; i < count; i += 1) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % count]!;
    if (p1.y === p2.y) {
      if (Math.abs(point.y - p1.y) < 1e-9) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        if (point.x >= minX - 1e-9 && point.x <= maxX + 1e-9) {
          return true;
        }
      }
    } else if (p1.x === p2.x) {
      if (Math.abs(point.x - p1.x) < 1e-9) {
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (point.y >= minY - 1e-9 && point.y <= maxY + 1e-9) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isPointStrictlyInsidePolygon(point: { x: number; y: number }, polygon: Vertex[]): boolean {
  if (isPointOnPolygonBoundary(point, polygon)) {
    return false;
  }
  let inside = false;
  const count = polygon.length;
  for (let i = 0; i < count; i += 1) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % count]!;
    if (p1.x === p2.x) {
      const intersects = (p1.y <= point.y && point.y < p2.y) || (p2.y <= point.y && point.y < p1.y);
      if (intersects && p1.x > point.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

export function isPointInsideOrOnPolygon(point: { x: number; y: number }, polygon: Vertex[]): boolean {
  if (isPointOnPolygonBoundary(point, polygon)) {
    return true;
  }
  return isPointStrictlyInsidePolygon(point, polygon);
}

export function getPolygonInteriorPoint(polygon: Vertex[]): { x: number; y: number } {
  const count = polygon.length;
  for (let i = 0; i < count; i += 1) {
    const prev = polygon[(i + count - 1) % count]!;
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % count]!;

    const inDx = Math.sign(curr.x - prev.x);
    const inDy = Math.sign(curr.y - prev.y);
    const outDx = Math.sign(next.x - curr.x);
    const outDy = Math.sign(next.y - curr.y);
    const cross = inDx * outDy - inDy * outDx;
    if (cross > 0) {
      const testPoint = {
        x: curr.x - 0.5 * inDx + 0.5 * outDx,
        y: curr.y - 0.5 * inDy + 0.5 * outDy,
      };
      if (isPointStrictlyInsidePolygon(testPoint, polygon)) {
        return testPoint;
      }
    }
  }
  let sumX = 0;
  let sumY = 0;
  for (const v of polygon) {
    sumX += v.x;
    sumY += v.y;
  }
  return { x: sumX / count, y: sumY / count };
}

export function isPolygonInsideBoundary(polygon: Vertex[], boundary: Vertex[]): boolean {
  if (boundary.length < 4 || polygon.length < 4) {
    return false;
  }

  for (const v of polygon) {
    if (!isPointInsideOrOnPolygon(v, boundary)) {
      return false;
    }
  }

  const pCount = polygon.length;
  const bCount = boundary.length;
  for (let i = 0; i < pCount; i += 1) {
    const a1 = polygon[i]!;
    const a2 = polygon[(i + 1) % pCount]!;
    for (let j = 0; j < bCount; j += 1) {
      const b1 = boundary[j]!;
      const b2 = boundary[(j + 1) % bCount]!;
      if (segmentsCrossProperly(a1, a2, b1, b2)) {
        return false;
      }
    }
  }

  for (let i = 0; i < pCount; i += 1) {
    const a1 = polygon[i]!;
    const a2 = polygon[(i + 1) % pCount]!;
    const mid = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
    if (!isPointInsideOrOnPolygon(mid, boundary)) {
      return false;
    }
  }

  const interior = getPolygonInteriorPoint(polygon);
  return isPointStrictlyInsidePolygon(interior, boundary);
}

export function doPolygonsOverlap(polyA: Vertex[], polyB: Vertex[]): boolean {
  if (polyA.length < 4 || polyB.length < 4) {
    return false;
  }

  const aCount = polyA.length;
  const bCount = polyB.length;
  for (let i = 0; i < aCount; i += 1) {
    const a1 = polyA[i]!;
    const a2 = polyA[(i + 1) % aCount]!;
    for (let j = 0; j < bCount; j += 1) {
      const b1 = polyB[j]!;
      const b2 = polyB[(j + 1) % bCount]!;
      if (segmentsCrossProperly(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  for (const v of polyA) {
    if (isPointStrictlyInsidePolygon(v, polyB)) {
      return true;
    }
  }

  for (const v of polyB) {
    if (isPointStrictlyInsidePolygon(v, polyA)) {
      return true;
    }
  }

  const intA = getPolygonInteriorPoint(polyA);
  if (isPointStrictlyInsidePolygon(intA, polyB)) {
    return true;
  }
  const intB = getPolygonInteriorPoint(polyB);
  if (isPointStrictlyInsidePolygon(intB, polyA)) {
    return true;
  }

  return false;
}

export type SpatialClass = 'PHYSICAL' | 'ZONE' | 'OBSTACLE';

export function doSpatialClassesCollide(classA: SpatialClass, classB: SpatialClass): boolean {
  return classA !== 'ZONE' && classB !== 'ZONE';
}

export function checkSpatialCollision(
  element: { spatialClass: SpatialClass; vertices: Vertex[] },
  existing: { spatialClass: SpatialClass; vertices: Vertex[] }[],
): boolean {
  if (element.spatialClass === 'ZONE') return false;
  return existing.some(
    (other) =>
      doSpatialClassesCollide(element.spatialClass, other.spatialClass) &&
      doPolygonsOverlap(element.vertices, other.vertices),
  );
}
