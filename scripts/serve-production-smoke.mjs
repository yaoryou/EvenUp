import { createServer } from "node:http";
import { groupIdFromArgs, loadEnvironment, loadGroups, selectGroup, validateEnvironment } from "./group-config.mjs";

const group = selectGroup(await loadGroups(), groupIdFromArgs(process.argv.slice(2)));
const { environment: config } = await loadEnvironment(group);
validateEnvironment(group, config, ["access_key", "web_app_url"]);
const port = Number(process.env.PORT || 4174);
const payload = JSON.stringify({
  api_version: "v1",
  action: "bootstrap",
  access_key: config.access_key,
  request_id: null,
  payload: {}
}).replaceAll("<", "\\u003c");

const html = `<!doctype html>
<html lang="ja">
  <meta charset="utf-8">
  <title>EvenUp ${group.name} Smoke Test</title>
  <body>
    <main>
      <h1>EvenUp ${group.name} Smoke Test</h1>
      <p id="status">確認中…</p>
    </main>
    <script>
      fetch(${JSON.stringify(config.web_app_url)}, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: ${JSON.stringify(payload)}
      })
        .then((response) => response.json())
        .then((result) => {
          if (!result.ok) throw new Error(result.error.code);
          const names = result.data.members.map((member) => member.name).join("、");
          document.querySelector("#status").textContent =
            "成功: " + names + " / 未精算 " + result.data.open_payments.length + "件";
          document.body.dataset.result = "success";
        })
        .catch((error) => {
          document.querySelector("#status").textContent = "失敗: " + error.message;
          document.body.dataset.result = "failure";
        });
    </script>
  </body>
</html>`;

createServer((_request, response) => {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; connect-src https://script.google.com https://script.googleusercontent.com; style-src 'unsafe-inline'`,
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`EvenUp ${group.id} smoke test: http://127.0.0.1:${port}`);
});
