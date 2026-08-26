import { WarpPayClient } from "./index.js";
/**
 * Generates LangChain-compatible tool definitions initialized with WarpPay402
 */
export declare function createWarpPayLangChainTools(client: WarpPayClient): ({
    name: string;
    description: string;
    func: ({ url }: {
        url: string;
    }) => Promise<any>;
} | {
    name: string;
    description: string;
    func: ({ address }: {
        address: string;
    }) => Promise<string>;
} | {
    name: string;
    description: string;
    func: ({ pdfUrl }: {
        pdfUrl: string;
    }) => Promise<any>;
})[];
