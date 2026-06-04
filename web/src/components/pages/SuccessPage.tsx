import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Mail,
  Clock,
  ArrowLeft,
  Clipboard,
  Check,
} from "lucide-react";
import { clearCart } from "../../store/cartSlice";
import { Button } from "../ui/Button";
import type { ISiteContent } from "../../types";

interface ISuccessPageProps {
  content: ISiteContent;
}

export const SuccessPage = ({ content }: ISuccessPageProps) => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const hasClearedCart = useRef(false);
  const [copied, setCopied] = useState(false);

  const copySessionId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  useEffect(() => {
    if (!hasClearedCart.current) {
      dispatch(clearCart());
      hasClearedCart.current = true;
    }
  }, [dispatch]);

  const hasConfirmed = useRef(false);
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (sessionId && !hasConfirmed.current) {
      hasConfirmed.current = true;
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      fetch(`${apiBaseUrl}/orders/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {
        // fire-and-forget — non-critical
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [sessionId]);

  return (
    <div
      data-testid="success-page"
      className="min-h-screen bg-gradient-to-b from-amber-50 via-primary-50 to-white flex items-center justify-center p-4"
    >
      <motion.div
        data-testid="success-page_container"
        className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          data-testid="success-page_icon"
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <ShoppingBag
            data-testid="success-page_icon"
            className="w-10 h-10 text-green-600"
            aria-hidden="true"
          />
        </motion.div>

        <h1
          data-testid="success-page_title"
          className="font-heading text-3xl font-bold text-dark-900 mb-4"
        >
          {content.orderConfirmed}
        </h1>

        <p
          data-testid="success-page_message"
          className="font-body text-dark-600 mb-2"
        >
          {content.orderConfirmationMessage}
        </p>

        {sessionId && (
          <p
            data-testid="success-page_session-id"
            className="font-body text-sm text-dark-500 mb-6 flex items-center justify-center gap-1"
          >
            <span data-testid="success-page_session-id-label">Order ID:</span>
            <button
              onClick={() => copySessionId(sessionId)}
              className="font-mono inline-flex items-center gap-1 hover:text-primary-600 transition-colors cursor-pointer"
              title="Click to copy"
              aria-label="Copy order ID to clipboard"
              data-testid="success-page_session-id-value"
            >
              {sessionId.slice(0, 12)}...
              {copied ? (
                <Check
                  className="w-3.5 h-3.5 text-green-500"
                  aria-hidden="true"
                />
              ) : (
                <Clipboard className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </p>
        )}

        <div
          data-testid="success-page_next-steps"
          className="bg-primary-50 rounded-xl p-4 mb-6 text-left"
        >
          <h3
            data-testid="success-page_next-steps-title"
            className="font-heading text-lg font-semibold text-dark-900 mb-3"
          >
            What's Next?
          </h3>
          <ul data-testid="success-page_next-steps-list" className="space-y-2">
            <li
              data-testid="success-page_next-steps-item-1"
              className="flex items-start gap-2 font-body text-sm text-dark-600"
            >
              <Mail
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Check your email for order confirmation
            </li>
            <li
              data-testid="success-page_next-steps-item-2"
              className="flex items-start gap-2 font-body text-sm text-dark-600"
            >
              <Clock
                className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              Your items will ship within 2-3 business days
            </li>
          </ul>
        </div>

        <div data-testid="success-page_buttons" className="space-y-3">
          <Link to="/products" className="block">
            <Button
              size="lg"
              className="w-full"
              data-testid="success-page_continue-shopping-btn"
            >
              Continue Shopping
            </Button>
          </Link>
          <Link to="/" className="block">
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              data-testid="success-page_home-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back to Home
            </Button>
          </Link>
        </div>

        <p
          data-testid="success-page_contact-info"
          className="font-body text-sm text-dark-500 mt-6"
        >
          {content.questionsContact}{" "}
          <a
            data-testid="success-page_contact-email"
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
