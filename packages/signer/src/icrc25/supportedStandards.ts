import type { JsonRequest, JsonResponse } from "../transport.js";

export type SupportedStandard = {
  name: string;
  url: string;
};

export type SupportedStandardsRequest =
  JsonRequest<"icrc25_supported_standards">;

export type SupportedStandardsResponse = JsonResponse<{
  supportedStandards: SupportedStandard[];
}>;
