import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileUpload from "./FileUpload";

// Mock the extraction module so we don't need real pdfjs-dist in tests
vi.mock("@/app/lib/utils/fileExtraction", () => ({
  extractTextFromFile: vi.fn(async (file: File) => {
    if (file.name.endsWith(".txt")) return `extracted: ${file.name}`;
    if (file.name.endsWith(".pdf")) return `pdf content: ${file.name}`;
    throw new Error("Unsupported file type");
  }),
}));

function createFile(name: string, content = ""): File {
  return new File([content], name, {
    type: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
  });
}

describe("FileUpload", () => {
  it("renders the upload button with accepted file types", () => {
    render(<FileUpload />);
    expect(screen.getByText(".txt, .md, .tex, .docx, .pdf")).toBeInTheDocument();
  });

  it("does not show a file list when no files are uploaded", () => {
    render(<FileUpload />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows file name and status after upload", async () => {
    const user = userEvent.setup();
    const onFilesChanged = vi.fn();
    render(<FileUpload onFilesChanged={onFilesChanged} />);

    const input = screen.getByLabelText("Choose files") as HTMLInputElement;
    await user.upload(input, createFile("paper.txt", "hello"));

    expect(await screen.findByText("paper.txt")).toBeInTheDocument();
    // Should show ready status (checkmark) after extraction completes
    expect(await screen.findByText("✓")).toBeInTheDocument();

    // Callback should have been called with extracted text (includes File reference)
    expect(onFilesChanged).toHaveBeenCalledWith([
      expect.objectContaining({ name: "paper.txt", text: "extracted: paper.txt" }),
    ]);
  });

  it("shows error for unsupported file types", async () => {
    const user = userEvent.setup();
    render(<FileUpload />);

    const input = screen.getByLabelText("Choose files") as HTMLInputElement;
    await user.upload(input, createFile("doc.docx", "content"));

    expect(await screen.findByText("doc.docx")).toBeInTheDocument();
    expect(await screen.findByText("✗")).toBeInTheDocument();
  });

  it("removes a file when clicking the remove button", async () => {
    const user = userEvent.setup();
    const onFilesChanged = vi.fn();
    render(<FileUpload onFilesChanged={onFilesChanged} />);

    const input = screen.getByLabelText("Choose files") as HTMLInputElement;
    await user.upload(input, createFile("test.txt", "hi"));

    await screen.findByText("✓");

    const removeBtn = screen.getByRole("button", {
      name: /Remove test\.txt/i,
    });
    await user.click(removeBtn);

    expect(screen.queryByText("test.txt")).not.toBeInTheDocument();
    expect(onFilesChanged).toHaveBeenLastCalledWith([]);
  });

  it("accumulates multiple uploads", async () => {
    const user = userEvent.setup();
    const onFilesChanged = vi.fn();
    render(<FileUpload onFilesChanged={onFilesChanged} />);

    const input = screen.getByLabelText("Choose files") as HTMLInputElement;
    await user.upload(input, createFile("a.txt", "aaa"));
    await screen.findByText("✓");

    await user.upload(input, createFile("b.txt", "bbb"));
    const checks = await screen.findAllByText("✓");
    expect(checks).toHaveLength(2);

    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });
});
