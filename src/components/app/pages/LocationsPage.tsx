import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Info, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { locationInputSchema } from '../../../lib/validation/schemas';
import { Button } from '../../ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Alert, AlertDescription, Badge, Card, CardContent, Input, Label, Switch } from '../../ui/primitives';
import { api } from '../api-client';
import { AddressAutocomplete, type AddressSuggestion } from '../AddressAutocomplete';
import { CountrySelect } from '../CountrySelect';
import { CitySelect, SubdivisionSelect } from '../LocationSelects';
import { EmptyState, ErrorState, Field, LoadingState, PageHeader } from '../common';
import { useApp } from '../context';
import { listFromText, number } from '../format';
import { numOrNull, serverFieldErrors, useAction, useResource, validate, type FieldErrors } from '../hooks';
import type { FulfillmentLocation } from '../types';

interface FormState {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  subdivision: string;
  postalCode: string;
  country: string;
  isPrimary: boolean;
  active: boolean;
  serviceRadius: string;
  serviceCountries: string;
}

const empty: FormState = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  subdivision: '',
  postalCode: '',
  country: '',
  isPrimary: false,
  active: true,
  serviceRadius: '',
  serviceCountries: '',
};

function toForm(l: FulfillmentLocation): FormState {
  return {
    name: l.name,
    ...l.address,
    isPrimary: l.isPrimary,
    active: l.active,
    serviceRadius: l.serviceRadius === null ? '' : String(l.serviceRadius),
    serviceCountries: l.serviceCountries.join(', '),
  };
}

function toInput(f: FormState) {
  return {
    name: f.name,
    address: { addressLine1: f.addressLine1, addressLine2: f.addressLine2, city: f.city, subdivision: f.subdivision, postalCode: f.postalCode, country: f.country },
    isPrimary: f.isPrimary,
    active: f.active,
    serviceRadius: numOrNull(f.serviceRadius),
    serviceCountries: listFromText(f.serviceCountries).map((c) => c.toUpperCase()),
  };
}

