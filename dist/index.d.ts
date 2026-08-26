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
export declare class WarpPayClient {
    private baseUrl;
    private account?;
    private solanaKeypair?;
    private solanaConnection;
    constructor(config: WarpPayConfig);
    /**
     * Handles multi-chain HTTP 402 Payment Required challenges dynamically.
     */
    private executePaidRequest;
    scrapeWeb(url: string): Promise<any>;
    getBaseAnalytics(address: string): Promise<any>;
    extractPdf(pdfUrl: string): Promise<any>;
    browserScrape(url: string): Promise<any>;
    renderScreenshot(url: string): Promise<any>;
    extractJson(url: string, schema?: object): Promise<any>;
}
