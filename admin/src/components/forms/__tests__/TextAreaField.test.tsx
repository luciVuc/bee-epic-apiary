import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextAreaField } from "../TextAreaField";

describe("TextAreaField", () => {
  it("renders label and textarea", () => {
    render(<TextAreaField label="Description" value="" onChange={() => {}} />);
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("hides label when hideLabel is true", () => {
    render(
      <TextAreaField
        label="Hidden Label"
        value=""
        onChange={() => {}}
        hideLabel
      />,
    );
    expect(screen.queryByText("Hidden Label")).not.toBeInTheDocument();
  });

  it("renders with provided value", () => {
    render(<TextAreaField label="Desc" value="Hello" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("Hello");
  });

  it("calls onChange when value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextAreaField label="Desc" value="" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("links label to textarea via htmlFor/name", () => {
    render(
      <TextAreaField label="Bio" value="" onChange={() => {}} name="bio" />,
    );
    const label = screen.getByText("Bio");
    const textarea = screen.getByRole("textbox");
    expect(label).toHaveAttribute("for", "bio");
    expect(textarea).toHaveAttribute("name", "bio");
  });

  it("handles null value by showing empty string", () => {
    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <TextAreaField label="Desc" value={null as any} onChange={() => {}} />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps an accessible name via aria-label when hideLabel is true", () => {
    render(
      <TextAreaField
        label="Hidden Label"
        value=""
        onChange={() => {}}
        hideLabel
      />,
    );
    // Not visible as text, but still reachable by accessible name.
    expect(screen.getByLabelText("Hidden Label")).toBeInTheDocument();
  });

  it("renders an error node and links it via aria-describedby", () => {
    render(
      <TextAreaField
        label="Desc"
        value=""
        onChange={() => {}}
        name="desc"
        error="Description is required"
      />,
    );
    const textarea = screen.getByRole("textbox");
    const error = screen.getByTestId("text-area-field_error");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(error).toHaveTextContent("Description is required");
    expect(textarea.getAttribute("aria-describedby")).toBe(error.id);
  });
});
