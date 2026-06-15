/** Tab for configuring API connection, Stripe keys, and admin settings (persisted to localStorage) */
import {
  Store,
  Globe,
  Key,
  Save,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { TextField, Section } from "../../components/forms";
import type { IAdminSettings } from "../../types";

export interface IAdminConfigTabProps {
  adminSettings: IAdminSettings;
  adminSaved: boolean;
  adminError: string;
  onAdminChange: (field: keyof IAdminSettings, value: string) => void;
  onAdminSave: () => void;
  saveDisabled?: boolean;
}

export function AdminConfigTab({
  adminSettings,
  adminSaved,
  adminError,
  onAdminChange,
  onAdminSave,
  saveDisabled,
}: IAdminConfigTabProps) {
  return (
    <div className="space-y-6" data-testid="admin-config-tab">
      {adminError && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
        >
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-red-700 dark:text-red-300">{adminError}</span>
        </div>
      )}
      {adminSaved && (
        <div
          role="status"
          className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 dark:bg-green-900/20 dark:border-green-800/30"
        >
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <span className="text-green-700 dark:text-green-300">
            Admin settings saved successfully!
          </span>
        </div>
      )}

      <p className="text-sm text-dark-500">
        These settings configure API connections, third-party service keys, and
        other admin configuration. Business information and site content are
        managed on the Site Content tab and stored in the backend.
      </p>

      <Section title="API Configuration" icon={<Globe className="w-4 h-4" />}>
        <TextField
          label="API URL (Cloudflare Worker)"
          value={adminSettings.apiUrl}
          onChange={(v) => onAdminChange("apiUrl", v)}
          placeholder="https://your-worker.workers.dev"
        />
      </Section>

      <Section title="API Secret Key" icon={<Key className="w-4 h-4" />}>
        <TextField
          label="API Secret Key"
          value={adminSettings.apiSecretKey || ""}
          onChange={(v) => onAdminChange("apiSecretKey", v)}
          placeholder="sk_live_..."
          type="password"
        />
        <p className="mt-2 text-xs text-dark-400">
          Stored in browser localStorage, never sent to the server. Used to
          authenticate API requests to the Cloudflare Worker.
        </p>
      </Section>

      <Section
        title="Stripe Configuration"
        icon={<Store className="w-4 h-4" />}
      >
        <TextField
          label="Publishable Key"
          value={adminSettings.stripePublishableKey}
          onChange={(v) => onAdminChange("stripePublishableKey", v)}
          placeholder="pk_test_..."
        />
        <p className="mt-2 text-xs text-dark-400">
          The Stripe secret key must be set as a Wrangler secret on the
          Cloudflare Worker (not stored client-side).
        </p>
      </Section>

      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onAdminSave}
          disabled={saveDisabled}
          data-testid="admin-config-tab_save-btn"
          className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          Save Admin Settings
        </button>
      </div>
    </div>
  );
}
