export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-6 lg:px-8 lg:py-8" aria-busy="true" aria-label="Cargando">
      <div className="h-7 w-48 rounded bg-raised" />
      <div className="mt-2 h-4 w-72 rounded bg-raised" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-raised" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-2xl bg-raised" />
    </div>
  );
}
