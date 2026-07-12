import { describe, expect, it } from 'vitest';
import { isRecommendationEligible } from './eligibility.js';

describe('recommendation eligibility', () => {
  it('rejects all customers and all products', () => {
    expect(isRecommendationEligible('', '')).toBe(false);
  });

  it('rejects a specific customer with all products', () => {
    expect(isRecommendationEligible('Northstar Outfitters', '')).toBe(false);
  });

  it('rejects all customers with a specific product', () => {
    expect(isRecommendationEligible('', 'Atlas Widget')).toBe(false);
  });

  it('allows a specific customer and specific product', () => {
    expect(isRecommendationEligible('Northstar Outfitters', 'Atlas Widget')).toBe(true);
  });
});
