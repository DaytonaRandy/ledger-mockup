# CallRail → HubSpot attribution fix (n8n workflow extension)

**Owner:** Uditha
**Est. time:** ~15 min
**Status:** TODO

## Problem

CallRail's native HubSpot integration creates contacts for inbound calls but does **not** pass through `gclid` / UTM / landing page data. Every paid-ad call is getting stamped as **Organic Search** in HubSpot, so our paid-pipeline reporting is broken.

Confirmed via CallRail's API that their HubSpot integration exposes only 6 toggles — no field mapping is configurable. It's a product limitation, not a misconfiguration.

**Example (real call, 2026-04-20):** Coty Pensyl called from a Google Ads click on the "spec home loan" keyword in the GUC campaign. CallRail captured the full attribution:
- `gclid = CjwKCAjwnZfPBhAGEiwAzg-VzEK0wBVKoyk3Fj5DOY3dhqmVxAWquOG1WFmDS9-Z9e8Y9tOvi005GRoCyVoQAvD_BwE`
- `utm_source = google`, `utm_medium = cpc`, `utm_campaign = GUC`, `utm_term = spec home loan`
- `landing_page_url = https://ledgertc.com/spec-home-construction-loans?...`

But in HubSpot, his contact landed with `hs_analytics_source = ORGANIC_SEARCH`, no gclid, no UTM fields. Manually patched as a one-off — need a durable fix going forward.

## Fix

Extend the existing n8n workflow on `n8n.ledgertc.co` that's already triggered by CallRail's `post_call_webhook`. Add nodes to enrich the HubSpot contact after it's created.

### Current state

- Workflow trigger: `POST https://n8n.ledgertc.co/webhook/call-inbound`
- Configured in CallRail as the `post_call_webhook` (fires on every inbound call end)
- Full CallRail call payload is already landing at this endpoint, including `gclid`, `utm_*`, `landing_page_url`, etc.

### Steps

1. **Open the existing workflow** on n8n bound to `/webhook/call-inbound`.

2. **Add an IF node** after the trigger. Continue only if attribution worth pushing exists:
   - `{{$json.gclid}}` is not empty, **OR**
   - `{{$json.utm_medium}}` equals `"cpc"` or `"ppc"`

   (If both false, end the branch — no-op.)

3. **Add a Wait node** — 3 seconds. Gives CallRail's native HUB_SPOT integration time to create the HubSpot contact before we try to update it.

4. **Add HubSpot node → Search Contact:**
   - Resource: `Contact`
   - Operation: `Search` (or `Get All` with filters, depending on which n8n HubSpot node version)
   - Filter: `phone` **contains token** `{{$json.customer_phone_number.replace(/\D/g, '').slice(-10)}}` (last 10 digits of the E.164 number)
   - Sort: `createdate` DESC
   - Limit: 1
   - On zero results: wait 4 more seconds and retry once. On still zero: log and exit the branch (don't fail the workflow).

5. **Add HubSpot node → Update Contact:**
   - Contact ID: from previous node's result
   - Properties to update:

   | HubSpot property | Value | When to set |
   |---|---|---|
   | `hs_google_click_id` | `{{$json.gclid}}` | only if gclid present |
   | `utm_campaign` | `{{$json.utm_campaign}}` | only if non-empty |
   | `hs_analytics_source` | `PAID_SEARCH` (static string) | when gclid present OR utm_medium is cpc/ppc |

   > `hs_analytics_source` is an enum. Use the raw value `PAID_SEARCH`, not the label "Paid Search".

### Credentials

HubSpot private-app token exists as `HUBSPOT_TOKEN` in Netlify env. If n8n needs its own creds, use a private app token with at minimum:
- `crm.objects.contacts.read`
- `crm.objects.contacts.write`

Russell can generate a fresh token from **HubSpot → Settings → Integrations → Private Apps** if needed.

### Don't touch

- CallRail's native **HUB_SPOT** integration (leave it active — handles the initial contact creation)
- The existing webhook URL or other downstream nodes in the same workflow

## Test payload

Real CallRail call from 2026-04-20 — paste into the webhook trigger's "Listen for test", or POST via curl:

```json
{
  "id": "CAL019dab04a8507ac792e4eab0fe43e220",
  "customer_phone_number": "+16104283348",
  "customer_name": "PENSYL COTY",
  "gclid": "CjwKCAjwnZfPBhAGEiwAzg-VzEK0wBVKoyk3Fj5DOY3dhqmVxAWquOG1WFmDS9-Z9e8Y9tOvi005GRoCyVoQAvD_BwE",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "GUC",
  "utm_term": "spec home loan",
  "landing_page_url": "https://ledgertc.com/spec-home-construction-loans?utm_source=google&utm_medium=cpc&utm_campaign=GUC&utm_term=spec%20home%20loan",
  "source": "Google Ads",
  "first_call": true,
  "device_type": "Mobile"
}
```

### Expected result

Contact with phone ending `6104283348` (Coty Pensyl, HubSpot contact ID `216669204512`) will already have `hs_google_click_id` set and `hs_analytics_source = PAID_SEARCH` — that record was manually patched 2026-04-20 as a one-off. The test will be an idempotent no-op write (same values), but it proves the workflow mechanics.

**Better real test:** wait for the next live inbound call with a `gclid` and confirm the HubSpot contact lands with Paid Search attribution on first save (no manual patching needed).

## Verification

Once live, any new CallRail-created HubSpot contact for a paid-ad call should have, on first save:

- `hs_google_click_id` populated ✓
- `utm_campaign` populated ✓
- `hs_analytics_source = PAID_SEARCH` ✓

HubSpot's contact creation source (`hs_object_source_detail_1`) will still show `Call Tracking Email` — that's CallRail's native integration doing its thing and is expected. The attribution fields are the part this workflow fixes.
