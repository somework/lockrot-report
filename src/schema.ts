/** The report schema major this renderer reads (DESIGN.md §2). */
export const READS_SCHEMA = 1;

/** Every report schema major from 1 to `READS_SCHEMA`, as the manifest's `schema.report` lists them. */
export const READS_SCHEMAS: readonly number[] = Array.from({ length: READS_SCHEMA }, (_, i) => i + 1);
