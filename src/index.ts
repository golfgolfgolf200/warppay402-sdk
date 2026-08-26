import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { privateKeyToAccount } from "viem/accounts";
import { Keypair, Connection, Transaction, PublicKey } from "@solana/web3.js";
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction, 
  createAssociatedTokenAccountIdempotentInstruction 
} from "@solana/spl-token";
import bs58 from "bs58";

export interface WarpPayConfig {
  /** Base Mainnet private key of the agent's wallet funding micro-payments */
  privateKey?: `0x${string}`;
  /** Solana Mainnet base58 private key funding micro-payments */
  solanaPrivateKey?: string;
  /** Custom gateway URL (Defaults to https://api.warppay402.com) */
  baseUrl?: string;
  /** Custom Solana RPC URL */
  solanaRpcUrl?: string;
}

export class WarpPayClient {
  private baseUrl: string;
  private account?: ReturnType<typeof privateKeyToAccount>;
  private solanaKeypair?: Keypair;
  private solanaConnection: Connection;

  constructor(config: WarpPayConfig) {
    this.baseUrl = (config.baseUrl || "https://api.warppay402.com").replace(/\/$/, "");
    this.solanaConnection = new Connection(
      config.solanaRpcUrl || "https://api.mainnet-beta.solana.com", 
      "confirmed"
    );

    // EVM Account Setup
    if (config.privateKey) {
      const rawKey = config.privateKey.trim();
      const formattedKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
      this.account = privateKeyToAccount(formattedKey);
    }

    // Solana Account Setup
    if (config.solanaPrivateKey) {
      const decodedSecret = bs58.decode(config.solanaPrivateKey.trim());
      this.solanaKeypair = Keypair.fromSecretKey(decodedSecret);
    }

    if (!this.account && !this.solanaKeypair) {
      throw new Error("WarpPayClient requires either a Base privateKey or a solanaPrivateKey.");
    }
  }

  /**
   * Handles multi-chain HTTP 402 Payment Required challenges dynamically.
   */
  private async executePaidRequest<T>(endpoint: string, payload: Record<string, any>): Promise<T> {
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
      const accepts: Array<any> = challenge.x402?.accepts || challenge.accepts || [];

      // Check for Solana offer if solanaKeypair is available
      const solanaReq = accepts.find((a) => a.network?.includes("solana"));
      const evmReq = accepts.find((a) => a.network?.includes("eip155"));

      let paymentPayload: any;

      if (solanaReq && this.solanaKeypair) {
        // Execute Solana L1 SPL-USDC Transaction Authorization
        const payToPubkey = new PublicKey(solanaReq.payTo);
        const usdcMint = new PublicKey(solanaReq.asset || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        const amountUnits = BigInt(solanaReq.amount || solanaReq.maxAmountRequired || "10000"); // $0.01 USDC

        const senderPubkey = this.solanaKeypair.publicKey;
        const senderAta = await getAssociatedTokenAddress(usdcMint, senderPubkey);
        const recipientAta = await getAssociatedTokenAddress(usdcMint, payToPubkey);

        const tx = new Transaction();
        tx.feePayer = senderPubkey;
        tx.recentBlockhash = (await this.solanaConnection.getLatestBlockhash()).blockhash;

        // Idempotently create recipient ATA if required
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            senderPubkey,
            recipientAta,
            payToPubkey,
            usdcMint
          )
        );

        // Append SPL-USDC Transfer instruction
        tx.add(
          createTransferInstruction(senderAta, recipientAta, senderPubkey, amountUnits)
        );

        tx.sign(this.solanaKeypair);
        const serializedTx = Buffer.from(tx.serialize()).toString("base64");

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
      } else if (evmReq && this.account) {
        // EVM EIP-712 Base Path
        const payTo = (evmReq.payToAddress || evmReq.payTo) as `0x${string}`;
        const assetContract = (evmReq.asset || evmReq.usdcAddress) as `0x${string}`;
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
        const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;

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
      } else {
        throw new Error("No matching private key configured for returned 402 networks.");
      }

      const encodedPayload = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

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

    return (await response.json()) as T;
  }

  public async scrapeWeb(url: string): Promise<any> {
    return this.executePaidRequest("/api/v1/tools/web-scraper", { url });
  }

  public async getBaseAnalytics(address: string): Promise<any> {
    return this.executePaidRequest("/api/v1/tools/base-analytics", { address });
  }

  public async extractPdf(pdfUrl: string): Promise<any> {
    return this.executePaidRequest("/api/v1/tools/pdf-extractor", { pdfUrl });
  }

  public async browserScrape(url: string): Promise<any> {
    return this.executePaidRequest("/api/v1/tools/browser-scraper", { url });
  }

  public async renderScreenshot(url: string): Promise<any> {
    return this.executePaidRequest("/api/v1/tools/render-screenshot", { url });
  }

  public async extractJson(url: string, schema?: object): Promise<any> {
    return this.executePaidRequest("/api/v1/tools/extract-json", { url, schema });
  }
}
