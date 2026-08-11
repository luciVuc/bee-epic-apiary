/** Tab for managing customer testimonials with name, location, star rating, text, and date */
import { Plus, Trash2, Star } from "lucide-react";
import type { ITestimonial } from "../../types/settings";
import { TextField, TextAreaField } from "../../components/forms";

/** Props for {@link TestimonialsTab}; CRUD callbacks are owned by the parent. */
export interface ITestimonialsTabProps {
  /** Current testimonials being edited. */
  testimonialsContent: ITestimonial[];
  /** Append a new blank testimonial. */
  addTestimonial: () => void;
  /** Update one field of the testimonial at `index`. */
  updateTestimonial: <K extends keyof ITestimonial>(
    index: number,
    field: K,
    value: ITestimonial[K],
  ) => void;
  /** Remove the testimonial at `index`. */
  removeTestimonial: (index: number) => void;
}

/**
 * Settings tab for editing customer testimonials (name, location, star rating,
 * text, date). The rating is a row of toggle buttons using `aria-pressed`.
 * Presentational only — mutations are delegated to the parent.
 */
export function TestimonialsTab({
  testimonialsContent,
  addTestimonial,
  updateTestimonial,
  removeTestimonial,
}: ITestimonialsTabProps) {
  return (
    <div className="space-y-4" data-testid="testimonials-tab">
      {testimonialsContent.map((testimonial, i) => (
        <div
          key={testimonial.id}
          className="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-dark-700">
              Testimonial {i + 1}
            </span>
            <button
              onClick={() => removeTestimonial(i)}
              aria-label={`Remove testimonial ${i + 1}`}
              title={`Remove testimonial ${i + 1}`}
              data-testid={`testimonials-tab_remove-btn-${i}`}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField
              label="Name"
              value={testimonial.name}
              onChange={(v) =>
                updateTestimonial(i, "name", v as ITestimonial["name"])
              }
            />
            <TextField
              label="Location"
              value={testimonial.location}
              onChange={(v) =>
                updateTestimonial(i, "location", v as ITestimonial["location"])
              }
            />
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Rating
              </label>
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label={`Rating: ${testimonial.rating} of 5 stars`}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    data-testid={`testimonials-tab_rating-${i}-${star}`}
                    onClick={() =>
                      updateTestimonial(
                        i,
                        "rating",
                        star as ITestimonial["rating"],
                      )
                    }
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    aria-pressed={star <= testimonial.rating}
                    title={`${star} star${star > 1 ? "s" : ""}`}
                    className={`p-1 rounded transition-colors ${star <= testimonial.rating ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
                  >
                    <Star className="w-5 h-5 fill-current" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <TextAreaField
              label="Text"
              value={testimonial.text}
              onChange={(v) =>
                updateTestimonial(i, "text", v as ITestimonial["text"])
              }
            />
          </div>
          <div className="mt-4">
            <TextField
              label="Date"
              value={testimonial.date}
              onChange={(v) =>
                updateTestimonial(i, "date", v as ITestimonial["date"])
              }
            />
          </div>
        </div>
      ))}
      <button
        onClick={addTestimonial}
        data-testid="testimonials-tab_add-btn"
        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        <Plus className="w-4 h-4" /> Add Testimonial
      </button>
    </div>
  );
}
