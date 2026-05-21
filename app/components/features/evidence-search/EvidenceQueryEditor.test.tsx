import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidenceQueryEditor from "./EvidenceQueryEditor";

describe("EvidenceQueryEditor", () => {
  it("renders one input per query", () => {
    render(<EvidenceQueryEditor queries={["alpha", "beta"]} isLoading={false} onRerun={() => {}} />);
    expect(screen.getByDisplayValue("alpha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("beta")).toBeInTheDocument();
  });

  it("adds and removes query rows", async () => {
    render(<EvidenceQueryEditor queries={["alpha"]} isLoading={false} onRerun={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /add query/i }));
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);

    await userEvent.click(screen.getAllByRole("button", { name: /remove query/i })[0]);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("calls onRerun with the trimmed, non-empty query list", async () => {
    const onRerun = vi.fn();
    render(<EvidenceQueryEditor queries={["alpha"]} isLoading={false} onRerun={onRerun} />);
    await userEvent.click(screen.getByRole("button", { name: /add query/i }));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[1], "  beta  ");
    await userEvent.click(screen.getByRole("button", { name: /re-run/i }));
    expect(onRerun).toHaveBeenCalledWith(["alpha", "beta"]);
  });

  it("disables the re-run button while loading", () => {
    render(<EvidenceQueryEditor queries={["alpha"]} isLoading onRerun={() => {}} />);
    expect(screen.getByRole("button", { name: /searching/i })).toBeDisabled();
  });
});
