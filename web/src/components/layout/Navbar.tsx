import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Menu, X } from "lucide-react";
import { useCart } from "../../hooks/useCart";
import type { ISiteContent } from "../../types";

interface INavbarProps {
  content: ISiteContent;
}

export const Navbar = ({ content }: INavbarProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { totalItems, open } = useCart();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const getPath = (id: string) => {
    if (id === "home") return "/";
    if (id === "products") return "/products";
    if (id === "about") return "/about";
    if (id === "contact") return "/contact";
    return "/";
  };

  const isActive = (id: string) => {
    const path = getPath(id);
    return location.pathname === path;
  };

  return (
    <motion.nav
      data-testid="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-white/90 backdrop-blur-md shadow-sm" : "bg-transparent"
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link
            to="/"
            data-testid="navbar_logo-link"
            className="flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
            aria-label={`${content.businessName} - Home`}
            title={`${content.businessName} - Home`}
          >
            <span className="text-3xl" aria-hidden="true">
              🐝
            </span>
            <span className="font-heading text-xl font-bold text-dark-900 hidden sm:block">
              {content.businessName}
            </span>
          </Link>

          <div id="nav-links" className="hidden md:flex items-center space-x-8">
            {content.navLinks
              .filter(
                (link) => link.id !== "testimonials" && link.id !== "process",
              )
              .map((link) => (
                <Link
                  key={link.id}
                  to={getPath(link.id)}
                  className={`font-body text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded ${
                    isActive(link.id)
                      ? "text-primary-600"
                      : "text-dark-600 hover:text-primary-600"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
          </div>

          <div className="flex items-center space-x-4">
            <button
              data-testid="navbar_cart-btn"
              onClick={open}
              className="relative p-2 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
              aria-label={`Shopping cart with ${totalItems} items`}
              title={`Shopping cart with ${totalItems} items`}
            >
              <ShoppingCart
                className="w-6 h-6 text-dark-700"
                aria-hidden="true"
              />
              {totalItems > 0 && (
                <motion.span
                  className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  key={totalItems}
                >
                  {totalItems > 9 ? "9+" : totalItems}
                </motion.span>
              )}
            </button>

            <button
              data-testid="navbar_menu-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              title={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-dark-700" aria-hidden="true" />
              ) : (
                <Menu className="w-6 h-6 text-dark-700" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            data-testid="navbar_mobile-menu"
            className="md:hidden bg-white border-t border-dark-100"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="px-4 py-4 space-y-2">
              {content.navLinks
                .filter(
                  (link) => link.id !== "testimonials" && link.id !== "process",
                )
                .map((link) => (
                  <Link
                    key={link.id}
                    to={getPath(link.id)}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block w-full text-left py-2 px-4 rounded-lg font-body font-medium transition-colors duration-200 ${
                      isActive(link.id)
                        ? "bg-primary-50 text-primary-600"
                        : "text-dark-600 hover:bg-dark-50"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isMobileMenuOpen && (
        <div data-testid="navbar_mobile-menu-closed" aria-hidden="true" />
      )}
    </motion.nav>
  );
};
