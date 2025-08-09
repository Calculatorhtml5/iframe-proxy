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

// Handle CORS preflight requests
app.options("/proxy", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.sendStatus(204);
});

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing ?url=");

  try {
    // Forward client headers including cookies
    const headers = { ...req.headers };
    delete headers.host; // Remove host header to avoid conflicts

    const r = await fetch(targetUrl, { headers });
    const type = r.headers.get("content-type") || "";

    // Forward important headers like Set-Cookie back to client
    r.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "set-cookie" || lowerKey === "access-control-allow-origin") {
        res.setHeader(key, value);
      }
    });

    // Add CORS headers to proxy response
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

    res.removeHeader("X-Frame-Options");
    res.removeHeader("Content-Security-Policy");

    if (type.includes("text/html")) {
      const html = await r.text();
      const rewritten = rewriteHTML(
        html,
        targetUrl,
        `https://${req.get("host")}/proxy`
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

app.listen(process.env.PORT || 3000, () =>
  console.log("Proxy running on port", process.env.PORT || 3000)
);
