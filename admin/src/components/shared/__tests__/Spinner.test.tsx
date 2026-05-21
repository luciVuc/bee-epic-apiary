import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Spinner } from "../Spinner";

describe("Spinner", () => {
  it("renders with default className", () => {
    const { container } = render(<Spinner />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain("h-64");
    expect(outerDiv.className).toContain("flex");
  });

  it("renders with custom className", () => {
    const { container } = render(<Spinner className="h-32" />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain("h-32");
    expect(outerDiv.className).not.toContain("h-64");
  });

  it("renders the animated spinner element", () => {
    const { container } = render(<Spinner />);
    const spinnerDiv = container.querySelector(".animate-spin");
    expect(spinnerDiv).toBeInTheDocument();
  });
});
