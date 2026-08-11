/** Tab for viewing build-time configuration and editing KV-backed settings */
import { Globe, Shield, Store, Send, Mail } from "lucide-react";
import { TextField, SelectField, Section } from "../../components/forms";
import { DEFAULT_API_URL } from "../../utils/constants";
import type { ISiteContent } from "../../types/settings";
import { useCaller } from "../../hooks/useCaller";

/** Props for {@link AdminConfigTab}. */
export interface IAdminConfigTabProps {
  /** Current site-content settings (the KV-backed, editable fields). */
  siteContent: ISiteContent;
  /** Updates a single site-content field on the parent's draft. */
  onSiteChange: <K extends keyof ISiteContent>(
    field: K,
    value: ISiteContent[K],
  ) => void;
}

/**
 * Settings tab surfacing build-time config (read-only API URL, live auth
 * status) alongside the KV-backed integration fields (Stripe key, Formspark
 * form id, email format). Business content lives on the Site Content tab; this
 * tab is deliberately the "plumbing" view.
 */
export function AdminConfigTab({
  siteContent,
  onSiteChange,
}: IAdminConfigTabProps) {
  const { caller } = useCaller();

  return (
    <div className="space-y-6" data-testid="admin-config-tab">
      <p className="text-sm text-dark-500">
        These settings are configured at build time via environment variables or
        stored in the backend KV store. Business information and site content
        are managed on the Site Content tab.
      </p>

      <Section
        title="API Configuration"
        icon={<Globe className="w-4 h-4" aria-hidden="true" />}
      >
        <TextField
          label="API URL (Cloudflare Worker)"
          value={DEFAULT_API_URL}
          onChange={() => {}}
          disabled
        />
        <p className="mt-2 text-xs text-dark-400">
          Set via{" "}
          <code className="text-xs bg-gray-100 dark:bg-dark-200 px-1 rounded">
            VITE_API_URL
          </code>{" "}
          at build time.
        </p>
      </Section>

      <Section
        title="Authentication"
        icon={<Shield className="w-4 h-4" aria-hidden="true" />}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${caller ? "bg-green-500" : "bg-yellow-400"}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-dark-700 dark:text-dark-300 truncate">
              {caller ? caller.email : "Not authenticated"}
            </p>
            {caller && (
              <p className="text-xs text-dark-400 mt-0.5">
                Role: <strong>{caller.role}</strong> · via {caller.via}
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-dark-400">
          Identity is verified via the bea_at cookie issued at login (HttpOnly,
          SameSite=Lax). User accounts and roles are managed on the Users tab
          (OWNER only). Password policy is managed on the Security tab (OWNER
          only).
        </p>
      </Section>

      <Section
        title="Stripe Configuration"
        icon={<Store className="w-4 h-4" aria-hidden="true" />}
      >
        <TextField
          label="Publishable Key"
          value={siteContent.stripePublishableKey}
          onChange={(v) => onSiteChange("stripePublishableKey", v)}
          placeholder="pk_test_..."
        />
        <p className="mt-2 text-xs text-dark-400">
          Stored in the backend KV store. The Stripe secret key must be set as a
          Wrangler secret on the Cloudflare Worker.
        </p>
      </Section>

      <Section
        title="Formspark Configuration"
        icon={<Send className="w-4 h-4" aria-hidden="true" />}
      >
        <TextField
          label="Formspark Form ID"
          value={siteContent.formsparkFormId ?? ""}
          onChange={(v) => onSiteChange("formsparkFormId", v)}
          placeholder="your-form-id"
        />
        <p className="mt-2 text-xs text-dark-400">
          When set, all email communications (contact form &amp; order
          notifications) route through Formspark instead of the Cloudflare Email
          Service. Leave blank to use the worker&apos;s built-in email service.
        </p>
      </Section>

      <Section
        title="Email Notifications"
        icon={<Mail className="w-4 h-4" aria-hidden="true" />}
      >
        <SelectField
          label="Notification Email Format"
          value={siteContent.emailFormat ?? "text"}
          onChange={(v) =>
            onSiteChange("emailFormat", v as "text" | "markdown" | "html")
          }
          options={[
            { value: "text", label: "Plain Text" },
            { value: "markdown", label: "Markdown" },
            { value: "html", label: "HTML" },
          ]}
        />
        <p className="mt-2 text-xs text-dark-400">
          Choose the format for order notification emails. HTML provides a rich
          email layout; Markdown sends lightweight formatted text; Plain Text
          sends a simple unformatted message.
        </p>
      </Section>
    </div>
  );
}
