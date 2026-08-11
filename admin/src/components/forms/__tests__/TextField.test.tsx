import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextField } from "../TextField";

describe("TextField", () => {
  it("renders label and input", () => {
    render(<TextField label="Name" value="" onChange={() => {}} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders with provided value", () => {
    render(<TextField label="Name" value="John" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("John");
  });

  it("calls onChange when value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextField label="Name" value="" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders with placeholder", () => {
    render(
      <TextField
        label="Name"
        value=""
        onChange={() => {}}
        placeholder="Enter name"
      />,
    );
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
  });

  it("renders with custom type", () => {
    const { container } = render(
      <TextField
        label="Key"
        value=""
        onChange={() => {}}
        type="password"
        name="secret"
      />,
    );
    const input = container.querySelector("input");
    expect(input).toHaveAttribute("type", "password");
  });

  it("handles null value by showing empty string", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TextField label="Name" value={null as any} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("defaults type to text", () => {
    render(<TextField label="Name" value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "text");
  });

  it("wires aria-required when required", () => {
    render(<TextField label="Name" value="" onChange={() => {}} required />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  it("renders an error node and links it via aria-describedby", () => {
    render(
      <TextField
        label="Name"
        value=""
        onChange={() => {}}
        name="fullname"
        error="Name is required"
      />,
    );
    const input = screen.getByRole("textbox");
    const error = screen.getByTestId("text-field_error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(error).toHaveTextContent("Name is required");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("has no error node and is not invalid when error is unset", () => {
    render(<TextField label="Name" value="" onChange={() => {}} />);
    expect(screen.queryByTestId("text-field_error")).toBeNull();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });
});
