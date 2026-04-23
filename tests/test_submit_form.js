// Test harness for submit-form.js
// Stubs global.fetch so we can validate handler logic without hitting
// Cloudflare Turnstile or HubSpot. Tests the email-or-phone fix.

const path = require("path");

// ─── Mock environment ──────────────────────────────────────────────
process.env.HUBSPOT_TOKEN = "test-token";
process.env.HUBSPOT_PORTAL_ID = "46107229";
process.env.HUBSPOT_PIPELINE_ID = "test-pipeline";
process.env.HUBSPOT_DEFAULT_OWNER_EMAIL = "russell@ledgertc.com";
process.env.TURNSTILE_SECRET_KEY = "test-secret";

// ─── Track all fetch calls so we can inspect what HubSpot would receive ──
const fetchCalls = [];

global.fetch = async (url, opts = {}) => {
  fetchCalls.push({ url, method: opts.method, body: opts.body });

  // Cloudflare Turnstile siteverify → always succeeds
  if (url.includes("challenges.cloudflare.com/turnstile")) {
    return {
      ok: true,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
    };
  }

  // HubSpot contact search → no existing contact (so we always go to create path)
  if (url.includes("/crm/v3/objects/contacts/search")) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ total: 0, results: [] }),
    };
  }

  // HubSpot contact create → return a fake contact id
  if (url.includes("/crm/v3/objects/contacts") && opts.method === "POST") {
    const body = JSON.parse(opts.body || "{}");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: "fake-contact-123",
        properties: body.properties || {},
      }),
    };
  }

  // Company search → empty
  if (url.includes("/crm/v3/objects/companies/search")) {
    return { ok: true, status: 200, text: async () => JSON.stringify({ total: 0, results: [] }) };
  }

  // Company create → fake id
  if (url.includes("/crm/v3/objects/companies") && opts.method === "POST") {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "fake-company-456", properties: {} }),
    };
  }

  // Owner lookup → fake owner
  if (url.includes("/crm/v3/owners")) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [{ id: "fake-owner-789" }] }),
    };
  }

  // Ticket create
  if (url.includes("/crm/v3/objects/tickets") && opts.method === "POST") {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "fake-ticket-999" }),
    };
  }

  // Association PUT
  if (url.includes("/associations/")) {
    return { ok: true, status: 200, text: async () => "{}" };
  }

  // Hutk createOrUpdate
  if (url.includes("/contacts/v1/contact/createOrUpdate")) {
    return { ok: true, status: 200, text: async () => "{}" };
  }

  // PATCH on contacts (backfill)
  if (opts.method === "PATCH") {
    return { ok: true, status: 200, text: async () => "{}" };
  }

  // Mailchannels (notification email)
  if (url.includes("mailchannels.net")) {
    return { ok: true, status: 200, text: async () => "{}" };
  }

  // Default: silent ok
  return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
};

// Now require the handler (which uses the global fetch)
const { handler } = require(path.join(__dirname, "submit-form.js"));

// ─── Build a form-encoded request body ────────────────────────────
function buildBody(fields) {
  const params = new URLSearchParams();
  // Defaults that pass anti-spam checks
  const defaults = {
    "cf-turnstile-response": "test-token",
    "form_loaded_at": String(Date.now() - 10000),  // 10s ago, past 3s threshold
  };
  Object.entries({ ...defaults, ...fields }).forEach(([k, v]) => {
    if (v !== undefined && v !== null) params.set(k, v);
  });
  return params.toString();
}

let ipCounter = 0;
function makeEvent(body, formSource = "rtl-calculator") {
  ipCounter++;
  return {
    httpMethod: "POST",
    headers: { referer: "https://ledgertc.com/test", "x-forwarded-for": `10.0.0.${ipCounter}` },
    body,
  };
}

// ─── Test runner ──────────────────────────────────────────────────
async function run(name, fields, expectedStatus, expectedSubstring) {
  fetchCalls.length = 0;
  const event = makeEvent(buildBody(fields));
  const result = await handler(event);
  const body = JSON.parse(result.body);
  const pass = result.statusCode === expectedStatus
    && (!expectedSubstring || JSON.stringify(body).includes(expectedSubstring));
  console.log(`${pass ? "PASS" : "FAIL"}  [${result.statusCode}] ${name}`);
  if (!pass) {
    console.log(`      expected status ${expectedStatus}, got ${result.statusCode}`);
    console.log(`      expected to contain: ${expectedSubstring}`);
    console.log(`      response body: ${result.body}`);
  }
  // Print which HubSpot calls were made (for create path verification)
  const createCall = fetchCalls.find(c => c.url.includes("/crm/v3/objects/contacts") && c.method === "POST" && !c.url.includes("/search"));
  if (createCall) {
    const props = JSON.parse(createCall.body).properties;
    console.log(`      created contact w/ keys: ${Object.keys(props).join(", ")}`);
  }
  return pass;
}

(async () => {
  let allPass = true;

  console.log("\n=== Calculator forms (should accept email OR phone) ===\n");

  allPass &= await run(
    "RTL calc, email only → 200",
    { form_source: "rtl-calculator", first_name: "Test", last_name: "Email", email: "test1@example.com" },
    200,
    "success"
  );

  allPass &= await run(
    "RTL calc, phone only → 200",
    { form_source: "rtl-calculator", first_name: "Test", last_name: "Phone", phone: "555-1234" },
    200,
    "success"
  );

  allPass &= await run(
    "DSCR calc, email only → 200",
    { form_source: "dscr-calculator", first_name: "Test", last_name: "DscrEmail", email: "test2@example.com" },
    200,
    "success"
  );

  allPass &= await run(
    "DSCR calc, phone only → 200",
    { form_source: "dscr-calculator", first_name: "Test", last_name: "DscrPhone", phone: "555-5678" },
    200,
    "success"
  );

  allPass &= await run(
    "DSCR calc, both empty → 400 with helpful message",
    { form_source: "dscr-calculator", first_name: "Test", last_name: "Neither" },
    400,
    "either an email"
  );

  allPass &= await run(
    "RTL calc, missing last name → 400",
    { form_source: "rtl-calculator", first_name: "Test", email: "x@y.com" },
    400,
    "Missing required"
  );

  console.log("\n=== Non-calc form (should still require all four fields) ===\n");

  allPass &= await run(
    "LP form, email only → 400 (phone still required)",
    { form_source: "construction-landing-page-google-ads", first_name: "Test", last_name: "LP", email: "lp@example.com" },
    400,
    "phone"
  );

  allPass &= await run(
    "LP form, all four fields → 200",
    { form_source: "construction-landing-page-google-ads", first_name: "Test", last_name: "LPok", email: "lp@example.com", phone: "555-9999" },
    200,
    "success"
  );

  console.log("\n=== Email validation edge cases ===\n");

  allPass &= await run(
    "Calc form, invalid email → 400",
    { form_source: "rtl-calculator", first_name: "Test", last_name: "Bad", email: "not-an-email" },
    400,
    "Invalid email"
  );

  allPass &= await run(
    "Calc form, disposable email → 200 silent reject",
    { form_source: "rtl-calculator", first_name: "Test", last_name: "Dispo", email: "spam@mailinator.com" },
    200,
    "Thank you"
  );

  console.log(`\n${allPass ? "ALL PASSED" : "SOME FAILED"}\n`);
  process.exit(allPass ? 0 : 1);
})();
