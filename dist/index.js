"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WarpPayClient = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_buffer_1 = require("node:buffer");
const accounts_1 = require("viem/accounts");
class WarpPayClient {
    baseUrl;
    account;
    constructor(config) {
        this.baseUrl = (config.baseUrl || "https://api.warppay402.com").replace(/\/$/, "");
        const rawKey = config.privateKey.trim();
        const formattedKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
        this.account = (0, accounts_1.privateKeyToAccount)(formattedKey);
    }
    /**
     * Internal helper handling the initial HTTP request, 402 Payment Required challenge,
     * EIP-712 signing, and automated retry with x402 payment authorization headers.
     */
    async executePaidRequest(endpoint, payload) {
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
            const payTo = (req.payToAddress || req.payTo || "0x0000000000000000000000000000000000000000");
            const assetContract = (req.asset || req.usdcAddress || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
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
            const nonce = `0x${node_crypto_1.default.randomBytes(32).toString("hex")}`;
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
            const encodedPayload = node_buffer_1.Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
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
        return (await response.json());
    }
    /**
     * Scrapes any Web URL into clean Markdown for AI context ($0.01 USDC on Base)
     */
    async scrapeWeb(url) {
        return this.executePaidRequest("/api/v1/tools/web-scraper", { url });
    }
    /**
     * Fetches Base Mainnet balance and transaction stats for any 0x wallet ($0.02 USDC on Base)
     */
    async getBaseAnalytics(address) {
        return this.executePaidRequest("/api/v1/tools/base-analytics", { address });
    }
    /**
     * Downloads and extracts text preview from a public PDF URL ($0.05 USDC on Base)
     */
    async extractPdf(pdfUrl) {
        return this.executePaidRequest("/api/v1/tools/pdf-extractor", { pdfUrl });
    }
    /**
     * Executes JS-rendering browser scraper via proxy workers ($0.05 USDC on Base)
     */
    async browserScrape(url) {
        return this.executePaidRequest("/api/v1/tools/browser-scraper", { url });
    }
    /**
     * Renders target URL and returns full-page screenshot data ($0.10 USDC on Base)
     */
    async renderScreenshot(url) {
        return this.executePaidRequest("/api/v1/tools/render-screenshot", { url });
    }
    /**
     * Extracts structured JSON schema data from web pages ($0.15 USDC on Base)
     */
    async extractJson(url, schema) {
        return this.executePaidRequest("/api/v1/tools/extract-json", { url, schema });
    }
}
exports.WarpPayClient = WarpPayClient;
