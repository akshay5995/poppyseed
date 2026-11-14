# Links extension, version 1

Source: [extensions/links.md](../source/docs/1.0/extensions/links.md). Official page: https://personalagentprotocol.org/docs/1.0/extensions/links

## 2 Links advertising support

- **MUST** · company · `links.only-declared` — The Company sends links only in response to a request that declares links version 1. *(implied)*

## 3 Links in messages

- **MUST** · company · `links.shape` — A Company message carries links in `extensions.links.items`, each with an HTTPS `url` and an optional `title`, in the order the message refers to them, and only Company messages carry them. *(implied)*
- **MUST** · agent · `links.content` — A link's `title` and `url` are content from the Company, and a title can name a page other than the one at its URL. *(implied)*
