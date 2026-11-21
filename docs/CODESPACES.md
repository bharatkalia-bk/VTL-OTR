# Run VTL OTR in GitHub Codespaces

The full app (PostgreSQL, Redis, API with background worker, candidate portal, admin console) runs inside a codespace with **demo data**, and GitHub gives it HTTPS links. HTTPS means the live camera works.

## Start it

1. Open https://github.com/bharatkalia-bk/VTL-OTR
2. Click **Code → Codespaces → ⋯ → New with options**, choose branch `claude/intelligent-wright-gsglml` and machine type **4-core**, then **Create codespace**.
3. Wait about 8 to 10 minutes the first time. It installs everything, creates the database and loads demo data. You can watch progress in the terminal.
4. When it finishes, the terminal prints the links and the candidate portal opens. Links look like
   `https://<codespace-name>-5173.app.github.dev` (candidates) and `…-5174.app.github.dev` (admin).

The setup tries to make both links **public** so anyone with the link can open them. If a link asks people to sign in to GitHub, open the **Ports** tab, right-click ports 5173 and 5174, and choose **Port Visibility → Public**.

## Log in

| Who | Login | Password | Extra |
|---|---|---|---|
| Candidate | `candidate01@example.in` … `candidate50@example.in` | `Candidate@123` | type the captcha |
| Staff | `superadmin@vtl-otr.local` (also `examadmin@`, `verifier@`, `helpdesk@`, `auditor@`, `centre@`, `observer@`, `agency@`, `panel@`) | `Admin@12345` | verification code `123456` |

Every OTP in the codespace is **`123456`**: staff sign-in codes, codes for sensitive staff actions, and candidate registration, login and recovery OTPs. Nothing is really sent; the **Demo inbox** (link in the yellow banner) shows what would have gone out.

## If a link shows "HTTP ERROR 502"

The site is not running yet (or stopped). In the codespace's terminal (bottom of the editor) run:

```bash
git pull && bash .devcontainer/start.sh
```

Wait for **VTL OTR is running**, then reload the page. If it prints a WARNING, run `bash .devcontainer/setup.sh` once (a few minutes, reloads the demo data), then `bash .devcontainer/start.sh` again.

## Good to know

- **It sleeps when idle** (30 minutes by default) and the links stop working. Reopen the codespace from GitHub and everything restarts automatically with the same data.
- Personal GitHub accounts include free Codespaces hours each month (a 4-core machine uses them 4× faster). Stop the codespace when you're not using it: **Codespaces → ⋯ → Stop**.
- Demo mode only. Never enter real candidate data here. For a real deployment use `docs/DEPLOYMENT.md`.
- Restart the app: `bash .devcontainer/start.sh`. Logs: `/tmp/vtl-otr/*.log`.
