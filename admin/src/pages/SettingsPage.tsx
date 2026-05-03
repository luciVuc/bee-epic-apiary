import { useState, useEffect } from "react";
import {
  Save,
  Store,
  Key,
  Globe,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { SETTINGS_STORAGE_KEY } from "../utils/constants";
import type { IAdminSettings } from "../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<IAdminSettings>({
    businessName: "",
    email: "",
    phone: "",
    location: "",
    stripePublishableKey: "",
    stripeSecretKey: "",
    apiUrl: "",
    allowedOrigins: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    } else {
      // Load defaults from web app's site.json if available
      setSettings((prev) => ({
        ...prev,
        businessName: "Bee Epic Apiary",
        email: "hello@beeepicapiary.com",
        phone: "(510) 555-APIARY",
        location: "Union City, California",
        apiUrl:
          (import.meta as any).env.VITE_API_URL || "http://localhost:8787",
        allowedOrigins:
          (import.meta as any).env.VITE_ALLOWED_ORIGINS ||
          "http://localhost:5173,http://localhost:5174",
      }));
    }
  }, []);

  const handleChange = (field: keyof IAdminSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    // Validate required fields
    if (!settings.businessName || !settings.apiUrl) {
      setError("Business Name and API URL are required");
      return;
    }

    // Validate URL format
    try {
      new URL(settings.apiUrl);
    } catch {
      setError("API URL must be a valid URL");
      return;
    }

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setError("");
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div>
      <h2 className="font-heading text-3xl font-bold text-dark-900 mb-6">
        Settings
      </h2>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {saved && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-green-700">Settings saved successfully!</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Business Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="font-heading text-xl font-semibold mb-4 flex items-center gap-2">
            <Store className="w-5 h-5 text-primary-500" />
            Business Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Business Name
              </label>
              <input
                type="text"
                value={settings.businessName}
                onChange={(e) => handleChange("businessName", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Phone
              </label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Location
              </label>
              <input
                type="text"
                value={settings.location}
                onChange={(e) => handleChange("location", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Stripe Configuration */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="font-heading text-xl font-semibold mb-4 flex items-center gap-2">
            <Key className="w-5 h-5 text-primary-500" />
            Stripe Configuration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Publishable Key
              </label>
              <input
                type="text"
                value={settings.stripePublishableKey}
                onChange={(e) =>
                  handleChange("stripePublishableKey", e.target.value)
                }
                placeholder="pk_test_..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Secret Key (for reference only)
              </label>
              <input
                type="password"
                value={settings.stripeSecretKey}
                onChange={(e) =>
                  handleChange("stripeSecretKey", e.target.value)
                }
                placeholder="sk_test_..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono text-sm"
              />
              <p className="mt-1 text-xs text-dark-400">
                Note: Secret key should be stored in Cloudflare Worker
                environment variables, not here.
              </p>
            </div>
          </div>
        </div>

        {/* API Configuration */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="font-heading text-xl font-semibold mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" />
            API Configuration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                API URL (Cloudflare Worker)
              </label>
              <input
                type="url"
                value={settings.apiUrl}
                onChange={(e) => handleChange("apiUrl", e.target.value)}
                placeholder="https://your-worker.your-subdomain.workers.dev"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Allowed Origins (CORS)
              </label>
              <input
                type="text"
                value={settings.allowedOrigins}
                onChange={(e) => handleChange("allowedOrigins", e.target.value)}
                placeholder="http://localhost:5173,https://example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              <p className="mt-1 text-xs text-dark-400">
                Comma-separated list of allowed origins for CORS.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
