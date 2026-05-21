import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Section } from "../Section";

describe("Section", () => {
  it("renders title and children", () => {
    render(
      <Section title="My Section">
        <p>Child content</p>
      </Section>,
    );
    expect(screen.getByText("My Section")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders with icon", () => {
    render(
      <Section title="Settings" icon={<span data-testid="icon">🔧</span>}>
        <p>Content</p>
      </Section>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders without icon", () => {
    render(
      <Section title="No Icon">
        <p>Content</p>
      </Section>,
    );
    expect(screen.getByText("No Icon")).toBeInTheDocument();
  });
});
