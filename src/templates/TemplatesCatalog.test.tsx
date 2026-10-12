import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesCatalog } from './TemplatesCatalog';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    PUT: (...args: unknown[]) => put(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'DESK',
    name: 'Desk',
    sortOrder: 0,
    archivedAt: null,
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    categoryId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'STD-DESK',
    name: 'Standard Desk',
    description: '1200mm',
    currentRevisionId: null,
    placeable: false as const,
    archivedAt: null,
    ...overrides,
  };
}

describe('TemplatesCatalog', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows empty catalog and creates a category then template', async () => {
    const createdCategory = category();
    const createdTemplate = template();
    get.mockImplementation((path: string) => {
      if (path === '/element-categories') {
        return Promise.resolve({ data: { categories: [] }, response: jsonResponse(200) });
      }
      if (String(path).includes('/templates')) {
        return Promise.resolve({ data: { templates: [] }, response: jsonResponse(200) });
      }
      return Promise.resolve({ data: {}, response: jsonResponse(404) });
    });
    post.mockImplementation((path: string) => {
      if (path === '/element-categories') {
        return Promise.resolve({ data: createdCategory, response: jsonResponse(201) });
      }
      return Promise.resolve({ data: createdTemplate, response: jsonResponse(201) });
    });

    render(<TemplatesCatalog canMutate />);
    expect(await screen.findByText('No categories yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category code'), { target: { value: 'desk' } });
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }));

    expect(await screen.findByRole('heading', { name: 'DESK' })).toBeInTheDocument();
    expect(await screen.findByText('No templates in this category.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Template code'), { target: { value: 'std-desk' } });
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Standard Desk' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '1200mm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    expect(await screen.findByRole('heading', { name: 'STD-DESK' })).toBeInTheDocument();
    expect(screen.getByText(/Not placeable/i)).toBeInTheDocument();
  });

  it('shows validation when category code is taken', async () => {
    get.mockResolvedValue({ data: { categories: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { error: 'category_code_taken' },
      response: jsonResponse(409),
    });

    render(<TemplatesCatalog canMutate />);
    expect(await screen.findByLabelText('Category code')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category code'), { target: { value: 'DESK' } });
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That category code is already in use.',
    );
  });

  it('hides mutate controls for read-only callers', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/element-categories') {
        return Promise.resolve({ data: { categories: [category()] }, response: jsonResponse(200) });
      }
      return Promise.resolve({ data: { templates: [template()] }, response: jsonResponse(200) });
    });

    render(<TemplatesCatalog canMutate={false} />);
    expect(await screen.findByRole('heading', { name: 'DESK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create template' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'STD-DESK' })).toBeInTheDocument();
  });

  it('shows unavailable state when catalog cannot load', async () => {
    get.mockRejectedValue(new Error('network'));

    render(<TemplatesCatalog canMutate />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Template catalog is unavailable.');
    expect(screen.queryByText('No categories yet.')).not.toBeInTheDocument();
  });
});
