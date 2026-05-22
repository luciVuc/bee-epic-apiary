import { motion } from "framer-motion";
import { Award, Leaf, Heart } from "lucide-react";
import { SectionHeader } from "../ui/SectionHeader";
import type { ISiteContent } from "../../types";

interface IAboutSectionProps {
  content: ISiteContent;
}

export const AboutSection = ({ content }: IAboutSectionProps) => {
  const stats = [
    {
      icon: Award,
      label: content.yearsExperience,
      description: content.yearsExperienceLabel,
    },
    {
      icon: Leaf,
      label: content.rawNatural,
      description: content.rawNaturalLabel,
    },
    {
      icon: Heart,
      label: content.californiaProud,
      description: content.californiaProudLabel,
    },
  ];

  return (
    <section id="about" data-testid="about-section" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <SectionHeader title={content.aboutTitle} align="left" />

            <div className="space-y-6">
              {content.aboutText.map((paragraph, index) => (
                <p
                  key={index}
                  className="font-body text-lg text-dark-600 leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-primary-100 shadow-amber-lg">
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center p-8">
                  <span className="text-6xl" aria-hidden="true">
                    🐝
                  </span>
                  <p className="font-body text-primary-700 mt-4">
                    [About Image]
                  </p>
                </div>
              </div>
            </div>

            <motion.div
              className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-amber p-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <p className="font-heading text-2xl font-bold text-primary-600">
                {content.sinceYear}
              </p>
              <p className="font-body text-sm text-dark-500">
                {content.sinceYearLabel}
              </p>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="bg-primary-50 rounded-xl p-6 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <stat.icon
                className="w-10 h-10 text-primary-500 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="font-heading text-3xl font-bold text-dark-900">
                {stat.label}
              </p>
              <p className="font-body text-dark-600">{stat.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
