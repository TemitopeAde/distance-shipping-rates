import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { XIcon } from 'lucide-react';
import { cn } from './utils';
import { Tooltip } from './primitives';
import { Button, buttonVariants } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-black/40', className)} {...props} />;
}

export function DialogContent({
  className,
  children,
  closeLabel,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { closeLabel: string }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-card fixed top-[50%] left-[50%] z-50 grid max-h-[90vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-xl border p-6 shadow-lg sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        <Tooltip content={closeLabel}>
          <DialogPrimitive.Close className="ring-offset-background focus-visible:ring-ring/50 absolute top-4 end-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus:outline-hidden [&_svg]:size-4">
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        </Tooltip>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side sheet built on the dialog primitive (used for long forms and mobile navigation). */
export function SheetContent({
  className,
  children,
  closeLabel,
  side = 'end',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { closeLabel: string; side?: 'start' | 'end' }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'bg-card fixed inset-y-0 z-50 flex h-full w-full flex-col gap-4 overflow-y-auto border shadow-lg sm:max-w-2xl',
          side === 'end' ? 'end-0 border-s' : 'start-0 border-e sm:max-w-xs',
          className,
        )}
        {...props}
      >
        {children}
        <Tooltip content={closeLabel}>
          <DialogPrimitive.Close className="focus-visible:ring-ring/50 absolute top-4 end-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] [&_svg]:size-4">
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        </Tooltip>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 text-start', className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg leading-none font-semibold', className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

// Confirmation dialog ---------------------------------------------------------
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel, destructive, busy, onConfirm }: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialogPrimitive.Content className="bg-card fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg sm:max-w-md">
          <AlertDialogPrimitive.Title className="text-lg font-semibold">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-muted-foreground text-sm">{description}</AlertDialogPrimitive.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel className={buttonVariants({ variant: 'outline' })}>{cancelLabel}</AlertDialogPrimitive.Cancel>
            <Button type="button" variant={destructive ? 'destructive' : 'default'} loading={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
