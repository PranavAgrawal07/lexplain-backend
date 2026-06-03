const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const SYSTEM_PROMPT = `You are LexPlain, an expert legal language simplifier trained on CUAD and LEDGAR clause datasets.

Analyze legal clauses and return a structured JSON object.

Rules:
- Identify ALL significant risks, minimum 3 and typically 4-5 risks per clause.
- Each risk must be distinct and specific, not a repetition of another.
- Always look for: liability exposure, rights being waived, time restrictions, one-sided obligations, missing protections, and financial risks.
- Each risk "text" field must be 2-3 sentences: what the risk is, why it matters, and worst-case scenario.
- Use simple, clear language a non-lawyer can understand.
- The simplified rewrite must be legally equivalent but plain.
- Risk levels: HIGH (significant legal/financial exposure or rights loss), MEDIUM (notable but manageable), LOW (standard clause, minor concern worth noting).

Return ONLY a valid JSON object, no markdown, no preamble:
{
  "plainEnglish": "Clear 2-4 sentence explanation of what this clause means.",
  "risks": [
    {
      "level": "HIGH|MEDIUM|LOW",
      "category": "e.g. Liability / Termination / IP Ownership / Payment",
      "text": "2-3 sentences: what the risk is, why it matters to the reader, and what could happen in a worst-case scenario."
    }
  ],
  "simplifiedRewrite": "Plain-English rewrite preserving legal intent.",
  "clauseType": "e.g. License Grant / Indemnification / Non-Compete",
  "keyParties": ["Party A role", "Party B role"]
}`;

async function fetchCaseLaw(clauseType) {
  try {
    const query = encodeURIComponent(clauseType || "contract clause");
    const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${query}&type=o&format=json&page_size=3`;
    const res = await fetch(url, {
      headers: { Authorization: `Token ${process.env.COURTLISTENER_API_KEY}` }
    });
    const data = await res.json();
    return (data.results || []).map(c => ({
      name: c.caseName || "Unknown Case",
      citation: c.citation?.[0] || "No citation",
      year: c.dateFiled?.split("-")[0] || "Unknown",
    }));
  } catch (err) {
    console.error("CourtListener error:", err.message);
    return [];
  }
}

app.post("/analyze", async (req, res) => {
  const { clause } = req.body;

  if (!clause || clause.trim().length < 20)
    return res.status(400).json({ error: "Clause is too short or missing." });

  if (clause.length > 5000)
    return res.status(400).json({ error: "Clause too long. Keep it under 5000 characters." });

  try {
    const completion = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze this legal clause:\n\n${clause}` },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { error: "Failed to parse AI response." };
    }

    const caseLawRefs = await fetchCaseLaw(parsed.clauseType);
    return res.json({ ...parsed, caseLawRefs });

  } catch (err) {
    console.error("Groq error:", err.message);
    return res.status(500).json({ error: "AI analysis failed. Check your API key." });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "LexPlain backend running ✓" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const key = process.env.GROQ_API_KEY;
  console.log(`LexPlain running on port ${PORT}`);
  console.log(`GROQ_API_KEY: ${key ? `set (${key.length} chars)` : "NOT SET"}`);
});
