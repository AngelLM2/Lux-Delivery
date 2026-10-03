export const isValidEmail = (value: string) => {
  return /^\S+@\S+\.\S+$/.test(value)
}

export const passwordStrength = (value: string) => {
  let score = 0
  if (value.length >= 8) score += 1
  if (/[A-Z]/.test(value)) score += 1
  if (/[0-9]/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  return score
}

export const isStrongPassword = (value: string) => {
  return passwordStrength(value) >= 4 && value.length >= 10
}
