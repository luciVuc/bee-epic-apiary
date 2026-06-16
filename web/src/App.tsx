import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "./components/layout/Layout";
import { CartDrawer } from "./components/shop/CartDrawer";
import { HomePage } from "./components/pages/HomePage";
import { ProductsPage } from "./components/pages/ProductsPage";
import { AboutProcessPage } from "./components/pages/AboutProcessPage";
import { ContactPage } from "./components/pages/ContactPage";
import { CancelPage } from "./components/pages/CancelPage";
import { SuccessPage } from "./components/pages/SuccessPage";
import { ProductDetailPage } from "./components/pages/ProductDetailPage";
import { LoadingSpinner } from "./components/ui/LoadingSpinner";
import { fetchAllSiteData } from "./utils/api";
import type {
  ISiteContent,
  ITestimonial,
  IProcessStep,
  ICategory,
} from "./types";

function AppContent() {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [siteContent, setSiteContent] = useState<ISiteContent | null>(null);
  const [testimonials, setTestimonials] = useState<ITestimonial[]>([]);
  const [processSteps, setProcessSteps] = useState<IProcessStep[]>([]);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllSiteData()
      .then((data) => {
        setSiteContent(data.siteContent);
        setTestimonials(data.testimonials);
        setProcessSteps(data.processSteps);
        setCategories(data.categories);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("session") === "success") {
      setShowSuccessModal(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (loading) {
    return (
      <div
        data-testid="app-loading"
        className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-dark-950"
      >
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="app-error"
        className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-dark-950"
      >
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold text-dark-900 mb-4">
            Unable to load site
          </h1>
          <p className="font-body text-dark-600">
            {error || "Site content not available"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout data-testid="app-layout" siteContent={siteContent}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage content={siteContent} testimonials={testimonials} />
            }
          />
          <Route
            path="/products"
            element={
              <ProductsPage content={siteContent} categories={categories} />
            }
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
            data-testid="success-modal_overlay"
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-modal_title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSuccessModal(false)}
          >
            <motion.div
              data-testid="success-modal"
              className="bg-white dark:bg-dark-100 rounded-2xl p-8 max-w-md w-full"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl" aria-hidden="true">
                    🎉
                  </span>
                </div>
                <h2
                  id="success-modal_title"
                  className="font-heading text-2xl font-bold text-dark-900 mb-4"
                >
                  {siteContent.orderConfirmed}
                </h2>
                <p className="font-body text-dark-600 mb-2">
                  {siteContent.orderConfirmationMessage}
                </p>
                <p className="font-body text-sm text-dark-500 dark:text-dark-600 mb-6">
                  {siteContent.questionsContact} {siteContent.email}
                </p>
                <button
                  data-testid="success-modal_continue-btn"
                  onClick={() => setShowSuccessModal(false)}
                  className="px-6 py-2 bg-primary-500 dark:bg-primary-600 text-white rounded-xl font-body font-medium hover:bg-primary-600 dark:hover:bg-primary-700 transition-colors"
                  aria-label={siteContent.continueShopping}
                  title={siteContent.continueShopping}
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
  return <AppContent />;
}

export default App;
