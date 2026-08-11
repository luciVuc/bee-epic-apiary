/**
 * SecurityTab — OWNER-only interface for the /settings/auth-policy API (Phase 8.7).
 * Lets an OWNER view and update the password policy: minLength, checkBreachCorpus,
 * notifyOnPasswordChange. Read-only metadata row shows updatedBy + updatedAt.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertCircle, CheckCircle, Shield } from "lucide-react";
import type { IAuthPolicy } from "@bee-epic/shared";
import { AUTH_POLICY_MIN_LENGTH_FLOOR } from "@bee-epic/shared";
import { Section } from "../../components/forms";
import { api, apiErrorMessage, ApiError } from "../../utils/api";

/* ─── constants ──────────────────────────────────────────────────────── */

const AUTH_POLICY_MAX_LENGTH = 128;

/* ─── helpers ────────────────────────────────────────────────────────── */

function getApiCode(err: unknown): string | null {
  if (err instanceof ApiError) return err.apiError.code;
  return null;
}

/** Minimal editable subset of IAuthPolicy shown in the form. */
interface IPolicyDraft {
  minLength: number;
  checkBreachCorpus: boolean;
  notifyOnPasswordChange: boolean;
}

function draftFrom(p: IAuthPolicy): IPolicyDraft {
  return {
    minLength: p.minLength,
    checkBreachCorpus: p.checkBreachCorpus,
    notifyOnPasswordChange: p.notifyOnPasswordChange,
  };
}

function isDirty(a: IPolicyDraft, b: IPolicyDraft): boolean {
  return (
    a.minLength !== b.minLength ||
    a.checkBreachCorpus !== b.checkBreachCorpus ||
    a.notifyOnPasswordChange !== b.notifyOnPasswordChange
  );
}

function validateMinLength(v: number): string | null {
  if (!Number.isInteger(v) || v < AUTH_POLICY_MIN_LENGTH_FLOOR) {
    return `Minimum length cannot be below ${AUTH_POLICY_MIN_LENGTH_FLOOR} characters.`;
  }
  if (v > AUTH_POLICY_MAX_LENGTH) {
    return `Minimum length cannot exceed ${AUTH_POLICY_MAX_LENGTH} characters.`;
  }
  return null;
}

/* ─── SecurityTab ────────────────────────────────────────────────────── */

type FetchStatus = "idle" | "loading" | "error";

/**
 * OWNER-only editor for the password policy (`/settings/auth-policy`). Fetches
 * on mount, tracks a dirty draft against the loaded policy, and only enables
 * Save when the draft is both dirty and valid. `minLength` is validated
 * client-side against the shared floor/ceiling; the success banner auto-
 * dismisses after 4s (timer cleared on unmount).
 */
