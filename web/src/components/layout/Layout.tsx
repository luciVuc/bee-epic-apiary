import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import type { ISiteContent } from "../../types";

interface ILayoutProps {
  children: ReactNode;
  siteContent: ISiteContent;
}

export const Layout = ({ children, siteContent }: ILayoutProps) => {
  return (
    <div data-testid="layout" className="min-h-screen flex flex-col">
      <Navbar content={siteContent} />
      <main data-testid="layout_main" className="flex-grow">
        {children}
      </main>
      <Footer content={siteContent} />
    </div>
  );
};
