import { Store, Image, Plus, Trash2 } from "lucide-react";
import type { ISiteContent } from "../../types/settings";
import { TextField, TextAreaField, Section } from "../../components/forms";

interface SiteContentTabProps {
  siteContent: ISiteContent;
  updateSite: <K extends keyof ISiteContent>(
    field: K,
    value: ISiteContent[K],
  ) => void;
  addAboutParagraph: () => void;
  updateAboutParagraph: (index: number, value: string) => void;
  removeAboutParagraph: (index: number) => void;
  addNavLink: () => void;
  updateNavLink: (index: number, field: "id" | "label", value: string) => void;
  removeNavLink: (index: number) => void;
}

export function SiteContentTab({
  siteContent,
  updateSite,
  addAboutParagraph,
  updateAboutParagraph,
  removeAboutParagraph,
  addNavLink,
  updateNavLink,
  removeNavLink,
}: SiteContentTabProps) {
  return (
    <div className="space-y-8">
      <Section title="Business Info" icon={<Store className="w-4 h-4" />}>
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

      <Section title="Social Links" icon={<Image className="w-4 h-4" />}>
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
              updateSite("socialLinks", { ...siteContent.socialLinks, etsy: v })
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
