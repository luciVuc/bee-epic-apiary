import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import type { ISiteContent } from "../../types";

interface ILayoutProps {
  children: ReactNode;
  siteContent: ISiteContent;
}

/** Page shell wrapping route content with the Navbar, a skip-to-content link, a `<main>` region, and the Footer. */
export const Layout = ({ children, siteContent }: ILayoutProps) => {
  return (
    <div data-testid="layout" className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-500 focus:text-white focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>
      <Navbar content={siteContent} />
      <main
        id="main-content"
        data-testid="layout_main"
        className="flex-grow"
        tabIndex={-1}
      >
        {children}
      </main>
      <Footer content={siteContent} />
    </div>
  );
};
