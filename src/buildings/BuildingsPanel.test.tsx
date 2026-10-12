import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingsPanel } from './BuildingsPanel';

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

function building(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    siteId: site.id,
    code: 'A',
    name: 'Building A',
    ...overrides,
  };
}

describe('BuildingsPanel', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('lists buildings and opens floors', async () => {
    get.mockResolvedValue({
      data: { buildings: [building(), building({ id: 'b2', code: 'B', name: 'Building B' })] },
      response: jsonResponse(200),
    });
    const onOpenBuilding = vi.fn();

    render(
      <BuildingsPanel
        site={site}
        canMutate
        onBack={() => undefined}
        onOpenBuilding={onOpenBuilding}
      />,
    );

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['A', 'B']);

    fireEvent.click(screen.getByRole('button', { name: 'Open floors for A' }));
    expect(onOpenBuilding).toHaveBeenCalledWith(expect.objectContaining({ code: 'A' }));
  });

  it('creates, edits, and archives a building', async () => {
    const created = building();
    get.mockResolvedValue({ data: { buildings: [] }, response: jsonResponse(200) });
    post.mockImplementation((path: string) => {
      if (String(path).includes('/archive')) {
        return Promise.resolve({ data: created, response: jsonResponse(200) });
      }
      return Promise.resolve({ data: created, response: jsonResponse(201) });
    });
    patch.mockResolvedValue({
      data: building({ name: 'Building A North' }),
      response: jsonResponse(200),
    });

    render(
      <BuildingsPanel
        site={site}
        canMutate
        onBack={() => undefined}
        onOpenBuilding={() => undefined}
      />,
    );
    expect(await screen.findByText('No active buildings.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Building code'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Building name'), { target: { value: 'Building A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create building' }));

    expect(await screen.findByRole('heading', { name: 'A' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit A' }));
    const card = screen.getByRole('listitem');
    fireEvent.change(within(card).getByLabelText('Building name'), {
      target: { value: 'Building A North' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Save A' }));
    expect(await within(card).findByText('Building A North')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive A' }));
    expect(await screen.findByText('No active buildings.')).toBeInTheDocument();
  });

  it('hides mutate controls for a read-only caller', async () => {
    get.mockResolvedValue({ data: { buildings: [building()] }, response: jsonResponse(200) });

    render(
      <BuildingsPanel
        site={site}
        canMutate={false}
        onBack={() => undefined}
        onOpenBuilding={() => undefined}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create building' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open floors for A' })).toBeInTheDocument();
  });

  it('explains that active floors block archival', async () => {
    get.mockResolvedValue({ data: { buildings: [building()] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { error: 'building_has_active_floors' },
      response: jsonResponse(409),
    });

    render(
      <BuildingsPanel
        site={site}
        canMutate
        onBack={() => undefined}
        onOpenBuilding={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Archive A' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Archive the floors in this building before archiving the building.',
    );
  });
});
