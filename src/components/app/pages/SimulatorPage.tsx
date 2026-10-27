import { useEffect, useState } from 'react';
import { site } from '@wix/site-site';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calculator, Info } from 'lucide-react';
import { simulateInputSchema } from '../../../lib/validation/schemas';
import { Button } from '../../ui/button';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, NativeSelect, Separator } from '../../ui/primitives';
import { api } from '../api-client';
import { AddressAutocomplete, type AddressSuggestion } from '../AddressAutocomplete';
import { CountrySelect } from '../CountrySelect';
import { CitySelect, SubdivisionSelect } from '../LocationSelects';
import { Field, PageHeader } from '../common';
import { useApp } from '../context';
import { micros, money, number } from '../format';
import { numOrNull, useAction, useResource, validate, type FieldErrors } from '../hooks';
import type { FulfillmentLocation, SerializedOption, SerializedOutcome } from '../types';
import { metersToUnits } from '../../../lib/shipping/units';

interface SimForm {
  addressLine1: string;
  city: string;
  subdivision: string;
  postalCode: string;
  country: string;
  subtotal: string;
  subtotalBeforeDiscount: string;
  weight: string;
  weightUnit: 'KG' | 'LB';
  currency: string;
  locationId: string;
}

function Breakdown({ option, unit }: { option: SerializedOption; unit: 'mi' | 'km' }) {
  const { t } = useTranslation();
  const { locale } = useApp();
  const u = t(`common.units.${unit}`);
  const c = option.currency;
  return (
    <ul className="grid gap-1 text-sm">
      {option.breakdown.map((line, i) => {
        const amount = 'micros' in line ? micros(line.micros, c, locale) : null;
        let label: string;
        switch (line.kind) {
          case 'distance':
            label = t('simulator.breakdown.distance', { units: number(Number(line.chargeableUnits), locale, 3), unit: u, rate: line.ratePerUnit });
            break;
          case 'tier':
            label =
              t('simulator.breakdown.tier', { from: number(Number(line.fromUnits), locale, 2), to: number(Number(line.toUnits), locale, 2), rate: line.ratePerUnit, unit: u }) +
              (Number(line.flatFee) > 0 ? t('simulator.breakdown.tierFlat', { flat: line.flatFee }) : '');
            break;
          case 'included_distance':
            label = t('simulator.breakdown.included_distance', { units: number(Number(line.units), locale), unit: u });
            break;
          case 'surcharge':
            label = t('simulator.breakdown.surcharge', { kind: t(`simulator.surchargeKinds.${String(line.surcharge)}`) });
            break;
          case 'free_delivery':
            label = t('simulator.breakdown.free_delivery');
            break;
          default:
            label = t(`simulator.breakdown.${line.kind}`);
        }
        const value = line.kind === 'free_delivery' ? `−${micros(line.waivedMicros, c, locale)}` : amount;
        return (
          <li key={i} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            {value && <span className="tabular-nums">{value}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function OptionCard({ option, unit }: { option: SerializedOption; unit: 'mi' | 'km' }) {
  const { t } = useTranslation();
  const { locale } = useApp();
  const total = (BigInt(option.priceMinor) + BigInt(option.handlingMinor)).toString();
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{option.title}</p>
          <p className="text-muted-foreground font-mono text-xs" dir="ltr">
            {option.code}
          </p>
        </div>
        <div className="text-end">
          <p className="text-xl font-semibold tabular-nums">{money(total, option.currency, locale)}</p>
          {option.handlingMinor !== '0' && (
            <p className="text-muted-foreground text-xs">
              {t('simulator.shipping')} {money(option.priceMinor, option.currency, locale)} + {t('simulator.handling')} {money(option.handlingMinor, option.currency, locale)}
            </p>
          )}
        </div>
      </div>
      {option.breakdown.length > 0 && (
        <>
          <Separator className="my-3" />
          <Breakdown option={option} unit={unit} />
        </>
      )}
    </div>
  );
}

export function SimulatorPage() {
  const { t } = useTranslation();
  const { locale, unit } = useApp();
  const locations = useResource<{ locations: FulfillmentLocation[] }>('locations');
  const [f, setF] = useState<SimForm>({
    addressLine1: '',
    city: '',
    subdivision: '',
    postalCode: '',
    country: '',
    subtotal: '50',
    subtotalBeforeDiscount: '',
    weight: '',
    weightUnit: 'KG',
    currency: '',
    locationId: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ outcome: SerializedOutcome; latencyMs: number; trace?: Array<{ step: 'geocode' | 'matrix'; attempt: number; ms: number; error: string | null }> } | null>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    let active = true;
    async function loadCurrency() {
      try {
        const currency = await site.currency();
        if (active) setF((previous) => ({ ...previous, currency: previous.currency || currency }));
      } catch (error) {
        console.error('Failed to load site currency', error);
        if (active) setErrors((previous) => ({ ...previous, currency: t('errors.internal') }));
      }
    }
    void loadCurrency();
    return () => { active = false; };
  }, [t]);

  const set = <K extends keyof SimForm>(k: K, v: SimForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const fillAddress = (s: AddressSuggestion) =>
    setF((p) => ({ ...p, addressLine1: s.addressLine1 || p.addressLine1, city: s.city, subdivision: s.subdivision, postalCode: s.postalCode }));
  // Changing country clears the address: it belonged to the previous country.
  const changeCountry = (country: string) =>
    setF((p) => (p.country === country ? p : { ...p, country, addressLine1: '', city: '', subdivision: '', postalCode: '' }));
  // Picking another state from the list clears the city: it belonged to the previous state.
  const changeSubdivision = (subdivision: string, fromList: boolean) =>
    setF((p) => ({ ...p, subdivision, city: fromList && p.subdivision !== subdivision ? '' : p.city }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validate(simulateInputSchema, {
      destination: { addressLine1: f.addressLine1, addressLine2: '', city: f.city, subdivision: f.subdivision, postalCode: f.postalCode, country: f.country },
      subtotal: f.subtotal,
      subtotalBeforeDiscount: f.subtotalBeforeDiscount.trim() === '' ? null : f.subtotalBeforeDiscount,
      weight: numOrNull(f.weight),
      weightUnit: f.weightUnit,
      currency: f.currency,
      locationId: f.locationId || null,
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const res = await run(() => api<{ outcome: SerializedOutcome; latencyMs: number; trace?: Array<{ step: 'geocode' | 'matrix'; attempt: number; ms: number; error: string | null }> }>('simulate', { method: 'POST', body: parsed.data }));
    if (res) setResult(res);
  };

  const outcome = result?.outcome;
  const locName = (id: string | undefined) => locations.data?.locations.find((l) => l.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader title={t('simulator.title')} description={t('simulator.subtitle')} />
      <Alert variant="info" className="mb-6">
        <Info />
        <AlertDescription>{t('simulator.disclaimer')}</AlertDescription>
      </Alert>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <form onSubmit={submit} noValidate className="grid gap-4">
              <p className="font-medium">{t('simulator.destination')}</p>
              <Field id="s-country" label={t('address.country')} hint={t('address.countryHint')} error={errors['destination.country']}>
                <CountrySelect value={f.country} onChange={changeCountry} />
              </Field>
              <Field id="s-line1" label={t('address.line1')} hint={t('address.autocompleteHint')} error={errors['destination.addressLine1']}>
                <AddressAutocomplete value={f.addressLine1} onChange={(v) => set('addressLine1', v)} onSelect={fillAddress} country={f.country} />
              </Field>
              <div className="grid gap-4">
                <Field id="s-sub" label={t('address.subdivision')} optional error={errors['destination.subdivision']}>
                  <SubdivisionSelect country={f.country} value={f.subdivision} onChange={changeSubdivision} />
                </Field>
                <Field id="s-city" label={t('address.city')} error={errors['destination.city']}>
                  <CitySelect country={f.country} subdivision={f.subdivision} value={f.city} onChange={(v) => set('city', v)} />
                </Field>
                <Field id="s-postal" label={t('address.postalCode')} error={errors['destination.postalCode']}>
                  <Input value={f.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
                </Field>
              </div>
              <Separator />
              <p className="font-medium">{t('simulator.cart')}</p>
              <div className="grid gap-4">
                <Field id="s-subtotal" label={t('simulator.subtotal')} error={errors.subtotal}>
                  <Input inputMode="decimal" value={f.subtotal} onChange={(e) => set('subtotal', e.target.value)} />
                </Field>
                <Field id="s-before" label={t('simulator.subtotalBefore')} optional error={errors.subtotalBeforeDiscount}>
                  <Input inputMode="decimal" value={f.subtotalBeforeDiscount} onChange={(e) => set('subtotalBeforeDiscount', e.target.value)} />
                </Field>
                <Field id="s-weight" label={t('simulator.weight')} optional error={errors.weight}>
                  <Input inputMode="decimal" value={f.weight} onChange={(e) => set('weight', e.target.value)} />
                </Field>
                <Field id="s-wunit" label={t('simulator.weightUnit')}>
                  <NativeSelect value={f.weightUnit} onChange={(e) => set('weightUnit', e.target.value as SimForm['weightUnit'])}>
                    <option value="KG">kg</option>
                    <option value="LB">lb</option>
                  </NativeSelect>
                </Field>
                <Field id="s-currency" label={t('simulator.currency')} error={errors.currency}>
                  <Input value={f.currency} maxLength={3} onChange={(e) => set('currency', e.target.value.toUpperCase())} dir="ltr" />
                </Field>
                <Field id="s-origin" label={t('simulator.origin')}>
                  <NativeSelect value={f.locationId} onChange={(e) => set('locationId', e.target.value)}>
                    <option value="">{t('simulator.originAuto')}</option>
                    {(locations.data?.locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Button type="submit" loading={busy} className="w-fit">
                <Calculator /> {t('simulator.run')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>{t('simulator.resultTitle')}</CardTitle>
            {outcome && <CardDescription>{t(`simulator.outcome.${outcome.kind}`)}</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-4">
            {!outcome && <p className="text-muted-foreground text-sm">{t('simulator.noResult')}</p>}
            {outcome && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {'distanceMeters' in outcome && outcome.distanceMeters !== undefined && (
                  <div>
                    <dt className="text-muted-foreground text-xs">{t('simulator.distance')}</dt>
                    <dd className="font-medium">
                      {number(metersToUnits(outcome.distanceMeters, outcome.kind === 'rates' ? outcome.unit : unit), locale)}{' '}
                      {t(`common.units.${outcome.kind === 'rates' ? outcome.unit : unit}`)}
                    </dd>
                  </div>
                )}
                {'originLocationId' in outcome && outcome.originLocationId && (
                  <div>
                    <dt className="text-muted-foreground text-xs">{t('simulator.from')}</dt>
                    <dd className="font-medium">{locName(outcome.originLocationId)}</dd>
                  </div>
                )}
                {outcome.kind === 'rates' && (
                  <div>
                    <dt className="text-muted-foreground text-xs">{t('simulator.quality')}</dt>
                    <dd className="font-medium">{t(`simulator.qualities.${outcome.geocodeQuality}`)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground text-xs">{t('simulator.cache')}</dt>
                  <dd className="font-medium">
                    {outcome.cacheHit ? t('simulator.cacheHit') : t('simulator.cacheMiss')} · {t('simulator.providerCalls')}: {outcome.providerCalls}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('simulator.latency')}</dt>
                  <dd className="font-medium">{result?.latencyMs} ms</dd>
                </div>
              </dl>
            )}
            {result?.trace && result.trace.length > 0 && (
              <div className="text-xs">
                <p className="text-muted-foreground mb-1 font-medium">{t('simulator.trace')}</p>
                <ul className="grid gap-0.5 font-mono">
                  {result.trace.map((a, i) => (
                    <li key={i} className={a.error ? 'text-destructive' : 'text-muted-foreground'}>
                      {t(`simulator.traceSteps.${a.step}`)} #{a.attempt}: {a.ms} ms{a.error ? ` · ${a.error}` : ' · OK'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outcome?.kind === 'rates' && outcome.options.map((o) => <OptionCard key={o.code} option={o} unit={outcome.unit} />)}
            {outcome?.kind === 'fallback' && (
              <>
                <Alert variant="warning">
                  <AlertTriangle />
                  <AlertTitle>{t(`reasons.${outcome.reason}`)}</AlertTitle>
                </Alert>
                <OptionCard option={outcome.option} unit={unit} />
              </>
            )}
            {outcome?.kind === 'no_rate' && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>{t(`reasons.${outcome.reason}`, { defaultValue: outcome.reason })}</AlertTitle>
                {outcome.ruleDiagnostics && (
                  <AlertDescription>
                    {outcome.ruleDiagnostics.length === 0 ? (
                      <p>{t('simulator.noRules')}</p>
                    ) : (
                      <>
                        <p className="font-medium">{t('simulator.ruleWhy')}</p>
                        <ul className="list-disc ps-4">
                          {outcome.ruleDiagnostics.map((d) => (
                            <li key={d.ruleId}>
                              <span className="font-medium">{d.title}</span>: {t(`simulator.ruleReasons.${d.reason}`, { defaultValue: d.reason })}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </AlertDescription>
                )}
                {outcome.routingErrorKind && (
                  <AlertDescription>
                    <Badge variant="outline" className="font-mono">
                      {outcome.routingErrorKind}
                    </Badge>
                  </AlertDescription>
                )}
              </Alert>
            )}
            {outcome?.kind === 'address_error' && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>{t(`reasons.${outcome.error}`)}</AlertTitle>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
