import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge, Card, CardContent, Label, NativeSelect, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/primitives';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../common';
import { useApp } from '../context';
import { dateTime, number } from '../format';
import { useResource } from '../hooks';
import type { LogRow, MerchantSettings } from '../types';

const STATUS_VARIANT = { priced: 'success', no_rate: 'secondary', fallback: 'warning', error: 'destructive' } as const;

export function LogTable({ rows, compact = false }: { rows: LogRow[]; compact?: boolean }) {
  const { t } = useTranslation();
  const { locale } = useApp();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('logs.columns.time')}</TableHead>
          {!compact && <TableHead>{t('logs.columns.source')}</TableHead>}
          <TableHead>{t('logs.columns.status')}</TableHead>
          <TableHead>{t('logs.columns.destination')}</TableHead>
          <TableHead>{t('logs.columns.distance')}</TableHead>
          <TableHead>{t('logs.columns.price')}</TableHead>
          {!compact && <TableHead>{t('logs.columns.reason')}</TableHead>}
          {!compact && <TableHead>{t('logs.columns.performance')}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{dateTime(r.createdAt, locale)}</TableCell>
            {!compact && <TableCell>{t(`logs.sources.${r.source}`)}</TableCell>}
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{t(`logs.statuses.${r.status}`)}</Badge>
              {compact && r.reason && <span className="text-muted-foreground ms-2 text-xs">{t(`reasons.${r.reason}`, { defaultValue: r.reason })}</span>}
            </TableCell>
            <TableCell>{[r.destCountry, r.destPostalPrefix && `${r.destPostalPrefix}…`].filter(Boolean).join(' ') || '—'}</TableCell>
            <TableCell>{r.distance !== null ? `${number(r.distance, locale)} ${t(`common.units.${r.unit === 'km' ? 'km' : 'mi'}`)}` : '—'}</TableCell>
            <TableCell>{r.price ? `${r.price} ${r.currency}` : '—'}</TableCell>
            {!compact && (
              <TableCell className="max-w-xs whitespace-normal">
                {r.reason ? t(`reasons.${r.reason}`, { defaultValue: r.reason }) : '—'}
                {r.providerError && <span className="text-muted-foreground block font-mono text-xs">{r.providerError}</span>}
              </TableCell>
            )}
            {!compact && (
              <TableCell className="text-muted-foreground text-xs">
                {number(r.latencyMs, locale, 0)} ms · {r.cacheHit ? t('logs.cached') : t('logs.calls', { count: r.providerCalls })}
                {r.requestRef && <span className="block font-mono">#{r.requestRef}</span>}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function LogsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const query = `logs?status=${status}&source=${source}&page=${page}&pageSize=${pageSize}`;
  const { data, error, loading, reload } = useResource<{ rows: LogRow[]; total: number | null }>(query);
  const settings = useResource<MerchantSettings>('settings');
  const total = data?.total ?? null;
  const hasNext = total !== null ? (page + 1) * pageSize < total : (data?.rows.length ?? 0) === pageSize;

  return (
    <>
      <PageHeader
        title={t('logs.title')}
        description={t('logs.subtitle')}
        actions={
          <Button variant="outline" onClick={() => void reload()} loading={loading}>
            <RefreshCw /> {t('common.refresh')}
          </Button>
        }
      />
      <Card className="mb-4 py-4">
        <CardContent className="flex flex-wrap items-end gap-4 px-4">
          <div className="grid gap-1.5">
            <Label htmlFor="log-status">{t('logs.status')}</Label>
            <NativeSelect
              id="log-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              {(['all', 'priced', 'no_rate', 'fallback', 'error'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`logs.statuses.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="log-source">{t('logs.source')}</Label>
            <NativeSelect
              id="log-source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(0);
              }}
            >
              {(['all', 'checkout', 'simulator'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`logs.sources.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {settings.data && <p className="text-muted-foreground ms-auto text-xs">{t('logs.retention', { days: settings.data.logRetentionDays })}</p>}
        </CardContent>
      </Card>
      {error && <ErrorState error={error} onRetry={() => void reload()} />}
      {!data && loading && <LoadingState />}
      {data && data.rows.length === 0 && <EmptyState title={t('logs.empty')} description={t('logs.emptyDesc')} icon={<Database className="size-6" />} />}
      {data && data.rows.length > 0 && (
        <Card className="py-2">
          <CardContent className="px-2">
            <LogTable rows={data.rows} />
          </CardContent>
        </Card>
      )}
      {data && (page > 0 || hasNext) && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            {t('common.previous')}
          </Button>
          <span className="text-muted-foreground text-sm">{t('common.pageN', { page: page + 1 })}</span>
          <Button variant="outline" size="sm" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>
            {t('common.next')}
          </Button>
        </div>
      )}
    </>
  );
}
