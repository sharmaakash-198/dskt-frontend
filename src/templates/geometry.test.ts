import { describe, expect, it } from 'vitest';
import { accessibleGeometrySummary, snapToEditingScale } from './geometry';

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
});
