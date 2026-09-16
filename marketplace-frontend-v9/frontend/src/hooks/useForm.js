import { useCallback, useState } from 'react';
import { validate } from '../lib/validators';

/**
 * Small form helper: values, touched-on-blur validation, server error merge, submit guard.
 */
export function useForm(initial, rules) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const onChange = useCallback((e) => setValue(e.target.name, e.target.type === 'checkbox' ? e.target.checked : e.target.value), [setValue]);

  const onBlur = useCallback((e) => {
    const name = e.target.name;
    setTouched((t) => ({ ...t, [name]: true }));
    if (rules?.[name]) {
      const err = validate(values, { [name]: rules[name] })[name];
      setErrors((er) => ({ ...er, [name]: err }));
    }
  }, [rules, values]);

  const validateAll = useCallback(() => {
    const errs = rules ? validate(values, rules) : {};
    setErrors(errs);
    setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])));
    return Object.keys(errs).length === 0;
  }, [rules, values]);

  const applyServerErrors = useCallback((serverErrors) => {
    if (serverErrors && typeof serverErrors === 'object') setErrors((e) => ({ ...e, ...serverErrors }));
  }, []);

  /** Control props only — safe to spread onto an <input>. */
  const field = (name) => ({ name, value: values[name] ?? '', onChange, onBlur });
  /** Error shown once the field has been touched or a submit/server error set it. */
  const error = (name) => (touched[name] || errors[name] ? errors[name] : undefined);

  return { values, setValues, setValue, errors, touched, submitting, setSubmitting, onChange, onBlur, validateAll, applyServerErrors, field, error };
}
