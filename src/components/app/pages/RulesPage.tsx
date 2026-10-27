import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDown, ArrowUp, Copy, ListOrdered, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { pricingRuleInputSchema, type PricingRuleInput } from '../../../lib/validation/schemas';
import { Button } from '../../ui/button';
import { ConfirmDialog, Dialog, DialogDescription, DialogTitle, SheetContent } from '../../ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  NativeSelect,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../ui/primitives';
import { api } from '../api-client';
import { EmptyState, ErrorState, Field, LoadingState, PageHeader } from '../common';
import { useApp } from '../context';
import { decimal } from '../format';
import { numOrNull, serverFieldErrors, useAction, useResource, validate, type FieldErrors } from '../hooks';
import type { DeliveryZone, FulfillmentLocation, PlanLimits, PricingRule, RulesResponse } from '../types';

type Surcharge = { kind: 'weight_over'; thresholdKg: string; amount: string } | { kind: 'order_value_over'; threshold: string; amount: string };

interface RuleForm {
  title: string;
  code: string;
  active: boolean;
  isDemo: boolean;
  priority: number;
  mode: PricingRuleInput['mode'];
  baseFee: string;
  ratePerUnit: string;
  includedDistance: string;
  tiers: Array<{ upTo: string; ratePerUnit: string; flatFee: string }>;
  minFee: string;
  maxFee: string;
  maxDistance: string;
  increment: '0.01' | '0.1' | '0.5' | '1';
  roundingMode: 'up' | 'nearest';
  freeEnabled: boolean;
  freeThreshold: string;
  freeBasis: 'after_discount' | 'before_discount';
  waiveHandling: boolean;
  handlingFee: string;
  surcharges: Surcharge[];
  minSubtotal: string;
  maxSubtotal: string;
  maxWeightKg: string;
  zoneIds: string[];
  locationIds: string[];
}

const blank = (priority: number): RuleForm => ({
  title: '',
  code: 'local-delivery',
  active: false,
  isDemo: false,
  priority,
  mode: 'per_unit',
  baseFee: '0',
  ratePerUnit: '0',
  includedDistance: '0',
  tiers: [{ upTo: '', ratePerUnit: '0', flatFee: '0' }],
  minFee: '',
  maxFee: '',
  maxDistance: '',
  increment: '0.1',
  roundingMode: 'up',
  freeEnabled: false,
  freeThreshold: '0',
  freeBasis: 'after_discount',
  waiveHandling: true,
  handlingFee: '',
  surcharges: [],
  minSubtotal: '',
  maxSubtotal: '',
  maxWeightKg: '',
  zoneIds: [],
  locationIds: [],
});

function toForm(r: PricingRule): RuleForm {
  return {
    title: r.title,
    code: r.code,
    active: r.active,
    isDemo: r.isDemo,
    priority: r.priority,
    mode: r.mode,
    baseFee: r.baseFee,
    ratePerUnit: r.ratePerUnit,
    includedDistance: String(r.includedDistance),
    tiers: r.tiers.length ? r.tiers.map((x) => ({ upTo: x.upTo === null ? '' : String(x.upTo), ratePerUnit: x.ratePerUnit, flatFee: x.flatFee })) : [{ upTo: '', ratePerUnit: '0', flatFee: '0' }],
    minFee: r.minFee ?? '',
    maxFee: r.maxFee ?? '',
    maxDistance: r.maxDistance === null ? '' : String(r.maxDistance),
    increment: String(r.distanceRounding.increment) as RuleForm['increment'],
    roundingMode: r.distanceRounding.mode,
    freeEnabled: r.freeDelivery.enabled,
    freeThreshold: r.freeDelivery.threshold,
    freeBasis: r.freeDelivery.basis,
    waiveHandling: r.freeDelivery.waiveHandling,
    handlingFee: r.handlingFee ?? '',
    surcharges: r.surcharges.map((s) =>
      s.kind === 'weight_over' ? { kind: s.kind, thresholdKg: String(s.thresholdKg), amount: s.amount } : { kind: s.kind, threshold: s.threshold, amount: s.amount },
    ),
    minSubtotal: r.conditions.minSubtotal ?? '',
    maxSubtotal: r.conditions.maxSubtotal ?? '',
    maxWeightKg: r.conditions.maxWeightKg === null ? '' : String(r.conditions.maxWeightKg),
    zoneIds: r.conditions.zoneIds,
    locationIds: r.conditions.locationIds,
  };
}

