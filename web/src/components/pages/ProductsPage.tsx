import { ProductsSection } from "../sections/ProductsSection";
import { SeoHead } from "../seo/SeoHead";
import type { ISiteContent, ICategory } from "../../types";

interface IProductsPageProps {
  content: ISiteContent;
  categories: ICategory[];
}

export function ProductsPage({ content, categories }: IProductsPageProps) {
  return (
    <div data-testid="products-page">
      <SeoHead
        title="Shop All Products"
        description={
          content.productsSubtitle ||
          "Browse our selection of raw honey, beeswax products, and gift sets."
        }
        canonicalPath="/products"
        keywords="buy honey, honey shop, raw honey, beeswax candles, honey gifts, apiary products"
      />
      <ProductsSection content={content} categories={categories} />
    </div>
  );
}
