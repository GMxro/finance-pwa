import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react';
import { api } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import { focusFirstInvalid, hasFieldErrors, type FieldErrors } from '@shared/form/validation';
import { Page, PageHeader, Section, Stack, Grid } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Button, IconButton } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { RadioGroup } from '@shared/ui/RadioGroup';
import { Modal } from '@shared/ui/Modal';
import { Notice } from '@shared/ui/Notice';
import { EmptyState } from '@shared/ui/EmptyState';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { ListRow } from '@shared/ui/ListRow';
import { CategoryIcon } from '@shared/ui/CategoryIcon';
import { CATEGORY_ICON_OPTIONS } from '@shared/ui/category-options';
import { Text } from '@shared/ui/Text';
import { slugify } from '@shared/format/slug';
import '../../app/styles/categories.css';

interface CategoryForm {
  kind: 'income' | 'expense';
  name: string;
  slug: string;
  iconKey: string;
  sortOrder: string;
}

const emptyForm = (kind: 'income' | 'expense' = 'expense'): CategoryForm => ({
  kind,
  name: '',
  slug: '',
  iconKey: kind === 'income' ? 'briefcase' : 'tag',
  sortOrder: '0'
});

export function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoryResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CategoryForm>(emptyForm());
  const [slugTouched, setSlugTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CategoryResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listCategories(true);
      if (response.error) throw response.error;
      setCategories(response.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cargar las categorías.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = categories.filter(c => !c.archivedAt);
  const archived = categories.filter(c => !!c.archivedAt);
  const expenses = active.filter(c => c.kind === 'expense');
  const incomes = active.filter(c => c.kind === 'income');

  const openCreate = (kind: 'income' | 'expense') => {
    setForm(emptyForm(kind));
    setSlugTouched(false);
    setFieldErrors({});
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (category: CategoryResponse) => {
    setForm({
      kind: category.kind,
      name: category.name,
      slug: category.slug,
      iconKey: category.iconKey,
      sortOrder: String(category.sortOrder)
    });
    setSlugTouched(true);
    setFieldErrors({});
    setFormError(null);
    setEditing(category);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setFieldErrors({});
    setFormError(null);
  };

  const handleSubmit = async () => {
    const nextErrors: FieldErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = 'Poné un nombre.';
    }
    const slug = form.slug || slugify(form.name);
    if (!editing) {
      if (!form.slug.trim()) {
        nextErrors.slug = 'Poné un identificador.';
      } else if (!/^[a-z0-9-]+$/.test(slug)) {
        nextErrors.slug = 'El identificador solo puede tener minúsculas, números y guiones.';
      }
    }
    if (hasFieldErrors(nextErrors)) {
      setFieldErrors(nextErrors);
      setFormError(null);
      focusFirstInvalid('category-form');
      return;
    }
    setFieldErrors({});

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const response = await api.updateCategory(editing.id, {
          name: form.name.trim(),
          iconKey: form.iconKey,
          sortOrder: Number(form.sortOrder) || 0
        });
        if (response.error) throw new Error(response.error.message);
      } else {
        const response = await api.createCategory({
          id: crypto.randomUUID(),
          kind: form.kind,
          name: form.name.trim(),
          slug,
          iconKey: form.iconKey,
          colorToken: form.kind === 'income' ? 'income-primary' : 'expense-other',
          sortOrder: Number(form.sortOrder) || 0
        });
        if (response.error) throw new Error(response.error.message);
      }
      closeModal();
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'No pudimos guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      const response = await api.updateCategory(archiveTarget.id, { archivedAt: Date.now() });
      if (response.error) throw new Error(response.error.message);
      setArchiveTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos archivar la categoría.');
      setArchiveTarget(null);
    }
  };

  const handleUnarchive = async (category: CategoryResponse) => {
    try {
      const response = await api.updateCategory(category.id, { archivedAt: null });
      if (response.error) throw new Error(response.error.message);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos desarchivar la categoría.');
    }
  };

  const renderRow = (category: CategoryResponse) => (
    <ListRow
      key={category.id}
      leading={<CategoryIcon iconKey={category.iconKey} />}
      title={category.name}
      subtitle={`${category.kind === 'income' ? 'Ingreso' : 'Gasto'} · ${category.slug}`}
      trailing={
        <>
          <IconButton label={`Editar ${category.name}`} size="sm" onClick={() => openEdit(category)}>
            <Pencil size={16} />
          </IconButton>
          {category.archivedAt ? (
            <IconButton label={`Desarchivar ${category.name}`} size="sm" onClick={() => void handleUnarchive(category)}>
              <RotateCcw size={16} />
            </IconButton>
          ) : (
            <IconButton label={`Archivar ${category.name}`} size="sm" tone="danger" onClick={() => setArchiveTarget(category)}>
              <Archive size={16} />
            </IconButton>
          )}
        </>
      }
    />
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Ajustes · Organización"
        title="Categorías"
        description="Agrupá tus movimientos para entender en qué se va la plata."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowArchived(v => !v)} aria-pressed={showArchived}>
              {showArchived ? 'Ocultar archivadas' : `Ver archivadas${archived.length ? ` (${archived.length})` : ''}`}
            </Button>
            <Button leftIcon={<Plus size={17} />} onClick={() => openCreate('expense')}>Nueva categoría</Button>
          </>
        }
      />

      {error && <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>{error}</Notice>}

      {loading && categories.length === 0 && <LoadingSpinner />}

      {!loading && active.length === 0 && archived.length === 0 && !error && (
        <EmptyState
          title="Sin categorías"
          message="Creá tu primera categoría para empezar a ordenar los movimientos."
          action={{ label: 'Crear categoría', onClick: () => openCreate('expense') }}
        />
      )}
      {!loading && active.length === 0 && archived.length > 0 && !error && (
        <EmptyState
          title="Todas las categorías están archivadas"
          message="Desarchivá alguna o creá una nueva para registrar movimientos."
          action={{ label: 'Ver archivadas', onClick: () => setShowArchived(true) }}
        />
      )}

      <Stack gap="xl">
        {expenses.length > 0 && (
          <Section title={`Gastos · ${expenses.length}`}>
            <Panel tone="paper" radius="panel" padding="none" className="categories-list">
              {expenses.map(renderRow)}
            </Panel>
          </Section>
        )}

        {incomes.length > 0 && (
          <Section title={`Ingresos · ${incomes.length}`}>
            <Panel tone="paper" radius="panel" padding="none" className="categories-list">
              {incomes.map(renderRow)}
            </Panel>
          </Section>
        )}

        {showArchived && archived.length > 0 && (
          <Section title={`Archivadas · ${archived.length}`}>
            <Panel tone="paper" radius="panel" padding="none" className="categories-list">
              {archived.map(renderRow)}
            </Panel>
          </Section>
        )}

        {showArchived && archived.length === 0 && (
          <Text variant="small" tone="stone">No hay categorías archivadas.</Text>
        )}
      </Stack>

      <Modal
        open={creating || editing !== null}
        onClose={closeModal}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="category-form" loading={saving}>{editing ? 'Guardar' : 'Crear'}</Button>
          </>
        }
      >
        <form id="category-form" noValidate onSubmit={e => { e.preventDefault(); void handleSubmit(); }}>
          <Stack gap="md">
            {formError && <Notice tone="strong">{formError}</Notice>}
            {!editing && (
              <RadioGroup
                label="Tipo"
                value={form.kind}
                onChange={v => {
                  const kind = v as 'income' | 'expense';
                  setForm(f => ({ ...f, kind, iconKey: kind === 'income' ? 'briefcase' : 'tag' }));
                }}
                options={[{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Ingreso' }]}
                inline
                required
              />
            )}
            <Input
              label="Nombre"
              value={form.name}
              onChange={v => {
                setForm(f => ({ ...f, name: v, slug: !slugTouched && !editing ? slugify(v) : f.slug }));
                setFieldErrors(errors => ({ ...errors, name: undefined, slug: undefined }));
              }}
              error={fieldErrors.name}
              placeholder="Ej.: Alimentación"
              maxLength={50}
              required
            />
            {!editing && (
              <Input
                label="Identificador"
                value={form.slug}
                onChange={v => {
                  setSlugTouched(true);
                  setForm(f => ({ ...f, slug: slugify(v) }));
                  setFieldErrors(errors => (errors.slug ? { ...errors, slug: undefined } : errors));
                }}
                error={fieldErrors.slug}
                placeholder="alimentacion"
                helperText="Se usa internamente. Minúsculas, números y guiones."
                maxLength={50}
              />
            )}
            <Grid columns={2} gap="md">
              <Select
                label="Ícono"
                value={form.iconKey}
                onChange={v => setForm(f => ({ ...f, iconKey: v }))}
                options={CATEGORY_ICON_OPTIONS}
              />
              <Input
                label="Orden"
                type="number"
                min="0"
                step="1"
                value={form.sortOrder}
                onChange={v => setForm(f => ({ ...f, sortOrder: v }))}
              />
            </Grid>
          </Stack>
        </form>
      </Modal>

      <Modal
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title="Archivar categoría"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void handleArchive()}>Archivar</Button>
          </>
        }
      >
        <p className="categories-confirm">
          {archiveTarget?.name} deja de aparecer al registrar movimientos. Si tiene movimientos, se conserva el historial.
        </p>
      </Modal>
    </Page>
  );
}
