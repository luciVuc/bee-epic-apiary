import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { SectionHeader } from "../ui/SectionHeader";
import type { ITestimonial, ISiteContent } from "../../types";
import { formatDate } from "../../utils/formatters";

interface ITestimonialsSectionProps {
  testimonials: ITestimonial[];
  content: ISiteContent;
}

export const TestimonialsSection = ({
  testimonials,
  content,
}: ITestimonialsSectionProps) => {
  return (
    <section id="testimonials" className="py-20 bg-primary-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={content.testimonialsTitle}
          subtitle={content.testimonialsSubtitle}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.id}
              className="bg-white rounded-2xl p-6 shadow-sm"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="flex items-center space-x-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < testimonial.rating
                        ? "fill-primary-500 text-primary-500"
                        : "fill-dark-200 text-dark-200"
                    }`}
                  />
                ))}
              </div>

              <Quote className="w-8 h-8 text-primary-200 mb-3" />

              <p className="font-body text-dark-600 mb-6 italic">
                "{testimonial.text}"
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-semibold text-dark-900">
                    {testimonial.name}
                  </p>
                  <p className="font-body text-sm text-dark-500">
                    {testimonial.location}
                  </p>
                </div>
                <p className="font-body text-xs text-dark-400">
                  {formatDate(testimonial.date)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
