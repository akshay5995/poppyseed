# ext-disclosures.md

Source: [extensions/disclosures.md](../source/docs/0.4/extensions/disclosures.md). Official page: https://personalagentprotocol.org/docs/0.4/extensions/disclosures

## 2 Disclosures Advertising support

- **MUST** · agent · `disclosures.personal-agent-declare` — A Personal Agent that doesn't declare it gets the notice in `text` *(implied)*
## 3 Disclosures in messages

- **MUST** · company · `disclosures.items-disclosures` — | `items` | Yes | The disclosures. | *(implied)*
- **MUST** · company · `disclosures.items-text-notice` — | `items[].text` | Yes | The notice, as text. | *(implied)*
## 2 Disclosures advertising support

- **MUST** · company · `disclosures.only-declared` — The Company sends disclosures only in response to a request that declares this version (spec 8.4) *(implied)*
## 3 Disclosures in messages

- **MUST** · company · `disclosures.company-only` — Only Company messages carry disclosures *(implied)*
