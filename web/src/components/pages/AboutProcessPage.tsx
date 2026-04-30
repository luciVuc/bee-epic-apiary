import { AboutSection } from "../sections/AboutSection";
import { ProcessSection } from "../sections/ProcessSection";
import type { ISiteContent, IProcessStep } from "../../types";

interface IAboutProcessPageProps {
  content: ISiteContent;
  steps: IProcessStep[];
}

export function AboutProcessPage({ content, steps }: IAboutProcessPageProps) {
  return (
    <>
      <AboutSection content={content} />
      <ProcessSection steps={steps} content={content} />
    </>
  );
}
