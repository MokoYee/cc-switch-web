export const renderControlLoginPage = (mountPath: string): string => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI CLI Switch Control UI</title>
    <style>
      :root {
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: #10212f;
        background:
          radial-gradient(circle at top left, rgba(255, 187, 92, 0.45), transparent 30%),
          radial-gradient(circle at top right, rgba(56, 189, 248, 0.2), transparent 28%),
          linear-gradient(180deg, #f7f2ea 0%, #eef4f7 100%);
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
      main {
        width: min(480px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 28px;
        background: rgba(255,255,255,.8);
        border: 1px solid rgba(16,33,47,.08);
        box-shadow: 0 18px 40px rgba(16,33,47,.06);
      }
      h1 { margin: 0 0 12px; font-size: 2rem; }
      p { color: #4b6475; }
      input, button {
        width: 100%;
        border-radius: 16px;
        border: 1px solid rgba(16,33,47,.14);
        padding: 14px 16px;
        font: inherit;
      }
      button {
        margin-top: 12px;
        background: #10212f;
        color: white;
        cursor: pointer;
      }
      .error { color: #be185d; min-height: 24px; }
      code { font-family: "IBM Plex Mono", monospace; }
    </style>
  </head>
  <body>
    <main>
      <p>Local Protected Control Plane</p>
      <h1>AI CLI Switch</h1>
      <p>控制台默认只建议本地访问。Local access is recommended. 请输入控制令牌后进入管理界面。</p>
      <form id="loginForm">
        <input id="tokenInput" type="password" placeholder="输入 / Enter AICLI_SWITCH_CONTROL_TOKEN" />
        <button type="submit">进入控制台 / Open Console</button>
      </form>
      <p class="error" id="errorMessage"></p>
      <p>默认入口 / Default path: <code>${mountPath}</code></p>
    </main>
    <script>
      document.getElementById("loginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const token = document.getElementById("tokenInput").value;
        const errorNode = document.getElementById("errorMessage");
        errorNode.textContent = "";

        const response = await fetch("/api/v1/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });

        if (!response.ok) {
          errorNode.textContent = "令牌无效，请重试。Invalid token. Please try again.";
          return;
        }

        window.location.href = "${mountPath}/";
      });
    </script>
  </body>
</html>`;
