import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SitesPanel } from './SitesPanel';

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

function site(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('SitesPanel', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows active sites in the order returned by the API', async () => {
    get.mockResolvedValue({
      data: {
        sites: [
          site({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', code: 'AUSTIN', name: 'Austin' }),
          site(),
        ],
      },
      response: jsonResponse(200),
    });

    render(<SitesPanel canMutate />);

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['AUSTIN', 'NOIDA']);
  });

  it('shows an empty location view when there are no active sites', async () => {
    get.mockResolvedValue({ data: { sites: [] }, response: jsonResponse(200) });

    render(<SitesPanel canMutate />);

    expect(await screen.findByText('No active sites.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create site' })).toBeInTheDocument();
  });

  it('shows a validation message for an invalid time zone', async () => {
    get.mockResolvedValue({ data: { sites: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { error: 'invalid_time_zone' },
      response: jsonResponse(400),
    });

    render(<SitesPanel canMutate />);
    expect(await screen.findByText('No active sites.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Site code'), { target: { value: 'NOIDA' } });
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'Noida HQ' } });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Not/AZone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create site' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid IANA time zone.');
  });

  it('shows an actionable conflict when the site code is taken', async () => {
    get.mockResolvedValue({ data: { sites: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { error: 'site_code_taken' },
      response: jsonResponse(409),
    });

    render(<SitesPanel canMutate />);
    expect(await screen.findByLabelText('Site code')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Site code'), { target: { value: 'NOIDA' } });
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'Noida HQ' } });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create site' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That site code is already in use.');
  });

  it('shows an unavailable state when sites cannot be loaded', async () => {
    get.mockRejectedValue(new Error('network'));

    render(<SitesPanel canMutate />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sites are unavailable.');
    expect(screen.queryByText('No active sites.')).not.toBeInTheDocument();
  });

  it('creates, edits, and archives a site', async () => {
    const created = site();
    get.mockResolvedValue({ data: { sites: [] }, response: jsonResponse(200) });
    post.mockImplementation((path: string) => {
      if (String(path).endsWith('/archive')) {
        return Promise.resolve({ data: created, response: jsonResponse(200) });
      }
      return Promise.resolve({ data: created, response: jsonResponse(201) });
    });
    patch.mockResolvedValue({
      data: site({ name: 'Noida Campus' }),
      response: jsonResponse(200),
    });

    render(<SitesPanel canMutate />);
    expect(await screen.findByText('No active sites.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Site code'), { target: { value: 'noida' } });
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'Noida HQ' } });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Noida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create site' }));

    expect(await screen.findByRole('heading', { name: 'NOIDA' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit NOIDA' }));
    const card = screen.getByRole('listitem');
    fireEvent.change(within(card).getByLabelText('Site name'), { target: { value: 'Noida Campus' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save NOIDA' }));
    expect(await within(card).findByText('Noida Campus')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive NOIDA' }));
    expect(await screen.findByText('No active sites.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'NOIDA' })).not.toBeInTheDocument();
  });

  it('hides mutate controls for a read-only caller', async () => {
    get.mockResolvedValue({ data: { sites: [site()] }, response: jsonResponse(200) });

    render(<SitesPanel canMutate={false} />);

    expect(await screen.findByRole('heading', { name: 'NOIDA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit NOIDA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive NOIDA' })).not.toBeInTheDocument();
  });

  it('explains that active buildings block archival', async () => {
    get.mockResolvedValue({ data: { sites: [site()] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { error: 'site_has_active_buildings' },
      response: jsonResponse(409),
    });

    render(<SitesPanel canMutate />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive NOIDA' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Archive the buildings on this site before archiving the site.',
    );
    expect(screen.getByRole('heading', { name: 'NOIDA' })).toBeInTheDocument();
  });

  it('navigates site to building to floor workspace', async () => {
    const building = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      siteId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      code: 'A',
      name: 'Building A',
    };
    const floor = {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      buildingId: building.id,
      code: 'L1',
      name: 'Level 1',
    };
    get.mockImplementation((path: string) => {
      if (path === '/sites') {
        return Promise.resolve({ data: { sites: [site()] }, response: jsonResponse(200) });
      }
      if (String(path).includes('/floor-plan')) {
        return Promise.resolve({ data: { revisions: [], floorPlan: null, activeRevision: null, publishedRevision: null }, response: jsonResponse(200) });
      }
      if (String(path).includes('/floors')) {
        return Promise.resolve({ data: { floors: [floor] }, response: jsonResponse(200) });
      }
      if (String(path).includes('/buildings')) {
        return Promise.resolve({ data: { buildings: [building] }, response: jsonResponse(200) });
      }
      return Promise.resolve({ data: {}, response: jsonResponse(404) });
    });

    render(<SitesPanel canMutate={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open buildings for NOIDA' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open floors for A' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open floor L1' }));

    expect(await screen.findByRole('heading', { name: 'NOIDA / A / L1' })).toBeInTheDocument();
    expect(screen.getByText(/currently empty/i)).toBeInTheDocument();
  });
});
