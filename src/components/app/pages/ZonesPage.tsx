import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Lock, Map, Pencil, Plus, Trash2 } from 'lucide-react';
import { zoneInputSchema } from '../../../lib/validation/schemas';
import { Button } from '../../ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Alert, AlertDescription, Badge, Card, CardContent, Input, Label, NativeSelect, Switch, Textarea } from '../../ui/primitives';
import { api } from '../api-client';
import { CountryMultiSelect } from '../CountrySelect';
import { EmptyState, ErrorState, Field, LoadingState, PageHeader } from '../common';
import { useApp } from '../context';
import { distanceOptions, listFromText, number } from '../format';
import { numOrNull, serverFieldErrors, useAction, useResource, validate, type FieldErrors } from '../hooks';
import type { BillingResponse, DeliveryZone } from '../types';

interface ZoneForm {
  name: string;
  type: 'include' | 'exclude';
  active: boolean;
  countries: string[];
  subdivisions: string;
  postalPatterns: string;
  maxDistance: string;
}

const blank: ZoneForm = { name: '', type: 'include', active: true, countries: [], subdivisions: '', postalPatterns: '', maxDistance: '' };

const toForm = (z: DeliveryZone): ZoneForm => ({
  name: z.name,
  type: z.type,
  active: z.active,
  countries: z.countries,
  subdivisions: z.subdivisions.join(', '),
  postalPatterns: z.postalPatterns.join('\n'),
  maxDistance: z.maxDistance === null ? '' : String(z.maxDistance),
});

const toInput = (f: ZoneForm) => ({
  name: f.name,
  type: f.type,
  active: f.active,
  countries: f.countries,
  subdivisions: listFromText(f.subdivisions).map((c) => c.toUpperCase()),
  postalPatterns: listFromText(f.postalPatterns),
  maxDistance: f.type === 'include' ? numOrNull(f.maxDistance) : null,
});

/** Preset zone distance limits, in the merchant's unit. */
/** Maps array-item errors (e.g. postalPatterns.2) back to the field. */
const firstError = (errors: FieldErrors, field: string) => errors[field] ?? Object.entries(errors).find(([k]) => k.startsWith(`${field}.`))?.[1];

