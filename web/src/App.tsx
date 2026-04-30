import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { store } from "./store";
import { Layout } from "./components/layout/Layout";
import { CartDrawer } from "./components/shop/CartDrawer";
import { HomePage } from "./components/pages/HomePage";
import { ProductsPage } from "./components/pages/ProductsPage";
import { AboutProcessPage } from "./components/pages/AboutProcessPage";
import { ContactPage } from "./components/pages/ContactPage";
import { CancelPage } from "./components/pages/CancelPage";
import { SuccessPage } from "./components/pages/SuccessPage";
import { ProductDetailPage } from "./components/pages/ProductDetailPage";
import siteData from "./data/site.json";
import productsData from "./data/products.json";
import testimonialsData from "./data/testimonials.json";
import processData from "./data/process.json";
import type {
  ISiteContent,
  IProduct,
  ITestimonial,
  IProcessStep,
} from "./types";

type SiteContent = ISiteContent;
type Product = IProduct;
type Testimonial = ITestimonial;
type ProcessStep = IProcessStep;

const siteContent: SiteContent = siteData as SiteContent;
const products: Product[] = productsData as Product[];
const testimonials: Testimonial[] = testimonialsData as Testimonial[];
const processSteps: ProcessStep[] = processData as ProcessStep[];

function AppContent() {
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    );
    if (params.get("session") === "success") {
      setShowSuccessModal(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <>
      <Layout siteContent={siteContent}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage content={siteContent} testimonials={testimonials} />
            }
          />
          <Route
            path="/products"
            element={<ProductsPage content={siteContent} products={products} />}
          />
          <Route
            path="/about"
            element={
              <AboutProcessPage content={siteContent} steps={processSteps} />
            }
          />
          <Route
            path="/contact"
            element={<ContactPage content={siteContent} />}
          />
          <Route path="/products/:slug" element={<ProductDetailPage />} />
          <Route
            path="/success"
            element={<SuccessPage content={siteContent} />}
          />
          <Route
            path="/cancel"
            element={<CancelPage content={siteContent} />}
          />
        </Routes>
      </Layout>
      <CartDrawer />

      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSuccessModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl p-8 max-w-md w-full"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">🎉</span>
                </div>
                <h2 className="font-heading text-2xl font-bold text-dark-900 mb-4">
                  {siteContent.orderConfirmed}
                </h2>
                <p className="font-body text-dark-600 mb-2">
                  {siteContent.orderConfirmationMessage}
                </p>
                <p className="font-body text-sm text-dark-500 mb-6">
                  {siteContent.questionsContact} {siteContent.email}
                </p>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="px-6 py-2 bg-primary-500 text-white rounded-xl font-body font-medium hover:bg-primary-600 transition-colors"
                >
                  {siteContent.continueShopping}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <HashRouter>
        <Routes>
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </HashRouter>
    </Provider>
  );
}

export default App;
