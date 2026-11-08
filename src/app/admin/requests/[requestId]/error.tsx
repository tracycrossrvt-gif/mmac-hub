"use client";

export default function RequestError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl px-4 py-10">
    <h1 className="text-2xl font-bold">Unable to load this case</h1>
    <p className="mt-3">The request or its history could not be loaded. Please try again.</p>
    <button onClick={reset} className="mt-5 rounded-md border px-4 py-2">Try again</button>
  </main>;
}
