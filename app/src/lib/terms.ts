// Proposal wording. Items marked DRAFT are Claude's first pass and need Nathan's approval before pilot.
export const COMPANY = {
  legal: 'Talent Termite LLC',
  address: '515 Central Drive, Virginia Beach, VA 23454',
  license: 'License #14899',
  phone: '(757) 530-4060',
  email: 'office@talenttermite.com',
};

export const INTRO =
  'Thank you for letting us inspect your home. Our free full-service inspection is a comprehensive 27-point checklist ' +
  'covering your crawlspace and foundation, attic, interior, and exterior. Below are the findings and the work we recommend.';

export const NOTICES = [
  'If financing through Regions Bank, application approval is required before we can schedule the work.',
  'All jobs over $4,000 require a 25% down payment before starting the work.',
];

export const WARRANTY = {
  workmanship: '1-year workmanship warranty on all work performed.',
  aprilaire: 'Aprilaire dehumidifiers include a 5-year manufacturer warranty.',
};

export const FINANCING = {
  sameAsCash: 'Regions Bank: 9 months same as cash (loan code D4377)',
  fiveYear: 'Regions Bank: 9.99% APR 5-year loan (loan code DEL2674)',
  note: 'No penalty for early payoff. Subject to credit approval.',
  apply: 'Scan a code below with your phone camera to prequalify with Regions Bank. Work is scheduled after approval.',
};

// DRAFT: awaiting Nathan's approval.
export const TERMS_DRAFT = [
  {
    title: 'Cracking',
    text:
      'Homes settle and materials expand and contract with moisture and temperature. Some cracking in drywall, plaster, ' +
      'masonry, tile, or concrete can occur during or after foundation, structural, or moisture work, and existing cracks ' +
      'may become more visible. Talent is not responsible for cosmetic cracking or for repairing finishes, and repair of ' +
      'such cracking is not included in this proposal unless listed above.',
  },
  {
    title: 'Hidden conditions and further work',
    text:
      'This proposal is based on a visual inspection of areas that were reasonably accessible on the inspection date. ' +
      'Conditions hidden behind walls, under floors or insulation, below grade, or otherwise out of view (including ' +
      'additional wood damage, moisture, or pest activity) may be found once work begins. If they are, we will stop and ' +
      'explain what we found, and any additional work will be quoted separately and done only with your written approval.',
  },
  {
    title: 'Agreement',
    text:
      'Signing below accepts this proposal and enters into a service agreement with Talent for the work and prices shown. ' +
      'The office will contact you to schedule.',
  },
];

// Shown only when the plan includes a dehumidifier or encapsulation (Nathan 2026-11-23).
export const DRYING_WOOD_TERM = {
  title: 'Drying of previously wet wood',
  text:
    'Wood that has been soaked by crawl space moisture for years is often already damaged. Once the dehumidifier ' +
    'dries the crawl space, that wood can crack or "dry rot." This is a natural result of the existing damage, not of ' +
    'our work, and is not covered by the warranty. Affected wood needs to be replaced; we will point out any we see.',
};
