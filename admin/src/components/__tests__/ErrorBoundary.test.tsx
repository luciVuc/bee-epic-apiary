import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

/** A child that throws on render, to trip the boundary. */
function Boom(): never {
  throw new Error("kaboom: internal detail that must not surface");
}

describe("ErrorBoundary (admin)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children unchanged when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">all good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("all good");
    expect(screen.queryByTestId("app-error-boundary")).not.toBeInTheDocument();
  });

  it("renders the fallback when a child throws and does NOT leak the error message", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const fallback = screen.getByTestId("app-error-boundary");
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveTextContent("Something went wrong");
    expect(fallback).not.toHaveTextContent("kaboom");
    expect(
      screen.getByTestId("app-error-boundary_reload-btn"),
    ).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
  });
});