const optDec = (s: string) => (s.trim() === '' ? null : s.trim());

export function toRuleInput(f: RuleForm): unknown {
  return {
    title: f.title,
    code: f.code,
    active: f.active,
    isDemo: f.isDemo,
    priority: f.priority,
    mode: f.mode,
    baseFee: f.baseFee,
    ratePerUnit: f.mode === 'per_unit' ? f.ratePerUnit : '0',
    includedDistance: numOrNull(f.includedDistance) ?? 0,
    tiers: f.mode === 'per_unit' ? [] : f.tiers.map((x) => ({ upTo: numOrNull(x.upTo), ratePerUnit: x.ratePerUnit, flatFee: x.flatFee || '0' })),
    minFee: optDec(f.minFee),
    maxFee: optDec(f.maxFee),
    maxDistance: numOrNull(f.maxDistance),
    distanceRounding: { increment: Number(f.increment), mode: f.roundingMode },
    freeDelivery: { enabled: f.freeEnabled, threshold: f.freeEnabled ? f.freeThreshold : '0', basis: f.freeBasis, waiveHandling: f.waiveHandling },
    handlingFee: optDec(f.handlingFee),
    surcharges: f.surcharges.map((s) =>
      s.kind === 'weight_over' ? { kind: s.kind, thresholdKg: numOrNull(s.thresholdKg), amount: s.amount } : { kind: s.kind, threshold: s.threshold, amount: s.amount },
    ),
    conditions: {
      minSubtotal: optDec(f.minSubtotal),
      maxSubtotal: optDec(f.maxSubtotal),
      maxWeightKg: numOrNull(f.maxWeightKg),
      zoneIds: f.zoneIds,
      locationIds: f.locationIds,
    },
  };
}

