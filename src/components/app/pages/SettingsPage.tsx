import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { settingsInputSchema, type MerchantSettings, type SupportedLocale } from '../../../lib/validation/schemas';
import { Button } from '../../ui/button';
import { Alert, AlertDescription, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Label, NativeSelect, Switch } from '../../ui/primitives';
import { api } from '../api-client';
import { ErrorState, Field, LoadingState, PageHeader } from '../common';
import { useApp } from '../context';
import { distanceOptions, number } from '../format';
import { numOrNull, serverFieldErrors, useAction, useResource, validate, type FieldErrors } from '../hooks';
import type { BillingResponse, Overview } from '../types';

interface Form {
  unit: 'mi' | 'km';
  originStrategy: 'primary' | 'nearest';
  maxDeliveryDistance: string;
  failureMode: 'fail_closed' | 'fail_open';
  fallbackTitle: string;
  fallbackPrice: string;
  fallbackRiskAcknowledged: boolean;
  accessEndBehavior: 'no_rates' | 'fallback_rate';
  addressStrictness: 'strict' | 'standard';
  addressErrorBehavior: 'no_rate' | 'request_details';
  requirePostalCode: boolean;
  avoidTolls: boolean;
  avoidHighways: boolean;
  cacheTtlHours: string;
  logRetentionDays: string;
  failureAlerts: boolean;
  weeklySummary: boolean;
  pluginEnabled: boolean;
}

function toForm(s: MerchantSettings): Form {
  return {
    unit: s.unit,
    originStrategy: s.originStrategy,
    maxDeliveryDistance: s.maxDeliveryDistance === null ? '' : String(s.maxDeliveryDistance),
    failureMode: s.failureMode,
    fallbackTitle: s.fallbackRate?.title ?? '',
    fallbackPrice: s.fallbackRate?.price ?? '',
    fallbackRiskAcknowledged: s.fallbackRiskAcknowledged,
    accessEndBehavior: s.accessEndBehavior,
    addressStrictness: s.addressStrictness,
    addressErrorBehavior: s.addressErrorBehavior,
    requirePostalCode: s.requirePostalCode,
    avoidTolls: s.routing.avoidTolls,
    avoidHighways: s.routing.avoidHighways,
    cacheTtlHours: String(s.cacheTtlHours),
    logRetentionDays: String(s.logRetentionDays),
    failureAlerts: s.notifications.failureAlerts,
    weeklySummary: s.notifications.weeklySummary,
    pluginEnabled: s.pluginEnabled,
  };
}

function toInput(f: Form, language: SupportedLocale) {
  const hasFallback = f.fallbackTitle.trim() !== '' || f.fallbackPrice.trim() !== '';
  return {
    unit: f.unit,
    language,
    pluginEnabled: f.pluginEnabled,
    originStrategy: f.originStrategy,
    maxDeliveryDistance: numOrNull(f.maxDeliveryDistance),
    failureMode: f.failureMode,
    fallbackRate: hasFallback ? { title: f.fallbackTitle, price: f.fallbackPrice } : null,
    fallbackRiskAcknowledged: f.fallbackRiskAcknowledged,
    accessEndBehavior: f.accessEndBehavior,
    addressStrictness: f.addressStrictness,
    addressErrorBehavior: f.addressErrorBehavior,
    requirePostalCode: f.requirePostalCode,
    routing: { avoidTolls: f.avoidTolls, avoidHighways: f.avoidHighways },
    cacheTtlHours: numOrNull(f.cacheTtlHours) ?? 0,
    logRetentionDays: numOrNull(f.logRetentionDays) ?? 1,
    notifications: { failureAlerts: f.failureAlerts, weeklySummary: f.weeklySummary },
  };
}

