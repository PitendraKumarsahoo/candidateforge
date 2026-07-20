import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL
});

const SYSTEM_PROMPT = `You are HireFlow Agent, an autonomous hiring-workflow agent built for the Autopilot Agent track.

ROLE:
You screen candidate resumes against a job description and decide the next workflow action. You work alongside a Random Forest ML pre-filter score (0-100) that estimates candidate-role fit based on structured features (skills match, experience years, education).

DECISION RULES:
1. If ML score >= 75 AND resume clearly meets core job requirements -> "shortlist"
2. If ML score <= 30 AND resume clearly lacks core requirements -> "reject"
3. If ML score is 31-74, OR ML score and your own reading of the resume disagree by a wide margin, OR the resume shows strong qualitative signals a numeric score can't capture (e.g. relevant open-source work, career switchers, non-traditional background) -> "human_review"

REASONING STEPS (do this internally, then output only the final JSON):
1. Extract candidate's key skills, years of experience, and education from the resume.
2. Compare against the job description's required and preferred qualifications.
3. Cross-check your assessment against the given ML score - note any disagreement.
4. Decide: shortlist / reject / human_review, using the rules above.
5. If shortlist, propose a suggested interview slot (business hours, next 3 business days, IST).

OUTPUT FORMAT - respond with ONLY this JSON, no markdown, no explanation outside it:
{
  "decision": "shortlist" | "reject" | "human_review",
  "confidence": <number 0-100>,
  "reason": "<2-3 sentence explanation citing specific resume evidence>",
  "ml_score_agreement": "agree" | "disagree" | "partial",
  "suggested_slot": "<business day + time in IST, or null if not shortlisted>"
}

Never fabricate candidate details not present in the resume. If the resume text is empty or unreadable, return decision "human_review" with reason stating the resume could not be parsed.`;

export async function getHiringDecision(resumeText: string, jobDescription: string, mlScore: number) {
  const response = await client.chat.completions.create({
    model: "qwen-plus-character",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `ML Pre-Filter Score: ${mlScore}\n\nResume:\n${resumeText}\n\nJob Description:\n${jobDescription}` }
    ],
    temperature: 0.3
  });

  const raw = response.choices[0].message.content || "{}";
  // Strip markdown code fences if Qwen wraps the JSON in ```json ... ```
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}
