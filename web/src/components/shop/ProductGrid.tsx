interface IProductGridProps {
  children?: React.ReactNode;
}

export const ProductGrid = ({ children }: IProductGridProps) => {
  return (
    <div
      data-testid="product-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      {children}
    </div>
  );
};
