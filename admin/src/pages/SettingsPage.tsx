/** Central settings page with tabbed interface for admin config, site content, process steps, testimonials, categories, users, and security */
import { useState, useEffect, useRef } from "react";
import { Save, AlertCircle, CheckCircle } from "lucide-react";
import {
  DEFAULT_SITE,
  DEFAULT_PROCESS,
  DEFAULT_TESTIMONIALS,
  DEFAULT_CATEGORIES,
} from "../utils/constants";
import type {
  ISiteContent,
  IProcessStep,
  ITestimonial,
  ICategory,
  SettingsTab,
} from "../types/settings";
import { EStaffRole } from "../types";
import { useCaller } from "../hooks/useCaller";
import * as api from "../utils/api";
import { apiErrorMessage } from "../utils/api";
import { AdminConfigTab } from "./settings/AdminConfigTab";
import { SiteContentTab } from "./settings/SiteContentTab";
import { ProcessTab } from "./settings/ProcessTab";
import { TestimonialsTab } from "./settings/TestimonialsTab";
import { CategoriesTab } from "./settings/CategoriesTab";
import { UsersTab } from "./settings/UsersTab";
import { SecurityTab } from "./settings/SecurityTab";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }
  return false;
}

type ContentStatus = "idle" | "loading" | "saving" | "error" | "success";

