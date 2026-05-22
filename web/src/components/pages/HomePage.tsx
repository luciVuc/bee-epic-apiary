import { HeroSection } from "../sections/HeroSection";
import { TestimonialsSection } from "../sections/TestimonialsSection";
import type { ISiteContent, ITestimonial } from "../../types";

interface IHomePageProps {
  content: ISiteContent;
  testimonials: ITestimonial[];
}

export function HomePage({ content, testimonials }: IHomePageProps) {
  return (
    <div data-testid="home-page">
      <HeroSection content={content} />
      <TestimonialsSection testimonials={testimonials} content={content} />
    </div>
  );
}
