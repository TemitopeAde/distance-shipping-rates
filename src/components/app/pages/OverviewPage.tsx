import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, CreditCard, Gauge, ListOrdered, MapPin, Plug, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '../../ui/primitives';
import { ErrorState, LoadingState, PageHeader, StatTile } from '../common';
import { useApp, type PageId } from '../context';
import { dateTime, number } from '../format';
import { useResource } from '../hooks';
import type { Overview } from '../types';
import { LogTable } from './LogsPage';

const STEP_TARGET: Record<string, PageId> = {
  location: 'locations',
  units: 'settings',
  rules: 'rules',
  routing: 'settings',
  fallback: 'settings',
  carrier: 'checkout',
  simulate: 'simulator',
  test_checkout: 'checkout',
  go_live: 'checkout',
};

const HEALTH_VARIANT = { healthy: 'success', degraded: 'warning', down: 'destructive', not_configured: 'destructive', idle: 'secondary' } as const;

export function OverviewPage() {
  const { t } = useTranslation();
  const { navigate, locale } = useApp();
  const { data, error, loading, reload } = useResource<Overview>('overview');

  return (
    <>
      <PageHeader
        title={t('overview.title')}
        description={t('overview.subtitle')}
        actions={
          <Button variant="outline" onClick={() => void reload()} loading={loading}>
            <RefreshCw /> {t('common.refresh')}
          </Button>
        }
      />
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState rows={4} />}
      {data && (
        <div className="grid gap-6">
          {data.rollout.mode === 'off' && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{t('overview.rolloutOff')}</AlertDescription>
            </Alert>
          )}
          {data.rollout.mode === 'allowlist' && !data.rollout.allowed && (
            <Alert variant="info">
              <AlertTriangle />
              <AlertDescription>{t('overview.rolloutAllowlist')}</AlertDescription>
            </Alert>
          )}
          {data.ruleWarnings.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>{t('overview.ruleWarnings')}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-4">
                  {data.ruleWarnings.map((w, i) => (
                    <li key={i}>{t(`rules.warnings.${w.kind}`, { code: 'code' in w ? w.code : '' })}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t('overview.liveTitle')}
              value={<Badge variant={data.pluginEnabled ? 'success' : 'secondary'}>{data.pluginEnabled ? t('overview.live') : t('overview.paused')}</Badge>}
              hint={data.lastCheckoutAt ? t('overview.lastRequest', { time: dateTime(data.lastCheckoutAt, locale) }) : t('overview.noRequests')}
              icon={<Plug className="size-5" />}
            />
            <StatTile
              label={t('overview.health.title')}
              value={<Badge variant={HEALTH_VARIANT[data.health]}>{t(`overview.health.${data.health}`)}</Badge>}
              hint={t(`overview.health.${data.health}Desc`)}
              icon={<Gauge className="size-5" />}
            />
            <StatTile
              label={t('overview.usageTitle')}
              value={t('overview.usageOf', { used: number(data.usage.used, locale, 0), limit: number(data.usage.limit, locale, 0) })}
              hint={
                <div className="grid gap-1">
                  <Progress value={Math.min(100, (data.usage.used / Math.max(1, data.usage.limit)) * 100)} aria-label={t('overview.usageTitle')} />
                  <span>{t('overview.usageHint')}</span>
                </div>
              }
            />
            <StatTile
              label={t('overview.planTitle')}
              value={t(`common.planNames.${data.entitlement.plan}`)}
              hint={t(`billing.status.${data.entitlement.status}`)}
              icon={<CreditCard className="size-5" />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('overview.checklistTitle')}</CardTitle>
              <CardDescription>{t('overview.checklistDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-3">
                <Progress className="flex-1" value={data.completion} aria-label={t('overview.completion', { percent: data.completion })} />
                <span className="shrink-0 text-sm font-medium tabular-nums">{t('overview.completion', { percent: data.completion })}</span>
              </div>
              <ol className="grid gap-1">
                {data.checklist.map((step, i) => (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => navigate(STEP_TARGET[step.id] ?? 'overview')}
                      className="hover:bg-muted flex w-full items-start gap-3 rounded-lg p-3 text-start transition-colors"
                    >
                      {step.done ? (
                        <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Circle className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={step.done ? 'text-muted-foreground font-medium line-through decoration-1' : 'font-medium'}>
                          {i + 1}. {t(`overview.steps.${step.id}.title`)}
                        </span>
                        <span className="text-muted-foreground block text-sm">{t(`overview.steps.${step.id}.desc`)}</span>
                        {step.evidence && <Badge variant="success" className="mt-1">{t(`overview.evidence.${step.evidence}`)}</Badge>}
                      </span>
                      <span className="sr-only">{step.done ? t('common.yes') : t('common.no')}</span>
                      <ArrowRight className="text-muted-foreground mt-0.5 size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t('overview.recentTitle')}</CardTitle>
                <CardAction>
                  <Button variant="link" onClick={() => navigate('logs')}>
                    {t('overview.viewAll')}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {data.recent.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('overview.recentEmpty')}</p>
                ) : (
                  <LogTable rows={data.recent} compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('overview.quickActions')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="outline" className="justify-start" onClick={() => navigate('simulator')}>
                  <Gauge /> {t('nav.simulator')}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => navigate('rules')}>
                  <ListOrdered /> {t('rules.add')}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => navigate('locations')}>
                  <MapPin /> {t('locations.add')}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => navigate('checkout')}>
                  <Plug /> {t('nav.checkout')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
