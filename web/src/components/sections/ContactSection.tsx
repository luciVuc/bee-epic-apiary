import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Send, AlertCircle } from "lucide-react";
import { SectionHeader } from "../ui/SectionHeader";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import type { ISiteContent } from "../../types";
import { FORMSPREE_FORM_ID } from "../../utils/constants";
import { formatPhoneNumber } from "../../utils/formatters";

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

export const ContactSection = ({ content }: IContactSectionProps) => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    subject: "general",
    message: "",
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

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

    if (!FORMSPREE_FORM_ID || FORMSPREE_FORM_ID === "REPLACE_ME") {
      setStatus("error");
      setErrorMessage(
        "Formspree is not configured. Please add VITE_FORMSPREE_FORM_ID to .env",
      );
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(
        `https://formspree.io/f/${FORMSPREE_FORM_ID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setStatus("success");
      setFormData({ name: "", email: "", subject: "general", message: "" });
    } catch {
      setStatus("error");
      setErrorMessage("Failed to send message. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <section id="contact" className="py-20 bg-white">
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
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Send className="w-8 h-8 text-green-600" />
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
    <section id="contact" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader title="Contact Us" />

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
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all font-body"
                  placeholder="Your name"
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
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all font-body"
                  placeholder="you@example.com"
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
                  value={formData.subject}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all font-body"
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
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all font-body resize-none"
                  placeholder="Your message..."
                />
              </div>

              <input
                type="text"
                name="_gotcha"
                style={{ display: "none" }}
                tabIndex={-1}
                autoComplete="off"
              />

              {status === "error" && errorMessage && (
                <div className="flex items-center space-x-2 p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="font-body text-sm text-red-600">
                    {errorMessage}
                  </p>
                </div>
              )}

              <Button type="submit" size="lg" disabled={status === "loading"}>
                {status === "loading" ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Send className="w-5 h-5 mr-2" />
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
            <div className="bg-primary-50 rounded-2xl p-8">
              <h3 className="font-heading text-xl font-semibold text-dark-900 mb-6">
                Get in Touch
              </h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <Mail className="w-6 h-6 text-primary-500 mt-0.5" />
                  <div>
                    <p className="font-body text-sm text-dark-500">Email</p>
                    <a
                      href={`mailto:${content.email}`}
                      className="font-body text-dark-900 hover:text-primary-600 transition-colors"
                    >
                      {content.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <Phone className="w-6 h-6 text-primary-500 mt-0.5" />
                  <div>
                    <p className="font-body text-sm text-dark-500">Phone</p>
                    <a
                      href={`tel:${content.phone}`}
                      className="font-body text-dark-900 hover:text-primary-600 transition-colors"
                    >
                      {formatPhoneNumber(content.phone)}
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <MapPin className="w-6 h-6 text-primary-500 mt-0.5" />
                  <div>
                    <p className="font-body text-sm text-dark-500">Location</p>
                    <p className="font-body text-dark-900">
                      {content.location}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="aspect-[4/3] bg-primary-50 rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-primary-400 mx-auto mb-3" />
                <p className="font-body text-primary-700">[Map Placeholder]</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
