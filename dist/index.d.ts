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
export declare class WarpPayClient {
    private baseUrl;
    private account;
    constructor(config: WarpPayConfig);
    /**
     * Internal helper handling the initial HTTP request, 402 Payment Required challenge,
     * EIP-712 signing, and automated retry with x402 payment authorization headers.
     */
    private executePaidRequest;
    /**
     * Scrapes any Web URL into clean Markdown for AI context ($0.01 USDC on Base)
     */
    scrapeWeb(url: string): Promise<ScrapeResponse>;
    /**
     * Fetches Base Mainnet balance and transaction stats for any 0x wallet ($0.02 USDC on Base)
     */
    getBaseAnalytics(address: string): Promise<BaseAnalyticsResponse>;
    /**
     * Downloads and extracts text preview from a public PDF URL ($0.05 USDC on Base)
     */
    extractPdf(pdfUrl: string): Promise<PdfExtractorResponse>;
    /**
     * Executes JS-rendering browser scraper via proxy workers ($0.05 USDC on Base)
     */
    browserScrape(url: string): Promise<BrowserScrapeResponse>;
    /**
     * Renders target URL and returns full-page screenshot data ($0.10 USDC on Base)
     */
    renderScreenshot(url: string): Promise<ScreenshotResponse>;
    /**
     * Extracts structured JSON schema data from web pages ($0.15 USDC on Base)
     */
    extractJson(url: string, schema?: object): Promise<ExtractJsonResponse>;
}
