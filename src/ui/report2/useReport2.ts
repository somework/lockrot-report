import type { Report2Embed } from "../../model/report2";
import { useReport } from "../context";

/** The report-2 embed for a surface the shell routes only on a report-2 document. */
export function useReport2(): Report2Embed {
  const { model } = useReport();
  if (model.report2 === null)
    throw new Error("A report-2 surface rendered for a document that is not report-2");
  return model.report2;
}
