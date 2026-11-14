# ext-links.md

Source: [extensions/links.md](../source/docs/0.4/extensions/links.md). Official page: https://personalagentprotocol.org/docs/0.4/extensions/links

## 3 Links in messages

- **MUST** · company · `links.items-links-order` — | `items` | Yes | The links, in the order the message refers to them. | *(implied)*
- **MUST** · company · `links.items-page-https` — | `items[].url` | Yes | The page's HTTPS URL. | *(implied)*
- **MAY** · company · `links.items-title-page` — | `items[].title` | No | The page's name, as the message refers to it. | *(implied)*
## 2 Links advertising support

- **MUST** · company · `links.only-declared` — The Company sends links only in response to a request that declares this version (spec 8.4) *(implied)*
## 3 Links in messages

- **MUST** · company · `links.company-only` — Only Company messages carry links *(implied)*
