import type { Metadata } from "next";

import { GetHelpForm } from "@/features/assistance/components/GetHelpForm";

// Intake page per docs/DESIGN.md "Intake page (/get-help)". Copy comes from
// the spec verbatim; don't add copy that isn't there.

const intro =
  "Tell us about yourself and your pet. It's okay if you aren't sure about some answers — Macon Moves will review your request and be in touch.";

export const metadata: Metadata = {
  title: "Get Help",
  description: intro,
};

export default function GetHelpPage() {
  return (
    <div className="bg-sand">
      <section data-surface="dark" className="bg-primary text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-14">
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Ask for Help</h1>
          <p className="mt-4 text-lg leading-relaxed text-white/90">{intro}</p>
          <p className="mt-3 leading-relaxed text-white/90">
            If your connection drops, your answers are saved in this browser tab until your request goes through.
          </p>
          <p className="mt-6 rounded-xl bg-white/10 p-4 text-sm leading-relaxed">
            Requesting help doesn&apos;t guarantee services. Rabies vaccination is required for most veterinary
            care coordinated through MMAC. If your pet isn&apos;t current or you&apos;re unsure, it may be included
            as part of their care.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <GetHelpForm />
      </div>
    </div>
  );
}
