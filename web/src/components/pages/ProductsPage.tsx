import { ProductsSection } from "../sections/ProductsSection";
import type { ISiteContent, ICategory } from "../../types";

interface IProductsPageProps {
  content: ISiteContent;
  categories: ICategory[];
}

export function ProductsPage({ content, categories }: IProductsPageProps) {
  return (
    <div data-testid="products-page">
      <ProductsSection content={content} categories={categories} />
    </div>
  );
}
