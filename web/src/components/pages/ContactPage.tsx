import { ContactSection } from "../sections/ContactSection";
import type { ISiteContent } from "../../types";

interface IContactPageProps {
  content: ISiteContent;
}

export function ContactPage({ content }: IContactPageProps) {
  return <ContactSection content={content} />;
}
