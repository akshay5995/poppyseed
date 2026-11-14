# Disclosures extension, version 1

Source: [extensions/disclosures.md](../source/docs/1.0/extensions/disclosures.md). Official page: https://personalagentprotocol.org/docs/1.0/extensions/disclosures

## 2 Disclosures advertising support

- **MUST** · company · `disclosures.only-declared` — The Company sends disclosures only in response to a request that declares disclosures version 1; a Personal Agent that does not declare it gets the notice in `text`. *(implied)*

## 3 Disclosures in messages

- **MUST** · company · `disclosures.shape` — A Company message carries disclosures in `extensions.disclosures.items`, each with `text`, and only Company messages carry them. *(implied)*
- **MUST** · agent · `disclosures.content` — Disclosures are content from the Company. *(implied)*