function RuleEditor({
  initial,
  id,
  limits,
  zones,
  locations,
  onDone,
}: {
  initial: RuleForm;
  id: string | null;
  limits: PlanLimits;
  zones: DeliveryZone[];
  locations: FulfillmentLocation[];
  onDone: (saved: boolean) => void;
}) {
  const { t } = useTranslation();
  const { unit } = useApp();
  const u = t(`common.units.${unit}`);
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tab, setTab] = useState('basics');
  const { busy, run } = useAction();
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const pro = limits.advancedRules;

  const tabOf = (path: string) => {
    if (/^(tiers|ratePerUnit|baseFee|includedDistance|minFee|maxFee|maxDistance|distanceRounding|mode)/.test(path)) return 'pricing';
    if (/^(freeDelivery|handlingFee|surcharges)/.test(path)) return 'extras';
    if (path.startsWith('conditions')) return 'conditions';
    return 'basics';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validate(pricingRuleInputSchema, toRuleInput(f));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setTab(tabOf(Object.keys(parsed.errors)[0] ?? ''));
      return;
    }
    setErrors({});
    const saved = await run(() => api(id ? `rules/${id}` : 'rules', { method: id ? 'PUT' : 'POST', body: parsed.data }), {
      success: t('common.saved'),
      onError: (err) => setErrors(serverFieldErrors(err) ?? {}),
    });
    if (saved) onDone(true);
  };

  const proLock = !pro && (
    <Alert variant="info" className="mb-4">
      <Lock />
      <AlertDescription>{t('common.upgradeRequired')}</AlertDescription>
    </Alert>
  );

  return (
    <form onSubmit={submit} noValidate className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        <DialogTitle className="mb-1 text-lg font-semibold">{id ? t('rules.editTitle') : t('rules.addTitle')}</DialogTitle>
        <DialogDescription className="text-muted-foreground mb-4 text-sm">{t('rules.subtitle')}</DialogDescription>
        {f.isDemo && (
          <Alert variant="warning" className="mb-4">
            <AlertTriangle />
            <AlertDescription>{t('rules.demoNote')}</AlertDescription>
          </Alert>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="basics">{t('rules.tabs.basics')}</TabsTrigger>
            <TabsTrigger value="pricing">{t('rules.tabs.pricing')}</TabsTrigger>
            <TabsTrigger value="extras">{t('rules.tabs.extras')}</TabsTrigger>
            <TabsTrigger value="conditions">{t('rules.tabs.conditions')}</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="grid gap-4">
            <Field id="r-title" label={t('rules.fields.title')} hint={t('rules.fields.titleHint')} error={errors.title}>
              <Input value={f.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field id="r-code" label={t('rules.fields.code')} hint={t('rules.fields.codeHint')} error={errors.code}>
              <Input value={f.code} onChange={(e) => set('code', e.target.value.toLowerCase())} dir="ltr" />
            </Field>
            <Label className="font-normal">
              <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} />
              {t('rules.fields.active')}
            </Label>
          </TabsContent>

          <TabsContent value="pricing" className="grid gap-4">
            <Field id="r-mode" label={t('rules.fields.mode')} hint={t(`rules.fields.modeHints.${f.mode}`)} error={errors.mode}>
              <NativeSelect value={f.mode} onChange={(e) => set('mode', e.target.value as RuleForm['mode'])}>
                <option value="per_unit">{t('rules.fields.modes.per_unit')}</option>
                <option value="graduated_tiers" disabled={!pro}>
                  {t('rules.fields.modes.graduated_tiers')}
                  {!pro ? ` — ${t('common.upgradeRequired')}` : ''}
                </option>
                <option value="volume_tiers" disabled={!pro}>
                  {t('rules.fields.modes.volume_tiers')}
                  {!pro ? ` — ${t('common.upgradeRequired')}` : ''}
                </option>
              </NativeSelect>
            </Field>
            <div className="grid gap-4">
              <Field id="r-base" label={t('rules.fields.baseFee')} error={errors.baseFee}>
                <Input inputMode="decimal" value={f.baseFee} onChange={(e) => set('baseFee', e.target.value)} />
              </Field>
              {f.mode === 'per_unit' && (
                <Field id="r-rate" label={t('rules.fields.ratePerUnit', { unit: u })} error={errors.ratePerUnit}>
                  <Input inputMode="decimal" value={f.ratePerUnit} onChange={(e) => set('ratePerUnit', e.target.value)} />
                </Field>
              )}
              <Field id="r-incl" label={t('rules.fields.includedDistance', { unit: u })} hint={t('rules.fields.includedDistanceHint')} error={errors.includedDistance}>
                <Input inputMode="decimal" value={f.includedDistance} onChange={(e) => set('includedDistance', e.target.value)} />
              </Field>
            </div>
            {f.mode !== 'per_unit' && (
              <fieldset className="grid gap-3 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">{t('rules.fields.tiers')}</legend>
                {errors.tiers && <p className="text-destructive text-xs">{t(errors.tiers)}</p>}
                {f.tiers.map((tier, i) => (
                  <div key={i} className="grid items-end gap-2">
                    <Field id={`r-t${i}-up`} label={t('rules.fields.tierUpTo', { unit: u })} hint={i === f.tiers.length - 1 ? t('rules.fields.tierUpToHint') : undefined} error={errors[`tiers.${i}.upTo`]}>
                      <Input inputMode="decimal" value={tier.upTo} onChange={(e) => set('tiers', f.tiers.map((x, j) => (j === i ? { ...x, upTo: e.target.value } : x)))} />
                    </Field>
                    <Field id={`r-t${i}-rate`} label={t('rules.fields.tierRate', { unit: u })} error={errors[`tiers.${i}.ratePerUnit`]}>
                      <Input inputMode="decimal" value={tier.ratePerUnit} onChange={(e) => set('tiers', f.tiers.map((x, j) => (j === i ? { ...x, ratePerUnit: e.target.value } : x)))} />
                    </Field>
                    <Field id={`r-t${i}-flat`} label={t('rules.fields.tierFlat')} error={errors[`tiers.${i}.flatFee`]}>
                      <Input inputMode="decimal" value={tier.flatFee} onChange={(e) => set('tiers', f.tiers.map((x, j) => (j === i ? { ...x, flatFee: e.target.value } : x)))} />
                    </Field>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('rules.fields.removeTier')} disabled={f.tiers.length === 1} onClick={() => set('tiers', f.tiers.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set('tiers', [...f.tiers, { upTo: '', ratePerUnit: '0', flatFee: '0' }])}>
                  <Plus /> {t('rules.fields.addTier')}
                </Button>
              </fieldset>
            )}
            <div className="grid gap-4">
              <Field id="r-min" label={t('rules.fields.minFee')} optional error={errors.minFee}>
                <Input inputMode="decimal" value={f.minFee} onChange={(e) => set('minFee', e.target.value)} />
              </Field>
              <Field id="r-max" label={t('rules.fields.maxFee')} optional error={errors.maxFee}>
                <Input inputMode="decimal" value={f.maxFee} onChange={(e) => set('maxFee', e.target.value)} />
              </Field>
              <Field id="r-maxd" label={t('rules.fields.maxDistance', { unit: u })} hint={t('rules.fields.maxDistanceHint')} optional error={errors.maxDistance}>
                <Input inputMode="decimal" value={f.maxDistance} onChange={(e) => set('maxDistance', e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4">
              <Field id="r-inc" label={t('rules.fields.rounding')}>
                <NativeSelect value={f.increment} onChange={(e) => set('increment', e.target.value as RuleForm['increment'])}>
                  {(['0.01', '0.1', '0.5', '1'] as const).map((v) => (
                    <option key={v} value={v}>
                      {v} {u}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="r-rmode" label={t('rules.fields.roundingMode')}>
                <NativeSelect value={f.roundingMode} onChange={(e) => set('roundingMode', e.target.value as RuleForm['roundingMode'])}>
                  <option value="up">{t('rules.fields.roundingModes.up')}</option>
                  <option value="nearest">{t('rules.fields.roundingModes.nearest')}</option>
                </NativeSelect>
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="extras" className="grid gap-4">
            <Field id="r-handling" label={t('rules.fields.handlingFee')} hint={t('rules.fields.handlingFeeHint')} optional error={errors.handlingFee}>
              <Input inputMode="decimal" value={f.handlingFee} onChange={(e) => set('handlingFee', e.target.value)} />
            </Field>
            <Separator />
            {proLock}
            <Label className="font-normal">
              <Switch checked={f.freeEnabled} disabled={!pro} onCheckedChange={(v) => set('freeEnabled', v)} />
              {t('rules.fields.freeDelivery')}
            </Label>
            {f.freeEnabled && (
              <div className="grid gap-4">
                <Field id="r-free" label={t('rules.fields.freeThreshold')} error={errors['freeDelivery.threshold']}>
                  <Input inputMode="decimal" value={f.freeThreshold} onChange={(e) => set('freeThreshold', e.target.value)} />
                </Field>
                <Field id="r-basis" label={t('rules.fields.freeBasis')} hint={t('rules.fields.freeBasisHint')}>
                  <NativeSelect value={f.freeBasis} onChange={(e) => set('freeBasis', e.target.value as RuleForm['freeBasis'])}>
                    <option value="after_discount">{t('rules.fields.freeBases.after_discount')}</option>
                    <option value="before_discount">{t('rules.fields.freeBases.before_discount')}</option>
                  </NativeSelect>
                </Field>
                <Label className="font-normal">
                  <Checkbox checked={f.waiveHandling} onCheckedChange={(v) => set('waiveHandling', v === true)} />
                  {t('rules.fields.waiveHandling')}
                </Label>
              </div>
            )}
            <Separator />
            <p className="text-sm font-medium">{t('rules.fields.surcharges')}</p>
            <p className="text-muted-foreground text-xs">{t('rules.fields.weightNote')}</p>
            {f.surcharges.map((s, i) => (
              <div key={i} className="grid items-end gap-2">
                {s.kind === 'weight_over' ? (
                  <Field id={`r-s${i}-th`} label={t('rules.fields.weightOver')} error={errors[`surcharges.${i}.thresholdKg`]}>
                    <Input inputMode="decimal" value={s.thresholdKg} onChange={(e) => set('surcharges', f.surcharges.map((x, j) => (j === i ? { ...s, thresholdKg: e.target.value } : x)))} />
                  </Field>
                ) : (
                  <Field id={`r-s${i}-th`} label={t('rules.fields.valueOver')} error={errors[`surcharges.${i}.threshold`]}>
                    <Input inputMode="decimal" value={s.threshold} onChange={(e) => set('surcharges', f.surcharges.map((x, j) => (j === i ? { ...s, threshold: e.target.value } : x)))} />
                  </Field>
                )}
                <Field id={`r-s${i}-amt`} label={t('rules.fields.amount')} error={errors[`surcharges.${i}.amount`]}>
                  <Input inputMode="decimal" value={s.amount} onChange={(e) => set('surcharges', f.surcharges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => set('surcharges', f.surcharges.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!pro} onClick={() => set('surcharges', [...f.surcharges, { kind: 'weight_over', thresholdKg: '', amount: '0' }])}>
                <Plus /> {t('rules.fields.addWeightSurcharge')}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!pro} onClick={() => set('surcharges', [...f.surcharges, { kind: 'order_value_over', threshold: '', amount: '0' }])}>
                <Plus /> {t('rules.fields.addValueSurcharge')}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="conditions" className="grid gap-4">
            {proLock}
            <div className="grid gap-4">
              <Field id="r-minsub" label={t('rules.fields.minSubtotal')} optional error={errors['conditions.minSubtotal']}>
                <Input inputMode="decimal" disabled={!pro} value={f.minSubtotal} onChange={(e) => set('minSubtotal', e.target.value)} />
              </Field>
              <Field id="r-maxsub" label={t('rules.fields.maxSubtotal')} optional error={errors['conditions.maxSubtotal']}>
                <Input inputMode="decimal" disabled={!pro} value={f.maxSubtotal} onChange={(e) => set('maxSubtotal', e.target.value)} />
              </Field>
              <Field id="r-maxw" label={t('rules.fields.maxWeightKg')} optional error={errors['conditions.maxWeightKg']}>
                <Input inputMode="decimal" disabled={!pro} value={f.maxWeightKg} onChange={(e) => set('maxWeightKg', e.target.value)} />
              </Field>
            </div>
            {zones.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t('rules.fields.zones')}</legend>
                {zones.filter((z) => z.type === 'include').map((z) => (
                  <Label key={z.id} className="font-normal">
                    <Checkbox
                      disabled={!pro}
                      checked={f.zoneIds.includes(z.id)}
                      onCheckedChange={(v) => set('zoneIds', v === true ? [...f.zoneIds, z.id] : f.zoneIds.filter((x) => x !== z.id))}
                    />
                    {z.name}
                  </Label>
                ))}
              </fieldset>
            )}
            {locations.length > 1 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t('rules.fields.locations')}</legend>
                {locations.map((l) => (
                  <Label key={l.id} className="font-normal">
                    <Checkbox
                      disabled={!pro}
                      checked={f.locationIds.includes(l.id)}
                      onCheckedChange={(v) => set('locationIds', v === true ? [...f.locationIds, l.id] : f.locationIds.filter((x) => x !== l.id))}
                    />
                    {l.name}
                  </Label>
                ))}
              </fieldset>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <div className="bg-card flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => onDone(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={busy}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

export function RulesPage() {
  const { t } = useTranslation();
  const { unit, locale } = useApp();
  const { data, error, loading, reload } = useResource<RulesResponse>('rules');
  const zones = useResource<{ zones: DeliveryZone[] }>('zones');
  const locations = useResource<{ locations: FulfillmentLocation[] }>('locations');
  const [editing, setEditing] = useState<{ id: string | null; form: RuleForm } | null>(null);
  const [deleting, setDeleting] = useState<PricingRule | null>(null);
  const action = useAction();
  const del = useAction();
  const u = t(`common.units.${unit}`);

  const rules = data?.rules ?? [];
  const nextPriority = (rules.at(-1)?.priority ?? 0) + 10;

  const move = (index: number, dir: -1 | 1) => {
    const ids = rules.map((r) => r.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void action.run(() => api('rules/reorder', { method: 'POST', body: { ids } })).then(() => reload());
  };

  const toggle = (r: PricingRule, active: boolean) => {
    const { id, ...rest } = r as PricingRule & { exceedsPlan?: boolean };
    delete (rest as { exceedsPlan?: boolean }).exceedsPlan;
    void action.run(() => api(`rules/${id}`, { method: 'PUT', body: { ...rest, active } }), { success: t('common.saved') }).then(() => reload());
  };

  const summary = (r: PricingRule) =>
    r.mode === 'per_unit'
      ? t('rules.summaryPerUnit', { base: decimal(r.baseFee, locale), rate: decimal(r.ratePerUnit, locale), unit: u })
      : `${decimal(r.baseFee, locale)} + ${t('rules.summaryTiers', { count: r.tiers.length })}`;

  return (
    <>
      <PageHeader
        title={t('rules.title')}
        description={t('rules.subtitle')}
        actions={
          <Button onClick={() => setEditing({ id: null, form: blank(nextPriority) })}>
            <Plus /> {t('rules.add')}
          </Button>
        }
      />
      {data && data.warnings.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>{t('overview.ruleWarnings')}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {data.warnings.map((w, i) => (
                <li key={i}>{t(`rules.warnings.${w.kind}`, { code: 'code' in w ? w.code : '' })}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState />}
      {data && rules.length === 0 && (
        <EmptyState
          title={t('rules.empty')}
          description={t('rules.emptyDesc')}
          icon={<ListOrdered className="size-6" />}
          action={
            <Button onClick={() => setEditing({ id: null, form: blank(nextPriority) })}>
              <Plus /> {t('rules.add')}
            </Button>
          }
        />
      )}
      {data && rules.length > 0 && (
        <Card className="py-2">
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('rules.columns.order')}</TableHead>
                  <TableHead>{t('rules.columns.option')}</TableHead>
                  <TableHead>{t('rules.columns.pricing')}</TableHead>
                  <TableHead>{t('rules.columns.status')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('common.edit')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" aria-label={t('common.moveUp')} disabled={i === 0 || action.busy} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={t('common.moveDown')} disabled={i === rules.length - 1 || action.busy} onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-muted-foreground font-mono text-xs" dir="ltr">
                        {r.code}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.isDemo && <Badge variant="warning">{t('common.demo')}</Badge>}
                        {r.exceedsPlan && (
                          <Badge variant="destructive">
                            <Lock /> {t('rules.exceedsPlan')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{summary(r)}</TableCell>
                    <TableCell>
                      <Switch checked={r.active} disabled={action.busy} onCheckedChange={(v) => toggle(r, v)} aria-label={`${t('rules.fields.active')}: ${r.title}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" aria-label={`${t('common.edit')} ${r.title}`} onClick={() => setEditing({ id: r.id, form: toForm(r) })}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${t('common.duplicate')} ${r.title}`}
                          disabled={action.busy}
                          onClick={() => void action.run(() => api(`rules/${r.id}/duplicate`, { method: 'POST' }), { success: t('common.saved') }).then(() => reload())}
                        >
                          <Copy />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`${t('common.delete')} ${r.title}`} onClick={() => setDeleting(r)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent closeLabel={t('common.close')} className="p-0">
          {editing && data && (
            <RuleEditor
              initial={editing.form}
              id={editing.id}
              limits={data.limits}
              zones={zones.data?.zones ?? []}
              locations={locations.data?.locations ?? []}
              onDone={(saved) => {
                setEditing(null);
                if (saved) void reload();
              }}
            />
          )}
        </SheetContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('common.confirmDeleteTitle', { name: deleting?.title ?? '' })}
        description={t('common.confirmDeleteBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        busy={del.busy}
        onConfirm={() =>
          void del.run(() => api(`rules/${deleting!.id}`, { method: 'DELETE' }), { success: t('common.deleted') }).then(() => {
            setDeleting(null);
            void reload();
          })
        }
      />
    </>
  );
}
