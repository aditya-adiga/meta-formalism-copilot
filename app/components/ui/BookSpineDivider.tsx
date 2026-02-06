export default function BookSpineDivider() {
  return (
    <div
      className="absolute left-1/2 top-0 z-10 h-full w-px -translate-x-1/2"
      aria-hidden
    >
      <div
        className="h-full w-full"
        style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(26, 26, 26, 0.08) 10%, rgba(26, 26, 26, 0.08) 90%, transparent 100%)",
          boxShadow: "0 0 4px rgba(26, 26, 26, 0.04)",
        }}
      />
    </div>
  );
}
