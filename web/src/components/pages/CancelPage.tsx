import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  XCircle,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "../ui/Button";
import { SeoHead } from "../seo/SeoHead";
import type { ISiteContent } from "../../types";

interface ICancelPageProps {
  content: ISiteContent;
}

export const CancelPage = ({ content }: ICancelPageProps) => {
  return (
    <div
      data-testid="cancel-page"
      className="min-h-screen bg-gradient-to-b from-amber-50 via-primary-50 to-white dark:from-amber-950/30 dark:via-dark-950 dark:to-dark-950 flex items-center justify-center p-4"
    >
      <SeoHead
        title="Checkout Cancelled"
        description="Your checkout was cancelled. No charges were made."
        canonicalPath="/cancel"
      />
      <motion.div
        data-testid="cancel-page_container"
        className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          data-testid="cancel-page_icon"
          className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <XCircle
            data-testid="cancel-page_icon"
            className="w-10 h-10 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        </motion.div>

        <h1
          data-testid="cancel-page_title"
          className="font-heading text-3xl font-bold text-dark-900 mb-4"
        >
          {content.checkoutCancelledTitle || "Checkout Cancelled"}
        </h1>

        <p
          data-testid="cancel-page_message"
          className="font-body text-dark-600 mb-6"
        >
          {content.checkoutCancelledMessage ||
            "No charges were made. Your items are still in your cart."}
        </p>

        <div
          data-testid="cancel-page_help"
          className="bg-dark-50 dark:bg-dark-100 rounded-xl p-4 mb-6 text-left"
        >
          <h3
            data-testid="cancel-page_help-title"
            className="font-heading text-lg font-semibold text-dark-900 mb-3 flex items-center gap-2"
          >
            <AlertCircle
              className="w-5 h-5 text-primary-500"
              aria-hidden="true"
            />
            Need Help?
          </h3>
          <ul data-testid="cancel-page_help-list" className="space-y-2">
            <li
              data-testid="cancel-page_help-item-1"
              className="flex items-start gap-2 font-body text-sm text-dark-600"
            >
              <HelpCircle
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Try a different payment method
            </li>
            <li
              data-testid="cancel-page_help-item-2"
              className="flex items-start gap-2 font-body text-sm text-dark-600"
            >
              <HelpCircle
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Contact us for questions
            </li>
          </ul>
        </div>

        <div data-testid="cancel-page_buttons" className="space-y-3">
          <Link to="/" className="block">
            <Button
              size="lg"
              className="w-full"
              data-testid="cancel-page_continue-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Continue Shopping
            </Button>
          </Link>
          <Link to="/contact" className="block">
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              data-testid="cancel-page_contact-btn"
            >
              Contact Support
              <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
          </Link>
        </div>

        <p
          data-testid="cancel-page_contact-info"
          className="font-body text-sm text-dark-500 mt-6"
        >
          {content.questionsContact}{" "}
          <a
            data-testid="cancel-page_contact-email"
            href={`mailto:${content.email}`}
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            {content.email}
          </a>
        </p>
      </motion.div>
    </div>
  );
};

export default CancelPage;
