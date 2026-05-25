import { ProductsSection } from "../sections/ProductsSection";
import type { ISiteContent } from "../../types";

interface IProductsPageProps {
  content: ISiteContent;
}

export function ProductsPage({ content }: IProductsPageProps) {
  return (
    <div data-testid="products-page">
      <ProductsSection content={content} />
    </div>
  );
}
