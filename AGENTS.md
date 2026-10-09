<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Product reads share `fetchProdutos`, which rejects query failures and bounds request duration; both menu screens use the same recovery path rather than treating failures as an empty menu.
- While the newly connected Cloud schema awaits migration, the existing app schema contract lives in `database-contract.ts` and uses the managed client's typed schema view; never edit generated types or treat this contract as proof of provisioned tables.
- Administrative Cloud queries must validate the existing signed password-gate session server-side before using privileged access; private tables have no browser grants.
- Public order submission recalculates prices from active products and atomically saves the order and customer; never trust client totals.
- Product images use a private Cloud bucket with signed administrator uploads and a public endpoint limited to active product references, because public buckets are disabled.
- Delivery and customer synchronization uses mounted-screen polling through the password-protected server boundary; browser realtime cannot authorize this cookie-based account model.
- Backups use a versioned ZIP manifest with embedded product images and password-gated server functions; restoration inserts missing primary keys only to preserve current registrations and make retries safe.