function LocationForm({ initial, id, onDone }: { initial: FormState; id: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const { unit } = useApp();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { busy, run } = useAction();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fillAddress = (s: AddressSuggestion) =>
    setForm((f) => ({ ...f, addressLine1: s.addressLine1 || f.addressLine1, city: s.city, subdivision: s.subdivision, postalCode: s.postalCode }));
  // Changing country clears the address: it belonged to the previous country.
  const changeCountry = (country: string) =>
    setForm((f) => (f.country === country ? f : { ...f, country, addressLine1: '', addressLine2: '', city: '', subdivision: '', postalCode: '' }));
  // Picking another state from the list clears the city: it belonged to the previous state.
  const changeSubdivision = (subdivision: string, fromList: boolean) =>
    setForm((f) => ({ ...f, subdivision, city: fromList && f.subdivision !== subdivision ? '' : f.city }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validate(locationInputSchema, toInput(form));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const result = await run(
      () => api<{ warning: string | null }>(id ? `locations/${id}` : 'locations', { method: id ? 'PUT' : 'POST', body: parsed.data }),
      { onError: (err) => setErrors(serverFieldErrors(err) ?? {}) },
    );
    if (!result) return;
    if (result.warning) toast.warning(t(`locations.warnings.${result.warning}`));
    else toast.success(t('common.saved'));
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field id="loc-name" label={t('locations.name')} error={errors.name}>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
      </Field>
      <Field id="loc-country" label={t('address.country')} hint={t('address.countryHint')} error={errors['address.country']}>
        <CountrySelect value={form.country} onChange={changeCountry} />
      </Field>
      <Field id="loc-line1" label={t('address.line1')} hint={t('address.autocompleteHint')} error={errors['address.addressLine1']}>
        <AddressAutocomplete value={form.addressLine1} onChange={(v) => set('addressLine1', v)} onSelect={fillAddress} country={form.country} />
      </Field>
      <Field id="loc-line2" label={t('address.line2')} optional error={errors['address.addressLine2']}>
        <Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} autoComplete="address-line2" />
      </Field>
      <div className="grid gap-4">
        <Field id="loc-sub" label={t('address.subdivision')} optional error={errors['address.subdivision']}>
          <SubdivisionSelect country={form.country} value={form.subdivision} onChange={changeSubdivision} />
        </Field>
        <Field id="loc-city" label={t('address.city')} error={errors['address.city']}>
          <CitySelect country={form.country} subdivision={form.subdivision} value={form.city} onChange={(v) => set('city', v)} />
        </Field>
        <Field id="loc-postal" label={t('address.postalCode')} error={errors['address.postalCode']}>
          <Input value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} autoComplete="postal-code" />
        </Field>
      </div>
      <div className="grid gap-4">
        <Field id="loc-radius" label={`${t('locations.serviceRadius')} (${t(`common.units.${unit}`)})`} hint={t('locations.serviceRadiusHint')} optional error={errors.serviceRadius}>
          <Input inputMode="decimal" value={form.serviceRadius} onChange={(e) => set('serviceRadius', e.target.value)} />
        </Field>
        <Field id="loc-countries" label={t('locations.serviceCountries')} hint={t('locations.serviceCountriesHint')} optional error={errors.serviceCountries}>
          <Input value={form.serviceCountries} onChange={(e) => set('serviceCountries', e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4">
        <Label className="font-normal">
          <Switch checked={form.isPrimary} onCheckedChange={(v) => set('isPrimary', v)} />
          {t('locations.isPrimary')}
        </Label>
        <Label className="font-normal">
          <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
          {t('locations.active')}
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={busy}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LocationsPage() {
  const { t } = useTranslation();
  const { unit, locale, refreshShell } = useApp();
  const { data, error, loading, reload } = useResource<{ locations: FulfillmentLocation[] }>('locations');
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [deleting, setDeleting] = useState<FulfillmentLocation | null>(null);
  const del = useAction();

  const close = () => {
    setEditing(null);
    void reload();
    refreshShell();
  };

  return (
    <>
      <PageHeader
        title={t('locations.title')}
        description={t('locations.subtitle')}
        actions={
          <Button onClick={() => setEditing({ id: null, form: empty })}>
            <Plus /> {t('locations.add')}
          </Button>
        }
      />
      <Alert variant="info" className="mb-4">
        <Info />
        <AlertDescription>{t('locations.originNote')}</AlertDescription>
      </Alert>
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState />}
      {data && data.locations.length === 0 && (
        <EmptyState
          title={t('locations.empty')}
          description={t('locations.emptyDesc')}
          icon={<MapPin className="size-6" />}
          action={
            <Button onClick={() => setEditing({ id: null, form: empty })}>
              <Plus /> {t('locations.add')}
            </Button>
          }
        />
      )}
      {data && data.locations.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.locations.map((l) => (
            <Card key={l.id} className="py-4">
              <CardContent className="flex items-start gap-3 px-4">
                <MapPin className="text-muted-foreground mt-1 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{l.name}</p>
                    {l.isPrimary && <Badge>{t('common.primary')}</Badge>}
                    <Badge variant={l.active ? 'secondary' : 'outline'}>{l.active ? t('common.active') : t('common.inactive')}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {l.formattedAddress || [l.address.addressLine1, l.address.city, l.address.postalCode, l.address.country].filter(Boolean).join(', ')}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs">
                    {l.validatedAt ? (
                      <>
                        <CheckCircle2 className="text-success size-3.5" aria-hidden="true" /> {t('locations.validated')}
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="text-warning size-3.5" aria-hidden="true" />
                        {l.geocodeQuality === 'low' ? t('locations.lowConfidence') : t('locations.notValidated')}
                      </>
                    )}
                    {l.serviceRadius !== null && (
                      <span className="text-muted-foreground ms-2">
                        · {t('locations.serviceRadius')}: {number(l.serviceRadius, locale)} {t(`common.units.${unit}`)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label={`${t('common.edit')} ${l.name}`} onClick={() => setEditing({ id: l.id, form: toForm(l) })}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`${t('common.delete')} ${l.name}`} onClick={() => setDeleting(l)}>
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent closeLabel={t('common.close')} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t('locations.editTitle') : t('locations.addTitle')}</DialogTitle>
            <DialogDescription>{t('locations.subtitle')}</DialogDescription>
          </DialogHeader>
          {editing && <LocationForm initial={editing.form} id={editing.id} onDone={close} />}
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
          void del
            .run(() => api(`locations/${deleting!.id}`, { method: 'DELETE' }), { success: t('common.deleted') })
            .then(() => {
              setDeleting(null);
              void reload();
            })
        }
      />
    </>
  );
}
