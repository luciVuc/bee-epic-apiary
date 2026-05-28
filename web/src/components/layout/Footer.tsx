import { Mail, Phone, MapPin } from "lucide-react";
import type { ISiteContent } from "../../types";

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

interface IFooterProps {
  content: ISiteContent;
}

export const Footer = ({ content }: IFooterProps) => {
  const currentYear = new Date().getFullYear();

  const navLinks = content.navLinks
    .filter((link) => link.id !== "process" && link.id !== "testimonials")
    .slice(1)
    .map((link) => ({
      label: link.label,
      href: `#${link.id}`,
    }));

  return (
    <footer data-testid="footer" className="bg-dark-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-2">
            <h3 className="font-heading text-2xl font-bold text-primary-400 mb-4">
              {content.businessName}
            </h3>
            <p className="font-body text-dark-300 mb-6 max-w-md">
              {content.tagline}
            </p>
            <div className="flex space-x-4">
              {content.socialLinks.instagram && (
                <a
                  href={content.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer_instagram-link"
                  className="p-2 bg-dark-800 rounded-lg hover:bg-primary-600 transition-colors duration-200"
                  aria-label="Instagram"
                  title="Instagram"
                >
                  <InstagramIcon className="w-5 h-5" />
                </a>
              )}
              {content.socialLinks.facebook && (
                <a
                  href={content.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer_facebook-link"
                  className="p-2 bg-dark-800 rounded-lg hover:bg-primary-600 transition-colors duration-200"
                  aria-label="Facebook"
                  title="Facebook"
                >
                  <FacebookIcon className="w-5 h-5" />
                </a>
              )}
              {content.socialLinks.etsy && (
                <a
                  href={content.socialLinks.etsy}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer_etsy-link"
                  className="p-2 bg-dark-800 rounded-lg hover:bg-primary-600 transition-colors duration-200"
                  aria-label="Etsy"
                  title="Etsy"
                >
                  <span className="text-sm font-bold">E</span>
                </a>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-heading text-lg font-semibold mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    data-testid={`footer_link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="font-body text-dark-300 hover:text-primary-400 transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-lg font-semibold mb-4">
              Contact Us
            </h4>
            <ul className="space-y-3">
              <li className="flex items-start space-x-3">
                <Mail
                  className="w-5 h-5 text-primary-400 mt-0.5"
                  aria-hidden="true"
                />
                <a
                  href={`mailto:${content.email}`}
                  data-testid="footer_email-link"
                  className="font-body text-dark-300 hover:text-primary-400 transition-colors duration-200"
                >
                  {content.email}
                </a>
              </li>
              <li className="flex items-start space-x-3">
                <Phone
                  className="w-5 h-5 text-primary-400 mt-0.5"
                  aria-hidden="true"
                />
                <a
                  href={`tel:${content.phone}`}
                  data-testid="footer_phone-link"
                  className="font-body text-dark-300 hover:text-primary-400 transition-colors duration-200"
                >
                  {content.phone}
                </a>
              </li>
              <li className="flex items-start space-x-3">
                <MapPin
                  className="w-5 h-5 text-primary-400 mt-0.5"
                  aria-hidden="true"
                />
                <span className="font-body text-dark-300">
                  {content.location}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-dark-800">
          <p className="font-body text-center text-dark-400">
            © {currentYear} {content.businessName}. All rights reserved.
          </p>
          <p className="font-body text-center text-dark-500 mt-2">
            {content.footerTagline}
          </p>
        </div>
      </div>
    </footer>
  );
};
