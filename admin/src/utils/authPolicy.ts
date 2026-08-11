import type { IAuthPolicy } from "@bee-epic/shared";

/**
 * Single hint row for the client-side password policy UI. `ok` drives the
 * check/cross glyph; `label` is displayed verbatim.
 */
export type IAuthPolicyHint = { ok: boolean; label: string };

/**
 * Mirror of PASSWORD_DENYLIST in services/src/auth/policy/validatePassword.ts.
 * Keep in sync if the server's list changes. Case-insensitive — entries stored
 * lowercase.
 *
 * Duplicated (rather than imported) because `services/` is worker-only and
 * `shared/` doesn't currently export denylists. A future refactor could hoist
 * this into `shared/`; it is out of scope for Task 10.14.
 */
const DENYLIST: ReadonlySet<string> = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "letmein",
  "welcome",
  "welcome1",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
]);

/** Default minLength used when no policy has been fetched yet. Matches
 * `DEFAULT_AUTH_POLICY.minLength` on the server so the pre-policy hint isn't
 * misleadingly lax. */
const DEFAULT_MIN_LENGTH = 12;

/**
 * Pure client-side evaluation of the visible password-policy hints. No
 * network, no store access, no time-dependence — safe to call on every
 * keystroke. The server remains the source of truth: this only surfaces
 * obvious failures so the user can fix them before hitting submit.
 *
 * Order is stable so tests and screen readers can rely on it:
 *   [0] length hint
 *   [1] denylist hint
 *   [2] breach-corpus hint  (only when policy.checkBreachCorpus === true)
 *
 * The breach-corpus hint is informational: the client cannot check HIBP
 * itself (SHA-1 + external fetch), so `ok` is always true when shown — the
 * label just tells the user the server will do it on submit.
 *
 * Empty password intentionally fails the denylist hint too: "nothing typed"
 * is not "safe", and rendering a green checkmark for an empty field would be
 * misleading.
 */
export function evaluate(
  password: string,
  policy: IAuthPolicy | null,
): IAuthPolicyHint[] {
  const minLength = policy?.minLength ?? DEFAULT_MIN_LENGTH;

  const hints: IAuthPolicyHint[] = [
    {
      ok: password.length >= minLength,
      label: `At least ${minLength} characters`,
    },
    {
      ok: password.length > 0 && !DENYLIST.has(password.toLowerCase()),
      label: "Not a commonly-used password",
    },
  ];

  if (policy?.checkBreachCorpus === true) {
    hints.push({
      ok: true,
      label: "Server will check against breach corpus on submit",
    });
  }

  return hints;
}
