import { Link } from "react-router-dom";
import { Mail, Phone, MapPin } from "lucide-react";
import {
  SiFacebook,
  SiInstagram,
  SiEtsy,
  SiTwitter,
  SiYouTube,
} from "../icons/BrandIcons";
import type { ISiteContent } from "../../types";

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
      path: `/${link.id === "home" ? "" : link.id}`,
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
                  <SiInstagram className="w-5 h-5" />
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
                  <SiFacebook className="w-5 h-5" />
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
                  <SiEtsy className="w-5 h-5" />
                </a>
              )}
              {content.socialLinks.twitter && (
                <a
                  href={content.socialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer_twitter-link"
                  className="p-2 bg-dark-800 rounded-lg hover:bg-primary-600 transition-colors duration-200"
                  aria-label="Twitter"
                  title="Twitter"
                >
                  <SiTwitter className="w-5 h-5" />
                </a>
              )}
              {content.socialLinks.youtube && (
                <a
                  href={content.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer_youtube-link"
                  className="p-2 bg-dark-800 rounded-lg hover:bg-primary-600 transition-colors duration-200"
                  aria-label="YouTube"
                  title="YouTube"
                >
                  <SiYouTube className="w-5 h-5" />
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
                  <Link
                    to={link.path}
                    data-testid={`footer_link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="font-body text-dark-300 hover:text-primary-400 transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
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
