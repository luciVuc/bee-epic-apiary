/** Tab for viewing build-time configuration and editing KV-backed settings */
import { Globe, Key, Store, Send, Mail } from "lucide-react";
import { TextField, SelectField, Section } from "../../components/forms";
import { DEFAULT_API_URL } from "../../utils/constants";
import type { ISiteContent } from "../../types/settings";

export interface IAdminConfigTabProps {
  siteContent: ISiteContent;
  onSiteChange: <K extends keyof ISiteContent>(
    field: K,
    value: ISiteContent[K],
  ) => void;
}

export function AdminConfigTab({
  siteContent,
  onSiteChange,
}: IAdminConfigTabProps) {
  const hasSecretKey = Boolean(import.meta.env.VITE_API_SECRET_KEY);

  return (
    <div className="space-y-6" data-testid="admin-config-tab">
      <p className="text-sm text-dark-500">
        These settings are configured at build time via environment variables or
        stored in the backend KV store. Business information and site content
        are managed on the Site Content tab.
      </p>

      <Section title="API Configuration" icon={<Globe className="w-4 h-4" />}>
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

      <Section title="API Secret Key" icon={<Key className="w-4 h-4" />}>
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
          <div
            className={`w-2 h-2 rounded-full ${hasSecretKey ? "bg-green-500" : "bg-red-400"}`}
          />
          <span className="text-sm text-dark-700 dark:text-dark-300">
            {hasSecretKey
              ? "API secret key is configured"
              : "No API secret key configured"}
          </span>
        </div>
        <p className="mt-2 text-xs text-dark-400">
          Set via{" "}
          <code className="text-xs bg-gray-100 dark:bg-dark-200 px-1 rounded">
            VITE_API_SECRET_KEY
          </code>{" "}
          at build time. Required for mutating operations in production.
        </p>
      </Section>

      <Section
        title="Stripe Configuration"
        icon={<Store className="w-4 h-4" />}
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
        icon={<Send className="w-4 h-4" />}
      >
        <TextField
          label="Formspark Form ID"
          value={siteContent.formsparkFormId}
          onChange={(v) => onSiteChange("formsparkFormId", v)}
          placeholder="your-form-id"
        />
        <p className="mt-2 text-xs text-dark-400">
          When set, all email communications (contact form &amp; order
          notifications) route through Formspark instead of the Cloudflare Email
          Service. Leave blank to use the worker&apos;s built-in email service.
        </p>
      </Section>

      <Section title="Email Notifications" icon={<Mail className="w-4 h-4" />}>
        <SelectField
          label="Notification Email Format"
          value={siteContent.emailFormat}
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
