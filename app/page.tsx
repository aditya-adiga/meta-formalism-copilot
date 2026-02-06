import BookSpineDivider from "@/app/components/ui/BookSpineDivider";
import InputPanel from "@/app/components/panels/InputPanel";
import OutputPanel from "@/app/components/panels/OutputPanel";

export default function Home() {
  return (
    <main className="relative grid h-screen grid-cols-2 gap-px overflow-hidden bg-[var(--ivory-cream)]">
      <section className="flex flex-col overflow-hidden shadow-sm" aria-label="Input panel">
        <InputPanel />
      </section>
      <section className="flex flex-col overflow-hidden shadow-sm" aria-label="Output panel">
        <OutputPanel />
      </section>
      <BookSpineDivider />
    </main>
  );
}
