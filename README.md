# WhatsApp Bot

<p align="center"><img src="assets/bot-avatar.svg" alt="WhatsApp bot avatar" width="180"></p>

A WhatsApp assistant for up to 10 separately linked accounts. It supports group trivia, BBC World headlines, optional AI answers, group administration, and explicit saving of ordinary media attachments. Pair each account with a WhatsApp-linked-device code or QR; the server saves each session automatically.

> Created by DANKWAH STEPHEN for learning purpose only.

## WhatsApp Channel

[Follow our WhatsApp Channel](https://whatsapp.com/channel/0029Vb8pMKh5q08fyglEMA0i).

## GitHub Repository

[View the Hawkin repository on GitHub](https://github.com/Warxone3/hawkin).

## Local Setup

Requires Node.js 20 or newer and Git. Install dependencies with `npm install`, copy `.env.example` to `.env`, and set `PAIRING_PAGE_PASSWORD` to a private password of at least 10 characters. Leave `WHATSAPP_PAIRING_NUMBER` blank to generate codes through the web page instead of printing one in the terminal. `WHATSAPP_OWNER_NUMBER` is only needed to restore an older single-account session.

Start with `npm run build` followed by `npm start`, then open `http://localhost:3000` locally. Enter your phone number with its `+` country code and the page password, then copy the generated pairing code into **WhatsApp > Linked devices > Link with phone number** on that phone. Or choose **Use QR code instead** and scan it from **WhatsApp > Linked devices > Link a device**. The portal supports up to 10 separate accounts. Session credentials are stored automatically on the server. After linking, the page shows a persistent session ID; `!session` also displays it to that account's owner. This ID is a reference, not a login credential or activation code. Set `OPENAI_API_KEY` to enable AI replies; API usage is billed by OpenAI. `OPENAI_MODEL` defaults to `gpt-4.1-mini`.

## Commands

Send `!help` in WhatsApp for an in-chat guide. Trivia, scores, headlines, and help are available to everyone in a chat; AI, media saving, and group-management commands are limited to that linked account's owner.

- `!help` lists commands.
- `!save` saves an attached image, video, audio file, or document into `downloads`. Include `!save` as the media caption. Downloads are limited to 100 MB each.
- `!join <invite link>` joins a group using its invite link.
- `!add <international number>` and `!kick <international number>` add or remove a member in the current group.
- `!link` sends the current group's invite link.
- `!session` shows the linked account's persistent session ID to its owner. This ID is a reference only and cannot authenticate or activate a session.
- `!ai <question>` sends a prompt to OpenAI and replies with its answer. Only the owner can use bot commands.
- `!trivia` starts a multiple-choice trivia round; the first correct `!answer <1-4>` earns a point.
- `!score` shows the current chat's trivia leaderboard. Scores reset when the bot restarts.
- `!news` shares up to five recent world headlines from the BBC News RSS feed.

Group administration, media saving, and AI commands are restricted to the paired account owner; trivia and news commands are available to other chat participants. Group changes require the bot account to have sufficient group permissions. Incoming messages are marked as read. View-once media is not opened or downloaded; `!save` only handles ordinary media.

Baileys is an unofficial WhatsApp Web client. Using it may violate WhatsApp's terms or result in account restrictions. Keep the session credentials and downloaded files private; both are excluded from Git by default.

## GitHub and Hosting

Create an empty GitHub repository, then from this project folder connect and push it from PowerShell:

```powershell
git init
git add .
git commit -m "Prepare WhatsApp bot for deployment"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Authenticate with GitHub when Git prompts; never commit `.env`, WhatsApp session files, or API keys. The GitHub Actions workflow builds the TypeScript project on each push. For a hosted service, connect the repository to a Docker-capable worker host (for example, Koyeb, Railway, or a VPS) and deploy using the included `Dockerfile`.

Configure `PAIRING_PAGE_PASSWORD`, `PORT` (usually `3000`), `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` as host environment variables. Keep the pairing password in the host's secret settings, never in this README or source control. Generate a strong password, for example with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Deploy behind the host's HTTPS proxy and expose port `3000`; never publish the pairing page over plain public HTTP. The portal supports at most 10 isolated accounts. Mount persistent storage at `/app/auth_info_baileys` before first pairing; optionally mount `/app/downloads` to preserve saved files. Without persistent storage, a restart or redeploy loses the WhatsApp pairings and requires pairing again.