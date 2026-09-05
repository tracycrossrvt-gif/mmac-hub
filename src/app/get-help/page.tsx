import { GetHelpForm } from "@/features/assistance/components/GetHelpForm";

export default function GetHelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium uppercase tracking-wide">
          Macon Moves Animal Care
        </p>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Get Help
        </h1>

        <p className="mt-4 text-base leading-7">
          Tell us about you, your animal, and the help you need. Submitting this
          form does not schedule an appointment. Macon Moves will review your
          request and contact you about available options.
        </p>
      </div>

      <GetHelpForm />
    </main>
  );
}