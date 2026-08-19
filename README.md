# @warppay402/sdk

Official TypeScript SDK for **WarpPay402**—pay-per-use AI tools monetized via x402 USDC micropayments on Base Mainnet.

## 📦 Installation

```bash
npm install @warppay402/sdk
```
## 🚀 Quickstart
```typescript
import { WarpPayClient } from "@warppay402/sdk";

// Initialize with your AI agent's Base wallet private key
const client = new WarpPayClient({
  privateKey: process.env.CUSTOMER_PRIVATE_KEY as `0x${string}`,
});

async function main() {
  // Scrapes any URL into clean Markdown ($0.01 USDC)
  const page = await client.scrapeWeb("https://news.ycombinator.com");
  console.log("Title:", page.title);
  console.log("Markdown:", page.markdown);

  // Fetch Base wallet analytics ($0.02 USDC)
  const analytics = await client.getBaseAnalytics("0x556c77792642E8ff95eC930FFb8D46a76579126E");
  console.log("ETH Balance:", analytics.ethBalance);

  // Extract PDF text preview ($0.05 USDC)
  const pdf = await client.extractPdf("https://example.com/document.pdf");
  console.log("Preview:", pdf.textPreview);
}

main();
```
## 🛠️ LangChain Integration
```typescript
import { WarpPayClient, createWarpPayLangChainTools } from "@warppay402/sdk";

const client = new WarpPayClient({
  privateKey: process.env.CUSTOMER_PRIVATE_KEY as `0x${string}`,
});

// Pass directly into your LangChain or AutoGen agent setup
const tools = createWarpPayLangChainTools(client);
```
## 🌐 API Gateway & Specs

Gateway: https://api.warppay402.com

MCP Manifest: https://api.warppay402.com/.well-known/mcp.json

OpenAPI Spec: https://api.warppay402.com/openapi.json
