import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Send, AlertCircle } from "lucide-react";
import { LocationMap } from "../ui/LocationMap";
import { SectionHeader } from "../ui/SectionHeader";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import type { ISiteContent } from "../../types";
import { formatPhoneNumber } from "../../utils/formatters";
import { submitContactForm } from "../../utils/api";

interface IContactSectionProps {
  content: ISiteContent;
}

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

type FormStatus = "idle" | "loading" | "success" | "error";

const subjectOptions = [
  { value: "general", label: "General Inquiry" },
  { value: "order", label: "Order Question" },
  { value: "wholesale", label: "Wholesale Inquiry" },
  { value: "other", label: "Other" },
];

/**
 * Contact section with a validated message form (name/email/subject/message)
 * plus a hidden honeypot field for spam protection. Submits via
 * {@link submitContactForm}, showing loading, success (swaps to a thank-you
 * view), and error states, alongside contact details and a {@link LocationMap}.
 */
export const ContactSection = ({ content }: IContactSectionProps) => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    subject: "general",
    message: "",
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  // Honeypot ref: querying the DOM directly (the previous approach) would
  // grab the FIRST `input[name="_gotcha"]` on the page, which is wrong as
  // soon as a second form coexists in a route or modal. A ref pins this to
  // the form's own hidden input.
  const gotchaRef = useRef<HTMLInputElement>(null);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setStatus("loading");
    setErrorMessage("");

    try {
      await submitContactForm({
        ...formData,
        _gotcha: gotchaRef.current?.value ?? "",
      });

      setStatus("success");
      setFormData({ name: "", email: "", subject: "general", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to send message. Please try again.",
      );
    }
  };

  if (status === "success") {
    return (
      <section
        id="contact"
        data-testid="contact-section"
        className="py-20 bg-white dark:bg-dark-950"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            title={content.contactTitle}
            subtitle={content.contactSubtitle}
          />

          <motion.div
            className="max-w-lg mx-auto text-center py-12"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Send
                className="w-8 h-8 text-green-600 dark:text-green-400"
                aria-hidden="true"
              />
            </div>
            <h3 className="font-heading text-2xl font-semibold text-dark-900 mb-4">
              Message Sent!
            </h3>
            <p className="font-body text-dark-600 mb-6">
              Thank you for reaching out. We'll get back to you as soon as
              possible.
            </p>
            <Button onClick={() => setStatus("idle")}>
              Send Another Message
            </Button>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="contact"
      data-testid="contact-section"
      className="py-20 bg-white dark:bg-dark-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader title={content.contactTitle} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block font-body text-sm font-medium text-dark-700 mb-2"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  data-testid="contact-section_input-name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  aria-required="true"
                  aria-invalid={status === "error"}
                  aria-describedby={
                    status === "error" ? "contact-section_error" : undefined
                  }
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-100 text-dark-900 dark:text-dark-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 outline-none transition-all font-body"
                  placeholder="Your name"
                  aria-label="Your name"
                  title="Enter your name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block font-body text-sm font-medium text-dark-700 mb-2"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  data-testid="contact-section_input-email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  aria-required="true"
                  aria-invalid={status === "error"}
                  aria-describedby={
                    status === "error" ? "contact-section_error" : undefined
                  }
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-100 text-dark-900 dark:text-dark-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 outline-none transition-all font-body"
                  placeholder="you@example.com"
                  aria-label="Your email address"
                  title="Enter your email address"
                />
              </div>

              <div>
                <label
                  htmlFor="subject"
                  className="block font-body text-sm font-medium text-dark-700 mb-2"
                >
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  data-testid="contact-section_select-subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-100 text-dark-900 dark:text-dark-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 outline-none transition-all font-body"
                  aria-label="Subject"
                  title="Select a subject"
                >
                  {subjectOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block font-body text-sm font-medium text-dark-700 mb-2"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  data-testid="contact-section_textarea-message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  aria-required="true"
                  aria-invalid={status === "error"}
                  aria-describedby={
                    status === "error" ? "contact-section_error" : undefined
                  }
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-100 text-dark-900 dark:text-dark-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 outline-none transition-all font-body resize-none"
                  placeholder="Your message..."
                  aria-label="Your message"
                  title="Enter your message"
                />
              </div>

              <input
                ref={gotchaRef}
                type="text"
                name="_gotcha"
                style={{ display: "none" }}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              {status === "error" && errorMessage && (
                <div
                  id="contact-section_error"
                  data-testid="contact-section_error"
                  className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg"
                  role="alert"
                  aria-live="assertive"
                >
                  <AlertCircle
                    className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <p className="font-body text-sm text-red-600 dark:text-red-400">
                    {errorMessage}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={status === "loading"}
                data-testid="contact-section_submit-btn"
              >
                {status === "loading" ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Send className="w-5 h-5 mr-2" aria-hidden="true" />
                )}
                Send Message
              </Button>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="bg-primary-50 dark:bg-dark-100 rounded-2xl p-8">
              <h3 className="font-heading text-xl font-semibold text-dark-900 mb-6">
                Get in Touch
              </h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <Mail
                    className="w-6 h-6 text-primary-500 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-body text-sm text-dark-500 dark:text-dark-600">
                      Email
                    </p>
                    <a
                      href={`mailto:${content.email}`}
                      data-testid="contact-section_email-link"
                      className="font-body text-dark-900 dark:text-dark-900 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {content.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <Phone
                    className="w-6 h-6 text-primary-500 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-body text-sm text-dark-500 dark:text-dark-600">
                      Phone
                    </p>
                    <a
                      href={`tel:${content.phone}`}
                      data-testid="contact-section_phone-link"
                      className="font-body text-dark-900 dark:text-dark-900 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {formatPhoneNumber(content.phone)}
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <MapPin
                    className="w-6 h-6 text-primary-500 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-body text-sm text-dark-500 dark:text-dark-600">
                      Location
                    </p>
                    <p className="font-body text-dark-900 dark:text-dark-900">
                      {content.location}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <LocationMap
              lat={content.lat}
              lng={content.lng}
              location={content.location}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
