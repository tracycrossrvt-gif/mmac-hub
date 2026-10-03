"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  GetHelpFormInput,
  getHelpSchema,
  type GetHelpFormData,
} from "@/features/assistance/validation/getHelpSchema";

import { submitGetHelpRequest } from "@/features/assistance/actions/submitGetHelpRequest";

export function GetHelpForm() {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<GetHelpFormInput, unknown, GetHelpFormData>({
    resolver: zodResolver(getHelpSchema),
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

  const onSubmit = async (data: GetHelpFormData) => {
  const result = await submitGetHelpRequest(data);

  setSubmitResult(result);
};

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-10">
      {/* ABOUT YOU */}
      <section aria-labelledby="about-you-heading">
        <h2 id="about-you-heading" className="text-xl font-semibold">
          About You
        </h2>

        <p className="mt-2 text-sm">Tell us how we can reach you.</p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="first-name" className="block text-sm font-medium">
              First name
            </label>
            <input
              id="first-name"
              type="text"
              autoComplete="given-name"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("firstName")}
            />
            {errors.firstName && (
              <p className="mt-1 text-sm" role="alert">
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="last-name" className="block text-sm font-medium">
              Last name
            </label>
            <input
              id="last-name"
              type="text"
              autoComplete="family-name"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("lastName")}
            />
            {errors.lastName && (
              <p className="mt-1 text-sm" role="alert">
                {errors.lastName.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="mt-1 text-sm" role="alert">
                {errors.phone.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-sm" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ABOUT YOUR ANIMAL */}
      <section aria-labelledby="animal-heading">
        <h2 id="animal-heading" className="text-xl font-semibold">
          About Your Animal
        </h2>

        <p className="mt-2 text-sm">
          Start with one animal. We&apos;ll add support for multiple animals
          after we validate the basic form structure.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="animal-name" className="block text-sm font-medium">
              Animal&apos;s name
            </label>
            <input
              id="animal-name"
              type="text"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("animalName")}
            />
          </div>

          <div>
            <label htmlFor="species" className="block text-sm font-medium">
              Species
            </label>
            <select
              id="species"
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-black"
              {...register("species")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="other">Other</option>
            </select>
            {errors.species && (
              <p className="mt-1 text-sm" role="alert">
                {errors.species.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="sex" className="block text-sm font-medium">
              Sex
            </label>
            <select
              id="sex"
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-black"
              {...register("sex")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Unknown</option>
            </select>
            {errors.sex && (
              <p className="mt-1 text-sm" role="alert">
                {errors.sex.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="altered-status"
              className="block text-sm font-medium"
            >
              Spay / neuter status
            </label>
            <select
              id="altered-status"
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-black"
              {...register("alteredStatus")}
            >
              <option value="" disabled>
                Select one
              </option>
              <option value="altered">Spayed / neutered</option>
              <option value="unaltered">Not spayed / neutered</option>
              <option value="unknown">I&apos;m not sure</option>
            </select>

            {errors.alteredStatus && (
              <p className="mt-1 text-sm" role="alert">
                {errors.alteredStatus.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="age" className="block text-sm font-medium">
              Approximate age
            </label>
            <input
              id="age"
              type="number"
              min="0"
              step="0.1"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("age")}
            />
          </div>

          <div>
            <label htmlFor="breed" className="block text-sm font-medium">
              Breed, if known
            </label>
            <input
              id="breed"
              type="text"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("breed")}
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="color-description"
              className="block text-sm font-medium"
            >
              Color or description
            </label>
            <input
              id="color-description"
              type="text"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("colorDescription")}
            />
          </div>

          {shouldShowHeatCycle && (
            <div className="sm:col-span-2">
              <label
                htmlFor="last-heat-cycle"
                className="block text-sm font-medium"
              >
                When was her last heat cycle?
              </label>

              <p className="mt-1 text-sm">
                An approximate answer is fine. If you aren&apos;t sure, you can
                enter &quot;Unknown.&quot;
              </p>

              <input
                id="last-heat-cycle"
                type="text"
                {...register("lastHeatCycleNotes")}
                className="mt-2 w-full rounded-md border px-3 py-2"
              />

              {errors.lastHeatCycleNotes && (
                <p className="mt-1 text-sm" role="alert">
                  {errors.lastHeatCycleNotes.message}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* HELP REQUESTED */}
      <section aria-labelledby="help-heading">
        <h2 id="help-heading" className="text-xl font-semibold">
          What Help Do You Need?
        </h2>

        <p className="mt-2 text-sm">
          Tell us what you are asking Macon Moves for help with. Requested
          services do not guarantee that care will be provided.
        </p>

        <div className="mt-6">
          <label htmlFor="help-summary" className="block text-sm font-medium">
            Tell us what you need help with
          </label>
          <textarea
            id="help-summary"
            rows={4}
            className="mt-2 w-full rounded-md border px-3 py-2"
            {...register("helpSummary")}
          />

          {errors.helpSummary && (
            <p className="mt-1 text-sm" role="alert">
              {errors.helpSummary.message}
            </p>
          )}
        </div>
      </section>

      {/* HEALTH & PREVENTION */}
      <section aria-labelledby="health-heading">
        <h2 id="health-heading" className="text-xl font-semibold">
          Health &amp; Prevention
        </h2>

        <p className="mt-2 text-sm">
          Answer what you know. It&apos;s okay if you aren&apos;t sure.
        </p>

        <div className="mt-6 grid gap-6">
          <div>
  <label
    htmlFor="rabies-status"
    className="block text-sm font-medium"
  >
    Rabies vaccination status
  </label>

  <select
    id="rabies-status"
    className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-black"
    {...register("rabiesStatus")}
  >
    <option value="" disabled>
      Select one
    </option>
    <option value="current">Current</option>
    <option value="not_current">Not current</option>
    <option value="unknown">I&apos;m not sure</option>
  </select>

  {errors.rabiesStatus && (
    <p className="mt-1 text-sm" role="alert">
      {errors.rabiesStatus.message}
    </p>
  )}
</div>

          <div>
            <label
              htmlFor="prevention-use"
              className="block text-sm font-medium"
            >
              Is your animal currently receiving parasite prevention?
            </label>
            <select
              id="prevention-use"
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-black"
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
            {errors.preventionUseStatus && (
              <p className="mt-1 text-sm" role="alert">
                {errors.preventionUseStatus.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="prevention-product"
              className="block text-sm font-medium"
            >
              Prevention product, if known
            </label>
            <input
              id="prevention-product"
              type="text"
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("preventionProduct")}
            />
          </div>

          <div>
            <label
              htmlFor="medical-concerns"
              className="block text-sm font-medium"
            >
              Are there any health concerns we should know about?
            </label>
            <p className="mt-1 text-sm">
              Tell us about anything you&apos;ve noticed, such as changes in
              appetite or energy, vomiting, discharge, swelling, possible
              pregnancy, or anything else that concerns you.
            </p>
            <textarea
              id="medical-concerns"
              rows={4}
              className="mt-2 w-full rounded-md border px-3 py-2"
              {...register("medicalConcerns")}
            />
          </div>
        </div>
      </section>

      {/* TRANSPORTATION & AVAILABILITY */}
      <section aria-labelledby="availability-heading">
        <h2 id="availability-heading" className="text-xl font-semibold">
          Transportation &amp; Availability
        </h2>

        <p className="mt-2 text-sm">
          Surgery appointments typically require morning drop-off. Tell us which
          mornings you could usually make work. This does not reserve an
          appointment.
        </p>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">
            Which mornings could you usually make an appointment?
          </legend>

          <p className="mt-1 text-sm">
            Select all that apply. This does not reserve an appointment.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ].map((day) => {
              const value = day.toLowerCase();

              return (
                <label
                  key={value}
                  className="flex items-center gap-3 rounded-md border px-3 py-3"
                >
                  <input
                    type="checkbox"
                    value={value}
                    {...register("availableDays")}
                    className="h-4 w-4"
                  />

                  <span className="text-sm">{day}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6">
          <label
            htmlFor="transportation-notes"
            className="block text-sm font-medium"
          >
            Transportation limitations or scheduling concerns
          </label>
          <textarea
            id="transportation-notes"
            rows={3}
            className="mt-2 w-full rounded-md border px-3 py-2"
            {...register("transportationNotes")}
          />
        </div>
      </section>

      {/* ADDITIONAL INFORMATION */}
      <section aria-labelledby="additional-heading">
        <h2 id="additional-heading" className="text-xl font-semibold">
          Anything Else?
        </h2>

        <div className="mt-6">
          <label
            htmlFor="additional-info"
            className="block text-sm font-medium"
          >
            Additional information
          </label>
          <textarea
            id="additional-info"
            rows={4}
            className="mt-2 w-full rounded-md border px-3 py-2"
            {...register("additionalInformation")}
          />
        </div>
      </section>
      <section aria-labelledby="contribution-heading">
        <h2 id="contribution-heading" className="text-xl font-semibold">
          Your Contribution
        </h2>

        <p className="mt-2 text-sm">
          If you are able to contribute toward the cost of your animal&apos;s
          care, please tell us approximately how much. It&apos;s okay if you
          aren&apos;t able to contribute.
        </p>

        <div className="mt-6">
          <label
            htmlFor="contribution-amount"
            className="block text-sm font-medium"
          >
            Amount you may be able to contribute
          </label>

          <div className="mt-2 flex items-center gap-2">
            <span aria-hidden="true">$</span>
            <input
              id="contribution-amount"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="0"
              className="w-full rounded-md border px-3 py-2 sm:max-w-xs"
              {...register("statedContributionAmount")}
            />
            {errors.statedContributionAmount && (
              <p className="mt-1 text-sm" role="alert">
                {errors.statedContributionAmount.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {submitResult && !submitResult.success && (
  <p role="alert" className="text-sm">
    {submitResult.message}
  </p>
)}

      <button
        type="submit"
        className="w-full rounded-md border px-4 py-3 font-medium sm:w-auto"
      >
        Submit Request
      </button>
    </form>
  );
}
