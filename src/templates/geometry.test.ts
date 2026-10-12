import { describe, expect, it } from 'vitest';
import {
  accessibleGeometrySummary,
  diagnoseOrthogonalPolygon,
  snapToEditingScale,
} from './geometry';

describe('template geometry helpers', () => {
  it('snaps to editing scale independently of viewport zoom', () => {
    expect(snapToEditingScale(13, 4)).toBe(12);
    expect(snapToEditingScale(14, 4)).toBe(16);
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
