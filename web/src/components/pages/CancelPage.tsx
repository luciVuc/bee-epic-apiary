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
import type { ISiteContent } from "../../types";

interface ICancelPageProps {
  content: ISiteContent;
}

export const CancelPage = ({ content }: ICancelPageProps) => {
  return (
    <div
      data-testid="cancel-page"
      className="min-h-screen bg-gradient-to-b from-amber-50 via-primary-50 to-white flex items-center justify-center p-4"
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <XCircle className="w-10 h-10 text-amber-600" aria-hidden="true" />
        </motion.div>

        <h1 className="font-heading text-3xl font-bold text-dark-900 mb-4">
          Checkout Cancelled
        </h1>

        <p className="font-body text-dark-600 mb-6">
          No charges were made. Your items are still in your cart.
        </p>

        <div className="bg-dark-50 rounded-xl p-4 mb-6 text-left">
          <h3 className="font-heading text-lg font-semibold text-dark-900 mb-3 flex items-center gap-2">
            <AlertCircle
              className="w-5 h-5 text-primary-500"
              aria-hidden="true"
            />
            Need Help?
          </h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 font-body text-sm text-dark-600">
              <HelpCircle
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Try a different payment method
            </li>
            <li className="flex items-start gap-2 font-body text-sm text-dark-600">
              <HelpCircle
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Contact us for questions
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <Link to="/" className="block">
            <Button size="lg" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Continue Shopping
            </Button>
          </Link>
          <Link to="/contact" className="block">
            <Button variant="outline" size="lg" className="w-full">
              Contact Support
              <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
          </Link>
        </div>

        <p className="font-body text-sm text-dark-500 mt-6">
          {content.questionsContact}{" "}
          <a
            href={`mailto:${content.email}`}
            className="text-primary-600 hover:underline"
          >
            {content.email}
          </a>
        </p>
      </motion.div>
    </div>
  );
};

export default CancelPage;
