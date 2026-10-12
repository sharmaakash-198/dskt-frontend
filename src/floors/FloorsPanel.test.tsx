import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorsPanel } from './FloorsPanel';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    PATCH: (...args: unknown[]) => patch(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

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

function floor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    buildingId: building.id,
    code: 'L1',
    name: 'Level 1',
    ...overrides,
  };
}

describe('FloorsPanel', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a floor and opens the empty floor workspace', async () => {
    const created = floor();
    get.mockResolvedValue({ data: { floors: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({ data: created, response: jsonResponse(201) });
    const onOpenFloor = vi.fn();

    render(
      <FloorsPanel
        site={site}
        building={building}
        canMutate
        onBack={() => undefined}
        onOpenFloor={onOpenFloor}
      />,
    );
    expect(await screen.findByText('No active floors.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Floor code'), { target: { value: 'l1' } });
    fireEvent.change(screen.getByLabelText('Floor name'), { target: { value: 'Level 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create floor' }));

    expect(await screen.findByRole('heading', { name: 'L1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open floor L1' }));
    expect(onOpenFloor).toHaveBeenCalledWith(expect.objectContaining({ code: 'L1' }));
  });

  it('edits and archives a floor', async () => {
    const existing = floor();
    get.mockResolvedValue({ data: { floors: [existing] }, response: jsonResponse(200) });
    patch.mockResolvedValue({
      data: floor({ name: 'Ground' }),
      response: jsonResponse(200),
    });
    post.mockResolvedValue({ data: existing, response: jsonResponse(200) });

    render(
      <FloorsPanel
        site={site}
        building={building}
        canMutate
        onBack={() => undefined}
        onOpenFloor={() => undefined}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit L1' }));
    const card = screen.getByRole('listitem');
    fireEvent.change(within(card).getByLabelText('Floor name'), { target: { value: 'Ground' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save L1' }));
    expect(await within(card).findByText('Ground')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive L1' }));
    expect(await screen.findByText('No active floors.')).toBeInTheDocument();
  });

  it('hides mutate controls for a read-only caller', async () => {
    get.mockResolvedValue({ data: { floors: [floor()] }, response: jsonResponse(200) });

    render(
      <FloorsPanel
        site={site}
        building={building}
        canMutate={false}
        onBack={() => undefined}
        onOpenFloor={() => undefined}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'L1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create floor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open floor L1' })).toBeInTheDocument();
  });
});
