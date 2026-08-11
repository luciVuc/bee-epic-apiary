import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Heart } from "lucide-react";
import { Button } from "../ui/Button";
import type { ISiteContent } from "../../types";

interface IHeroSectionProps {
  content: ISiteContent;
}

/** Full-screen landing hero: tagline pill, headline/subheadline, shop/story CTAs, and animated decorative background. */
export const HeroSection = ({ content }: IHeroSectionProps) => {
  return (
    <section
      id="home"
      data-testid="hero-section"
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-amber-50 via-primary-50 to-white dark:from-amber-950/30 dark:via-dark-950 dark:to-dark-950"
    >
      <div
        data-testid="hero-section_background"
        className="absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <motion.div
          data-testid="hero-section_animated-bg-1"
          className="absolute -top-20 -right-20 w-96 h-96 bg-primary-200 dark:bg-primary-800 rounded-full opacity-30 dark:opacity-20"
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 90, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          data-testid="hero-section_animated-bg-2"
          className="absolute bottom-20 -left-20 w-64 h-64 bg-amber-200 dark:bg-amber-800 rounded-full opacity-30 dark:opacity-20"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, -90, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div
        data-testid="hero-section_content"
        className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            data-testid="hero-section_tagline"
            className="inline-flex items-center space-x-2 bg-primary-100 dark:bg-dark-100 rounded-full px-4 py-1.5 mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Heart className="w-4 h-4 text-primary-500" aria-hidden="true" />
            <span className="font-body text-sm text-primary-700 dark:text-primary-300">
              {content.tagline}
            </span>
          </motion.div>

          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-dark-900 mb-6">
            {content.heroHeadline}
          </h1>

          <p className="font-body text-lg sm:text-xl text-dark-600 max-w-2xl mx-auto mb-10">
            {content.heroSubheadline}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/products" data-testid="hero-section_shop-link">
              <Button
                size="lg"
                className="group"
                data-testid="hero-section_shop-btn"
              >
                Shop Our Honey
                <ArrowRight
                  className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform"
                  aria-hidden="true"
                />
              </Button>
            </Link>
            <Link to="/about" data-testid="hero-section_story-link">
              <Button
                variant="outline"
                size="lg"
                data-testid="hero-section_story-btn"
              >
                Our Story
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>

      <motion.div
        data-testid="hero-section_scroll-indicator"
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        aria-hidden="true"
      >
        <div className="w-6 h-10 border-2 border-dark-300 dark:border-dark-600 rounded-full flex justify-center pt-1">
          <motion.div
            className="w-1.5 h-1.5 bg-dark-400 dark:bg-dark-500 rounded-full"
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </section>
  );
};
