import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CircleHelp, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, Label, Skeleton, Tooltip } from '../ui/primitives';
import { cn } from '../ui/utils';
import type { ClientApiError } from './api-client';
import { useErrorMessage, useOnline, type FieldErrors } from './hooks';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="text-muted-foreground text-xs font-normal">({t('common.optional')})</span>}
        </Label>
        {hint && (
          <Tooltip content={hint}>
            <button type="button" aria-label={`${label}: ${t('common.help')}`} className="text-muted-foreground hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {child}
      {hint && !error && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}

/** Picks the error for a field path from a FieldErrors map. */
export const fe = (errors: FieldErrors, path: string) => errors[path];

export function LoadingState({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ClientApiError | null; onRetry: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{t('common.loadFailed')}</AlertTitle>
      <AlertDescription>
        <p>{message(error)}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw /> {t('common.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">{icon ?? <Inbox className="size-6" />}</div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

/** Unobtrusive bottom notice while the browser is offline. */
export function OfflineNotice() {
  const online = useOnline();
  const { t } = useTranslation();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className="bg-foreground text-background fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 px-4 py-2 text-sm">
      <WifiOff className="size-4" aria-hidden="true" />
      {t('common.offline')}
    </div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          <div className="mt-1 text-xl font-semibold">{value}</div>
          {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  );
}
