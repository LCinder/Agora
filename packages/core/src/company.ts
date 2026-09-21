import company from './company.json';

/**
 * Who is behind this, legally.
 *
 * Four fields and a date, in one file, because they appear in three legal pages
 * and in the contract every town hall signs: the company does not exist yet, so
 * they say PENDIENTE and the pages print that word where the name should be.
 * Visible on purpose — a privacy policy that quietly reads "PENDIENTE S.L." is
 * worse than one that admits it is unfinished, and nobody ships a page with this
 * word on it by accident.
 *
 * Filling them is one edit here (see docs/legal/).
 */
export interface Company {
  legalName: string;
  taxId: string;
  address: string;
  email: string;
  /** Date the legal texts were last reviewed, as `2026-09-20`. */
  updatedAt: string;
}

export const COMPANY: Company = company;

/** True while the four fields are still placeholders. */
export function companyIsPending(): boolean {
  return [COMPANY.legalName, COMPANY.taxId, COMPANY.address, COMPANY.email].some(
    (value) => value === 'PENDIENTE' || value.trim() === '',
  );
}
