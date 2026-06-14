import { HeroSection } from "../sections/HeroSection";
import { TestimonialsSection } from "../sections/TestimonialsSection";
import { SeoHead } from "../seo/SeoHead";
import type { ISiteContent, ITestimonial } from "../../types";
import {
  organizationSchema,
  websiteSchema,
  localBusinessSchema,
} from "../../utils/structuredData";

interface IHomePageProps {
  content: ISiteContent;
  testimonials: ITestimonial[];
}

export function HomePage({ content, testimonials }: IHomePageProps) {
  return (
    <div data-testid="home-page">
      <SeoHead
        title={content.businessName}
        description={content.tagline}
        canonicalPath="/"
        ogImage={content.logo || undefined}
        keywords="raw honey, bee products, apiary, organic honey, beeswax, honey shop"
        jsonLd={[
          organizationSchema(content),
          websiteSchema(content),
          localBusinessSchema(content),
        ]}
      />
      <HeroSection content={content} />
      <TestimonialsSection testimonials={testimonials} content={content} />
    </div>
  );
}
