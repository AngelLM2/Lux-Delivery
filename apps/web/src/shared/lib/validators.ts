/** Mirrors the API password policy: 10+ chars with upper, lower, digit and symbol. */
export const PASSWORD_MIN_LENGTH = 10

export const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim())

/** 0..4 — one point per character class, capped while the minimum length is not met. */
export const passwordStrength = (value: string) => {
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
  return value.length >= PASSWORD_MIN_LENGTH ? classes : Math.min(classes, 2)
}

export const isStrongPassword = (value: string) =>
  value.length >= PASSWORD_MIN_LENGTH && passwordStrength(value) === 4

export const PASSWORD_HINT =
  'Mínimo de 10 caracteres, com letra maiúscula, minúscula, número e símbolo.'
