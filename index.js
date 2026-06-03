const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(cors({ origin: '*' }));
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

const CASE_LAW_DB = {
  "non-compete": [
    { name: "BDO Seidman v. Hirshberg", citation: "712 N.E.2d 1220", year: "1999" },
    { name: "Lucente v. International Business Machines Corp.", citation: "310 F.3d 243", year: "2002" },
    { name: "Estee Lauder Cos. v. Batra", citation: "430 F. Supp. 2d 158", year: "2006" },
  ],
  "indemnification": [
    { name: "Regan v. Publicis Groupe S.A.", citation: "566 F. Supp. 2d 296", year: "2008" },
    { name: "Rite Aid Corp. v. Levy-Gray", citation: "894 A.2d 563", year: "2006" },
    { name: "Prince v. Pacific Gas & Electric Co.", citation: "45 Cal. 4th 1151", year: "2009" },
  ],
  "confidentiality": [
    { name: "PepsiCo, Inc. v. Redmond", citation: "54 F.3d 1262", year: "1995" },
    { name: "Earthweb, Inc. v. Schlack", citation: "71 F. Supp. 2d 299", year: "1999" },
    { name: "Trailer Leasing Co. v. Associates Commercial Corp.", citation: "433 F. Supp. 326", year: "1977" },
  ],
  "termination": [
    { name: "Fortune v. National Cash Register Co.", citation: "373 Mass. 96", year: "1977" },
    { name: "Nolan v. Control Data Corp.", citation: "243 N.J. Super. 420", year: "1990" },
    { name: "Guz v. Bechtel National, Inc.", citation: "24 Cal. 4th 317", year: "2000" },
  ],
  "intellectual property": [
    { name: "Stanford University v. Roche Molecular Systems", citation: "563 U.S. 776", year: "2011" },
    { name: "Teets v. Chromalloy Gas Turbine Corp.", citation: "83 F.3d 403", year: "1996" },
    { name: "Banks v. Unisys Corp.", citation: "228 F.3d 1357", year: "2000" },
  ],
  "license": [
    { name: "Sun Microsystems, Inc. v. Microsoft Corp.", citation: "188 F.3d 1115", year: "1999" },
    { name: "MDY Industries v. Blizzard Entertainment", citation: "629 F.3d 928", year: "2010" },
    { name: "Jacobsen v. Katzer", citation: "535 F.3d 1373", year: "2008" },
  ],
  "payment": [
    { name: "Bowers v. Transamerica Title Insurance Co.", citation: "100 Wn.2d 581", year: "1983" },
    { name: "Meineke Car Care Centers v. RLB Holdings", citation: "423 F.3d 610", year: "2005" },
    { name: "Allied Canners & Packers v. Victor Packing Co.", citation: "162 Cal. App. 3d 905", year: "1984" },
  ],
  "limitation of liability": [
    { name: "Valhal Corp. v. Sullivan Associates", citation: "44 F.3d 195", year: "1995" },
    { name: "Travelers Casualty & Surety Co. v. Dormitory Auth.", citation: "735 F. Supp. 2d 42", year: "2010" },
    { name: "FedEx National LTL, Inc. v. Skillnet Solutions", citation: "2010 WL 3835143", year: "2010" },
  ],
  "arbitration": [
    { name: "AT&T Mobility LLC v. Concepcion", citation: "563 U.S. 333", year: "2011" },
    { name: "Epic Systems Corp. v. Lewis", citation: "584 U.S. 497", year: "2018" },
    { name: "Hall Street Associates v. Mattel, Inc.", citation: "552 U.S. 576", year: "2008" },
  ],
  "warranty": [
    { name: "Henningsen v. Bloomfield Motors, Inc.", citation: "32 N.J. 358", year: "1960" },
    { name: "Step-Saver Data Systems v. Wyse Technology", citation: "939 F.2d 91", year: "1991" },
    { name: "Bobb Forest Products v. Morbark Industries", citation: "151 Ohio App. 3d 63", year: "2002" },
  ],
  "force majeure": [
    { name: "Kel Kim Corp. v. Central Markets, Inc.", citation: "70 N.Y.2d 900", year: "1987" },
    { name: "Gulf Oil Corp. v. Federal Power Commission", citation: "563 F.2d 588", year: "1977" },
    { name: "Phibro Energy v. Empresa De Polimeros", citation: "1991 WL 18842", year: "1991" },
  ],
  "assignment": [
    { name: "Macke Co. v. Pizza of Gaithersburg, Inc.", citation: "259 Md. 479", year: "1970" },
    { name: "Rumbin v. Utica Mutual Insurance Co.", citation: "254 Conn. 259", year: "2000" },
    { name: "The British Waggon Co. v. Lea & Co.", citation: "5 Q.B.D. 149", year: "1880" },
  ],
  "non-solicitation": [
    { name: "Loewen Group v. Haberl", citation: "1995 WL 929089", year: "1995" },
    { name: "H&R Block Tax Services v. Circle A Enterprises", citation: "2008 WL 4525011", year: "2008" },
    { name: "Merrill Lynch v. Ran", citation: "67 F. Supp. 2d 764", year: "1999" },
  ],
  "default": [
    { name: "Lucy v. Zehmer", citation: "196 Va. 493", year: "1954" },
    { name: "Hadley v. Baxendale", citation: "9 Ex. 341", year: "1854" },
    { name: "Jacob & Youngs, Inc. v. Kent", citation: "230 N.Y. 239", year: "1921" },
  ],
};

function getCaseLawFallback(clauseType) {
  const type = (clauseType || "").toLowerCase();
  if (type.includes("non-compete") || type.includes("noncompete")) return CASE_LAW_DB["non-compete"];
  if (type.includes("indemnif")) return CASE_LAW_DB["indemnification"];
  if (type.includes("confidential") || type.includes("nda")) return CASE_LAW_DB["confidentiality"];
  if (type.includes("termination")) return CASE_LAW_DB["termination"];
  if (type.includes("intellectual property") || type.includes("ip own")) return CASE_LAW_DB["intellectual property"];
  if (type.includes("licens")) return CASE_LAW_DB["license"];
  if (type.includes("payment") || type.includes("invoice")) return CASE_LAW_DB["payment"];
  if (type.includes("limitation") || type.includes("liability cap")) return CASE_LAW_DB["limitation of liability"];
  if (type.includes("arbitration") || type.includes("dispute")) return CASE_LAW_DB["arbitration"];
  if (type.includes("warrant")) return CASE_LAW_DB["warranty"];
  if (type.includes("force majeure")) return CASE_LAW_DB["force majeure"];
  if (type.includes("assignment")) return CASE_LAW_DB["assignment"];
  if (type.includes("non-solicit") || type.includes("nonsolicitation")) return CASE_LAW_DB["non-solicitation"];
  return CASE_LAW_DB["default"];
}

async function fetchCaseLaw(clauseType) {
  return getCaseLawFallback(clauseType);
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
