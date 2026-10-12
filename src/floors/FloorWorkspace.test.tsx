import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloorWorkspace } from './FloorWorkspace';

const site = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  code: 'NOIDA',
  name: 'Noida HQ',
  timeZone: 'Asia/Kolkata',
  address: {
    addressLine1: null,
    addressLine2: null,
    city: 'Noida',
    region: null,
    postalCode: null,
    country: null,
  },
};

const building = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  siteId: site.id,
  code: 'A',
  name: 'Building A',
};

const floor = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  buildingId: building.id,
  code: 'L1',
  name: 'Level 1',
};

describe('FloorWorkspace', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the empty floor workspace and returns to floors', () => {
    const onBack = vi.fn();
    render(<FloorWorkspace site={site} building={building} floor={floor} onBack={onBack} />);

    expect(screen.getByRole('heading', { name: 'NOIDA / A / L1' })).toBeInTheDocument();
    expect(screen.getByText(/currently empty/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to floors' }));
    expect(onBack).toHaveBeenCalled();
  });
});
