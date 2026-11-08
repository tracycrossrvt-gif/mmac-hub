import type { ComponentType, SVGProps } from "react";

import { FamilyIcon, HeartIcon, MapPinIcon } from "@/components/ui/icons";

// docs/DESIGN.md: these are statements, not numbers. Do not add figures.
const stats: { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { label: "Families Supported and Growing", Icon: FamilyIcon },
  { label: "3 Counties Served", Icon: MapPinIcon },
  { label: "Healthier Pets at Home", Icon: HeartIcon },
];

export function StatsBar() {
  return (
    <section aria-label="Our impact" className="border-t border-sand bg-white">
      <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
        {stats.map(({ label, Icon }) => (
          <li key={label} className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand text-secondary">
              <Icon className="size-6" />
            </span>
            <span className="text-sm font-medium text-primary sm:text-base">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
