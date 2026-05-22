import { ProductsSection } from "../sections/ProductsSection";
import type { ISiteContent, IProduct } from "../../types";

interface IProductsPageProps {
  content: ISiteContent;
  products: IProduct[];
}

export function ProductsPage({ content, products }: IProductsPageProps) {
  return (
    <div data-testid="products-page">
      <ProductsSection products={products} content={content} />
    </div>
  );
}
