import { describe, expect, it } from 'vitest';
import {
  accessibleGeometrySummary,
  diagnoseOrthogonalPolygon,
  doPolygonsOverlap,
  isPolygonInsideBoundary,
  snapToEditingScale,
  transformVertices,
} from './geometry';

describe('template geometry helpers', () => {
  it('snaps to editing scale independently of viewport zoom', () => {
    expect(snapToEditingScale(13, 4)).toBe(12);
    expect(snapToEditingScale(14, 4)).toBe(16);
  });

  it('transforms template-local vertices by quarter-turn rotation and translation', () => {
    const local = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];

    expect(transformVertices(local, { x: 100, y: 50 }, 0)).toEqual([
      { x: 100, y: 50 },
      { x: 104, y: 50 },
      { x: 104, y: 53 },
      { x: 100, y: 53 },
    ]);

    expect(transformVertices(local, { x: 100, y: 50 }, 90)).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 54 },
      { x: 97, y: 54 },
      { x: 97, y: 50 },
    ]);
  });

  it('checks polygon containment and overlap', () => {
    const boundary = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const inside = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ];
    const outside = [
      { x: 110, y: 10 },
      { x: 130, y: 10 },
      { x: 130, y: 30 },
      { x: 110, y: 30 },
    ];
    const touching = [
      { x: 30, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 30 },
      { x: 30, y: 30 },
    ];

    expect(isPolygonInsideBoundary(inside, boundary)).toBe(true);
    expect(isPolygonInsideBoundary(outside, boundary)).toBe(false);
    expect(doPolygonsOverlap(inside, touching)).toBe(false);
  });

  it('summarizes geometry for accessible feedback', () => {
    const summary = accessibleGeometrySummary([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
    expect(summary).toContain('4 vertices');
    expect(summary).toContain('10 by 5');
    expect(summary).toContain('Closure is implicit');
  });

  it('advises on clockwise and diagonal geometry without claiming server authority', () => {
    const clockwise = diagnoseOrthogonalPolygon([
      { x: 0, y: 0 },
      { x: 0, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 0 },
    ]);
    expect(clockwise.map((item) => item.code)).toContain('not_anticlockwise');

    const diagonal = diagnoseOrthogonalPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 8, y: 8 },
      { x: 0, y: 8 },
    ]);
    expect(diagonal[0]?.code).toBe('non_orthogonal_edge');
    expect(diagonal[0]?.edgeIndex).toBe(1);
  });
});