function SettingsForm({ initial, maxRetention, routing }: { initial: MerchantSettings; maxRetention: number; routing: Overview['routing'] | null }) {
  const { t } = useTranslation();
  const { locale, refreshShell } = useApp();
  const [f, setF] = useState(() => toForm(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const { busy, run } = useAction();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const u = t(`common.units.${f.unit}`);
  // A leftover fallback is still validated when not required, so its fields must stay visible while they hold an error.
  const needsFallback =
    f.failureMode === 'fail_open' || f.accessEndBehavior === 'fallback_rate' || Object.keys(errors).some((k) => k.startsWith('fallbackRate'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validate(settingsInputSchema, toInput(f, locale));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      toast.error(t('common.fixErrors'));
      return;
    }
    setErrors({});
    const saved = await run(() => api<MerchantSettings>('settings', { method: 'PUT', body: parsed.data }), {
      success: t('common.saved'),
      onError: (err) => setErrors(serverFieldErrors(err) ?? {}),
    });
    if (saved) {
      setF(toForm(saved));
      refreshShell();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field id="st-unit" label={t('settings.unit')}>
            <NativeSelect value={f.unit} onChange={(e) => set('unit', e.target.value as Form['unit'])}>
              <option value="mi">{t('common.units.miles')}</option>
              <option value="km">{t('common.units.kilometers')}</option>
            </NativeSelect>
          </Field>
          <Field id="st-origin" label={t('settings.origin')} hint={t('settings.originHint')}>
            <NativeSelect value={f.originStrategy} onChange={(e) => set('originStrategy', e.target.value as Form['originStrategy'])}>
              <option value="primary">{t('settings.origins.primary')}</option>
              <option value="nearest">{t('settings.origins.nearest')}</option>
            </NativeSelect>
          </Field>
          <Field id="st-maxd" label={t('settings.maxDistance', { unit: u })} hint={t('settings.maxDistanceHint')} optional error={errors.maxDeliveryDistance}>
            <NativeSelect value={f.maxDeliveryDistance} onChange={(e) => set('maxDeliveryDistance', e.target.value)}>
              <option value="">{t('zones.noDistanceLimit')}</option>
              {distanceOptions(f.maxDeliveryDistance).map((d) => (
                <option key={d} value={String(d)}>
                  {number(d, locale, 1)} {u}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.failure')}</CardTitle>
          <CardDescription>{t('settings.failureHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="sr-only">{t('settings.failure')}</legend>
            {(['fail_closed', 'fail_open'] as const).map((mode) => (
              <label key={mode} className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
                <input type="radio" name="failureMode" value={mode} checked={f.failureMode === mode} onChange={() => set('failureMode', mode)} className="accent-primary size-4" />
                {t(`settings.failureModes.${mode}`)}
              </label>
            ))}
          </fieldset>
          <Field id="st-access" label={t('settings.accessEnd')} error={errors.accessEndBehavior}>
            <NativeSelect value={f.accessEndBehavior} onChange={(e) => set('accessEndBehavior', e.target.value as Form['accessEndBehavior'])}>
              <option value="no_rates">{t('settings.accessEnds.no_rates')}</option>
              <option value="fallback_rate">{t('settings.accessEnds.fallback_rate')}</option>
            </NativeSelect>
          </Field>
          {needsFallback && (
            <>
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{t('settings.fallbackRisk')}</AlertDescription>
              </Alert>
              <div className="grid gap-4">
                <Field id="st-fbt" label={t('settings.fallbackTitle')} error={errors['fallbackRate.title'] ?? errors.fallbackRate}>
                  <Input value={f.fallbackTitle} onChange={(e) => set('fallbackTitle', e.target.value)} />
                </Field>
                <Field id="st-fbp" label={t('settings.fallbackPrice')} error={errors['fallbackRate.price']}>
                  <Input inputMode="decimal" value={f.fallbackPrice} onChange={(e) => set('fallbackPrice', e.target.value)} />
                </Field>
              </div>
              {f.failureMode === 'fail_open' && (
                <div className="grid gap-1">
                  <Label className="font-normal">
                    <Checkbox
                      checked={f.fallbackRiskAcknowledged}
                      onCheckedChange={(v) => set('fallbackRiskAcknowledged', v === true)}
                      aria-invalid={errors.fallbackRiskAcknowledged ? true : undefined}
                    />
                    {t('settings.fallbackAck')}
                  </Label>
                  {errors.fallbackRiskAcknowledged && (
                    <p className="text-destructive text-xs" role="alert">
                      {t(errors.fallbackRiskAcknowledged)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.address')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field id="st-strict" label={t('settings.strictness')}>
            <NativeSelect value={f.addressStrictness} onChange={(e) => set('addressStrictness', e.target.value as Form['addressStrictness'])}>
              <option value="standard">{t('settings.strictnesses.standard')}</option>
              <option value="strict">{t('settings.strictnesses.strict')}</option>
            </NativeSelect>
          </Field>
          <Field id="st-adderr" label={t('settings.addressError')}>
            <NativeSelect value={f.addressErrorBehavior} onChange={(e) => set('addressErrorBehavior', e.target.value as Form['addressErrorBehavior'])}>
              <option value="no_rate">{t('settings.addressErrors.no_rate')}</option>
              <option value="request_details">{t('settings.addressErrors.request_details')}</option>
            </NativeSelect>
          </Field>
          <div className="grid gap-1">
            <Label className="font-normal">
              <Switch checked={f.requirePostalCode} onCheckedChange={(v) => set('requirePostalCode', v)} />
              {t('settings.requirePostal')}
            </Label>
            <p className="text-muted-foreground text-xs">{t('settings.requirePostalHint')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.routing')}</CardTitle>
          <CardDescription>{t('settings.providerManaged')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">{t('settings.provider')}</span>
            <span className="flex items-center gap-2">
              <span className="capitalize">{routing?.provider ?? '—'}</span>
              <Badge variant={routing?.configured ? 'success' : 'destructive'}>{routing?.configured ? t('settings.configured') : t('settings.notConfigured')}</Badge>
            </span>
          </div>
          <Field id="st-cache" label={t('settings.cache')} hint={t('settings.cacheHint')} error={errors.cacheTtlHours}>
            <Input inputMode="numeric" value={f.cacheTtlHours} onChange={(e) => set('cacheTtlHours', e.target.value)} />
          </Field>
          <Label className="font-normal">
            <Switch checked={f.avoidTolls} onCheckedChange={(v) => set('avoidTolls', v)} />
            {t('settings.avoidTolls')}
          </Label>
          <Label className="font-normal">
            <Switch checked={f.avoidHighways} onCheckedChange={(v) => set('avoidHighways', v)} />
            {t('settings.avoidHighways')}
          </Label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.privacy')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Alert variant="default">
            <ShieldCheck />
            <AlertDescription>{t('settings.privacyNote')}</AlertDescription>
          </Alert>
          <Field id="st-ret" label={t('settings.retention')} hint={t('settings.retentionHint', { max: maxRetention })} error={errors.logRetentionDays} className="sm:max-w-xs">
            <Input inputMode="numeric" value={f.logRetentionDays} onChange={(e) => set('logRetentionDays', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.notifications')}</CardTitle>
          <CardDescription>{t('settings.notificationsNote')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Label className="font-normal">
            <Switch checked={f.failureAlerts} onCheckedChange={(v) => set('failureAlerts', v)} />
            {t('settings.failureAlerts')}
          </Label>
          <Label className="font-normal">
            <Switch checked={f.weeklySummary} onCheckedChange={(v) => set('weeklySummary', v)} />
            {t('settings.weeklySummary')}
          </Label>
        </CardContent>
      </Card>

      <div className="bg-background/95 sticky bottom-0 flex justify-end border-t py-3 backdrop-blur">
        <Button type="submit" loading={busy}>
          {t('common.saveChanges')}
        </Button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useResource<MerchantSettings>('settings');
  const billing = useResource<BillingResponse>('billing');
  const overview = useResource<Overview>('overview');

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      {settings.error && <ErrorState error={settings.error} onRetry={() => void settings.reload()} />}
      {!settings.data && settings.loading && <LoadingState rows={5} />}
      {settings.data && (
        <SettingsForm
          key={settings.data.settingsVersion}
          initial={settings.data}
          maxRetention={billing.data?.entitlement.limits.maxLogRetentionDays ?? 90}
          routing={overview.data?.routing ?? null}
        />
      )}
    </>
  );
}
