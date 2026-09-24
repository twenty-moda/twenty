import { Package, Smartphone, Store, Truck } from "lucide-react";

const benefits = [
  { icon: Truck, title: "Delivery en Lima", text: "Recíbelo en 24 a 48 horas" },
  { icon: Package, title: "Envíos a todo el Perú", text: "Por Shalom u Olva" },
  { icon: Smartphone, title: "Paga como quieras", text: "Yape, Plin o tarjeta" },
  { icon: Store, title: "Recojo gratis", text: "En nuestra tienda de Gamarra" },
];

export function Benefits() {
  return (
    <section aria-label="Beneficios" className="mx-auto max-w-7xl 2xl:max-w-[96rem] px-4 py-8 lg:px-6">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {benefits.map(({ icon: Icon, title, text }) => (
          <li key={title} className="reveal rounded-xl border border-line p-4">
            <Icon className="size-6" aria-hidden />
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
