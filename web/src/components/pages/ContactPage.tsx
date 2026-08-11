import { ContactSection } from "../sections/ContactSection";
import { SeoHead } from "../seo/SeoHead";
import type { ISiteContent } from "../../types";

interface IContactPageProps {
  content: ISiteContent;
}

/** `/contact` route: SEO head plus the contact form section. */
export function ContactPage({ content }: IContactPageProps) {
  return (
    <div data-testid="contact-page">
      <SeoHead
        title="Contact Us"
        description={`Get in touch with ${content.businessName}. Contact us for orders, wholesale inquiries, or questions about our products.`}
        canonicalPath="/contact"
        keywords="contact us, honey order, wholesale honey, customer service"
      />
      <ContactSection content={content} />
    </div>
  );
}
