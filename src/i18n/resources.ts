import { common as enCommon } from "@/i18n/resources/en/common";
import { homepage as enHomepage } from "@/i18n/resources/en/homepage";
import { metadata as enMetadata } from "@/i18n/resources/en/metadata";
import { seo as enSeo } from "@/i18n/resources/en/seo";
import { workflow as enWorkflow } from "@/i18n/resources/en/workflow";
import { common as zhCommon } from "@/i18n/resources/zh-Hans/common";
import { homepage as zhHomepage } from "@/i18n/resources/zh-Hans/homepage";
import { metadata as zhMetadata } from "@/i18n/resources/zh-Hans/metadata";
import { seo as zhSeo } from "@/i18n/resources/zh-Hans/seo";
import { workflow as zhWorkflow } from "@/i18n/resources/zh-Hans/workflow";

export const defaultNamespace = "common";

export const resources = {
  en: {
    common: enCommon,
    homepage: enHomepage,
    workflow: enWorkflow,
    metadata: enMetadata,
    seo: enSeo,
  },
  "zh-Hans": {
    common: zhCommon,
    homepage: zhHomepage,
    workflow: zhWorkflow,
    metadata: zhMetadata,
    seo: zhSeo,
  },
} as const;

export type AppResources = (typeof resources)["en"];
