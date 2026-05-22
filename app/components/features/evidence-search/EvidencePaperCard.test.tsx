import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidencePaperCard from "./EvidencePaperCard";
import type { EvidencePaper } from "@/app/lib/types/evidence";

const paper = (over: Partial<EvidencePaper>): EvidencePaper => ({
  openAlexId: "W1",
  title: "Defaults and retirement savings",
  authors: ["Thaler"],
  year: 2008,
  abstract: null,
  citedByCount: 10,
  journal: null,
  doi: null,
  oaUrl: null,
  reliability: null,
  relatedness: null,
  status: "retrieved",
  ...over,
});

describe("EvidencePaperCard prune/restore", () => {
  it("shows a prune control on an active paper and calls onPrune", async () => {
    const onPrune = vi.fn();
    render(<EvidencePaperCard paper={paper({})} onPrune={onPrune} onRestore={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /prune/i }));
    expect(onPrune).toHaveBeenCalledTimes(1);
  });

  it("shows a restore control on a pruned paper and calls onRestore", async () => {
    const onRestore = vi.fn();
    render(
      <EvidencePaperCard paper={paper({ status: "pruned" })} onPrune={() => {}} onRestore={onRestore} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("renders the lifecycle status label", () => {
    render(<EvidencePaperCard paper={paper({ status: "evaluated" })} onPrune={() => {}} onRestore={() => {}} />);
    expect(screen.getByText(/evaluated/i)).toBeInTheDocument();
  });
});
