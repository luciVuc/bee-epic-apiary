import { ContactSection } from "../sections/ContactSection";
import type { ISiteContent } from "../../types";

interface IContactPageProps {
  content: ISiteContent;
}

export function ContactPage({ content }: IContactPageProps) {
  return (
    <div data-testid="contact-page">
      <ContactSection content={content} />
    </div>
  );
}
