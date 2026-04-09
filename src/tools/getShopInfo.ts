import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetShopInfoInputSchema = z.object({});

let shopifyClient: GraphQLClient;

export const getShopInfo: ShopifyTool = {
  name: "get-shop-info",
  description:
    "Get general information about the Shopify store: name, plan, primary currency, timezone, tax settings, weight unit, and contact details. Useful as context before building reports or configuring tools.",
  schema: GetShopInfoInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (_input) => {
    try {
      const query = gql`
        #graphql
        query GetShopInfo {
          shop {
            id
            name
            email
            contactEmail
            myshopifyDomain
            primaryDomain {
              url
              host
            }
            plan {
              displayName
              partnerDevelopment
              shopifyPlus
            }
            currencyCode
            currencyFormats {
              moneyFormat
              moneyWithCurrencyFormat
            }
            ianaTimezone
            timezoneOffset
            timezoneAbbreviation
            taxesIncluded
            taxShipping
            weightUnit
            unitSystem
            createdAt
            enabledPresentmentCurrencies
          }
        }
      `;

      const data = (await shopifyClient.request(query)) as { shop: any };

      const s = data.shop;

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        contactEmail: s.contactEmail,
        domain: s.myshopifyDomain,
        primaryDomain: s.primaryDomain,
        plan: s.plan,
        currency: s.currencyCode,
        enabledCurrencies: s.enabledPresentmentCurrencies,
        currencyFormats: s.currencyFormats,
        timezone: s.ianaTimezone,
        timezoneOffset: s.timezoneOffset,
        timezoneAbbreviation: s.timezoneAbbreviation,
        taxesIncluded: s.taxesIncluded,
        taxShipping: s.taxShipping,
        weightUnit: s.weightUnit,
        unitSystem: s.unitSystem,
        createdAt: s.createdAt,
      };
    } catch (error) {
      handleToolError("get shop info", error);
    }
  },
};
