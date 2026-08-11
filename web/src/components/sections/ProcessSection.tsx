import { motion } from "framer-motion";
import { Home, Flower2, Wind, Shield, Award, ChevronRight } from "lucide-react";
import { SectionHeader } from "../ui/SectionHeader";
import type { IProcessStep, ISiteContent } from "../../types";

interface IProcessSectionProps {
  steps: IProcessStep[];
  content: ISiteContent;
}

/** Maps a step's string `icon` name to its lucide-react component; falls back to ChevronRight for unknown names. */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  Flower2,
  Wind,
  Shield,
  Award,
};

/** "Hive to table" process steps rendered as a horizontal timeline on desktop and a vertical one on mobile. */
export const ProcessSection = ({ steps, content }: IProcessSectionProps) => {
  return (
    <section
      id="process"
      data-testid="process-section"
      className="py-20 bg-primary-50 dark:bg-dark-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={content.processTitle}
          subtitle={content.processSubtitle}
        />

        <div className="relative">
          <div
            className="hidden md:block absolute top-[7rem] left-0 right-0 h-0.5 bg-primary-200 dark:bg-primary-800"
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {steps.map((processStep, index) => {
              const IconComponent = iconMap[processStep.icon] || ChevronRight;

              return (
                <motion.div
                  key={processStep.id}
                  data-testid={`process-section_step-${processStep.id}`}
                  className="relative"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                >
                  <div className="flex flex-col items-center text-center">
                    <motion.div
                      className="w-16 h-16 bg-white dark:bg-dark-100 rounded-full shadow-amber flex items-center justify-center mb-4 relative z-10"
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <IconComponent
                        className="w-8 h-8 text-primary-500"
                        aria-hidden="true"
                      />
                    </motion.div>

                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary-500 dark:bg-primary-600 text-white rounded-full flex items-center justify-center font-heading font-bold text-sm">
                      {processStep.step}
                    </div>

                    <h3 className="font-heading text-xl font-semibold text-dark-900 mb-2">
                      {processStep.title}
                    </h3>

                    <p className="font-body text-dark-600 text-sm leading-relaxed">
                      {processStep.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 md:hidden">
          <div className="border-l-2 border-primary-200 dark:border-primary-800 ml-8">
            {steps.map((processStep, index) => {
              const IconComponent = iconMap[processStep.icon] || ChevronRight;

              return (
                <motion.div
                  key={processStep.id}
                  className="relative pl-8 pb-8"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                >
                  <div className="absolute -left-[9px] top-0 w-4 h-4 bg-primary-500 dark:bg-primary-600 rounded-full" />
                  <div className="w-12 h-12 bg-white dark:bg-dark-100 rounded-full shadow-amber flex items-center justify-center mb-3">
                    <IconComponent
                      className="w-6 h-6 text-primary-500"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-dark-900 mb-1">
                    {processStep.title}
                  </h3>
                  <p className="font-body text-dark-600 text-sm">
                    {processStep.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
