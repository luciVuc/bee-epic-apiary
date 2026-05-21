import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProcessTab } from "../ProcessTab";
import { DEFAULT_PROCESS } from "../../../utils/constants";

const defaultProcess = DEFAULT_PROCESS;

function renderTab(
  props: Partial<React.ComponentProps<typeof ProcessTab>> = {},
) {
  return render(
    <ProcessTab
      processContent={defaultProcess}
      addProcessStep={vi.fn()}
      updateProcessStep={vi.fn()}
      removeProcessStep={vi.fn()}
      {...props}
    />,
  );
}

describe("ProcessTab", () => {
  it("renders all process steps", () => {
    renderTab();
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 5")).toBeInTheDocument();
  });

  it("renders add step button", () => {
    renderTab();
    expect(screen.getByText("Add Step")).toBeInTheDocument();
  });

  it("renders step titles from DEFAULT_PROCESS", () => {
    renderTab();
    expect(screen.getByDisplayValue("The Hive")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Harvest")).toBeInTheDocument();
  });

  it("calls addProcessStep when Add Step is clicked", async () => {
    const user = userEvent.setup();
    const addProcessStep = vi.fn();
    renderTab({ addProcessStep });
    await user.click(screen.getByText("Add Step"));
    expect(addProcessStep).toHaveBeenCalledTimes(1);
  });

  it("calls removeProcessStep when delete button is clicked", async () => {
    const user = userEvent.setup();
    const removeProcessStep = vi.fn();
    renderTab({ removeProcessStep });
    const removeButtons = screen.getAllByLabelText(/Remove process step/);
    await user.click(removeButtons[0]);
    expect(removeProcessStep).toHaveBeenCalledWith(0);
  });

  it("calls updateProcessStep when title changes", async () => {
    const user = userEvent.setup();
    const updateProcessStep = vi.fn();
    renderTab({ updateProcessStep });

    const titleInputs = screen.getAllByDisplayValue(
      /^The Hive|Foraging|The Nectar|Sealing|Harvest$/,
    );
    await user.type(titleInputs[0], "z");
    expect(updateProcessStep).toHaveBeenCalled();
  });
});
