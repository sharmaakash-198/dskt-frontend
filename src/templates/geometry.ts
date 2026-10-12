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
