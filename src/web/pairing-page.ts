export const pairingPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#eaf4ed">
  <title>Hawking Tech | WhatsApp Pairing</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Aptos", "Segoe UI", sans-serif;
      color: #173a42;
      background: #eaf4ed;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      --ink: #173a42;
      --muted: #557076;
      --line: #cadbd2;
      --green: #176d61;
      --coral: #ef6b5b;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 28px 18px;
      background-image: linear-gradient(#dcebe1 1px, transparent 1px), linear-gradient(90deg, #dcebe1 1px, transparent 1px);
      background-size: 32px 32px;
    }
    main { width: min(100%, 490px); }
    .brand { display: flex; align-items: center; gap: 12px; margin: 0 0 20px 2px; }
    .brand img { width: 48px; height: 48px; }
    .brand-name { font-size: 15px; font-weight: 800; letter-spacing: .08em; }
    .brand-label { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; }
    .panel { padding: clamp(24px, 7vw, 38px); border: 1px solid var(--line); border-radius: 10px; background: #fffef9; box-shadow: 0 18px 50px #173a4212; }
    .eyebrow { color: var(--green); font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 10px 0 8px; font-size: clamp(28px, 8vw, 38px); line-height: 1.08; }
    .intro { margin: 0 0 26px; color: var(--muted); font-size: 15px; line-height: 1.55; }
    label { display: block; margin: 18px 0 7px; font-size: 13px; font-weight: 700; }
    input { width: 100%; min-height: 48px; padding: 12px 13px; border: 1px solid #a9c0b7; border-radius: 6px; outline: none; background: #fff; color: var(--ink); font: inherit; }
    input:focus { border-color: var(--green); box-shadow: 0 0 0 3px #176d6124; }
    .hint { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    button { width: 100%; min-height: 48px; margin-top: 22px; border: 0; border-radius: 6px; background: var(--green); color: white; cursor: pointer; font: inherit; font-weight: 750; }
    button:hover { background: #10584f; }
    .copy-button { min-height: 42px; margin-top: 10px; border: 1px solid #91b2a4; background: transparent; color: var(--green); }
    .copy-button:hover { background: #edf6ef; }
    button:focus-visible { outline: 3px solid var(--coral); outline-offset: 3px; }
    button:disabled { cursor: wait; opacity: .65; }
    .notice { margin-top: 20px; padding: 12px 14px; border-left: 3px solid var(--coral); background: #fff1ec; color: #5b3a35; font-size: 12px; line-height: 1.5; }
    #result { margin-top: 20px; }
    #result[hidden] { display: none; }
    #message { min-height: 22px; margin: 0 0 10px; color: var(--muted); font-size: 13px; }
    #code { display: block; padding: 14px; border: 1px dashed #91b2a4; border-radius: 6px; background: #f2f8f3; font-family: ui-monospace, Consolas, monospace; font-size: 26px; font-weight: 800; letter-spacing: .12em; text-align: center; }
    #qr-image { display: block; width: min(100%, 320px); height: auto; margin: 12px auto; border: 8px solid #fff; }
    #qr-image[hidden] { display: none; }
    #session-reference { margin-top: 16px; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: #f5f8f3; }
    #session-reference[hidden] { display: none; }
    #session-id { display: block; overflow-wrap: anywhere; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
    .instructions { margin: 10px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
    footer { padding: 16px 4px 0; color: #557076; font-size: 11px; line-height: 1.5; }
    @media (prefers-reduced-motion: no-preference) {
      .panel { animation: appear .35s ease-out both; }
      @keyframes appear { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    }
  </style>
</head>
<body>
  <main>
    <header class="brand">
      <img src="/bot-avatar.svg" alt="">
      <div><span class="brand-name">HAWKING TECH</span><span class="brand-label">WhatsApp linked-device setup</span></div>
    </header>
    <section class="panel" aria-labelledby="title">
      <span class="eyebrow">Private pairing</span>
      <h1 id="title">Link your WhatsApp</h1>
      <p class="intro">Generate a one-time pairing code for your WhatsApp account.</p>
      <form id="pair-form">
        <label for="phone">WhatsApp number with country code</label>
        <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 555 123 4567" required>
        <p class="hint">Use the full international number, including + and your country calling code.</p>
        <label for="password">Pairing page password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" minlength="10" required>
        <button id="submit" type="submit">Generate pairing code</button>
      </form>
      <button id="qr-submit" class="copy-button" type="button">Use QR code instead</button>
      <div id="result" hidden aria-live="polite">
        <p id="message"></p>
        <output id="code"></output>
        <button id="copy-code" class="copy-button" type="button" hidden>Copy pairing code</button>
        <img id="qr-image" alt="WhatsApp linked-device QR code" hidden>
        <div id="session-reference" hidden>
          <p id="session-label" class="hint"></p>
          <code id="session-id"></code>
          <button id="copy-session" class="copy-button" type="button">Copy session ID</button>
        </div>
        <p class="instructions">Pair with the code or QR in WhatsApp → Linked devices. The bot stores the session automatically. The session ID is only a reference, not a password or activation code.</p>
      </div>
      <aside class="notice">Up to 10 accounts can link, each with isolated session files. Linking lets this bot access that account’s messages. Only pair an account you own or manage.</aside>
    </section>
    <footer>Pairing codes are temporary. Keep this page private and use it only over HTTPS.</footer>
  </main>
  <script>
    const form = document.querySelector('#pair-form');
    const button = document.querySelector('#submit');
    const result = document.querySelector('#result');
    const message = document.querySelector('#message');
    const code = document.querySelector('#code');
    const copyButton = document.querySelector('#copy-code');
    const qrButton = document.querySelector('#qr-submit');
    const qrImage = document.querySelector('#qr-image');
    const sessionReference = document.querySelector('#session-reference');
    const sessionLabel = document.querySelector('#session-label');
    const sessionIdOutput = document.querySelector('#session-id');
    const copySessionButton = document.querySelector('#copy-session');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      result.hidden = false;
      message.textContent = 'Requesting a pairing code…';
      code.textContent = '';
      copyButton.hidden = true;
      qrImage.hidden = true;
      qrImage.removeAttribute('src');
      sessionReference.hidden = true;
      button.disabled = true;
      try {
        const response = await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: form.phone.value, password: form.password.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Pairing request failed.');
        message.textContent = 'Enter this code on your WhatsApp phone:';
        code.textContent = data.code;
        copyButton.hidden = false;
        sessionLabel.textContent = 'Session ID (active after WhatsApp pairing; reference only):';
        sessionIdOutput.textContent = data.sessionId;
        sessionReference.hidden = false;
      } catch (error) {
        message.textContent = error.message || 'Pairing request failed.';
      } finally {
        button.disabled = false;
      }
    });
    qrButton.addEventListener('click', async () => {
      result.hidden = false;
      message.textContent = 'Starting a secure QR session…';
      code.textContent = '';
      copyButton.hidden = true;
      qrImage.hidden = true;
      sessionReference.hidden = true;
      qrButton.disabled = true;
      button.disabled = true;
      try {
        const response = await fetch('/api/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: form.password.value })
        });
        const session = await response.json();
        if (!response.ok) throw new Error(session.error || 'Could not start a QR session.');

        let shownImage = '';
        for (let attempt = 0; attempt < 240; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const statusResponse = await fetch('/api/qr/' + encodeURIComponent(session.sessionId), { cache: 'no-store' });
          const status = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(status.error || 'QR session expired.');
          if (status.status === 'connected') {
            qrImage.hidden = true;
            message.textContent = 'WhatsApp linked. The bot session is active.';
            sessionLabel.textContent = 'Linked session ID (reference only):';
            sessionIdOutput.textContent = status.sessionId;
            sessionReference.hidden = false;
            return;
          }
          if (status.status === 'qr' && status.image) {
            if (status.image !== shownImage) {
              qrImage.src = status.image;
              qrImage.hidden = false;
              shownImage = status.image;
            }
            message.textContent = 'On your phone, open WhatsApp → Linked devices → Link a device, then scan this QR code.';
          }
        }
        throw new Error('The QR session expired. Start a new one and scan promptly.');
      } catch (error) {
        message.textContent = error.message || 'Could not start a QR session.';
      } finally {
        qrButton.disabled = false;
        button.disabled = false;
      }
    });
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        copyButton.textContent = 'Copied';
      } catch {
        message.textContent = 'Copy is unavailable here. Select the code and copy it manually.';
      }
    });
    copySessionButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(sessionIdOutput.textContent);
        copySessionButton.textContent = 'Copied';
      } catch {
        message.textContent = 'Copy is unavailable here. Select the session ID and copy it manually.';
      }
    });
  </script>
</body>
</html>`;