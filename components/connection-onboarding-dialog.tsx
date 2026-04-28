"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

const DISMISS_KEY = "hfsm-onboarding-dismissed";

type ConnectionOnboardingDialogProps = {
  open: boolean;
  dismissStorageKey?: string | null;
  onClose?: () => void;
  eyebrow?: string;
  title?: string;
  description?: string;
  dismissLabel?: string;
};

export function ConnectionOnboardingDialog({
  open,
  dismissStorageKey = DISMISS_KEY,
  onClose,
  eyebrow = "first setup",
  title = "Add your first connection",
  description = "Set a label and a Hugging Face token to start monitoring Spaces.",
  dismissLabel = "Later",
}: ConnectionOnboardingDialogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [, startVisibilityTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      startVisibilityTransition(() => {
        setIsVisible(false);
      });
      return;
    }

    if (!dismissStorageKey) {
      startVisibilityTransition(() => {
        setIsVisible(true);
      });
      return;
    }

    const dismissed = window.localStorage.getItem(dismissStorageKey) === "1";
    startVisibilityTransition(() => {
      setIsVisible(!dismissed);
    });
  }, [dismissStorageKey, open]);

  function dismiss() {
    if (dismissStorageKey) {
      window.localStorage.setItem(dismissStorageKey, "1");
    }
    setIsVisible(false);
    onClose?.();
  }

  async function addConnection(formData: FormData) {
    setError(null);

    const response = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: formData.get("label"),
        token: formData.get("token"),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Failed to create connection." }));
      setError(body.error ?? "Failed to create connection.");
      return;
    }

    if (dismissStorageKey) {
      window.localStorage.removeItem(dismissStorageKey);
    }
    setIsVisible(false);
    onClose?.();
    startTransition(() => {
      router.refresh();
      if (pathname !== "/connections") {
        router.push("/connections");
      }
    });
  }

  if (!open || !isVisible) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-card stack-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-onboarding-title"
      >
        <div className="panel-header">
          <div className="stack-xs">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id="connection-onboarding-title">{title}</h2>
            {description ? <p className="muted">{description}</p> : null}
          </div>
          <button className="button button-ghost" type="button" onClick={dismiss}>
            {dismissLabel}
          </button>
        </div>

        <form action={addConnection} className="stack-md">
          <div className="modal-form-fields">
            <label className="field">
              <span>Label</span>
              <input name="label" required placeholder="main-account" autoFocus />
            </label>
            <label className="field">
              <span>HF Token</span>
              <input name="token" type="password" required placeholder="hf_..." />
            </label>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="modal-actions">
            <p className="muted">The token is validated before it is stored.</p>
            <button className="button" type="submit" disabled={isPending}>
              Save connection
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}