function ZoneEditor({ initial, id, onDone }: { initial: ZoneForm; id: string | null; onDone: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const { unit, locale } = useApp();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { busy, run } = useAction();
  const set = <K extends keyof ZoneForm>(k: K, v: ZoneForm[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validate(zoneInputSchema, toInput(f));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const saved = await run(() => api(id ? `zones/${id}` : 'zones', { method: id ? 'PUT' : 'POST', body: parsed.data }), {
      success: t('common.saved'),
      onError: (err) => setErrors(serverFieldErrors(err) ?? {}),
    });
    if (saved) onDone(true);
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-4">
        <Field id="z-name" label={t('zones.name')} error={errors.name}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field id="z-type" label={t('zones.type')}>
          <NativeSelect value={f.type} onChange={(e) => set('type', e.target.value as ZoneForm['type'])}>
            <option value="include">{t('zones.types.include')}</option>
            <option value="exclude">{t('zones.types.exclude')}</option>
          </NativeSelect>
        </Field>
      </div>
      <Field id="z-countries" label={t('zones.countries')} hint={t('zones.countriesHint')} optional error={firstError(errors, 'countries')}>
        <CountryMultiSelect value={f.countries} onChange={(codes) => set('countries', codes)} />
      </Field>
      <Field id="z-subs" label={t('zones.subdivisions')} hint={t('zones.subdivisionsHint')} optional error={firstError(errors, 'subdivisions')}>
        <Input value={f.subdivisions} onChange={(e) => set('subdivisions', e.target.value)} dir="ltr" />
      </Field>
      <Field id="z-postal" label={t('zones.postalPatterns')} hint={t('zones.postalPatternsHint')} optional error={firstError(errors, 'postalPatterns')}>
        <Textarea rows={4} value={f.postalPatterns} onChange={(e) => set('postalPatterns', e.target.value)} dir="ltr" />
      </Field>
      {f.type === 'include' && (
        <Field id="z-maxd" label={t('zones.maxDistance', { unit: t(`common.units.${unit}`) })} optional error={errors.maxDistance}>
          <NativeSelect value={f.maxDistance} onChange={(e) => set('maxDistance', e.target.value)}>
            <option value="">{t('zones.noDistanceLimit')}</option>
            {distanceOptions(f.maxDistance).map((d) => (
              <option key={d} value={String(d)}>
                {number(d, locale, 1)} {t(`common.units.${unit}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Label className="font-normal">
        <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} />
        {t('common.active')}
      </Label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={busy}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ZonesPage() {
  const { t } = useTranslation();
  const { unit, locale } = useApp();
  const { data, error, loading, reload } = useResource<{ zones: DeliveryZone[] }>('zones');
  const billing = useResource<BillingResponse>('billing');
  const [editing, setEditing] = useState<{ id: string | null; form: ZoneForm } | null>(null);
  const [deleting, setDeleting] = useState<DeliveryZone | null>(null);
  const del = useAction();
  const canEdit = billing.data?.entitlement.limits.zones ?? false;

  return (
    <>
      <PageHeader
        title={t('zones.title')}
        description={t('zones.subtitle')}
        actions={
          <Button disabled={!canEdit} onClick={() => setEditing({ id: null, form: blank })}>
            {canEdit ? <Plus /> : <Lock />} {t('zones.add')}
          </Button>
        }
      />
      {billing.data && !canEdit && (
        <Alert variant="info" className="mb-4">
          <Lock />
          <AlertDescription>{t('zones.proOnly')}</AlertDescription>
        </Alert>
      )}
      <Alert variant="default" className="mb-4">
        <Info />
        <AlertDescription>{t('zones.geoNote')}</AlertDescription>
      </Alert>
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState />}
      {data && data.zones.length === 0 && <EmptyState title={t('zones.empty')} description={t('zones.emptyDesc')} icon={<Map className="size-6" />} />}
      {data && data.zones.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.zones.map((z) => (
            <Card key={z.id} className="py-4">
              <CardContent className="flex items-start gap-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{z.name}</p>
                    <Badge variant={z.type === 'exclude' ? 'destructive' : 'success'}>{t(`zones.types.${z.type}`)}</Badge>
                    {!z.active && <Badge variant="outline">{t('common.inactive')}</Badge>}
                  </div>
                  <dl className="text-muted-foreground mt-2 grid gap-1 text-xs">
                    {z.countries.length > 0 && (
                      <div>
                        <dt className="inline font-medium">{t('zones.countries')}: </dt>
                        <dd className="inline">{z.countries.join(', ')}</dd>
                      </div>
                    )}
                    {z.subdivisions.length > 0 && (
                      <div>
                        <dt className="inline font-medium">{t('zones.subdivisions')}: </dt>
                        <dd className="inline">{z.subdivisions.join(', ')}</dd>
                      </div>
                    )}
                    {z.postalPatterns.length > 0 && (
                      <div>
                        <dt className="inline font-medium">{t('zones.postalPatterns')}: </dt>
                        <dd className="inline" dir="ltr">
                          {z.postalPatterns.slice(0, 8).join(', ')}
                          {z.postalPatterns.length > 8 ? '…' : ''}
                        </dd>
                      </div>
                    )}
                    {z.maxDistance !== null && (
                      <div>
                        <dt className="inline font-medium">{t('zones.maxDistance', { unit: t(`common.units.${unit}`) })}: </dt>
                        <dd className="inline">{number(z.maxDistance, locale)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" disabled={!canEdit} aria-label={`${t('common.edit')} ${z.name}`} onClick={() => setEditing({ id: z.id, form: toForm(z) })}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`${t('common.delete')} ${z.name}`} onClick={() => setDeleting(z)}>
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent closeLabel={t('common.close')} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t('zones.editTitle') : t('zones.addTitle')}</DialogTitle>
            <DialogDescription>{t('zones.subtitle')}</DialogDescription>
          </DialogHeader>
          {editing && (
            <ZoneEditor
              initial={editing.form}
              id={editing.id}
              onDone={(saved) => {
                setEditing(null);
                if (saved) void reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('common.confirmDeleteTitle', { name: deleting?.name ?? '' })}
        description={t('common.confirmDeleteBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        busy={del.busy}
        onConfirm={() =>
          void del.run(() => api(`zones/${deleting!.id}`, { method: 'DELETE' }), { success: t('common.deleted') }).then(() => {
            setDeleting(null);
            void reload();
          })
        }
      />
    </>
  );
}
