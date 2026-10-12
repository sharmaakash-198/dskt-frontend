import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type ElementCategory = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
};

export type ElementTemplate = {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  description: string;
  currentRevisionId: string | null;
  placeable: boolean;
  archivedAt: string | null;
};

export type SpatialClass = 'PHYSICAL' | 'ZONE' | 'OBSTACLE';

export type TemplateRevision = {
  id: string;
  templateId: string;
  revisionNumber: number;
  assignable: boolean;
  spatialClass: SpatialClass;
  borderColor: string;
  fillColor: string;
  vertices: { x: number; y: number }[];
  isCurrent: boolean;
};

const ERROR_COPY: Record<string, string> = {
  category_code_taken: 'That category code is already in use.',
  category_archived: 'This category is archived.',
  category_not_found: 'That category was not found.',
  invalid_category_code: 'Use a category code of letters, numbers, and hyphens.',
  invalid_category_name: 'Enter a category name.',
  invalid_category_order: 'Category order is invalid.',
  template_code_taken: 'That template code is already in use in this category.',
  template_not_found: 'That template was not found.',
  template_archived: 'This template is archived.',
  invalid_template_code: 'Use a template code of letters, numbers, and hyphens.',
  invalid_template_name: 'Enter a template name.',
  invalid_spatial_class: 'Choose a valid spatial class.',
  invalid_assignability: 'Only PHYSICAL revisions may be assignable.',
  invalid_color: 'Use a #RRGGBB color.',
  invalid_vertex_coordinates: 'Vertices must be integers.',
  invalid_vertex_count: 'Use 4 to 100 vertices.',
  non_orthogonal_edge: 'Edges must be horizontal or vertical.',
  zero_length_edge: 'Edges must have non-zero length.',
  duplicate_closing_vertex: 'Do not repeat the first vertex to close the polygon.',
  repeated_vertex: 'Vertices must be unique.',
  organization_missing: 'The organization is not ready for templates.',
  forbidden: 'You cannot change the template catalog.',
  unauthorized: 'Your session is no longer valid.',
};

export function templateErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
}

function isCategory(data: unknown): data is ElementCategory {
  return Boolean(data && typeof data === 'object' && 'code' in data && 'sortOrder' in data);
}

function isTemplate(data: unknown): data is ElementTemplate {
  return Boolean(
    data && typeof data === 'object' && 'code' in data && 'placeable' in data && 'categoryId' in data,
  );
}

function isRevision(data: unknown): data is TemplateRevision {
  return Boolean(
    data && typeof data === 'object' && 'revisionNumber' in data && 'vertices' in data,
  );
}

export async function listCategories(
  client: Client<paths>,
): Promise<{ ok: true; categories: ElementCategory[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/element-categories');
    if (response.ok && data && 'categories' in data) {
      return { ok: true, categories: data.categories };
    }
    return {
      ok: false,
      error: templateErrorMessage(data, 'Template catalog is unavailable.'),
    };
  } catch {
    return { ok: false, error: 'Template catalog is unavailable.' };
  }
}

export async function createCategory(
  client: Client<paths>,
  body: { code: string; name: string },
): Promise<{ ok: true; category: ElementCategory } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/element-categories', { body });
    if (response.ok && isCategory(data)) {
      return { ok: true, category: data };
    }
    return { ok: false, error: templateErrorMessage(data, 'Could not create that category.') };
  } catch {
    return { ok: false, error: 'Could not create that category.' };
  }
}

export async function reorderCategories(
  client: Client<paths>,
  categoryIds: string[],
): Promise<{ ok: true; categories: ElementCategory[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.PUT('/element-categories/order', {
      body: { categoryIds },
    });
    if (response.ok && data && 'categories' in data) {
      return { ok: true, categories: data.categories };
    }
    return { ok: false, error: templateErrorMessage(data, 'Could not reorder categories.') };
  } catch {
    return { ok: false, error: 'Could not reorder categories.' };
  }
}

export async function archiveCategory(
  client: Client<paths>,
  categoryId: string,
): Promise<{ ok: true; category: ElementCategory } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/element-categories/{categoryId}/archive', {
      params: { path: { categoryId } },
    });
    if (response.ok && isCategory(data)) {
      return { ok: true, category: data };
    }
    return { ok: false, error: templateErrorMessage(data, 'Could not archive that category.') };
  } catch {
    return { ok: false, error: 'Could not archive that category.' };
  }
}

export async function listTemplates(
  client: Client<paths>,
  categoryId: string,
): Promise<{ ok: true; templates: ElementTemplate[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/element-categories/{categoryId}/templates', {
      params: { path: { categoryId } },
    });
    if (response.ok && data && 'templates' in data) {
      return { ok: true, templates: data.templates };
    }
    return { ok: false, error: templateErrorMessage(data, 'Templates are unavailable.') };
  } catch {
    return { ok: false, error: 'Templates are unavailable.' };
  }
}

export async function createTemplate(
  client: Client<paths>,
  categoryId: string,
  body: { code: string; name: string; description?: string },
): Promise<{ ok: true; template: ElementTemplate } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/element-categories/{categoryId}/templates', {
      params: { path: { categoryId } },
      body,
    });
    if (response.ok && isTemplate(data)) {
      return { ok: true, template: data };
    }
    return { ok: false, error: templateErrorMessage(data, 'Could not create that template.') };
  } catch {
    return { ok: false, error: 'Could not create that template.' };
  }
}

export async function listRevisions(
  client: Client<paths>,
  templateId: string,
): Promise<{ ok: true; revisions: TemplateRevision[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/element-templates/{templateId}/revisions', {
      params: { path: { templateId } },
    });
    if (response.ok && data && 'revisions' in data) {
      return { ok: true, revisions: data.revisions };
    }
    return { ok: false, error: templateErrorMessage(data, 'Revisions are unavailable.') };
  } catch {
    return { ok: false, error: 'Revisions are unavailable.' };
  }
}

export async function createRevision(
  client: Client<paths>,
  templateId: string,
  body: {
    spatialClass: SpatialClass;
    assignable: boolean;
    borderColor: string;
    fillColor: string;
    vertices: { x: number; y: number }[];
  },
): Promise<{ ok: true; revision: TemplateRevision } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/element-templates/{templateId}/revisions', {
      params: { path: { templateId } },
      body,
    });
    if (response.ok && isRevision(data)) {
      return { ok: true, revision: data };
    }
    return { ok: false, error: templateErrorMessage(data, 'Could not create that revision.') };
  } catch {
    return { ok: false, error: 'Could not create that revision.' };
  }
}
