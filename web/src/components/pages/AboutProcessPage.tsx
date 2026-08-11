import { AboutSection } from "../sections/AboutSection";
import { ProcessSection } from "../sections/ProcessSection";
import { SeoHead } from "../seo/SeoHead";
import type { ISiteContent, IProcessStep } from "../../types";

interface IAboutProcessPageProps {
  content: ISiteContent;
  steps: IProcessStep[];
}

/** `/about` route: SEO head plus the About and Process sections. */
export function AboutProcessPage({ content, steps }: IAboutProcessPageProps) {
  return (
    <div data-testid="about-process-page">
      <SeoHead
        title="About Us"
        description={`Learn about ${content.businessName} — ${content.tagline}`}
        canonicalPath="/about"
        keywords="about us, our story, beekeeping, apiary, honey farm, California honey"
      />
      <AboutSection content={content} />
      <ProcessSection steps={steps} content={content} />
    </div>
  );
}
