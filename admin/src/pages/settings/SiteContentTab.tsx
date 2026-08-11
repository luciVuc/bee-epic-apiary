/** Tab for editing site-wide content: business info, hero, about, nav links, social links, order confirmation */
import { Store, Image, Plus, Trash2, Bell } from "lucide-react";
import type { ISiteContent } from "../../types/settings";
import { TextField, TextAreaField, Section } from "../../components/forms";

/** Props for {@link SiteContentTab}; all mutations are owned by the parent. */
export interface ISiteContentTabProps {
  /** Current site-content draft being edited. */
  siteContent: ISiteContent;
  /** Update a single scalar/object field of the site content. */
  updateSite: <K extends keyof ISiteContent>(
    field: K,
    value: ISiteContent[K],
  ) => void;
  /** Append a blank About paragraph. */
  addAboutParagraph: () => void;
  /** Update the About paragraph at `index`. */
  updateAboutParagraph: (index: number, value: string) => void;
  /** Remove the About paragraph at `index`. */
  removeAboutParagraph: (index: number) => void;
  /** Append a blank About image URL. */
  addAboutImage: () => void;
  /** Update the About image URL at `index`. */
  updateAboutImage: (index: number, value: string) => void;
  /** Remove the About image at `index`. */
  removeAboutImage: (index: number) => void;
  /** Append a blank navigation link. */
  addNavLink: () => void;
  /** Update the `id` or `label` of the nav link at `index`. */
  updateNavLink: (index: number, field: "id" | "label", value: string) => void;
  /** Remove the nav link at `index`. */
  removeNavLink: (index: number) => void;
}

/**
 * The largest settings tab: edits the storefront's public content — business
 * info, hero/about copy, section titles, stats bar, nav + social links, and
 * order-confirmation strings. Presentational only; every mutation is delegated
 * to the parent so the draft/save lifecycle stays on SettingsPage.
 */
export function SiteContentTab({
  siteContent,
  updateSite,
  addAboutParagraph,
  updateAboutParagraph,
  removeAboutParagraph,
  addAboutImage,
  updateAboutImage,
  removeAboutImage,
  addNavLink,
  updateNavLink,
  removeNavLink,
}: ISiteContentTabProps) {
  return (
    <div className="space-y-8" data-testid="site-content-tab">
      <Section
        title="Business Info"
        icon={<Store className="w-4 h-4" aria-hidden="true" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Business Name"
            value={siteContent.businessName}
            onChange={(v) => updateSite("businessName", v)}
          />
          <TextField
            label="Logo URL"
            value={siteContent.logo}
            onChange={(v) => updateSite("logo", v)}
            placeholder="https://example.com/logo.png"
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
          <TextField
            label="Latitude"
            type="number"
            value={String(siteContent.lat ?? "")}
            onChange={(v) => updateSite("lat", v ? Number(v) : undefined)}
            placeholder="e.g. 38.4405"
          />
          <TextField
            label="Longitude"
            type="number"
            value={String(siteContent.lng ?? "")}
            onChange={(v) => updateSite("lng", v ? Number(v) : undefined)}
            placeholder="e.g. -122.7144"
          />
        </div>
      </Section>

      <Section
        title="Admin Notifications"
        icon={<Bell className="w-4 h-4" aria-hidden="true" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Replay window (hours)"
            type="number"
            value={String(siteContent.notificationReplayHours ?? 1)}
            onChange={(v) => {
              const parsed = v === "" ? undefined : Number(v);
              if (parsed === undefined) {
                updateSite("notificationReplayHours", undefined);
                return;
              }
              if (!Number.isFinite(parsed)) return;
              const clamped = Math.min(24, Math.max(1, Math.trunc(parsed)));
              updateSite("notificationReplayHours", clamped);
            }}
            placeholder="1"
          />
        </div>
        <p
          className="mt-2 text-sm text-dark-500"
          data-testid="site-content-tab_replay-help"
        >
          How long the admin notification stream keeps undelivered events
          available for replay after the browser reconnects. 1&ndash;24 hours;
          defaults to 1.
        </p>
      </Section>

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
                title={`Remove paragraph ${i + 1}`}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0 self-start mt-1 dark:hover:bg-red-900/30"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            onClick={addAboutParagraph}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add Paragraph
          </button>
        </div>
        <div className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-dark-700">
            About Images (URLs)
          </label>
          {siteContent.aboutImages.map((image, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1">
                <TextField
                  name={`about-image-${i}`}
                  label={`Image URL ${i + 1}`}
                  value={image}
                  onChange={(v) => updateAboutImage(i, v)}
                />
              </div>
              <button
                onClick={() => removeAboutImage(i)}
                aria-label={`Remove image ${i + 1}`}
                title={`Remove image ${i + 1}`}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0 self-start mt-1 dark:hover:bg-red-900/30"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            onClick={addAboutImage}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add Image
          </button>
        </div>
      </Section>

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
                title={`Remove nav link ${i + 1}`}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0 self-start mt-1 dark:hover:bg-red-900/30"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            onClick={addNavLink}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add Nav Link
          </button>
        </div>
      </Section>

      <Section
        title="Social Links"
        icon={<Image className="w-4 h-4" aria-hidden="true" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField
            label="Instagram URL"
            value={siteContent.socialLinks.instagram as string}
            onChange={(v) =>
              updateSite("socialLinks", {
                ...siteContent.socialLinks,
                instagram: v,
              })
            }
          />
          <TextField
            label="Facebook URL"
            value={siteContent.socialLinks.facebook as string}
            onChange={(v) =>
              updateSite("socialLinks", {
                ...siteContent.socialLinks,
                facebook: v,
              })
            }
          />
          <TextField
            label="Etsy URL"
            value={siteContent.socialLinks.etsy as string}
            onChange={(v) =>
              updateSite("socialLinks", { ...siteContent.socialLinks, etsy: v })
            }
          />
          <TextField
            label="Twitter URL"
            value={siteContent.socialLinks.twitter as string}
            onChange={(v) =>
              updateSite("socialLinks", {
                ...siteContent.socialLinks,
                twitter: v,
              })
            }
          />
          <TextField
            label="YouTube URL"
            value={siteContent.socialLinks.youtube as string}
            onChange={(v) =>
              updateSite("socialLinks", {
                ...siteContent.socialLinks,
                youtube: v,
              })
            }
          />
        </div>
      </Section>

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
            onChange={(v) => updateSite("orderConfirmationMessage", v)}
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
  );
}
