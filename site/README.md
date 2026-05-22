# FormAlive — Landing site

A single-page static landing site for the FormAlive Chrome extension.

## Local preview

```powershell
# from repo root
cd site
# any static server works; pick one
npx serve .
# or
python -m http.server 5173
```

Then open http://localhost:5173/ (or whatever port the server reports).

## Files

- `index.html` — all sections (hero, supported ATS, features, demo, how-it-works, testimonials, pricing, FAQ, CTA, footer)
- `style.css` — glassmorphism, gradients, reveal-on-scroll, demo states
- `main.js` — scroll reveal, FAQ accordion, pricing toggle, demo fill animation

Tailwind is loaded via CDN so there is no build step. To deploy:

## Deploy to GitHub Pages

1. Push the `site/` folder to the repo.
2. In GitHub → Settings → Pages, set source to `main` branch and folder to `/site`.
3. Your site will be live at `https://ritzy1211.github.io/FormAlive/`.

(Or copy the three files to any static host: Netlify, Cloudflare Pages, Vercel.)
