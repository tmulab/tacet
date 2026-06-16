import { notFound } from "next/navigation";
import { CASE_DATA } from "../../cases";
import { realCase } from "../../realCase";
import { CaseExperience } from "./CaseExperience";

/**
 * A worked case (offline replay). Validates the case id and hands the case data
 * to the client experience (the five inner screens). The data is the design's
 * illustrative mock for now; Phase 3 wires the frozen fixtures via the core.
 */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cs = realCase(id) ?? CASE_DATA[id];
  if (!cs) notFound();
  return <CaseExperience cs={cs} />;
}
