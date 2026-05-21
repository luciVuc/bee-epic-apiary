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
    render(<TextField label="Name" value={null as any} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("defaults type to text", () => {
    render(<TextField label="Name" value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "text");
  });
});
