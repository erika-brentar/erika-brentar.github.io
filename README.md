# Erika Brentar portfolio

Three folders:

| Folder | What it is | On GitHub? |
|---|---|---|
| `site-source/` | The readable site. `public` is the homepage; `private` is the case studies and their images. | **Never.** It's listed in `.gitignore`. |
| `tools/encrypt.html` | Turns `site-source` into the encrypted site. Runs offline in your browser. | Yes (harmless; it has no content or password) |
| `docs/` | The encrypted, published site. | Yes. GitHub Pages serves this folder. |

## One-time setup

1. Install **GitHub Desktop** and sign in.
2. **File → Add local repository →** choose this `eb-portfolio` folder, then **create a repository** here. Keep it **public** (needed for free GitHub Pages).
3. Run the encrypt steps below, then **Commit** and **Publish repository**.
4. On github.com, open the repo → **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main**, folder: **/docs** → Save.
5. Your site appears at `https://<your-username>.github.io/eb-portfolio/` within a few minutes.

## Encrypt (every time anything changes)

1. Open `tools/encrypt.html` in Chrome or Edge (double-click it).
2. **Choose folder** → pick `site-source`.
3. Type your password twice. Use 4+ random words or 16+ characters.
4. **Save into docs folder** → pick `docs`. (Or **Download .zip** and unzip it into `eb-portfolio`, replacing `docs`.)
5. In GitHub Desktop, check that only `docs` files changed, then **Commit** and **Push**.

## Updating content

Ask Claude to update the canvas, then for a fresh `site-source` folder. Replace the old one, run Encrypt with the **same password**, and push. Visitors keep using the password they have.

## Changing the password

Run Encrypt with the new password and push. The old password stops working immediately.

## Good to know

- Visitors unlock once per browser tab. Closing the tab locks it again.
- The homepage (cards, About, contact) is public. Case studies and every case study image are encrypted (AES-256-GCM, key from PBKDF2-SHA256 with 600,000 iterations).
- Anyone you give the password to can share it. Change it any time with the steps above.
- Custom domain: add it under **Settings → Pages**. GitHub writes a `CNAME` file into `docs`; the encrypt step keeps it.
