import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { privateKeyToAccount } from "viem/accounts";

export interface WarpPayConfig {
  /** Base Mainnet private key of the agent's wallet funding the micro-payments */
  privateKey: `0x${string}`;
  /** Custom gateway URL (Defaults to https://api.warppay402.com) */
  baseUrl?: string;
}

export interface ScrapeResponse {
  success: boolean;
  title: string;
  markdown: string;
  truncated: boolean;
}

export interface BaseAnalyticsResponse {
  success: boolean;
  network: string;
  address: string;
  ethBalance: string;
  nonce: number;
  timestamp: string;
}

export interface PdfExtractorResponse {
  success: boolean;
  pages: number;
  info: Record<string, any>;
  textPreview: string;
}

export interface BrowserScrapeResponse {
  success: boolean;
  url: string;
  content: string;
}

export interface ScreenshotResponse {
  success: boolean;
  url: string;
  screenshotUrl?: string;
  base64?: string;
}

export interface ExtractJsonResponse {
  success: boolean;
  url: string;
  schema: any;
  extractedData: Record<string, any>;
}

export class WarpPayClient {
  private baseUrl: string;
  private account;

  constructor(config: WarpPayConfig) {
    this.baseUrl = (config.baseUrl || "https://api.warppay402.com").replace(/\/$/, "");
    
    const rawKey = config.privateKey.trim();
    const formattedKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
    this.account = privateKeyToAccount(formattedKey);
  }

  /**
   * Internal helper handling the initial HTTP request, 402 Payment Required challenge,
   * EIP-712 signing, and automated retry with x402 payment authorization headers.
   */
  private async executePaidRequest<T>(endpoint: string, payload: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // 1. Initial Request
    let response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // 2. Handle x402 V2 Payment Challenge if HTTP 402 returned
    if (response.status === 402) {
      const challenge = await response.json();

      const req = challenge.x402?.accepts?.[0] || challenge.accepts?.[0] || {};
      const payTo = (req.payToAddress || req.payTo || "0x0000000000000000000000000000000000000000") as `0x${string}`;
      const assetContract = (req.asset || req.usdcAddress || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;
      const value = BigInt(req.maxAmountRequired || req.amount || "10000");

      const domain = {
        name: req.extra?.name || "USD Coin",
        version: req.extra?.version || "2",
        chainId: 8453,
        verifyingContract: assetContract,
      };

      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };

      const now = Math.floor(Date.now() / 1000);
      const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;

      const message = {
        from: this.account.address,
        to: payTo,
        value,
        validAfter: BigInt(0),
        validBefore: BigInt(now + 3600),
        nonce,
      };

      // Sign typed EIP-712 USDC TransferWithAuthorization data
      const signature = await this.account.signTypedData({
        domain,
        types,
        primaryType: "TransferWithAuthorization",
        message,
      });

      const paymentPayload = {
        x402Version: 2,
        scheme: req.scheme || "exact",
        network: req.network || "eip155:8453",
        payload: {
          authorization: {
            from: this.account.address,
            to: payTo,
            value: value.toString(),
            validAfter: "0",
            validBefore: (now + 3600).toString(),
            nonce,
          },
          signature,
        },
      };

      const encodedPayload = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      // Retry request with signed x402 headers
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": encodedPayload,
          "PAYMENT-SIGNATURE": encodedPayload,
          "X-PAYMENT-SIGNATURE": signature,
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WarpPay API Error (${response.status}): ${errText}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Scrapes any Web URL into clean Markdown for AI context ($0.01 USDC on Base)
   */
  public async scrapeWeb(url: string): Promise<ScrapeResponse> {
    return this.executePaidRequest<ScrapeResponse>("/api/v1/tools/web-scraper", { url });
  }

  /**
   * Fetches Base Mainnet balance and transaction stats for any 0x wallet ($0.02 USDC on Base)
   */
  public async getBaseAnalytics(address: string): Promise<BaseAnalyticsResponse> {
    return this.executePaidRequest<BaseAnalyticsResponse>("/api/v1/tools/base-analytics", { address });
  }

  /**
   * Downloads and extracts text preview from a public PDF URL ($0.05 USDC on Base)
   */
  public async extractPdf(pdfUrl: string): Promise<PdfExtractorResponse> {
    return this.executePaidRequest<PdfExtractorResponse>("/api/v1/tools/pdf-extractor", { pdfUrl });
  }

  /**
   * Executes JS-rendering browser scraper via proxy workers ($0.05 USDC on Base)
   */
  public async browserScrape(url: string): Promise<BrowserScrapeResponse> {
    return this.executePaidRequest<BrowserScrapeResponse>("/api/v1/tools/browser-scraper", { url });
  }

  /**
   * Renders target URL and returns full-page screenshot data ($0.10 USDC on Base)
   */
  public async renderScreenshot(url: string): Promise<ScreenshotResponse> {
    return this.executePaidRequest<ScreenshotResponse>("/api/v1/tools/render-screenshot", { url });
  }

  /**
   * Extracts structured JSON schema data from web pages ($0.15 USDC on Base)
   */
  public async extractJson(url: string, schema?: object): Promise<ExtractJsonResponse> {
    return this.executePaidRequest<ExtractJsonResponse>("/api/v1/tools/extract-json", { url, schema });
  }
}
