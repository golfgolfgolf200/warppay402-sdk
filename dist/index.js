"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WarpPayClient = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_buffer_1 = require("node:buffer");
const accounts_1 = require("viem/accounts");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
class WarpPayClient {
    baseUrl;
    account;
    solanaKeypair;
    solanaConnection;
    constructor(config) {
        this.baseUrl = (config.baseUrl || "https://api.warppay402.com").replace(/\/$/, "");
        this.solanaConnection = new web3_js_1.Connection(config.solanaRpcUrl || "https://api.mainnet-beta.solana.com", "confirmed");
        // EVM Account Setup
        if (config.privateKey) {
            const rawKey = config.privateKey.trim();
            const formattedKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
            this.account = (0, accounts_1.privateKeyToAccount)(formattedKey);
        }
        // Solana Account Setup
        if (config.solanaPrivateKey) {
            const decodedSecret = bs58_1.default.decode(config.solanaPrivateKey.trim());
            this.solanaKeypair = web3_js_1.Keypair.fromSecretKey(decodedSecret);
        }
        if (!this.account && !this.solanaKeypair) {
            throw new Error("WarpPayClient requires either a Base privateKey or a solanaPrivateKey.");
        }
    }
    /**
     * Handles multi-chain HTTP 402 Payment Required challenges dynamically.
     */
    async executePaidRequest(endpoint, payload) {
        const url = `${this.baseUrl}${endpoint}`;
        // 1. Initial Request Probe
        let response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        // 2. Multi-Chain Settlement Challenge Response
        if (response.status === 402) {
            const challenge = await response.json();
            const accepts = challenge.x402?.accepts || challenge.accepts || [];
            // Check for Solana offer if solanaKeypair is available
            const solanaReq = accepts.find((a) => a.network?.includes("solana"));
            const evmReq = accepts.find((a) => a.network?.includes("eip155"));
            let paymentPayload;
            if (solanaReq && this.solanaKeypair) {
                // Execute Solana L1 SPL-USDC Transaction Authorization
                const payToPubkey = new web3_js_1.PublicKey(solanaReq.payTo);
                const usdcMint = new web3_js_1.PublicKey(solanaReq.asset || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
                const amountUnits = BigInt(solanaReq.amount || solanaReq.maxAmountRequired || "10000"); // $0.01 USDC
                const senderPubkey = this.solanaKeypair.publicKey;
                const senderAta = await (0, spl_token_1.getAssociatedTokenAddress)(usdcMint, senderPubkey);
                const recipientAta = await (0, spl_token_1.getAssociatedTokenAddress)(usdcMint, payToPubkey);
                const tx = new web3_js_1.Transaction();
                tx.feePayer = senderPubkey;
                tx.recentBlockhash = (await this.solanaConnection.getLatestBlockhash()).blockhash;
                // Idempotently create recipient ATA if required
                tx.add((0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(senderPubkey, recipientAta, payToPubkey, usdcMint));
                // Append SPL-USDC Transfer instruction
                tx.add((0, spl_token_1.createTransferInstruction)(senderAta, recipientAta, senderPubkey, amountUnits));
                tx.sign(this.solanaKeypair);
                const serializedTx = node_buffer_1.Buffer.from(tx.serialize()).toString("base64");
                paymentPayload = {
                    x402Version: 2,
                    scheme: solanaReq.scheme || "exact",
                    network: solanaReq.network || "solana:5eykt4wA89m8E5b9B5658p445VTc28",
                    signature: serializedTx,
                    paymentPayload: {
                        signature: serializedTx,
                        network: solanaReq.network
                    }
                };
            }
            else if (evmReq && this.account) {
                // EVM EIP-712 Base Path
                const payTo = (evmReq.payToAddress || evmReq.payTo);
                const assetContract = (evmReq.asset || evmReq.usdcAddress);
                const value = BigInt(evmReq.maxAmountRequired || evmReq.amount || "10000");
                const domain = {
                    name: evmReq.extra?.name || "USD Coin",
                    version: evmReq.extra?.version || "2",
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
                const signature = await this.account.signTypedData({
                    domain,
                    types,
                    primaryType: "TransferWithAuthorization",
                    message,
                });
                paymentPayload = {
                    x402Version: 2,
                    scheme: evmReq.scheme || "exact",
                    network: evmReq.network || "eip155:8453",
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
            }
            else {
                throw new Error("No matching private key configured for returned 402 networks.");
            }
            const encodedPayload = node_buffer_1.Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
            // Resubmit request with signed x402 headers
            response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-PAYMENT": encodedPayload,
                    "PAYMENT-SIGNATURE": encodedPayload,
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
    async scrapeWeb(url) {
        return this.executePaidRequest("/api/v1/tools/web-scraper", { url });
    }
    async getBaseAnalytics(address) {
        return this.executePaidRequest("/api/v1/tools/base-analytics", { address });
    }
    async extractPdf(pdfUrl) {
        return this.executePaidRequest("/api/v1/tools/pdf-extractor", { pdfUrl });
    }
    async browserScrape(url) {
        return this.executePaidRequest("/api/v1/tools/browser-scraper", { url });
    }
    async renderScreenshot(url) {
        return this.executePaidRequest("/api/v1/tools/render-screenshot", { url });
    }
    async extractJson(url, schema) {
        return this.executePaidRequest("/api/v1/tools/extract-json", { url, schema });
    }
}
exports.WarpPayClient = WarpPayClient;