export function SecurityTab() {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [fetchError, setFetchError] = useState("");

  const [initial, setInitial] = useState<IAuthPolicy | null>(null);
  const [draft, setDraft] = useState<IPolicyDraft>({
    minLength: AUTH_POLICY_MIN_LENGTH_FLOOR,
    checkBreachCorpus: true,
    notifyOnPasswordChange: true,
  });
  const [minLengthRaw, setMinLengthRaw] = useState<string>(
    String(AUTH_POLICY_MIN_LENGTH_FLOOR),
  );
  const [minLengthError, setMinLengthError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Ref to track success-banner auto-dismiss timer for cleanup on unmount.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  /* ── fetching ─────────────────────────────────────────────────────── */

  const fetchPolicy = useCallback(async () => {
    setFetchStatus("loading");
    setFetchError("");
    try {
      const policy = await api.getAuthPolicy();
      setInitial(policy);
      const d = draftFrom(policy);
      setDraft(d);
      setMinLengthRaw(String(policy.minLength));
      setMinLengthError(null);
      setFetchStatus("idle");
    } catch (err) {
      setFetchError(
        apiErrorMessage(err, "Failed to load policy. Please try again."),
      );
      setFetchStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchPolicy();
  }, [fetchPolicy]);

  /* ── minLength input change ───────────────────────────────────────── */

  const handleMinLengthChange = (raw: string) => {
    setMinLengthRaw(raw);
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
      setMinLengthError(
        `Minimum length cannot be below ${AUTH_POLICY_MIN_LENGTH_FLOOR} characters.`,
      );
      // Leave draft.minLength as-is so dirtiness calc stays stable.
      return;
    }
    setMinLengthError(validateMinLength(parsed));
    setDraft((prev) => ({ ...prev, minLength: parsed }));
  };

  /* ── save ─────────────────────────────────────────────────────────── */

  const handleSave = async () => {
    if (!initial) return;
    const err = validateMinLength(draft.minLength);
    if (err) return; // defense in depth

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const nextPolicy: IAuthPolicy = {
      ...initial,
      minLength: draft.minLength,
      checkBreachCorpus: draft.checkBreachCorpus,
      notifyOnPasswordChange: draft.notifyOnPasswordChange,
    };

    try {
      const updated = await api.putAuthPolicy(nextPolicy);
      setInitial(updated);
      setDraft(draftFrom(updated));
      setMinLengthRaw(String(updated.minLength));
      setMinLengthError(null);
      setSaveSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      const code = getApiCode(err);
      if (code === "VALIDATION_FAILED") {
        setSaveError("Please check your inputs and try again.");
      } else {
        setSaveError(apiErrorMessage(err, "Failed to save policy."));
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── derived ──────────────────────────────────────────────────────── */

  const dirty = initial !== null && isDirty(draft, draftFrom(initial));
  const valid = minLengthError === null;
  const canSave = dirty && valid && !saving;

  /* ── render ───────────────────────────────────────────────────────── */

  if (fetchStatus === "loading") {
    return (
      <div
        className="flex items-center justify-center h-32"
        role="status"
        aria-live="polite"
        data-testid="security-tab_loading"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 dark:border-primary-400" />
        <span className="sr-only">Loading policy...</span>
      </div>
    );
  }

  if (fetchStatus === "error") {
    return (
      <div
        className="space-y-4"
        data-testid="security-tab_fetch-error"
        role="alert"
      >
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30">
          <AlertCircle
            className="w-5 h-5 text-red-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-red-700 dark:text-red-300">{fetchError}</span>
        </div>
        <button
          onClick={() => void fetchPolicy()}
          data-testid="security-tab_retry-btn"
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="security-tab">
      {/* Save error banner */}
      {saveError && (
        <div
          role="alert"
          data-testid="security-tab_save-error"
          className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
        >
          <AlertCircle
            className="w-5 h-5 text-red-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-red-700 dark:text-red-300">{saveError}</span>
        </div>
      )}

      {/* Save success banner */}
      {saveSuccess && (
        <div
          role="status"
          data-testid="security-tab_save-success"
          className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 dark:bg-green-900/20 dark:border-green-800/30"
        >
          <CheckCircle
            className="w-5 h-5 text-green-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-green-700 dark:text-green-300">
            Policy saved successfully.
          </span>
        </div>
      )}

      <Section
        title="Password Policy"
        icon={<Shield className="w-4 h-4" aria-hidden="true" />}
      >
        <div className="space-y-5">
          {/* minLength */}
          <div>
            <label
              htmlFor="security-tab_min-length"
              className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1"
            >
              Minimum password length
            </label>
            <input
              id="security-tab_min-length"
              type="number"
              min={AUTH_POLICY_MIN_LENGTH_FLOOR}
              max={AUTH_POLICY_MAX_LENGTH}
              value={minLengthRaw}
              onChange={(e) => handleMinLengthChange(e.target.value)}
              disabled={saving}
              data-testid="security-tab_min-length"
              aria-invalid={minLengthError !== null ? "true" : undefined}
              aria-describedby={
                minLengthError !== null
                  ? "security-tab_min-length-error"
                  : undefined
              }
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {minLengthError && (
              <p
                id="security-tab_min-length-error"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                data-testid="security-tab_min-length-error"
              >
                {minLengthError}
              </p>
            )}
          </div>

          {/* checkBreachCorpus */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.checkBreachCorpus}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  checkBreachCorpus: e.target.checked,
                }))
              }
              disabled={saving}
              data-testid="security-tab_check-breach-corpus"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-dark-700 dark:text-dark-300">
              Reject passwords found in known-breach corpora (HIBP). Fail-open
              on network error.
            </span>
          </label>

          {/* notifyOnPasswordChange */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.notifyOnPasswordChange}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  notifyOnPasswordChange: e.target.checked,
                }))
              }
              disabled={saving}
              data-testid="security-tab_notify-on-change"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-dark-700 dark:text-dark-300">
              Email the user when their password is changed.
            </span>
          </label>

          {/* Read-only metadata */}
          {initial && (
            <p
              className="text-xs text-dark-400"
              data-testid="security-tab_metadata"
            >
              {initial.updatedAt === 0
                ? "Never edited"
                : `Last updated by ${initial.updatedBy} on ${new Date(initial.updatedAt).toLocaleDateString()}`}
            </p>
          )}

          {/* Save button */}
          <div>
            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              data-testid="security-tab_save-btn"
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
