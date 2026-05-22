import { Plus, Trash2, Star } from "lucide-react";
import type { ITestimonial } from "../../types/settings";
import { TextField, TextAreaField } from "../../components/forms";

export interface ITestimonialsTabProps {
  testimonialsContent: ITestimonial[];
  addTestimonial: () => void;
  updateTestimonial: <K extends keyof ITestimonial>(
    index: number,
    field: K,
    value: ITestimonial[K],
  ) => void;
  removeTestimonial: (index: number) => void;
}

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
          className="p-4 border border-gray-200 rounded-lg"
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
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
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
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() =>
                      updateTestimonial(
                        i,
                        "rating",
                        star as ITestimonial["rating"],
                      )
                    }
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    title={`${star} star${star > 1 ? "s" : ""}`}
                    className={`p-1 rounded transition-colors ${star <= testimonial.rating ? "text-yellow-400" : "text-gray-300"}`}
                  >
                    <Star className="w-5 h-5 fill-current" />
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
        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
      >
        <Plus className="w-4 h-4" /> Add Testimonial
      </button>
    </div>
  );
}
