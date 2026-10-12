import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import {
  archiveCategory,
  createCategory,
  createTemplate,
  listCategories,
  listTemplates,
  reorderCategories,
  type ElementCategory,
  type ElementTemplate,
} from './api';

export type TemplatesCatalogProps = {
  canMutate: boolean;
};

export function TemplatesCatalog({ canMutate }: TemplatesCatalogProps) {
  const [categories, setCategories] = useState<ElementCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ElementTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const selected = categories.find((category) => category.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    void listCategories(api).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setCategories(result.categories);
        setSelectedId(result.categories[0]?.id ?? null);
      } else {
        setUnavailable(true);
        setErrorMessage(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    void listTemplates(api, selectedId).then((result) => {
      if (cancelled) {
        return;
      }
      setTemplatesLoading(false);
      if (result.ok) {
        setTemplates(result.templates);
      } else {
        setErrorMessage(result.error);
        setTemplates([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    setCreatingCategory(true);
    setErrorMessage(null);
    const result = await createCategory(api, { code: categoryCode, name: categoryName });
    setCreatingCategory(false);
    if (result.ok) {
      setCategories((current) => [...current, result.category]);
      setTemplates([]);
      setTemplatesLoading(true);
      setSelectedId(result.category.id);
      setCategoryCode('');
      setCategoryName('');
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleCreateTemplate(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) {
      return;
    }
    setCreatingTemplate(true);
    setErrorMessage(null);
    const result = await createTemplate(api, selectedId, {
      code: templateCode,
      name: templateName,
      description: templateDescription,
    });
    setCreatingTemplate(false);
    if (result.ok) {
      setTemplates((current) =>
        [...current, result.template].sort((a, b) => a.code.localeCompare(b.code)),
      );
      setTemplateCode('');
      setTemplateName('');
      setTemplateDescription('');
    } else {
      setErrorMessage(result.error);
    }
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    const index = categories.findIndex((category) => category.id === categoryId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= categories.length) {
      return;
    }
    const ordered = [...categories];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    setErrorMessage(null);
    const result = await reorderCategories(
      api,
      ordered.map((category) => category.id),
    );
    if (result.ok) {
      setCategories(result.categories);
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleArchiveCategory(categoryId: string) {
    setErrorMessage(null);
    const result = await archiveCategory(api, categoryId);
    if (result.ok) {
      setCategories((current) => {
        const next = current.filter((category) => category.id !== categoryId);
        setSelectedId((selected) => (selected === categoryId ? (next[0]?.id ?? null) : selected));
        return next;
      });
    } else {
      setErrorMessage(result.error);
    }
  }

  return (
    <section className="sites-panel" aria-label="Template catalog">
      <h2>Template catalog</h2>
      {errorMessage && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}
      {loading && <p>Loading catalog...</p>}
      {!loading && !unavailable && categories.length === 0 && <p>No categories yet.</p>}

      {canMutate && !unavailable && (
        <form className="sign-in-form" onSubmit={(event) => void handleCreateCategory(event)}>
          <div className="form-group">
            <label htmlFor="category-code">Category code</label>
            <input
              id="category-code"
              required
              value={categoryCode}
              onChange={(event) => setCategoryCode(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="category-name">Category name</label>
            <input
              id="category-name"
              required
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
          </div>
          <button type="submit" disabled={creatingCategory}>
            {creatingCategory ? 'Creating category...' : 'Create category'}
          </button>
        </form>
      )}

      <ul className="site-list">
        {categories.map((category, index) => (
          <li key={category.id} className="site-card">
            <h3>{category.code}</h3>
            <p>{category.name}</p>
            <div className="site-actions">
              <button
                type="button"
                onClick={() => {
                  if (category.id !== selectedId) {
                    setTemplates([]);
                    setTemplatesLoading(true);
                    setSelectedId(category.id);
                  }
                }}
              >
                {selectedId === category.id ? `Selected ${category.code}` : `Open ${category.code}`}
              </button>
              {canMutate && (
                <>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => void moveCategory(category.id, -1)}
                  >
                    Move {category.code} up
                  </button>
                  <button
                    type="button"
                    disabled={index === categories.length - 1}
                    onClick={() => void moveCategory(category.id, 1)}
                  >
                    Move {category.code} down
                  </button>
                  <button type="button" onClick={() => void handleArchiveCategory(category.id)}>
                    Archive {category.code}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {selected && (
        <section aria-label={`Templates for ${selected.code}`}>
          <h3>Templates · {selected.code}</h3>
          {templatesLoading && <p>Loading templates...</p>}
          {!templatesLoading && templates.length === 0 && <p>No templates in this category.</p>}
          {canMutate && (
            <form className="sign-in-form" onSubmit={(event) => void handleCreateTemplate(event)}>
              <div className="form-group">
                <label htmlFor="template-code">Template code</label>
                <input
                  id="template-code"
                  required
                  value={templateCode}
                  onChange={(event) => setTemplateCode(event.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="template-name">Template name</label>
                <input
                  id="template-name"
                  required
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="template-description">Description</label>
                <input
                  id="template-description"
                  value={templateDescription}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                />
              </div>
              <button type="submit" disabled={creatingTemplate}>
                {creatingTemplate ? 'Creating template...' : 'Create template'}
              </button>
            </form>
          )}
          <ul className="site-list">
            {templates.map((template) => (
              <li key={template.id} className="site-card">
                <h4>{template.code}</h4>
                <p>{template.name}</p>
                {template.description && <p>{template.description}</p>}
                <p>Not placeable — no published revision yet.</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
