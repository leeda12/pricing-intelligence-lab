export function isRecommendationEligible(customer?: string, product?: string): boolean {
  return Boolean(customer?.trim() && product?.trim());
}