/**
 * Tabbed settings hub. Owns the draft state for the four KV-backed content
 * sections (site, process, testimonials, categories) plus all the add/update/
 * remove helpers passed down to the presentational tabs, and gates the Save
 * button per tab via a `deepEqual` dirty check against the last-loaded snapshot
 * held in `initialContentRef`. The Users and Security tabs are OWNER-only and
 * self-manage their own data, so they render no Save button here.
 */
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("admin");
  const { caller } = useCaller();
  const isOwner = caller?.role === EStaffRole.OWNER;

  const [siteContent, setSiteContent] = useState<ISiteContent>(DEFAULT_SITE);
  const [processContent, setProcessContent] =
    useState<IProcessStep[]>(DEFAULT_PROCESS);
  const [testimonialsContent, setTestimonialsContent] =
    useState<ITestimonial[]>(DEFAULT_TESTIMONIALS);
  const [categoriesContent, setCategoriesContent] =
    useState<ICategory[]>(DEFAULT_CATEGORIES);

  const [contentStatus, setContentStatus] = useState<ContentStatus>("idle");
  const [contentError, setContentError] = useState("");

  const initialContentRef = useRef({
    site: DEFAULT_SITE,
    process: DEFAULT_PROCESS,
    testimonials: DEFAULT_TESTIMONIALS,
    categories: DEFAULT_CATEGORIES,
  });

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
      if (site) {
        const merged = { ...DEFAULT_SITE, ...site };
        setSiteContent(merged);
        initialContentRef.current = {
          ...initialContentRef.current,
          site: merged,
        };
      }
      if (process) {
        setProcessContent(process);
        initialContentRef.current = { ...initialContentRef.current, process };
      }
      if (testimonials) {
        setTestimonialsContent(testimonials);
        initialContentRef.current = {
          ...initialContentRef.current,
          testimonials,
        };
      }
      if (categories && categories.length > 0) {
        setCategoriesContent(categories);
        initialContentRef.current = {
          ...initialContentRef.current,
          categories,
        };
      }
      setContentStatus("idle");
    } catch {
      setContentStatus("idle");
    }
  };

  useEffect(() => {
    void loadContent().catch(console.error);
  }, []);

  const handleSaveSetting = async (type: string) => {
    setContentStatus("saving");
    setContentError("");
    try {
      switch (type) {
        case "site":
          await api.api.saveSettings("site", siteContent);
          initialContentRef.current = {
            ...initialContentRef.current,
            site: JSON.parse(JSON.stringify(siteContent)),
          };
          break;
        case "process":
          await api.api.saveSettings("process", processContent);
          initialContentRef.current = {
            ...initialContentRef.current,
            process: JSON.parse(JSON.stringify(processContent)),
          };
          break;
        case "testimonials":
          await api.api.saveSettings("testimonials", testimonialsContent);
          initialContentRef.current = {
            ...initialContentRef.current,
            testimonials: JSON.parse(JSON.stringify(testimonialsContent)),
          };
          break;
        case "categories":
          if (categoriesContent.length > 0) {
            await api.api.saveSettings("categories", categoriesContent);
            initialContentRef.current = {
              ...initialContentRef.current,
              categories: JSON.parse(JSON.stringify(categoriesContent)),
            };
          }
          break;
      }
      setContentStatus("success");
      setTimeout(() => setContentStatus("idle"), 3000);
    } catch (err: unknown) {
      setContentError(apiErrorMessage(err, "Failed to save content"));
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

  const addAboutImage = () => {
    setSiteContent((prev) => ({
      ...prev,
      aboutImages: [...prev.aboutImages, ""],
    }));
  };

  const updateAboutImage = (index: number, value: string) => {
    setSiteContent((prev) => {
      const updated = [...prev.aboutImages];
      updated[index] = value;
      return { ...prev, aboutImages: updated };
    });
  };

  const removeAboutImage = (index: number) => {
    setSiteContent((prev) => ({
      ...prev,
      aboutImages: prev.aboutImages.filter((_, i) => i !== index),
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
      <div
        data-testid="settings-page_header"
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 dark:bg-dark-950 dark:border-gray-700"
      >
        <h2
          className="font-heading text-3xl font-bold text-dark-900"
          data-testid="settings-page_title"
        >
          Settings
        </h2>
      </div>

      {/* Content Status Messages */}
      {contentError && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
        >
          <AlertCircle
            className="w-5 h-5 text-red-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-red-700 dark:text-red-300">{contentError}</span>
        </div>
      )}
      {contentStatus === "success" && (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 dark:bg-green-900/20 dark:border-green-800/30"
        >
          <CheckCircle
            className="w-5 h-5 text-green-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-green-700 dark:text-green-300">
            Content saved successfully!
          </span>
        </div>
      )}

      {/* Content Tabs */}
      <div
        data-testid="settings-page_tabs"
        className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 dark:bg-dark-950 dark:border-gray-700"
      >
        <div
          data-testid="settings-page_tab-content"
          className="border-b border-gray-200 dark:border-gray-700"
        >
          <nav
            data-testid="settings-page_tab-nav"
            className="flex -mb-px overflow-x-auto scrollbar-hide"
          >
            {(
              [
                "admin",
                "site",
                "process",
                "testimonials",
                "categories",
                ...(isOwner ? (["users", "security"] as const) : []),
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                data-testid={`settings-page_tab-${tab}`}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex-shrink-0 whitespace-nowrap ${
                  activeTab === tab
                    ? "border-primary-500 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-dark-500 hover:text-dark-700 hover:border-dark-300 dark:text-dark-400 dark:hover:text-dark-200 dark:hover:border-dark-600"
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
                        : tab === "categories"
                          ? "Categories"
                          : tab === "users"
                            ? "Users"
                            : "Security"}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {contentStatus === "loading" ? (
            <div
              className="flex items-center justify-center h-32"
              role="status"
              aria-live="polite"
            >
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 dark:border-primary-400"></div>
              <span className="sr-only">Loading settings...</span>
            </div>
          ) : (
            <>
              {activeTab === "site" && (
                <>
                  <SiteContentTab
                    siteContent={siteContent}
                    updateSite={updateSite}
                    addAboutParagraph={addAboutParagraph}
                    updateAboutParagraph={updateAboutParagraph}
                    removeAboutParagraph={removeAboutParagraph}
                    addAboutImage={addAboutImage}
                    updateAboutImage={updateAboutImage}
                    removeAboutImage={removeAboutImage}
                    addNavLink={addNavLink}
                    updateNavLink={updateNavLink}
                    removeNavLink={removeNavLink}
                  />
                  <div className="mt-6 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleSaveSetting("site")}
                      disabled={
                        isSaving ||
                        deepEqual(siteContent, initialContentRef.current.site)
                      }
                      data-testid="settings-page_save-site-btn"
                      className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {isSaving ? "Saving..." : "Save Site Content"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "process" && (
                <>
                  <ProcessTab
                    processContent={processContent}
                    addProcessStep={addProcessStep}
                    updateProcessStep={updateProcessStep}
                    removeProcessStep={removeProcessStep}
                  />
                  <div className="mt-6 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleSaveSetting("process")}
                      disabled={
                        isSaving ||
                        deepEqual(
                          processContent,
                          initialContentRef.current.process,
                        )
                      }
                      data-testid="settings-page_save-process-btn"
                      className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {isSaving ? "Saving..." : "Save Process Steps"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "admin" && (
                <>
                  <AdminConfigTab
                    siteContent={siteContent}
                    onSiteChange={updateSite}
                  />
                  <div className="mt-6 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleSaveSetting("site")}
                      disabled={
                        isSaving ||
                        deepEqual(siteContent, initialContentRef.current.site)
                      }
                      data-testid="settings-page_save-admin-config-btn"
                      className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {isSaving ? "Saving..." : "Save Admin Config"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "categories" && (
                <>
                  <CategoriesTab
                    categoriesContent={categoriesContent}
                    addCategoryItem={addCategoryItem}
                    updateCategoryItem={updateCategoryItem}
                    removeCategoryItem={removeCategoryItem}
                  />
                  <div className="mt-6 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleSaveSetting("categories")}
                      disabled={
                        isSaving ||
                        deepEqual(
                          categoriesContent,
                          initialContentRef.current.categories,
                        )
                      }
                      data-testid="settings-page_save-categories-btn"
                      className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {isSaving ? "Saving..." : "Save Categories"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "testimonials" && (
                <>
                  <TestimonialsTab
                    testimonialsContent={testimonialsContent}
                    addTestimonial={addTestimonial}
                    updateTestimonial={updateTestimonial}
                    removeTestimonial={removeTestimonial}
                  />
                  <div className="mt-6 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleSaveSetting("testimonials")}
                      disabled={
                        isSaving ||
                        deepEqual(
                          testimonialsContent,
                          initialContentRef.current.testimonials,
                        )
                      }
                      data-testid="settings-page_save-testimonials-btn"
                      className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {isSaving ? "Saving..." : "Save Testimonials"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "users" && isOwner && <UsersTab />}
              {activeTab === "security" && isOwner && <SecurityTab />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
