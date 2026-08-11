import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectField } from "../SelectField";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("SelectField", () => {
  it("renders label and select with options", () => {
    render(
      <SelectField
        label="Choice"
        value="a"
        onChange={() => {}}
        options={OPTIONS}
      />,
    );
    expect(screen.getByText("Choice")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
  });

  it("reflects the provided value", () => {
    render(
      <SelectField
        label="Choice"
        value="b"
        onChange={() => {}}
        options={OPTIONS}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("b");
  });

  it("calls onChange when a new option is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectField
        label="Choice"
        value="a"
        onChange={onChange}
        options={OPTIONS}
      />,
    );
    await user.selectOptions(screen.getByRole("combobox"), "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("links label to select via htmlFor/name", () => {
    render(
      <SelectField
        label="Choice"
        value="a"
        onChange={() => {}}
        options={OPTIONS}
        name="choice"
      />,
    );
    expect(screen.getByText("Choice")).toHaveAttribute("for", "choice");
    expect(screen.getByRole("combobox")).toHaveAttribute("name", "choice");
  });

  it("wires aria-required when required", () => {
    render(
      <SelectField
        label="Choice"
        value="a"
        onChange={() => {}}
        options={OPTIONS}
        required
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  it("renders an error node and links it via aria-describedby", () => {
    render(
      <SelectField
        label="Choice"
        value="a"
        onChange={() => {}}
        options={OPTIONS}
        name="choice"
        error="Pick one"
      />,
    );
    const select = screen.getByRole("combobox");
    const error = screen.getByTestId("select-field_error");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(error).toHaveTextContent("Pick one");
    expect(select.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("has no error node when error is unset", () => {
    render(
      <SelectField
        label="Choice"
        value="a"
        onChange={() => {}}
        options={OPTIONS}
      />,
    );
    expect(screen.queryByTestId("select-field_error")).toBeNull();
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-invalid");
  });
});
