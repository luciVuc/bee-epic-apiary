import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Leaf, Heart, X, ChevronLeft, ChevronRight } from "lucide-react";
import { SectionHeader } from "../ui/SectionHeader";
import type { ISiteContent } from "../../types";

interface IAboutSectionProps {
  content: ISiteContent;
}

/**
 * "Our Story" section: about copy, a carousel of about images with a full-screen
 * lightbox (prev/next + dot indicators when there are multiple), and a stats
 * band. Renders a bee placeholder when no images are configured.
 */
export const AboutSection = ({ content }: IAboutSectionProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  const images = content.aboutImages || [];
  const hasMultipleImages = images.length > 1;

  const nextImage = () =>
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  const prevImage = () =>
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);

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
    <section
      id="about"
      data-testid="about-section"
      className="py-20 bg-white dark:bg-dark-950"
    >
      <div
        data-testid="about-content"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div
          data-testid="about-grid"
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
        >
          <motion.div
            data-testid="about-text"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <SectionHeader
              testId="about-title"
              title={content.aboutTitle}
              align="left"
            />

            <div data-testid="about-text-content" className="space-y-6">
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
            data-testid="about-image"
            className="relative"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div
              data-testid="about-image-content"
              className="about-image-grid aspect-[4/3] rounded-2xl overflow-hidden bg-primary-100 dark:bg-dark-100 shadow-amber-lg relative"
            >
              {images.length > 0 ? (
                <>
                  <motion.img
                    key={currentImageIndex}
                    src={images[currentImageIndex]}
                    alt={content.aboutTitle}
                    className="w-full h-full object-cover cursor-pointer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => setShowLightbox(true)}
                    data-testid="about-image_main-image"
                  />
                  {hasMultipleImages && (
                    <>
                      <button
                        data-testid="about-image_prev-btn"
                        onClick={prevImage}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 dark:bg-dark-950/80 rounded-full flex items-center justify-center shadow-md hover:bg-white dark:hover:bg-dark-950 transition-colors"
                        aria-label="Previous image"
                        title="Previous image"
                      >
                        <ChevronLeft
                          className="w-5 h-5 text-dark-700 dark:text-dark-700"
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        data-testid="about-image_next-btn"
                        onClick={nextImage}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 dark:bg-dark-950/80 rounded-full flex items-center justify-center shadow-md hover:bg-white dark:hover:bg-dark-950 transition-colors"
                        aria-label="Next image"
                        title="Next image"
                      >
                        <ChevronRight
                          className="w-5 h-5 text-dark-700 dark:text-dark-700"
                          aria-hidden="true"
                        />
                      </button>
                      <div
                        data-testid="about-image_indicators"
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2"
                      >
                        {images.map((_, idx) => (
                          <button
                            key={idx}
                            data-testid={`about-image_indicator-${idx}`}
                            onClick={() => setCurrentImageIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-colors ${idx === currentImageIndex ? "bg-primary-500 dark:bg-primary-400" : "bg-dark-300 dark:bg-dark-600"}`}
                            aria-label={`Go to image ${idx + 1}`}
                            aria-current={idx === currentImageIndex}
                            title={`Go to image ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div
                  data-testid="about-image-placeholder"
                  className="w-full h-full flex items-center justify-center"
                >
                  <div className="text-center p-8">
                    <span className="text-6xl" aria-hidden="true">
                      🐝
                    </span>
                    <p className="font-body text-primary-700 dark:text-primary-300 mt-4">
                      [About Image]
                    </p>
                  </div>
                </div>
              )}
            </div>

            <motion.div
              data-testid="about-stats"
              className="absolute -bottom-6 -left-6 bg-white dark:bg-dark-100 rounded-xl shadow-amber p-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <p className="font-heading text-2xl font-bold text-primary-600 dark:text-primary-400">
                {content.sinceYear}
              </p>
              <p className="font-body text-sm text-dark-500 dark:text-dark-600">
                {content.sinceYearLabel}
              </p>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          data-testid="about-stats-grid"
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="bg-primary-50 dark:bg-dark-100 rounded-xl p-6 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <stat.icon
                className="w-10 h-10 text-primary-500 dark:text-primary-400 mx-auto mb-3"
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

      <AnimatePresence>
        {showLightbox && (
          <motion.div
            data-testid="about-image_lightbox"
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={`Lightbox for ${content.aboutTitle}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLightbox(false)}
          >
            <button
              data-testid="about-image_lightbox-close-btn"
              className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
              onClick={() => setShowLightbox(false)}
              aria-label="Close lightbox"
              title="Close lightbox"
            >
              <X className="w-6 h-6 text-white" aria-hidden="true" />
            </button>
            {hasMultipleImages && (
              <>
                <button
                  data-testid="about-image_lightbox-prev-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    prevImage();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                  aria-label="Previous image"
                  title="Previous image"
                >
                  <ChevronLeft
                    className="w-8 h-8 text-white"
                    aria-hidden="true"
                  />
                </button>
                <button
                  data-testid="about-image_lightbox-next-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    nextImage();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                  aria-label="Next image"
                  title="Next image"
                >
                  <ChevronRight
                    className="w-8 h-8 text-white"
                    aria-hidden="true"
                  />
                </button>
              </>
            )}
            <img
              src={images[currentImageIndex]}
              alt={content.aboutTitle}
              data-testid="about-image_lightbox-image"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
