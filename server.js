import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { JSDOM } from "jsdom";

const app = express();
app.use(cors());

// Rewrite all src/href URLs to go through our proxy
function rewriteHTML(html, baseUrl, proxyBase) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  doc.querySelectorAll("[src]").forEach(el => {
    let url = el.getAttribute("src");
    if (url && !url.startsWith("data:")) {
      url = new URL(url, baseUrl).href;
      el.setAttribute("src", `${proxyBase}?url=${encodeURIComponent(url)}`);
    }
  });

  doc.querySelectorAll("[href]").forEach(el => {
    let url = el.getAttribute("href");
    if (url && !url.startsWith("data:") && !url.startsWith("#")) {
      url = new URL(url, baseUrl).href;
      el.setAttribute("href", `${proxyBase}?url=${encodeURIComponent(url)}`);
    }
  });

  return dom.serialize();
}

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing ?url=");

  try {
    const r = await fetch(targetUrl);
    const type = r.headers.get("content-type") || "";
    res.removeHeader("X-Frame-Options");
    res.removeHeader("Content-Security-Policy");

    if (type.includes("text/html")) {
      const html = await r.text();
      const rewritten = rewriteHTML(
        html,
        targetUrl,
        `${req.protocol}://${req.get("host")}/proxy`
      );
      res.set("Content-Type", "text/html");
      res.send(rewritten);
    } else {
      res.set("Content-Type", type);
      const buf = await r.arrayBuffer();
      res.send(Buffer.from(buf));
    }
  } catch (err) {
    res.status(500).send("Proxy error: " + err.message);
  }
});

app.listen(3000, () => console.log("Proxy running on port 3000"));
