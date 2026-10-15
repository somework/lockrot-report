import type { Report2Embed } from "../../model/report2";
import { useReport } from "../context";

/** The report-2 embed the page draws. */
export function useReport2(): Report2Embed {
  return useReport().model;
}
