import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Info, Pause, Play, XCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/dialog';
import { Alert, AlertDescription, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/primitives';
import { api } from '../api-client';
import { ErrorState, LoadingState, PageHeader } from '../common';
import { useApp } from '../context';
import { dateTime } from '../format';
import { useAction, useResource } from '../hooks';
import type { Overview } from '../types';
import { openShippingSettings } from '../wix-pages';
import { ManageAppsScreenshot } from '../ManageAppsScreenshot';

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="text-success size-4" aria-hidden="true" /> : <XCircle className="text-destructive size-4" aria-hidden="true" />}
      <span>{label}</span>
      <span className="sr-only">{ok ? '✓' : '✗'}</span>
    </li>
  );
}

export function CheckoutPage() {
  const { t } = useTranslation();
  const { locale, refreshShell } = useApp();
  const { data, error, loading, reload } = useResource<Overview>('overview');
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState<'go_live' | 'pause' | null>(null);

  const act = async (action: 'confirm_carrier' | 'confirm_checkout_test' | 'go_live' | 'pause', success: string) => {
    const done = await run(() => api('onboarding', { method: 'POST', body: { action } }), { success });
    setConfirm(null);
    if (done) {
      void reload();
      refreshShell();
    }
  };

  const step = (id: string) => data?.checklist.find((c) => c.id === id)?.done ?? false;

  return (
    <>
      <PageHeader title={t('checkout.title')} description={t('checkout.subtitle')} />
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState rows={4} />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('checkout.how')}</CardTitle>
              <CardDescription>{t('checkout.howBody')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Alert variant="info">
                <Info />
                <AlertDescription>{t('checkout.notWidget')}</AlertDescription>
              </Alert>
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">{t('checkout.deliveryTypes')}: </span>
                {t('checkout.deliveryTypesBody')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.steps')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ol className="grid list-decimal gap-2 ps-5 text-sm">
                <li>{t('checkout.step1')}</li>
                <li>{t('checkout.step2')}</li>
                <li>{t('checkout.step3', { app: t('common.appName') })}</li>
                <li>{t('checkout.step4')}</li>
                <li>{t('checkout.step5')}</li>
              </ol>
              <ManageAppsScreenshot />
              <div className="flex flex-wrap items-center gap-2">
                <Button className="w-fit" onClick={openShippingSettings}>
                  <ExternalLink /> {t('checkout.openShippingSettings')}
                </Button>
                {step('carrier') ? (
                  <Badge variant="success" className="w-fit">
                    <CheckCircle2 /> {t('checkout.carrierConfirmed')}
                  </Badge>
                ) : (
                  <Button variant="outline" className="w-fit" loading={busy} onClick={() => void act('confirm_carrier', t('common.saved'))}>
                    {t('checkout.confirmCarrier')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.statusTitle')}</CardTitle>
              <CardDescription>{t('checkout.statusNote')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">{t('checkout.lastRequest')}: </span>
                <span className="font-medium">{data.lastCheckoutAt ? dateTime(data.lastCheckoutAt, locale) : t('checkout.never')}</span>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{t('checkout.diagnostics')}</p>
                <ul className="grid gap-1.5">
                  <Check ok={step('location')} label={t('checkout.diag.location')} />
                  <Check ok={step('rules')} label={t('checkout.diag.rule')} />
                  <Check ok={data.routing.configured} label={t('checkout.diag.routing')} />
                  <Check ok={data.entitlement.limits.checkout} label={t('checkout.diag.plan')} />
                  <Check ok={data.pluginEnabled} label={t('checkout.diag.live')} />
                  <Check ok={data.rollout.allowed} label={t('checkout.diag.rollout')} />
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('checkout.testTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ol className="grid list-decimal gap-2 ps-5 text-sm">
                <li>{t('checkout.test1')}</li>
                <li>{t('checkout.test2')}</li>
                <li>{t('checkout.test3')}</li>
                <li>{t('checkout.test4')}</li>
                <li>{t('checkout.test5')}</li>
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                {step('test_checkout') ? (
                  <Badge variant="success">
                    <CheckCircle2 /> {t('checkout.testConfirmed')}
                  </Badge>
                ) : (
                  <Button variant="outline" loading={busy} onClick={() => void act('confirm_checkout_test', t('common.saved'))}>
                    {t('checkout.confirmTest')}
                  </Button>
                )}
                {data.pluginEnabled ? (
                  <Button variant="outline" onClick={() => setConfirm('pause')}>
                    <Pause /> {t('checkout.pause')}
                  </Button>
                ) : (
                  <Button onClick={() => setConfirm('go_live')}>
                    <Play /> {t('checkout.goLive')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'pause' ? t('checkout.pauseConfirmTitle') : t('checkout.liveConfirmTitle')}
        description={confirm === 'pause' ? t('checkout.pauseConfirmBody') : t('checkout.liveConfirmBody')}
        confirmLabel={confirm === 'pause' ? t('checkout.pause') : t('checkout.goLive')}
        cancelLabel={t('common.cancel')}
        destructive={confirm === 'pause'}
        busy={busy}
        onConfirm={() => void act(confirm!, confirm === 'pause' ? t('checkout.paused') : t('checkout.wentLive'))}
      />
    </>
  );
}
