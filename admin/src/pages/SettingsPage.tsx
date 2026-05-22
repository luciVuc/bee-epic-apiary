import { useState, useEffect } from "react";
import { Save, AlertCircle, CheckCircle } from "lucide-react";
import {
  SETTINGS_STORAGE_KEY,
  DEFAULT_SITE,
  DEFAULT_PROCESS,
  DEFAULT_TESTIMONIALS,
  DEFAULT_CATEGORIES,
} from "../utils/constants";
import type { IAdminSettings } from "../types";
import type {
  ISiteContent,
  IProcessStep,
  ITestimonial,
  ICategory,
  SettingsTab,
} from "../types/settings";
import * as api from "../utils/api";
import { AdminConfigTab } from "./settings/AdminConfigTab";
import { SiteContentTab } from "./settings/SiteContentTab";
import { ProcessTab } from "./settings/ProcessTab";
import { TestimonialsTab } from "./settings/TestimonialsTab";
import { CategoriesTab } from "./settings/CategoriesTab";

type ContentStatus = "idle" | "loading" | "saving" | "error" | "success";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("admin");

  const [siteContent, setSiteContent] = useState<ISiteContent>(DEFAULT_SITE);
  const [processContent, setProcessContent] =
    useState<IProcessStep[]>(DEFAULT_PROCESS);
  const [testimonialsContent, setTestimonialsContent] =
    useState<ITestimonial[]>(DEFAULT_TESTIMONIALS);
  const [categoriesContent, setCategoriesContent] =
    useState<ICategory[]>(DEFAULT_CATEGORIES);

  const [contentStatus, setContentStatus] = useState<ContentStatus>("idle");
  const [contentError, setContentError] = useState("");

  const [adminSettings, setAdminSettings] = useState<IAdminSettings>({
    apiUrl: "",
    stripePublishableKey: "",
    apiSecretKey: "",
  });
  const [adminSaved, setAdminSaved] = useState(false);
  const [adminError, setAdminError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setAdminSettings((prev) => ({ ...prev, ...parsed }));
    } else {
      setAdminSettings((prev) => ({
        ...prev,
        apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8787",
      }));
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    setContentStatus("loading");
    setContentError("");
    try {
      const [site, process, testimonials, categories] = await Promise.all([
        api.api.getSettings<ISiteContent>("site").catch(() => null),
        api.api.getSettings<IProcessStep[]>("process").catch(() => null),
        api.api.getSettings<ITestimonial[]>("testimonials").catch(() => null),
        api.api.getSettings<ICategory[]>("categories").catch(() => null),
      ]);
      if (site) setSiteContent({ ...DEFAULT_SITE, ...site });
      if (process) setProcessContent(process);
      if (testimonials) setTestimonialsContent(testimonials);
      if (categories && categories.length > 0) setCategoriesContent(categories);
      setContentStatus("idle");
    } catch {
      setContentStatus("idle");
    }
  };

  const handleAdminChange = (field: keyof IAdminSettings, value: string) => {
    setAdminSettings((prev) => ({ ...prev, [field]: value }));
    setAdminSaved(false);
  };

  const handleAdminSave = () => {
    if (!adminSettings.apiUrl) {
      setAdminError("API URL is required");
      return;
    }
    try {
      new URL(adminSettings.apiUrl);
    } catch {
      setAdminError("API URL must be a valid URL");
      return;
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(adminSettings));
    api.updateApiBaseUrl(adminSettings.apiUrl);
    setAdminSaved(true);
    setAdminError("");
    setTimeout(() => setAdminSaved(false), 3000);
  };

  const handleSaveContent = async () => {
    setContentStatus("saving");
    setContentError("");
    try {
      await api.api.saveSettings("site", siteContent);
      await api.api.saveSettings("process", processContent);
      await api.api.saveSettings("testimonials", testimonialsContent);
      if (categoriesContent.length > 0) {
        await api.api.saveSettings("categories", categoriesContent);
      }
      setContentStatus("success");
      setTimeout(() => setContentStatus("idle"), 3000);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setContentError(
        axiosErr?.response?.data?.error ||
          axiosErr?.message ||
          "Failed to save content",
      );
      setContentStatus("error");
    }
  };

  // --- Site Content Helpers ---
  const updateSite = <K extends keyof ISiteContent>(
    field: K,
    value: ISiteContent[K],
  ) => {
    setSiteContent((prev) => ({ ...prev, [field]: value }));
  };

  const addAboutParagraph = () => {
    setSiteContent((prev) => ({ ...prev, aboutText: [...prev.aboutText, ""] }));
  };

  const updateAboutParagraph = (index: number, value: string) => {
    setSiteContent((prev) => {
      const updated = [...prev.aboutText];
      updated[index] = value;
      return { ...prev, aboutText: updated };
    });
  };

  const removeAboutParagraph = (index: number) => {
    setSiteContent((prev) => ({
      ...prev,
      aboutText: prev.aboutText.filter((_, i) => i !== index),
    }));
  };

  const addNavLink = () => {
    setSiteContent((prev) => ({
      ...prev,
      navLinks: [...prev.navLinks, { id: "", label: "" }],
    }));
  };

  const updateNavLink = (
    index: number,
    field: "id" | "label",
    value: string,
  ) => {
    setSiteContent((prev) => {
      const updated = [...prev.navLinks];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, navLinks: updated };
    });
  };

  const removeNavLink = (index: number) => {
    setSiteContent((prev) => ({
      ...prev,
      navLinks: prev.navLinks.filter((_, i) => i !== index),
    }));
  };

  // --- Categories Tab Helpers ---
  const addCategoryItem = () => {
    setCategoriesContent((prev) => [...prev, { id: "", label: "" }]);
  };

  const updateCategoryItem = (
    index: number,
    field: keyof ICategory,
    value: string,
  ) => {
    setCategoriesContent((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeCategoryItem = (index: number) => {
    setCategoriesContent((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Process Helpers ---
  const addProcessStep = () => {
    const newId = `process-${Date.now()}`;
    setProcessContent((prev) => [
      ...prev,
      {
        id: newId,
        step: prev.length + 1,
        title: "",
        description: "",
        icon: "Circle",
      },
    ]);
  };

  const updateProcessStep = <K extends keyof IProcessStep>(
    index: number,
    field: K,
    value: IProcessStep[K],
  ) => {
    setProcessContent((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeProcessStep = (index: number) => {
    setProcessContent((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, step: i + 1 })),
    );
  };

  // --- Testimonials Helpers ---
  const addTestimonial = () => {
    const newId = `testimonial-${Date.now()}`;
    setTestimonialsContent((prev) => [
      ...prev,
      {
        id: newId,
        name: "",
        location: "",
        rating: 5,
        text: "",
        date: new Date().toISOString().split("T")[0],
      },
    ]);
  };

  const updateTestimonial = <K extends keyof ITestimonial>(
    index: number,
    field: K,
    value: ITestimonial[K],
  ) => {
    setTestimonialsContent((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeTestimonial = (index: number) => {
    setTestimonialsContent((prev) => prev.filter((_, i) => i !== index));
  };

  const isSaving = contentStatus === "saving";

  return (
    <div data-testid="settings-page">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6">
        <h2
          className="font-heading text-3xl font-bold text-dark-900"
          data-testid="settings-page_title"
        >
          Settings
        </h2>
      </div>

      {/* Content Status Messages */}
      {contentError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-red-700">{contentError}</span>
        </div>
      )}
      {contentStatus === "success" && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <span className="text-green-700">Content saved successfully!</span>
        </div>
      )}

      {/* Content Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {(
              [
                "admin",
                "site",
                "process",
                "testimonials",
                "categories",
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                data-testid={`settings-page_tab-${tab}`}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-dark-500 hover:text-dark-700 hover:border-dark-300"
                }`}
              >
                {tab === "admin"
                  ? "Admin Config"
                  : tab === "site"
                    ? "Site Content"
                    : tab === "process"
                      ? "Process"
                      : tab === "testimonials"
                        ? "Testimonials"
                        : "Categories"}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {contentStatus === "loading" ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : (
            <>
              {activeTab === "site" && (
                <SiteContentTab
                  siteContent={siteContent}
                  updateSite={updateSite}
                  addAboutParagraph={addAboutParagraph}
                  updateAboutParagraph={updateAboutParagraph}
                  removeAboutParagraph={removeAboutParagraph}
                  addNavLink={addNavLink}
                  updateNavLink={updateNavLink}
                  removeNavLink={removeNavLink}
                />
              )}

              {activeTab === "process" && (
                <ProcessTab
                  processContent={processContent}
                  addProcessStep={addProcessStep}
                  updateProcessStep={updateProcessStep}
                  removeProcessStep={removeProcessStep}
                />
              )}

              {activeTab === "admin" && (
                <AdminConfigTab
                  adminSettings={adminSettings}
                  adminSaved={adminSaved}
                  adminError={adminError}
                  onAdminChange={handleAdminChange}
                  onAdminSave={handleAdminSave}
                />
              )}

              {activeTab === "categories" && (
                <CategoriesTab
                  categoriesContent={categoriesContent}
                  addCategoryItem={addCategoryItem}
                  updateCategoryItem={updateCategoryItem}
                  removeCategoryItem={removeCategoryItem}
                />
              )}

              {activeTab === "testimonials" && (
                <TestimonialsTab
                  testimonialsContent={testimonialsContent}
                  addTestimonial={addTestimonial}
                  updateTestimonial={updateTestimonial}
                  removeTestimonial={removeTestimonial}
                />
              )}

              {/* Save Content Button */}
              {activeTab !== "admin" && (
                <div className="mt-6 flex justify-end pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSaveContent}
                    disabled={isSaving}
                    data-testid="settings-page_save-content-btn"
                    className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save Content"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
