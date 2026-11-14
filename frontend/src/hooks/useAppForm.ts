import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';

/**
 * The app's configured `useForm`.
 *
 * Why this exists — two real textbox glitches came from react-hook-form's
 * defaults:
 *
 * 1. **Errors never cleared while retyping.** The default `mode: 'onSubmit'`
 *    combined with `reValidateMode: 'onChange'` means a field validated only at
 *    submit time keeps its error until the *next* submit. Visually the box stays
 *    red and the message stays put while the user fixes it, which reads as a
 *    broken input. `mode: 'onTouched'` validates after the first blur and then
 *    re-validates on every change, so the error clears the moment the value
 *    becomes valid — without nagging before the user has finished typing.
 *
 * 2. **A server-side error (`setError`) stuck forever.** Same cause: with
 *    `onSubmit`-only validation, a 409 from the API put the field into an error
 *    state that only another submit could clear. `onTouched` + the same change
 *    handling clears it as soon as the value changes.
 *
 * `shouldFocusError` stays on so a failed submit moves focus to the first bad
 * field — important with `datetime-local` inputs further down a long form.
 */
export function useAppForm<TFieldValues extends FieldValues = FieldValues>(
  props: UseFormProps<TFieldValues> = {},
): UseFormReturn<TFieldValues> {
  return useForm<TFieldValues>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    criteriaMode: 'firstError',
    shouldFocusError: true,
    ...props,
  });
}

export type { DefaultValues };
