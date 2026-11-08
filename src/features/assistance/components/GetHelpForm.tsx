"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  GetHelpFormInput,
  getHelpSchema,
  type GetHelpFormData,
} from "@/features/assistance/validation/getHelpSchema";

import { submitGetHelpRequest } from "@/features/assistance/actions/submitGetHelpRequest";

import {
  beginSubmissionAttempt, blockSubmissionAttempt,
  finishSubmissionAttempt, readSubmissionAttempt, verifyPendingAttempt,
  type PendingSubmissionAttempt, type PublicSubmissionAttempt,
} from "@/features/assistance/lib/publicSubmissionAttempt";

import { siteInfo } from "@/components/layout/siteInfo";
import { buttonStyles } from "@/components/ui/button";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/ui/icons";
import { demoMode } from "@/lib/demoMode";

const storageMessage = "We cannot safely save or restore this submission in this browser. No new attempt will be sent. If you already submitted, do not start another request for the same attempt.";
const retryMessage = "We could not confirm receipt. Keep this tab open and use Retry this submission to send the same saved details. Do not start another request for this attempt.";
const conflictMessage = "The saved submission could not be safely confirmed. It has been stopped to avoid a duplicate. Do not start another request for this attempt.";
const receivedButUnsavedMessage = "Your request was received, but this browser could not safely save the confirmation or clear saved details. Close this tab. Do not submit this request again.";

// Fields that can fail validation, in form order, with the id of the control
// the error summary links to.
const errorFields: [keyof GetHelpFormInput, string][] = [
  ["firstName", "first-name"],
  ["lastName", "last-name"],
  ["phone", "phone"],
  ["email", "email"],
  ["species", "species"],
  ["sex", "sex"],
  ["alteredStatus", "altered-status"],
  ["age", "age"],
  ["lastHeatCycleNotes", "last-heat-cycle"],
  ["helpSummary", "help-summary"],
  ["rabiesStatus", "rabies-status"],
  ["preventionUseStatus", "prevention-use"],
  ["availableDays", "available-monday"],
  ["statedContributionAmount", "contribution-amount"],
];

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const cardClass = "rounded-2xl bg-white p-5 shadow-sm sm:p-8";
const headingClass = "font-display text-2xl font-semibold text-primary";
const labelClass = "block text-sm font-medium text-text";
const hintClass = "mt-1 text-sm text-text/80";
const controlClass =
  "mt-2 block min-h-11 w-full rounded-lg border border-text/30 bg-white px-3 py-2 text-text " +
  "aria-invalid:border-2 aria-invalid:border-error disabled:bg-neutral disabled:text-text/60";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-error">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}

function DemoContactNote() {
  return (
    <p className="mt-4 border-t border-text/15 pt-4 text-sm text-text">
      This is a portfolio demo. If you need real help, contact MMAC at{" "}
      <a href={siteInfo.phoneHref} className="font-semibold text-primary underline">{siteInfo.phoneDisplay}</a>{" "}
      or{" "}
      <a href={`mailto:${siteInfo.email}`} className="break-all font-semibold text-primary underline">{siteInfo.email}</a>.
    </p>
  );
}

export function GetHelpForm() {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GetHelpFormInput, unknown, GetHelpFormData>({
    resolver: zodResolver(getHelpSchema),
    // The error summary takes focus on a failed submit instead of the first field.
    shouldFocusError: false,
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      animalName: "",
      species: "",
      sex: "",
      alteredStatus: "",
      age: "",
      breed: "",
      colorDescription: "",
      lastHeatCycleNotes: "",
      helpSummary: "",
      rabiesStatus: "",
      preventionUseStatus: "",
      preventionProduct: "",
      medicalConcerns: "",
      availableDays: [],
      transportationNotes: "",
      additionalInformation: "",
    },
  });
  const [submitResult, setSubmitResult] = useState<
  Awaited<ReturnType<typeof submitGetHelpRequest>> | null
