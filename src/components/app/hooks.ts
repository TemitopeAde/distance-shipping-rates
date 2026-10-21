import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { ZodError, ZodType } from 'zod';
import { api, ClientApiError } from './api-client';

export interface Resource<T> {
  data: T | null;
  error: ClientApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/** Fetches a GET endpoint with loading/error state. Loading is derived from which path has settled. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const fetchInto = useCallback(
    (target: string) => {
      const id = ++seq.current;
      return api<T>(target).then(
        (result) => {
          if (id !== seq.current) return;
          setDataState(result);
          setError(null);
          setSettledPath(target);
          setRefreshing(false);
        },
        (e: unknown) => {
          if (id !== seq.current) return;
          setError(e instanceof ClientApiError ? e : new ClientApiError(0, 'internal'));
          setSettledPath(target);
          setRefreshing(false);
        },
      );
    },
    [],
  );

  useEffect(() => {
    if (path) void fetchInto(path);
  }, [path, fetchInto]);

  const reload = useCallback(async () => {
    if (!path) return;
    setRefreshing(true);
    await fetchInto(path);
  }, [path, fetchInto]);

  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState((p) => updater(p)), []);
  const loading = Boolean(path) && (refreshing || settledPath !== path);
  return { data, error, loading, reload, setData };
}

/** Translates a backend error code into a user-facing message. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (err: unknown) => {
      if (err instanceof ClientApiError) {
        const details = err.details as { limit?: number } | null;
        return t(`errors.${err.code}`, { defaultValue: t('errors.internal'), limit: details?.limit ?? 0 });
      }
      return t('errors.internal');
    },
    [t],
  );
}

/**
 * Wraps an async action: prevents duplicate submissions while one is running,
 * and reports success/failure with toasts.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const message = useErrorMessage();

  const run = useCallback(
    async <R,>(fn: () => Promise<R>, opts: { success?: string; onError?: (e: unknown) => void } = {}): Promise<R | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setBusy(true);
      try {
        const result = await fn();
        if (opts.success) toast.success(opts.success);
        return result;
      } catch (e) {
        opts.onError?.(e);
        toast.error(message(e));
        return undefined;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [message],
  );
  return { busy, run };
}

export type FieldErrors = Record<string, string>;

/** Maps a Zod issue to an i18n key. Schema messages are already keys (`validation.*`). */
export function issueKey(issue: { code: string; message: string }): string {
  if (issue.message.startsWith('validation.')) return issue.message;
  switch (issue.code) {
    case 'invalid_type':
      return 'validation.required';
    case 'too_small':
      return 'validation.required';
    case 'too_big':
      return 'validation.tooLong';
    case 'invalid_format':
    case 'invalid_string':
      return 'validation.format';
    default:
      return 'validation.invalid';
  }
}

export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!(path in out)) out[path] = issueKey(issue);
  }
  return out;
}

/** Validates with Zod; returns parsed data or field errors (i18n keys). Never relies on browser validation. */
export function validate<T>(schema: ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: zodFieldErrors(result.error) };
}

/** Server-side validation errors arrive as [{ path, message }]. */
export function serverFieldErrors(err: unknown): FieldErrors | null {
  if (!(err instanceof ClientApiError) || err.code !== 'validation_failed' || !Array.isArray(err.details)) return null;
  const out: FieldErrors = {};
  for (const d of err.details as Array<{ path: string; message: string }>) {
    out[d.path] = d.message.startsWith('validation.') ? d.message : 'validation.invalid';
  }
  return out;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** '' → null; otherwise Number (NaN surfaces as a validation error). */
export function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}
