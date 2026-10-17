# Saturday Edge — Free iPhone Home Screen App

A static Progressive Web App (PWA) for GitHub Pages. No paid services, secrets, or personal ledger files in the public repository.

## Deploy on GitHub (repository: Kriegler1521/saturday-edge)

1. On a computer, download the **Saturday_Edge_GitHub_Pages.zip** file and unzip it.
2. Open your public repository: https://github.com/Kriegler1521/saturday-edge
3. Choose **Add file → Upload files**. Upload the **contents** of the unzipped folder (not the folder itself). GitHub's web upload may not preserve the hidden `.github/workflows` folder. If it doesn't, use the GitHub desktop app or create `.github/workflows/refresh.yml` manually in the GitHub web editor and paste its content.
4. Commit the changes to the `main` branch.
5. In repository **Settings → Pages**, choose **Deploy from a branch**, `main`, `/ (root)` and Save. Wait for deployment.
6. Open https://kriegler1521.github.io/saturday-edge/ on your iPhone in Safari.
7. Tap **Share → Add to Home Screen → Add**.
8. In GitHub, open **Actions → Refresh public CFB games → Run workflow** for the first feed update. If Actions prompts you to enable workflows, enable them. The scheduled job runs approximately every 3 hours but can be delayed.

## What is and isn't automatic

- **Automatic after Actions is enabled:** available ESPN public college football game schedules and scores, subject to endpoint availability and GitHub Actions scheduling.
- **Interactive but manual:** SP+, FPI, FEI, Action Network and custom CFBD projections, actual sportsbook odds, personnel and weather verification.
- **Private locally:** wagers stored in Safari localStorage. They do not sync between devices. Use the Backup JSON button regularly. Do not commit exported wagers to this public repository.
- **No automatic bets, no guaranteed edges:** the normal-distribution cover calculation and model weights are unvalidated research estimates. A candidate label is not a wager recommendation.

## Troubleshooting

- If the schedule shows no games, run the workflow manually and inspect its logs. The public ESPN endpoint may be unavailable or change.
- If the site returns 404, check Pages settings, repository spelling and wait for the initial deployment.
- GitHub Pages is **public**. Do not upload private betting ledgers, API keys or secrets.
- GitHub Actions usage, repository policies and free tier availability can change; the workflow uses no paid API or cloud service.

## Future extensions

Add a supported CFBD free API integration using a GitHub Actions secret, ensure usage limits are enforced, and publish only aggregated non-sensitive team ratings. Obtain explicit permissions for any third-party prediction/odds feeds before automating them. Validate model weights and cover probabilities on out-of-sample seasons before treating signals as bets.
