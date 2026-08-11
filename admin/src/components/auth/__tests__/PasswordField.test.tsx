/**
 * Tests for the reusable password input (Task 10.14).
 *
 * PasswordField is a small controlled input with:
 *  - a show/hide toggle that flips input type between "password" and "text";
 *  - an optional hints list (rendered when the `policy` prop is provided,
 *    even as null) driven by `evaluate` from utils/authPolicy.
 *
 * The value itself stays fully controlled by the caller — the only piece of
 * internal state is the reveal toggle.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordField } from "../PasswordField";

describe("PasswordField", () => {
  it("starts as type=password and toggles to type=text on show/hide click", () => {
    render(
      <PasswordField id="pw" label="Password" value="" onChange={() => {}} />,
    );
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    // When hidden, the toggle offers to reveal.
    const toggle = screen.getByRole("button", { name: /show password/i });
    fireEvent.click(toggle);

    expect(input.type).toBe("text");
    // Accessible name flips.
    expect(screen.getByRole("button", { name: /hide password/i })).toBeTruthy();
  });

  it("renders one <li> per hint when policy is passed (null policy, empty value → both hints failing)", () => {
    render(
      <PasswordField
        id="pw"
        label="Password"
        value=""
        onChange={() => {}}
        policy={null}
      />,
    );
    const list = screen.getByTestId("password-field_hints");
    const items = list.querySelectorAll("li");
    expect(items.length).toBe(2);
    // Both hints failing → both start with ✘
    expect(items[0].textContent).toContain("✘");
    expect(items[0].textContent).toContain("At least 12 characters");
    expect(items[1].textContent).toContain("✘");
    expect(items[1].textContent).toContain("Not a commonly-used password");
  });

  it("emits onChange on every keystroke with the typed value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PasswordField id="pw" label="Password" value="" onChange={onChange} />,
    );
    const input = screen.getByLabelText("Password");
    await user.type(input, "abc");
    // userEvent.type fires onChange once per character; since the input is
    // controlled with value="" the input never accumulates, so each call
    // receives a single character. Verify onChange was called and the last
    // call carries the last typed character.
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("does not render the hints list when the policy prop is omitted", () => {
    render(
      <PasswordField
        id="pw"
        label="Password"
        value="anything"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("password-field_hints")).toBeNull();
  });
});
