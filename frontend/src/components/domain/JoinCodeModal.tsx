import { useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/**
 * Shown ONCE immediately after team creation. The backend stores only an Argon2
 * hash of the join code, so it can never be displayed again.
 * The component is deliberately non-dismissible until acknowledged.
 */
export function JoinCodeModal({
  open,
  joinCode,
  teamName,
  onClose,
}: {
  open: boolean;
  joinCode: string;
  teamName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save this join code now"
      description={`${teamName} was created with a one-time join code.`}
      maxWidth="max-w-md"
      dismissible={false}
      footer={
        <Button onClick={onClose} block>
          I have saved the code
        </Button>
      }
    >
      <Alert tone="warning" title="This code cannot be retrieved again">
        The server keeps only a hash of the join code. If you lose it, you cannot share it with new
        teammates — you would have to invite them by email instead.
      </Alert>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
        <code className="font-mono text-lg font-bold tracking-[0.25em] text-ink">{joinCode}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          icon={copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <p className="flex items-start gap-2 text-[11px] text-muted">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Share it privately. Anyone with this code who is registered for the event can join while
        the team has free slots.
      </p>
    </Modal>
  );
}
