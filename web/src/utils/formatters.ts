/** Format an integer cent amount (Stripe's unit_amount) as a USD currency string, e.g. 1250 -> "$12.50". */
export const formatPrice = (cents: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
};

/** Format a date-parseable string as a long US date, e.g. "January 5, 2026". */
export const formatDate = (dateString: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateString));
};

/** Format a 10-digit US phone number as "(xxx) xxx-xxxx"; returns the input unchanged if it isn't 10 digits. */
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};
