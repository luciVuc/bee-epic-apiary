import { useState, useEffect } from "react";
import {
  Save,
  Store,
  Key,
  Globe,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  Image,
  Star,
} from "lucide-react";
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

  const updateProcessStep = (
    index: number,
    field: keyof IProcessStep,
    value: any,
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

  const updateTestimonial = (
    index: number,
    field: keyof ITestimonial,
    value: any,
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
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6">
        <h2 className="font-heading text-3xl font-bold text-dark-900">
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
              {/* ==================== SITE CONTENT TAB ==================== */}
              {activeTab === "site" && (
                <div className="space-y-8">
                  {/* Business Info */}
                  <Section
                    title="Business Info"
                    icon={<Store className="w-4 h-4" />}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TextField
                        label="Business Name"
                        value={siteContent.businessName}
                        onChange={(v) => updateSite("businessName", v)}
                      />
                      <TextField
                        label="Tagline"
                        value={siteContent.tagline}
                        onChange={(v) => updateSite("tagline", v)}
                      />
                      <TextField
                        label="Email"
                        value={siteContent.email}
                        onChange={(v) => updateSite("email", v)}
                      />
                      <TextField
                        label="Phone"
                        value={siteContent.phone}
                        onChange={(v) => updateSite("phone", v)}
                      />
                      <TextField
                        label="Location"
                        value={siteContent.location}
                        onChange={(v) => updateSite("location", v)}
                      />
                    </div>
                  </Section>

                  {/* Hero */}
                  <Section title="Hero Section">
                    <div className="space-y-4">
                      <TextField
                        label="Hero Headline"
                        value={siteContent.heroHeadline}
                        onChange={(v) => updateSite("heroHeadline", v)}
                      />
                      <TextAreaField
                        label="Hero Subheadline"
                        value={siteContent.heroSubheadline}
                        onChange={(v) => updateSite("heroSubheadline", v)}
                      />
                    </div>
                  </Section>

                  {/* About */}
                  <Section title="About Section">
                    <TextField
                      label="About Title"
                      value={siteContent.aboutTitle}
                      onChange={(v) => updateSite("aboutTitle", v)}
                    />
                    <div className="mt-4 space-y-3">
                      <label className="block text-sm font-medium text-dark-700">
                        About Paragraphs
                      </label>
                      {siteContent.aboutText.map((paragraph, i) => (
                        <div key={i} className="flex gap-2">
                          <TextAreaField
                            name={`about-paragraph-${i}`}
                            label={`Paragraph ${i + 1}`}
                            value={paragraph}
                            onChange={(v) => updateAboutParagraph(i, v)}
                            hideLabel
                          />
                          <button
                            onClick={() => removeAboutParagraph(i)}
                            aria-label={`Remove paragraph ${i + 1}`}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0 self-start mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addAboutParagraph}
                        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                      >
                        <Plus className="w-4 h-4" /> Add Paragraph
                      </button>
                    </div>
                  </Section>

                  {/* Section Titles */}
                  <Section title="Section Titles">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TextField
                        label="Process Title"
                        value={siteContent.processTitle}
                        onChange={(v) => updateSite("processTitle", v)}
                      />
                      <TextField
                        label="Process Subtitle"
                        value={siteContent.processSubtitle}
                        onChange={(v) => updateSite("processSubtitle", v)}
                      />
                      <TextField
                        label="Products Title"
                        value={siteContent.productsTitle}
                        onChange={(v) => updateSite("productsTitle", v)}
                      />
                      <TextField
                        label="Products Subtitle"
                        value={siteContent.productsSubtitle}
                        onChange={(v) => updateSite("productsSubtitle", v)}
                      />
                      <TextField
                        label="Testimonials Title"
                        value={siteContent.testimonialsTitle}
                        onChange={(v) => updateSite("testimonialsTitle", v)}
                      />
                      <TextField
                        label="Testimonials Subtitle"
                        value={siteContent.testimonialsSubtitle}
                        onChange={(v) => updateSite("testimonialsSubtitle", v)}
                      />
                      <TextField
                        label="Contact Title"
                        value={siteContent.contactTitle}
                        onChange={(v) => updateSite("contactTitle", v)}
                      />
                      <TextField
                        label="Contact Subtitle"
                        value={siteContent.contactSubtitle}
                        onChange={(v) => updateSite("contactSubtitle", v)}
                      />
                    </div>
                  </Section>

                  {/* Stats */}
                  <Section title="Stats Bar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TextField
                        label="Years Experience"
                        value={siteContent.yearsExperience}
                        onChange={(v) => updateSite("yearsExperience", v)}
                      />
                      <TextField
                        label="Years Experience Label"
                        value={siteContent.yearsExperienceLabel}
                        onChange={(v) => updateSite("yearsExperienceLabel", v)}
                      />
                      <TextField
                        label="Raw Natural"
                        value={siteContent.rawNatural}
                        onChange={(v) => updateSite("rawNatural", v)}
                      />
                      <TextField
                        label="Raw Natural Label"
                        value={siteContent.rawNaturalLabel}
                        onChange={(v) => updateSite("rawNaturalLabel", v)}
                      />
                      <TextField
                        label="California Proud"
                        value={siteContent.californiaProud}
                        onChange={(v) => updateSite("californiaProud", v)}
                      />
                      <TextField
                        label="California Proud Label"
                        value={siteContent.californiaProudLabel}
                        onChange={(v) => updateSite("californiaProudLabel", v)}
                      />
                      <TextField
                        label="Since Year"
                        value={siteContent.sinceYear}
                        onChange={(v) => updateSite("sinceYear", v)}
                      />
                      <TextField
                        label="Since Year Label"
                        value={siteContent.sinceYearLabel}
                        onChange={(v) => updateSite("sinceYearLabel", v)}
                      />
                    </div>
                  </Section>

                  {/* Navigation Links */}
                  <Section title="Navigation Links">
                    <div className="space-y-3">
                      {siteContent.navLinks.map((link, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <TextField
                              label="ID"
                              value={link.id}
                              onChange={(v) => updateNavLink(i, "id", v)}
                            />
                            <TextField
                              label="Label"
                              value={link.label}
                              onChange={(v) => updateNavLink(i, "label", v)}
                            />
                          </div>
                          <button
                            onClick={() => removeNavLink(i)}
                            aria-label={`Remove nav link ${i + 1}`}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0 self-start mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addNavLink}
                        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                      >
                        <Plus className="w-4 h-4" /> Add Nav Link
                      </button>
                    </div>
                  </Section>

                  {/* Social Links */}
                  <Section
                    title="Social Links"
                    icon={<Image className="w-4 h-4" />}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <TextField
                        label="Instagram URL"
                        value={siteContent.socialLinks.instagram}
                        onChange={(v) =>
                          updateSite("socialLinks", {
                            ...siteContent.socialLinks,
                            instagram: v,
                          })
                        }
                      />
                      <TextField
                        label="Facebook URL"
                        value={siteContent.socialLinks.facebook}
                        onChange={(v) =>
                          updateSite("socialLinks", {
                            ...siteContent.socialLinks,
                            facebook: v,
                          })
                        }
                      />
                      <TextField
                        label="Etsy URL"
                        value={siteContent.socialLinks.etsy}
                        onChange={(v) =>
                          updateSite("socialLinks", {
                            ...siteContent.socialLinks,
                            etsy: v,
                          })
                        }
                      />
                    </div>
                  </Section>

                  {/* Order Confirmation */}
                  <Section title="Order Confirmation">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TextField
                        label="Order Confirmed Title"
                        value={siteContent.orderConfirmed}
                        onChange={(v) => updateSite("orderConfirmed", v)}
                      />
                      <TextField
                        label="Order Confirmation Message"
                        value={siteContent.orderConfirmationMessage}
                        onChange={(v) =>
                          updateSite("orderConfirmationMessage", v)
                        }
                      />
                      <TextField
                        label="Questions Contact Text"
                        value={siteContent.questionsContact}
                        onChange={(v) => updateSite("questionsContact", v)}
                      />
                      <TextField
                        label="Continue Shopping Text"
                        value={siteContent.continueShopping}
                        onChange={(v) => updateSite("continueShopping", v)}
                      />
                    </div>
                  </Section>

                  {/* Misc */}
                  <Section title="Other">
                    <div className="space-y-4">
                      <TextField
                        label="No Products Found Message"
                        value={siteContent.noProductsFound}
                        onChange={(v) => updateSite("noProductsFound", v)}
                      />
                      <TextField
                        label="Footer Tagline"
                        value={siteContent.footerTagline}
                        onChange={(v) => updateSite("footerTagline", v)}
                      />
                    </div>
                  </Section>
                </div>
              )}

              {/* ==================== PROCESS TAB ==================== */}
              {activeTab === "process" && (
                <div className="space-y-4">
                  {processContent.map((step, i) => (
                    <div
                      key={step.id}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-dark-700">
                          Step {step.step}
                        </span>
                        <button
                          onClick={() => removeProcessStep(i)}
                          aria-label={`Remove process step ${i + 1}`}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextField
                          label="Title"
                          value={step.title}
                          onChange={(v) => updateProcessStep(i, "title", v)}
                        />
                        <TextField
                          label="Icon"
                          value={step.icon}
                          onChange={(v) => updateProcessStep(i, "icon", v)}
                        />
                      </div>
                      <div className="mt-4">
                        <TextAreaField
                          label="Description"
                          value={step.description}
                          onChange={(v) =>
                            updateProcessStep(i, "description", v)
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addProcessStep}
                    className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                  >
                    <Plus className="w-4 h-4" /> Add Step
                  </button>
                </div>
              )}

              {/* ==================== ADMIN CONFIG TAB ==================== */}
              {activeTab === "admin" && (
                <div className="space-y-6">
                  {adminError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                      <span className="text-red-700">{adminError}</span>
                    </div>
                  )}
                  {adminSaved && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                      <span className="text-green-700">
                        Admin settings saved successfully!
                      </span>
                    </div>
                  )}

                  <p className="text-sm text-dark-500">
                    These settings configure how the admin panel connects to the
                    API. Business information and site content are managed on
                    the Site Content tab and stored in the backend.
                  </p>

                  {/* API URL */}
                  <Section
                    title="API Configuration"
                    icon={<Globe className="w-4 h-4" />}
                  >
                    <TextField
                      label="API URL (Cloudflare Worker)"
                      value={adminSettings.apiUrl}
                      onChange={(v) => handleAdminChange("apiUrl", v)}
                      placeholder="https://your-worker.workers.dev"
                    />
                  </Section>

                  {/* Stripe Configuration */}
                  <Section
                    title="Stripe Configuration"
                    icon={<Key className="w-4 h-4" />}
                  >
                    <TextField
                      label="Publishable Key"
                      value={adminSettings.stripePublishableKey}
                      onChange={(v) =>
                        handleAdminChange("stripePublishableKey", v)
                      }
                      placeholder="pk_test_..."
                    />
                    <p className="mt-2 text-xs text-dark-400">
                      The Stripe secret key must be set as a Wrangler secret on
                      the Cloudflare Worker (not stored client-side).
                    </p>
                  </Section>

                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={handleAdminSave}
                      className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
                    >
                      <Save className="w-4 h-4" />
                      Save Admin Settings
                    </button>
                  </div>
                </div>
              )}

              {/* ==================== CATEGORIES TAB ==================== */}
              {activeTab === "categories" && (
                <div className="space-y-4">
                  <p className="text-sm text-dark-500 mb-4">
                    Define and manage product categories used across the store.
                  </p>
                  {categoriesContent.map((cat, i) => (
                    <div
                      key={i}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-dark-700">
                          Category {i + 1}
                        </span>
                        <button
                          onClick={() => removeCategoryItem(i)}
                          aria-label={`Remove category ${i + 1}`}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextField
                          label="ID (e.g. HONEY)"
                          value={cat.id}
                          onChange={(v) => updateCategoryItem(i, "id", v)}
                          placeholder="HONEY"
                        />
                        <TextField
                          label="Label (e.g. Honey)"
                          value={cat.label}
                          onChange={(v) => updateCategoryItem(i, "label", v)}
                          placeholder="Honey"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addCategoryItem}
                    className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                  >
                    <Plus className="w-4 h-4" /> Add Category
                  </button>
                </div>
              )}

              {/* ==================== TESTIMONIALS TAB ==================== */}
              {activeTab === "testimonials" && (
                <div className="space-y-4">
                  {testimonialsContent.map((testimonial, i) => (
                    <div
                      key={testimonial.id}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-dark-700">
                          Testimonial {i + 1}
                        </span>
                        <button
                          onClick={() => removeTestimonial(i)}
                          aria-label={`Remove testimonial ${i + 1}`}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <TextField
                          label="Name"
                          value={testimonial.name}
                          onChange={(v) => updateTestimonial(i, "name", v)}
                        />
                        <TextField
                          label="Location"
                          value={testimonial.location}
                          onChange={(v) => updateTestimonial(i, "location", v)}
                        />
                        <div>
                          <label className="block text-sm font-medium text-dark-700 mb-2">
                            Rating
                          </label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() =>
                                  updateTestimonial(i, "rating", star)
                                }
                                className={`p-1 rounded transition-colors ${star <= testimonial.rating ? "text-yellow-400" : "text-gray-300"}`}
                              >
                                <Star className="w-5 h-5 fill-current" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <TextAreaField
                          label="Text"
                          value={testimonial.text}
                          onChange={(v) => updateTestimonial(i, "text", v)}
                        />
                      </div>
                      <div className="mt-4">
                        <TextField
                          label="Date"
                          value={testimonial.date}
                          onChange={(v) => updateTestimonial(i, "date", v)}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addTestimonial}
                    className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                  >
                    <Plus className="w-4 h-4" /> Add Testimonial
                  </button>
                </div>
              )}

              {/* Save Content Button */}
              {activeTab !== "admin" && (
                <div className="mt-6 flex justify-end pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSaveContent}
                    disabled={isSaving}
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

// --- Reusable Form Fields ---

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  name?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-dark-700 mb-2"
      >
        {label}
      </label>
      <input
        type={type || "text"}
        value={value ?? ""}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  hideLabel,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hideLabel?: boolean;
  name?: string;
}) {
  return (
    <div className="w-full">
      {!hideLabel && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-dark-700 mb-2"
        >
          {label}
        </label>
      )}
      <textarea
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
      />
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2 text-dark-800">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
