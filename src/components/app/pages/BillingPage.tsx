import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Minus, RefreshCw } from 'lucide-react';
import type { PaidPlanId, PlanLimits } from '../../../lib/billing/plans';
import { Button } from '../../ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  NativeSelect,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/primitives';
import { api } from '../api-client';
import { ErrorState, LoadingState, LookupsRemaining, PageHeader } from '../common';
import { useApp } from '../context';
import { date, number } from '../format';
import { useAction, useResource } from '../hooks';
import type { BillingResponse } from '../types';

const FEATURES: Array<keyof PlanLimits> = ['checkout', 'maxLocations', 'maxRules', 'advancedRules', 'zones', 'monthlyLookups', 'maxLogRetentionDays'];
const PLANS = ['basic', 'pro', 'business'] as const;

function FeatureValue({ value, locale }: { value: number | boolean; locale: string }) {
  if (typeof value === 'boolean') {
    return value ? <Check className="text-success size-4" aria-label="✓" /> : <Minus className="text-muted-foreground size-4" aria-label="—" />;
  }
  return <span>{number(value, locale, 0)}</span>;
}

export function BillingPage() {
  const { t } = useTranslation();
  const { locale, navigate } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading, reload } = useResource<BillingResponse>(refreshKey ? `billing?refresh=1&k=${refreshKey}` : 'billing');
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const { busy, run } = useAction();

  const upgrade = async (plan: PaidPlanId) => {
    const res = await run(() => api<{ url: string }>('billing/checkout-url', { method: 'POST', body: { plan, billingCycle: cycle } }));
    if (res?.url) window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  const ent = data?.entitlement;

  return (
    <>
      <PageHeader
        title={t('billing.title')}
        description={t('billing.subtitle')}
        actions={
          <Button variant="outline" loading={loading} onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw /> {t('billing.refresh')}
          </Button>
        }
      />
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState rows={3} />}
      {data && ent && (
        <div className="grid gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>{t('billing.current')}</CardDescription>
                <CardTitle className="text-2xl">{t(`common.planNames.${ent.plan}`)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <Badge variant={ent.status === 'active' || ent.status === 'trial' || ent.status === 'override' ? 'success' : 'warning'} className="w-fit">
                  {t(`billing.status.${ent.status}`)}
                </Badge>
                {ent.accessUntil && <p>{t('billing.accessUntil', { date: date(ent.accessUntil, locale) })}</p>}
                {data.snapshot?.autoRenewing !== null && data.snapshot && !data.snapshot.isFree && (
                  <p className="text-muted-foreground">{data.snapshot.autoRenewing ? t('billing.renews') : t('billing.noRenew')}</p>
                )}
                {data.snapshot?.freeTrialAvailable && <p className="text-success">{t('billing.trialAvailable')}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>{t('billing.usage')}</CardDescription>
                <CardTitle className="text-2xl">
                  {t('overview.usageOf', { used: number(data.usage.used, locale, 0), limit: number(data.usage.limit, locale, 0) })}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Progress value={Math.min(100, (data.usage.used / Math.max(1, data.usage.limit)) * 100)} aria-label={t('billing.usage')} />
                <LookupsRemaining usage={data.usage} locale={locale} />
                <p className="text-muted-foreground text-xs">{t('overview.usageHint')}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('billing.compare')}</CardTitle>
              <CardDescription>{t('billing.redirectNote')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid w-fit gap-1.5">
                <Label htmlFor="cycle">{t('billing.cycle')}</Label>
                <NativeSelect id="cycle" value={cycle} onChange={(e) => setCycle(e.target.value as 'MONTHLY' | 'YEARLY')}>
                  <option value="MONTHLY">{t('billing.monthly')}</option>
                  <option value="YEARLY">{t('billing.yearly')}</option>
                </NativeSelect>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    {PLANS.map((p) => (
                      <TableHead key={p}>{t(`common.planNames.${p}`)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FEATURES.map((f) => (
                    <TableRow key={f}>
                      <TableCell className="whitespace-normal">{t(`billing.features.${f}`)}</TableCell>
                      {PLANS.map((p) => (
                        <TableCell key={p}>
                          <FeatureValue value={data.plans[p][f]} locale={locale} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell />
                    <TableCell className="text-muted-foreground text-sm">{t('billing.freePlan')}</TableCell>
                    {(['pro', 'business'] as const).map((p) => (
                      <TableCell key={p}>
                        <Button disabled={ent.plan === p && ent.status !== 'cancelling'} loading={busy} onClick={() => void upgrade(p)}>
                          {t('billing.choose', { plan: t(`common.planNames.${p}`) })} <ExternalLink />
                        </Button>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-muted-foreground text-xs">{t('billing.legalNote')}</p>
            </CardContent>
          </Card>

          <Alert variant="default">
            <AlertTitle>{t('billing.whenAccessEnds')}</AlertTitle>
            <AlertDescription>
              <p>{t('billing.whenAccessEndsBody')}</p>
              <Button variant="link" className="h-auto p-0" onClick={() => navigate('settings')}>
                {t('nav.settings')}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );
}
