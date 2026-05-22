import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { motion } from "framer-motion";
import { ShoppingBag, Mail, Clock, ArrowLeft } from "lucide-react";
import { clearCart } from "../../store/cartSlice";
import { Button } from "../ui/Button";
import type { ISiteContent } from "../../types";

interface ISuccessPageProps {
  content: ISiteContent;
}

export const SuccessPage = ({ content }: ISuccessPageProps) => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(clearCart());
  }, [dispatch]);

  const sessionId = searchParams.get("session_id");

  return (
    <div
      data-testid="success-page"
      className="min-h-screen bg-gradient-to-b from-amber-50 via-primary-50 to-white flex items-center justify-center p-4"
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <ShoppingBag
            className="w-10 h-10 text-green-600"
            aria-hidden="true"
          />
        </motion.div>

        <h1 className="font-heading text-3xl font-bold text-dark-900 mb-4">
          {content.orderConfirmed}
        </h1>

        <p className="font-body text-dark-600 mb-2">
          {content.orderConfirmationMessage}
        </p>

        {sessionId && (
          <p className="font-body text-sm text-dark-500 mb-6">
            Order ID:{" "}
            <span className="font-mono">{sessionId.slice(0, 12)}...</span>
          </p>
        )}

        <div className="bg-primary-50 rounded-xl p-4 mb-6 text-left">
          <h3 className="font-heading text-lg font-semibold text-dark-900 mb-3">
            What's Next?
          </h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 font-body text-sm text-dark-600">
              <Mail
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Check your email for order confirmation
            </li>
            <li className="flex items-start gap-2 font-body text-sm text-dark-600">
              <Clock
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Your items will ship within 2-3 business days
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <Link to="/products" className="block">
            <Button size="lg" className="w-full">
              Continue Shopping
            </Button>
          </Link>
          <Link to="/" className="block">
            <Button variant="outline" size="lg" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back to Home
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

export default SuccessPage;