>(null);

  const [attempt, setAttempt] = useState<PublicSubmissionAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const currentAttempt = useRef<PublicSubmissionAttempt | null>(null);
  const [invalidSubmits, setInvalidSubmits] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Storage is browser-only. Defer hydration to avoid SSR access and disable
    // submission until restoration has completed.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = readSubmissionAttempt(window.sessionStorage);
        currentAttempt.current = saved;
        setAttempt(saved);
        if (saved && saved.state !== "complete") reset(saved.submission.data, { keepDefaultValues: true });
        if (saved?.state === "complete") setSubmitResult({ success: true, requestId: saved.requestId, status: "new" });
      } catch {
        setStorageError(storageMessage);
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [reset]);

  // Move focus to the error summary after each failed submit.
  useEffect(() => {
    if (invalidSubmits > 0) summaryRef.current?.focus();
  }, [invalidSubmits]);

  const sex = useWatch({
    control,
    name: "sex",
  });

  const alteredStatus = useWatch({
    control,
    name: "alteredStatus",
  });

  const shouldShowHeatCycle =
    sex === "female" && alteredStatus === "unaltered";

  const sendAttempt = async (pending: PendingSubmissionAttempt) => {
    if (inFlight.current || storageError) return;
    inFlight.current = true;
    setSending(true);
    setSubmitResult(null);
    try {
      const submission = verifyPendingAttempt(window.sessionStorage, pending);
      let result: Awaited<ReturnType<typeof submitGetHelpRequest>>;
      try {
        result = await submitGetHelpRequest(submission);
      } catch {
        // A lost Server Action response may follow a successful database commit.
        setSubmitResult({ success: false, code: "unconfirmed", message: retryMessage });
        return;
      }
      setSubmitResult(result);
      if (result.success) {
        reset(); // Clear sensitive DOM and React state even if storage fails.
        const completed: PublicSubmissionAttempt = { version: 1, state: "complete",
          submissionId: pending.submission.submissionId, requestId: result.requestId };
        currentAttempt.current = completed;
        setAttempt(completed);
        finishSubmissionAttempt(window.sessionStorage, pending, result.requestId);
      } else if (result.code === "submission_conflict" || result.code === "validation") {
        // A later validation failure cannot disprove an earlier successful write.
        // Keep the original attempt; never unlock a fresh submission here.
        const blocked = blockSubmissionAttempt(window.sessionStorage, pending);
        currentAttempt.current = blocked;
        setAttempt(blocked);
      }
    } catch {
      setStorageError(storageMessage);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const onSubmit = async (data: GetHelpFormData) => {
    if (!ready || storageError || currentAttempt.current || inFlight.current) return;
    let pending: PendingSubmissionAttempt;
    try {
      pending = beginSubmissionAttempt(window.sessionStorage, data, () => crypto.randomUUID());
      currentAttempt.current = pending;
      setAttempt(pending);
    } catch {
      setStorageError(storageMessage);
      return;
    }
    await sendAttempt(pending);
  };

  const onInvalid = () => setInvalidSubmits(invalidSubmits + 1);

  // Accessibility wiring for a validated control: error styling, and the
  // control described by its hint (if any) and its error message (if any).
  const describe = (id: string, name: keyof GetHelpFormInput, hintId?: string) => {
    const describedBy = [hintId, errors[name] ? `${id}-error` : undefined].filter(Boolean).join(" ");
    return {
      id,
      "aria-invalid": errors[name] ? (true as const) : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };
  const errorMessage = (name: keyof GetHelpFormInput) => {
    const message = errors[name]?.message;
    return typeof message === "string" ? message : undefined;
  };

  const summaryItems = errorFields.flatMap(([name, id]) => {
    const message = errorMessage(name);
    return message ? [{ id, message }] : [];
  });

  // One card for every unresolved or failed state. A fresh server result
  // supersedes the saved-attempt message so the same advice isn't shown twice.
  const resultFailure = submitResult && !submitResult.success ? submitResult : null;
  const showAttemptMessage = !resultFailure || resultFailure.code === "validation";
  const problemMessages = [...new Set([
    storageError ? (submitResult?.success ? receivedButUnsavedMessage : storageError) : null,
    resultFailure?.message ?? null,
    showAttemptMessage && !storageError && !sending && !submitResult?.success && attempt?.state === "pending" ? retryMessage : null,
    showAttemptMessage && !storageError && attempt?.state === "conflict" ? conflictMessage : null,
  ].filter((message): message is string => Boolean(message)))];

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)} noValidate className="space-y-6">
      {invalidSubmits > 0 && summaryItems.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="error-summary-heading"
          className="rounded-2xl border-2 border-error bg-white p-5 sm:p-6"
        >
          <h2 id="error-summary-heading" className="flex items-center gap-2 text-lg font-semibold text-error">
            <AlertCircleIcon className="size-5 shrink-0" />
            Please check the following before sending:
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-error">
            {summaryItems.map(({ id, message }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="font-medium underline underline-offset-2"
                  onClick={(event) => {
                    const target = document.getElementById(id);
                    if (!target) return;
                    event.preventDefault();
                    target.focus();
                    target.scrollIntoView({ block: "center" });
                  }}
                >
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset disabled={!ready || sending || !!attempt || !!storageError || submitResult?.success === true} className="space-y-6">
      <legend className="sr-only">Assistance request details</legend>
      {/* ABOUT YOU */}
      <section aria-labelledby="about-you-heading" className={cardClass}>
        <h2 id="about-you-heading" className={headingClass}>
          About You
        </h2>

        <p className={hintClass}>Tell us how we can reach you.</p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="first-name" className={labelClass}>
              First name
            </label>
            <input
              type="text"
              autoComplete="given-name"
              className={controlClass}
              {...describe("first-name", "firstName")}
              {...register("firstName")}
            />
            <FieldError id="first-name" message={errorMessage("firstName")} />
          </div>

          <div>
            <label htmlFor="last-name" className={labelClass}>
              Last name
            </label>
            <input
              type="text"
              autoComplete="family-name"
              className={controlClass}
              {...describe("last-name", "lastName")}
              {...register("lastName")}
            />
            <FieldError id="last-name" message={errorMessage("lastName")} />
          </div>

          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone
            </label>
            <input
              type="tel"
              autoComplete="tel"
              className={controlClass}
              {...describe("phone", "phone")}
              {...register("phone")}
            />
            <FieldError id="phone" message={errorMessage("phone")} />
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              className={controlClass}
              {...describe("email", "email")}
              {...register("email")}
            />
            <FieldError id="email" message={errorMessage("email")} />
          </div>
        </div>
      </section>

      {/* ABOUT YOUR ANIMAL */}
      <section aria-labelledby="animal-heading" className={cardClass}>
        <h2 id="animal-heading" className={headingClass}>
          About Your Animal
        </h2>

        <p className={hintClass}>
          Start with one animal. We&apos;ll add support for multiple animals
          after we validate the basic form structure.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="animal-name" className={labelClass}>
              Animal&apos;s name
            </label>
            <input
              id="animal-name"
              type="text"
              className={controlClass}
              {...register("animalName")}
            />
          </div>

          <div>
            <label htmlFor="species" className={labelClass}>
              Species
            </label>
            <select
              className={controlClass}
              {...describe("species", "species")}
              {...register("species")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="other">Other</option>
            </select>
            <FieldError id="species" message={errorMessage("species")} />
          </div>

          <div>
            <label htmlFor="sex" className={labelClass}>
              Sex
            </label>
            <select
              className={controlClass}
              {...describe("sex", "sex")}
              {...register("sex")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Unknown</option>
            </select>
            <FieldError id="sex" message={errorMessage("sex")} />
          </div>

          <div>
            <label htmlFor="altered-status" className={labelClass}>
              Spay / neuter status
            </label>
            <select
              className={controlClass}
              {...describe("altered-status", "alteredStatus")}
              {...register("alteredStatus")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="altered">Spayed / neutered</option>
              <option value="unaltered">Not spayed / neutered</option>
              <option value="unknown">I&apos;m not sure</option>
            </select>
            <FieldError id="altered-status" message={errorMessage("alteredStatus")} />
          </div>

          <div>
            <label htmlFor="age" className={labelClass}>
              Approximate age
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              className={controlClass}
              {...describe("age", "age")}
              {...register("age")}
            />
            <FieldError id="age" message={errorMessage("age")} />
          </div>

          <div>
            <label htmlFor="breed" className={labelClass}>
              Breed, if known
            </label>
            <input
              id="breed"
              type="text"
              className={controlClass}
              {...register("breed")}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="color-description" className={labelClass}>
              Color or description
            </label>
            <input
              id="color-description"
              type="text"
              className={controlClass}
              {...register("colorDescription")}
            />
          </div>

          {shouldShowHeatCycle && (
            <div className="sm:col-span-2">
              <label htmlFor="last-heat-cycle" className={labelClass}>
                When was her last heat cycle?
              </label>

              <p id="last-heat-cycle-hint" className={hintClass}>
                An approximate answer is fine. If you aren&apos;t sure, you can
                enter &quot;Unknown.&quot;
              </p>

              <input
                type="text"
                {...register("lastHeatCycleNotes")}
                {...describe("last-heat-cycle", "lastHeatCycleNotes", "last-heat-cycle-hint")}
                className={controlClass}
              />

              <FieldError id="last-heat-cycle" message={errorMessage("lastHeatCycleNotes")} />
            </div>
          )}
        </div>
      </section>

      {/* HELP REQUESTED */}
      <section aria-labelledby="help-heading" className={cardClass}>
        <h2 id="help-heading" className={headingClass}>
          What Help Do You Need?
        </h2>

        <p className={hintClass}>
          Tell us what you are asking Macon Moves for help with. Requested
          services do not guarantee that care will be provided.
        </p>

        <div className="mt-6">
          <label htmlFor="help-summary" className={labelClass}>
            Tell us what you need help with
          </label>
          <p id="help-summary-hint" className={hintClass}>
            A sentence or two is plenty.
          </p>
          <textarea
            rows={4}
            className={controlClass}
            {...describe("help-summary", "helpSummary", "help-summary-hint")}
            {...register("helpSummary")}
          />
          <FieldError id="help-summary" message={errorMessage("helpSummary")} />
        </div>
      </section>

      {/* HEALTH & PREVENTION */}
      <section aria-labelledby="health-heading" className={cardClass}>
        <h2 id="health-heading" className={headingClass}>
          Health &amp; Prevention
        </h2>

        <p className={hintClass}>
          Answer what you know. It&apos;s okay if you aren&apos;t sure.
        </p>

        <div className="mt-6 grid gap-6">
          <div>
            <label htmlFor="rabies-status" className={labelClass}>
              Rabies vaccination status
            </label>
            <select
              className={controlClass}
              {...describe("rabies-status", "rabiesStatus")}
              {...register("rabiesStatus")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="current">Current</option>
              <option value="not_current">Not current</option>
              <option value="unknown">I&apos;m not sure</option>
            </select>
            <FieldError id="rabies-status" message={errorMessage("rabiesStatus")} />
          </div>

          <div>
            <label htmlFor="prevention-use" className={labelClass}>
              Is your animal currently receiving parasite prevention?
            </label>
            <select
              className={controlClass}
              {...describe("prevention-use", "preventionUseStatus")}
              {...register("preventionUseStatus")}
              defaultValue=""
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="using">Yes</option>
              <option value="not_using">No</option>
              <option value="unknown">I&apos;m not sure</option>
            </select>
            <FieldError id="prevention-use" message={errorMessage("preventionUseStatus")} />
          </div>

          <div>
            <label htmlFor="prevention-product" className={labelClass}>
              Prevention product, if known
            </label>
            <input
              id="prevention-product"
              type="text"
              className={controlClass}
              {...register("preventionProduct")}
            />
          </div>

          <div>
            <label htmlFor="medical-concerns" className={labelClass}>
              Are there any health concerns we should know about?
            </label>
            <p id="medical-concerns-hint" className={hintClass}>
              Tell us about anything you&apos;ve noticed, such as changes in
              appetite or energy, vomiting, discharge, swelling, possible
              pregnancy, or anything else that concerns you.
            </p>
            <textarea
              id="medical-concerns"
              rows={4}
              aria-describedby="medical-concerns-hint"
              className={controlClass}
              {...register("medicalConcerns")}
            />
          </div>
        </div>
      </section>

      {/* TRANSPORTATION & AVAILABILITY */}
      <section aria-labelledby="availability-heading" className={cardClass}>
        <h2 id="availability-heading" className={headingClass}>
          Transportation &amp; Availability
        </h2>

        <p className={hintClass}>
          Surgery appointments typically require morning drop-off. Tell us which
          mornings you could usually make work. This does not reserve an
          appointment.
        </p>

        <fieldset
          className="mt-6"
          aria-describedby={errorMessage("availableDays") ? "available-monday-error" : undefined}
        >
          <legend className="text-sm font-medium text-text">
            Which mornings could you usually make an appointment?
          </legend>

          <p className={hintClass}>
            Select all that apply. This does not reserve an appointment.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {days.map((day) => {
              const value = day.toLowerCase();

              return (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-text/30 bg-white px-3 py-2 has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    id={`available-${value}`}
                    type="checkbox"
                    value={value}
                    {...register("availableDays")}
                    className="size-5 accent-primary"
                  />

                  <span className="text-sm">{day}</span>
                </label>
              );
            })}
          </div>
          <FieldError id="available-monday" message={errorMessage("availableDays")} />
        </fieldset>

        <div className="mt-6">
          <label htmlFor="transportation-notes" className={labelClass}>
            Transportation limitations or scheduling concerns
          </label>
          <textarea
            id="transportation-notes"
            rows={3}
            className={controlClass}
            {...register("transportationNotes")}
          />
        </div>
      </section>

      {/* ADDITIONAL INFORMATION */}
      <section aria-labelledby="additional-heading" className={cardClass}>
        <h2 id="additional-heading" className={headingClass}>
          Anything Else?
        </h2>

        <div className="mt-6">
          <label htmlFor="additional-info" className={labelClass}>
            Additional information
          </label>
          <textarea
            id="additional-info"
            rows={4}
            className={controlClass}
            {...register("additionalInformation")}
          />
        </div>
      </section>

      <section aria-labelledby="contribution-heading" className={cardClass}>
        <h2 id="contribution-heading" className={headingClass}>
          Your Contribution
        </h2>

        <p className={hintClass}>
          If you are able to contribute toward the cost of your animal&apos;s
          care, please tell us approximately how much. It&apos;s okay if you
          aren&apos;t able to contribute.
        </p>

        <div className="mt-6">
          <label htmlFor="contribution-amount" className={labelClass}>
            Amount you may be able to contribute
          </label>

          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="mt-2 text-text">$</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="0"
              className={`${controlClass} sm:max-w-xs`}
              {...describe("contribution-amount", "statedContributionAmount")}
              {...register("statedContributionAmount")}
            />
          </div>
          <FieldError id="contribution-amount" message={errorMessage("statedContributionAmount")} />
        </div>
      </section>

      </fieldset>

      {problemMessages.length > 0 && (
        <div role="alert" className="rounded-2xl border-2 border-error/40 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="mt-0.5 size-6 shrink-0 text-error" />
            <div className="space-y-2">
              {problemMessages.map((message) => (
                <p key={message} className="font-medium text-text">{message}</p>
              ))}
            </div>
          </div>
          {demoMode && <DemoContactNote />}
        </div>
      )}

      {submitResult?.success && (
        <div role="status" className="rounded-2xl border-2 border-secondary bg-secondary/10 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-display text-xl font-semibold text-primary">
            <CheckCircleIcon className="size-6 shrink-0 text-secondary" />
            Request received.
          </p>
          <p className="mt-2 text-text">
            Macon Moves Animal Care has received your request and will review it.
          </p>
        </div>
      )}

      {attempt?.state === "pending" && !submitResult?.success ? (
        <button type="button" disabled={sending || !!storageError}
          onClick={() => void sendAttempt(attempt)}
          className={buttonStyles("primary", "w-full sm:w-auto")}>
          {sending ? "Sending…" : "Retry this submission"}
        </button>
      ) : (
        <button
          type="submit"
          disabled={!ready || isSubmitting || sending || !!storageError || !!attempt || submitResult?.success === true}
          className={buttonStyles("primary", "w-full sm:w-auto")}
        >
          {isSubmitting || sending ? "Sending…" : "Submit Request"}
        </button>
      )}
    </form>
  );
}
