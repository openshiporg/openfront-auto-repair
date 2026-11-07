"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core13 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/access.ts
var permissionNames = [
  // NKS and fleet-mandatory
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManagePayments",
  "canIssueRefunds",
  "canReadAudit",
  // Organisation
  "canManageOrganization",
  "canManageShops",
  "canManageIntegrations",
  "canAccessAllShops",
  // Policy
  "canManagePolicies",
  "canPublishPolicies",
  // Customers
  "canManageCustomers",
  "canApproveMerge",
  "canReadCustomerPII",
  // Scheduling
  "canManageSchedule",
  // Repair orders
  "canWriteRepairOrders",
  "canSendEstimates",
  "canRecordAuthorizations",
  "canApproveReopen",
  "canApproveRelease",
  "canReadRepairOrders",
  // Inspections and diagnosis
  "canPerformInspections",
  "canDiagnose",
  "canOverrideTrustGate",
  // Pricing
  "canPriceJobs",
  "canApprovePriceOverride",
  "canApproveDiscount",
  "canSeeCost",
  // Parts
  "canManageParts",
  "canOrderParts",
  "canReceiveParts",
  "canApproveSupplierInvoice",
  "canApproveStockAdjustment",
  "canApproveCoreWriteOff",
  // Labor
  "canClockSelf",
  "canManageTime",
  "canApproveTime",
  "canClosePayPeriod",
  "canReadTechPay",
  // Money
  "canFinalizeInvoices",
  "canTakePayments",
  "canCloseDay",
  "canApproveRefund",
  "canApproveWriteOff",
  "canApproveCredit",
  "canApproveCreditMemo",
  "canReadFinancials",
  // Warranty
  "canManageComebacks",
  "canApproveGoodwill",
  // Communications
  "canMessageCustomers",
  "canManageCampaigns",
  // Tires
  "canManageTireRegistrations",
  // Agents
  "canManageAgents",
  "canConfirmProposals",
  "canApproveAgentAutonomy",
  // Reporting
  "canReadReports",
  // Raw status override. Never seeded on a default role; every use is audited.
  "canBreakGlass"
];
var approvalPermissions = permissionNames.filter((name) => name.startsWith("canApprove") || name === "canPublishPolicies" || name === "canBreakGlass");
var isSignedIn = ({ session }) => {
  if (!session) return false;
  const expires = session.data?.accessExpiresAt;
  return !expires || Date.parse(expires) > Date.now();
};
var hasPermission = (session, permission) => isSignedIn({ session }) && session?.data.role?.[permission] === true;
var permissions = Object.fromEntries(
  permissionNames.map((name) => [name, ({ session }) => hasPermission(session, name)])
);
var anyOf = (...names) => ({ session }) => names.some((name) => hasPermission(session, name));
var sys = () => false;
function sessionShopIds(session) {
  if (!isSignedIn({ session })) return [];
  if (session.data.role?.canAccessAllShops) return "all";
  return (session.data.memberships ?? []).filter((m) => m.status === "active" && m.shop?.id).map((m) => m.shop.id);
}
var rules = {
  canReadPeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canSeeOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } },
  canUpdatePeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canEditOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } }
};

// features/keystone/models/User.ts
var User = (0, import_core.list)({
  access: {
    operation: {
      ...(0, import_access.allOperations)(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
          return true;
        }
        return permissions.canManagePeople(args);
      },
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "title", "role", "kind"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields2.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    kind: (0, import_fields2.select)({
      type: "enum",
      options: ["staff", "customer_portal", "fleet_portal", "auditor", "machine"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      defaultValue: "staff",
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople }
    }),
    title: (0, import_fields2.text)(),
    memberships: (0, import_fields2.relationship)({ ref: "ShopMembership.user", many: true, access: { create: permissions.canManagePeople, update: permissions.canManagePeople } }),
    mfaEnrolled: (0, import_fields2.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    accessExpiresAt: (0, import_fields2.timestamp)({
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { description: "Time-boxed access for auditors and guests." }
    }),
    onboardingStatus: (0, import_fields2.select)({
      options: ["not_started", "in_progress", "completed", "dismissed"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      defaultValue: "not_started"
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    description: (0, import_fields3.text)({ ui: { displayMode: "textarea" } }),
    ...Object.fromEntries(permissionNames.map((name) => [name, (0, import_fields3.checkbox)({ defaultValue: false })])),
    ...trackingFields,
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    })
  }
});

// features/keystone/models/OAuthApp.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields4.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields4.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields4.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields4.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields4.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields4.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields4.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields4.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields4.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields4.text)(),
    privacyPolicyUrl: (0, import_fields4.text)(),
    termsOfServiceUrl: (0, import_fields4.text)(),
    supportUrl: (0, import_fields4.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core5 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields5.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields5.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields5.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields5.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields5.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields5.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields5.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields5.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields5.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields5.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields5.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields5.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/platform.ts
var platform_exports = {};
__export(platform_exports, {
  AgentIdentity: () => AgentIdentity,
  ApprovalDecision: () => ApprovalDecision,
  ApprovalPolicy: () => ApprovalPolicy,
  ApprovalRequest: () => ApprovalRequest,
  AuditEvent: () => AuditEvent,
  Bay: () => Bay,
  CommandReceipt: () => CommandReceipt,
  Document: () => Document,
  Lease: () => Lease,
  MachineCredential: () => MachineCredential,
  Notification: () => Notification,
  Obligation: () => Obligation,
  OrganizationSettings: () => OrganizationSettings,
  OutboxEvent: () => OutboxEvent,
  SecretBox: () => SecretBox,
  Sequence: () => Sequence,
  Shop: () => Shop,
  ShopCalendar: () => ShopCalendar,
  ShopCalendarException: () => ShopCalendarException,
  ShopMembership: () => ShopMembership,
  WorkerSchedule: () => WorkerSchedule
});
var import_core7 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/models/domainFields.ts
var import_fields6 = require("@keystone-6/core/fields");
var minor = (options = {}) => (0, import_fields6.bigInt)({
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0 },
  ...options.description ? { ui: { description: options.description } } : {}
});
var exact = (precision, scale) => (options = {}) => (0, import_fields6.decimal)({
  precision,
  scale,
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0 },
  ...options.description ? { ui: { description: options.description } } : {}
});
var pct = exact(12, 6);
var fac = exact(12, 6);
var conf = exact(5, 4);
var wholeNumber = (description) => (options = {}) => (0, import_fields6.integer)({
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0, ...options.min !== void 0 ? { min: options.min } : {} },
  ui: { description }
});
var centiHours = wholeNumber("Hundredths of an hour (125 = 1.25 h).");
var milli = wholeNumber("Thousandths of the unit (5700 = 5.7).");
var option = (value) => ({ label: value.replaceAll("_", " ").replaceAll(".", " \xB7 "), value });
var lifecycle = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  defaultValue: initial,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var choice = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  ...initial !== null ? { defaultValue: initial } : {},
  validation: { isRequired: initial !== null }
});
var versionField = () => (0, import_fields6.integer)({
  defaultValue: 0,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var systemText = (options = {}) => (0, import_fields6.text)({
  ...options.indexed ? { isIndexed: options.indexed } : {},
  validation: { isRequired: options.required ?? false },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var readOnly = { access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } } };
var fixedChoice = (values) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});

// features/keystone/models/listAccess.ts
var rule = (permission) => permission === "signedIn" ? isSignedIn : Array.isArray(permission) ? anyOf(...permission) : permissions[permission];
var governed = (read) => ({
  operation: { query: rule(read), create: sys, update: sys, delete: sys }
});
var managed = (read, write) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: sys }
});
var immutable = governed;
var serverOnly = {
  operation: { query: sys, create: sys, update: sys, delete: sys }
};
function shopFilter(path = "shop") {
  return ({ session }) => {
    const ids = sessionShopIds(session);
    if (ids === "all") return true;
    const leaf = { id: { in: ids } };
    return path.split(".").reverse().reduce((inner, key) => ({ [key]: inner }), leaf);
  };
}
function shopScoped(spec, path = "shop") {
  const filter = shopFilter(path);
  return { ...spec, filter: { query: filter, update: filter, delete: filter } };
}

// features/keystone/lib/audit.ts
var import_node_crypto3 = require("node:crypto");

// features/keystone/lib/canonical.ts
var import_node_crypto2 = require("node:crypto");

// features/keystone/lib/decimal.ts
var import_decimal = __toESM(require("decimal.js"));
var Decimal = import_decimal.default.clone({
  precision: 60,
  rounding: import_decimal.default.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 60
});
var Scale = { pct: 6, fac: 6, conf: 4 };
var DECIMAL_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
function dec(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "bigint") return new Decimal(value.toString());
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`Refusing float ${value}: pass the exact decimal as a string`);
    return new Decimal(value);
  }
  const text11 = String(value).trim();
  if (!DECIMAL_TEXT.test(text11)) throw new Error(`Not a decimal number: ${JSON.stringify(text11).slice(0, 40)}`);
  return new Decimal(text11);
}
function toScale(value, scale, rounding = Decimal.ROUND_HALF_EVEN) {
  const places = typeof scale === "number" ? scale : Scale[scale];
  return dec(value).toDecimalPlaces(places, rounding).toFixed(places);
}
var plain = (value) => dec(value).toFixed();
var ZERO = new Decimal(0);
var ONE = new Decimal(1);
var BPS = new Decimal(1e4);

// features/keystone/lib/canonical.ts
function canonicalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot hold a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const decimalLike = value;
    if (typeof decimalLike.isFinite === "function" && typeof decimalLike.isNaN === "function") return plain(decimalLike.toString());
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  throw new Error(`Canonical JSON cannot hold a ${typeof value}`);
}
var canonicalJson = (value) => JSON.stringify(canonicalize(value));
var sha256 = (text11) => (0, import_node_crypto2.createHash)("sha256").update(text11).digest("hex");
var payloadHash = (value) => sha256(canonicalJson(value));
var toJsonValue = (value) => canonicalize(value);

// features/keystone/lib/db.ts
async function advisoryLock(tx, key) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
var MODEL_NAME = /^[A-Z][A-Za-z0-9]*$/;
function tableName(model) {
  if (!MODEL_NAME.test(model)) throw new Error(`Invalid model name: ${model.slice(0, 40)}`);
  return `"${model}"`;
}
function delegateOf(tx, model) {
  tableName(model);
  const delegate2 = tx[model[0].toLowerCase() + model.slice(1)];
  if (!delegate2) throw new Error(`Unknown model: ${model}`);
  return delegate2;
}
var TRANSACTION_OPTIONS = { maxWait: 15e3, timeout: 6e4 };

// features/keystone/lib/audit.ts
var GENESIS_HASH = "0".repeat(64);
function auditHashBody(row) {
  return {
    seq: row.seq,
    eventKey: row.eventKey,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId ?? null,
    actorAgentId: row.actorAgentId ?? null,
    approverId: row.approverId ?? null,
    reason: row.reason || null,
    before: row.before ?? null,
    after: row.after ?? null,
    metadata: row.metadata ?? null,
    requestId: row.requestId || null,
    at: row.at.toISOString()
  };
}
var auditHash = (prevHash, row) => sha256(`${prevHash}
${canonicalJson(auditHashBody(row))}`);
async function appendAuditEvents(tx, events, now = /* @__PURE__ */ new Date()) {
  if (!events.length) return [];
  await advisoryLock(tx, "audit:chain");
  const last = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  let seq = last?.seq ?? 0;
  let prevHash = last?.hash ?? GENESIS_HASH;
  const written = [];
  const rows = [];
  for (const event of events) {
    seq += 1;
    const row = {
      seq,
      eventKey: event.eventKey ?? (0, import_node_crypto3.randomUUID)(),
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId ?? null,
      actorAgentId: event.actorAgentId ?? null,
      approverId: event.approverId ?? null,
      reason: event.reason ? event.reason.slice(0, 2e3) : null,
      before: event.before === void 0 ? null : toJsonValue(event.before),
      after: event.after === void 0 ? null : toJsonValue(event.after),
      metadata: event.metadata === void 0 ? null : toJsonValue(event.metadata),
      requestId: event.requestId ?? null,
      prevHash,
      at: now
    };
    const hash = auditHash(prevHash, row);
    const id = (0, import_node_crypto3.randomUUID)();
    rows.push({
      id,
      seq: row.seq,
      eventKey: row.eventKey,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      actorAgentId: row.actorAgentId,
      approverId: row.approverId,
      reason: row.reason ?? "",
      // Nullable json columns: omit null (stored as SQL NULL, read back as null).
      ...row.before === null ? {} : { before: row.before },
      ...row.after === null ? {} : { after: row.after },
      ...row.metadata === null ? {} : { metadata: row.metadata },
      requestId: row.requestId ?? "",
      prevHash,
      hash,
      at: row.at
    });
    written.push({ id, seq, hash });
    prevHash = hash;
  }
  for (let i = 0; i < rows.length; i += 200) await tx.auditEvent.createMany({ data: rows.slice(i, i + 200) });
  return written;
}
async function verifyAuditChain(db, batchSize = 1e3) {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  let count = 0;
  for (; ; ) {
    const rows = await db.auditEvent.findMany({ where: { seq: { gte: expectedSeq } }, orderBy: { seq: "asc" }, take: batchSize });
    if (!rows.length) break;
    for (const row of rows) {
      if (row.seq !== expectedSeq) return { ok: false, count, lastSeq: expectedSeq - 1, lastHash: prevHash, brokenAtSeq: expectedSeq, problem: "missing event" };
      if (row.prevHash !== prevHash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "previous hash does not match" };
      const hash = auditHash(prevHash, {
        ...row,
        reason: row.reason || null,
        requestId: row.requestId || null,
        actorUserId: row.actorUserId ?? null,
        actorAgentId: row.actorAgentId ?? null,
        approverId: row.approverId ?? null
      });
      if (hash !== row.hash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "content does not match its hash" };
      prevHash = row.hash;
      expectedSeq += 1;
      count += 1;
    }
  }
  return { ok: true, count, lastSeq: expectedSeq - 1, lastHash: prevHash };
}

// features/keystone/models/auditHooks.ts
function auditedHooks(entityType) {
  return {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      const after = operation === "delete" ? null : item;
      const before = operation === "create" ? null : originalItem;
      const id = String((item ?? originalItem)?.id ?? "");
      if (!id) return;
      const prisma = context.sudo().prisma;
      await prisma.$transaction(
        (tx) => appendAuditEvents(tx, [{
          eventType: `${entityType}.${operation}d`.replace("deleted", "deleted").replace("updated", "updated"),
          entityType,
          entityId: id,
          actorUserId: context.session?.itemId ?? null,
          before,
          after,
          metadata: { via: "admin_api" }
        }]),
        TRANSACTION_OPTIONS
      );
    }
  };
}

// features/keystone/models/platform.ts
var OrganizationSettings = (0, import_core7.list)({
  isSingleton: true,
  graphql: { plural: "OrganizationSettingsItems" },
  access: { operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManageOrganization, delete: () => false } },
  hooks: auditedHooks("OrganizationSettings"),
  fields: {
    legalName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Auto Repair" }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Auto Repair" }),
    currencyCode: (0, import_fields7.text)({ defaultValue: "USD", validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/, explanation: "ISO 4217 currency code" } }, ...readOnly }),
    defaultTimeZone: (0, import_fields7.text)({ defaultValue: "America/Los_Angeles", validation: { isRequired: true } }),
    customerSharing: (0, import_fields7.select)({ type: "string", options: ["shared_all_shops", "per_shop"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "shared_all_shops", validation: { isRequired: true }, ...readOnly, ui: { ...readOnly.ui, description: "Cross-shop visibility of customers. Changed through maker-checker." } }),
    retentionYearsOverride: (0, import_fields7.integer)({ ...readOnly, validation: { min: 1, max: 30 }, ui: { ...readOnly.ui, description: "Used when longer than the jurisdiction rule (CA: 4 years). Changed through maker-checker." } }),
    strictAgentOwnerSoD: (0, import_fields7.checkbox)({ ...readOnly, defaultValue: true, ui: { ...readOnly.ui, description: "An agent's owner can't approve what the agent proposed." } }),
    version: versionField(),
    ...trackingFields
  }
});
var shopRowFilter = ({ session }) => {
  const ids = sessionShopIds(session);
  return ids === "all" ? true : { id: { in: ids } };
};
var Shop = (0, import_core7.list)({
  access: {
    operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManageShops, delete: () => false },
    filter: { query: shopRowFilter, update: shopRowFilter }
  },
  hooks: auditedHooks("Shop"),
  ui: { labelField: "name", listView: { initialColumns: ["code", "name", "city", "region", "status"] } },
  fields: {
    code: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z]{2,5}$/, explanation: "2 to 5 capital letters, e.g. NGA" } } }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    legalName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    addressLine1: (0, import_fields7.text)(),
    addressLine2: (0, import_fields7.text)(),
    city: (0, import_fields7.text)(),
    region: (0, import_fields7.text)({ ui: { description: "US state code (CA). Suggests the jurisdiction pack." }, validation: { match: { regex: /^([A-Z]{2})?$/, explanation: "Two-letter state code" } } }),
    postalCode: (0, import_fields7.text)(),
    country: (0, import_fields7.text)({ defaultValue: "US" }),
    phone: (0, import_fields7.text)(),
    email: (0, import_fields7.text)(),
    website: (0, import_fields7.text)(),
    timeZone: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "America/Los_Angeles" }),
    registrations: (0, import_fields7.json)({ defaultValue: {}, ui: { description: "{ barArd, epaId, sellerPermit, tireFeeAccount, batteryFeeAccount, other[] }: printed on estimates and invoices." } }),
    calendar: (0, import_fields7.relationship)({ ref: "ShopCalendar.shop" }),
    // The policy in force (SCHEMA §1.2). Set by publishPolicyVersion only; repair orders pin these at open.
    jurisdictionPack: (0, import_fields7.relationship)({ ref: "JurisdictionPack", ...readOnly, ui: { ...readOnly.ui, description: "The state rules this shop follows. Publishing a new version of the pack updates the version below." } }),
    jurisdictionPolicy: (0, import_fields7.relationship)({ ref: "JurisdictionPolicyVersion", ...readOnly }),
    shopPolicy: (0, import_fields7.relationship)({ ref: "ShopPolicyVersion", ...readOnly }),
    laborRateClassSet: (0, import_fields7.relationship)({ ref: "LaborRateClassSetVersion", ...readOnly }),
    laborMatrix: (0, import_fields7.relationship)({ ref: "LaborMatrixVersion", ...readOnly }),
    partsMatrix: (0, import_fields7.relationship)({ ref: "PartsMatrixVersion", ...readOnly }),
    feePolicy: (0, import_fields7.relationship)({ ref: "FeePolicyVersion", ...readOnly }),
    taxRuleSet: (0, import_fields7.relationship)({ ref: "TaxRuleSetVersion", ...readOnly }),
    warrantyTermSet: (0, import_fields7.relationship)({ ref: "WarrantyTermSetVersion", ...readOnly }),
    bays: (0, import_fields7.relationship)({ ref: "Bay.shop", many: true }),
    memberships: (0, import_fields7.relationship)({ ref: "ShopMembership.shop", many: true, ...readOnly }),
    publicProfile: (0, import_fields7.json)({ defaultValue: {}, ui: { description: "Read by the public API only (tagline, about, hours text, amenities)." } }),
    isPublished: (0, import_fields7.checkbox)({ defaultValue: false }),
    status: lifecycle(["active", "suspended", "closed"]),
    version: versionField(),
    ...trackingFields
  }
});
var ShopMembership = (0, import_core7.list)({
  access: shopScoped(managed("canAccessDashboard", "canManagePeople")),
  hooks: auditedHooks("ShopMembership"),
  ui: { listView: { initialColumns: ["user", "shop", "role", "isDefault", "status"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.memberships" }),
    shop: (0, import_fields7.relationship)({ ref: "Shop.memberships" }),
    role: (0, import_fields7.relationship)({ ref: "Role", ui: { description: "Optional per-shop role. The user role applies when empty." } }),
    isDefault: (0, import_fields7.checkbox)({ defaultValue: false }),
    status: lifecycle(["active", "suspended", "ended"]),
    startedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" } }),
    endedAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var ShopCalendar = (0, import_core7.list)({
  access: shopScoped(managed("signedIn", "canManageShops")),
  hooks: auditedHooks("ShopCalendar"),
  ui: { labelField: "name" },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop.calendar" }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    weeklyHours: (0, import_fields7.json)({ defaultValue: [], ui: { description: '[{ dow: 0-6 (Sunday 0), open: "07:30", close: "18:00" }] in the shop time zone.' } }),
    exceptions: (0, import_fields7.relationship)({ ref: "ShopCalendarException.calendar", many: true }),
    coverageThrough: (0, import_fields7.calendarDay)({ ui: { description: "Booking past this date is refused until the closures are reviewed." } }),
    ...trackingFields
  }
});
var ShopCalendarException = (0, import_core7.list)({
  access: shopScoped(managed("signedIn", "canManageShops"), "calendar.shop"),
  hooks: auditedHooks("ShopCalendarException"),
  ui: { labelField: "date", listView: { initialColumns: ["calendar", "date", "closed", "open", "close", "reason"] } },
  fields: {
    calendar: (0, import_fields7.relationship)({ ref: "ShopCalendar.exceptions" }),
    date: (0, import_fields7.calendarDay)({ validation: { isRequired: true } }),
    closed: (0, import_fields7.checkbox)({ defaultValue: true }),
    open: (0, import_fields7.text)({ ui: { description: "HH:mm when open with special hours" } }),
    close: (0, import_fields7.text)(),
    reason: (0, import_fields7.text)(),
    ...trackingFields
  }
});
var Bay = (0, import_core7.list)({
  access: shopScoped(managed("signedIn", "canManageShops")),
  hooks: auditedHooks("Bay"),
  ui: { labelField: "code", listView: { initialColumns: ["shop", "code", "name", "kind", "active"] } },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop.bays" }),
    code: (0, import_fields7.text)({ validation: { isRequired: true } }),
    name: (0, import_fields7.text)(),
    kind: choice(["general", "alignment", "lift_heavy", "quick_lube", "tire", "inspection"], "general"),
    active: (0, import_fields7.checkbox)({ defaultValue: true }),
    ...trackingFields
  }
});
var MachineCredential = (0, import_core7.list)({
  access: governed("canManageAgents"),
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    hashedSecret: (0, import_fields7.text)({ access: { read: () => false, create: () => false, update: () => false }, ui: { itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" }, createView: { fieldMode: "hidden" } } }),
    scopes: (0, import_fields7.json)({ ...readOnly, defaultValue: [] }),
    agent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly, ui: { ...readOnly.ui, description: "Empty = all shops." } }),
    lastUsedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    revokedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var AgentIdentity = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    kind: (0, import_fields7.select)({ type: "string", options: ["llm_agent", "voice_agent", "rules_engine", "external_mcp_client"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "llm_agent", validation: { isRequired: true }, ...readOnly }),
    modelRef: systemText(),
    owner: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    shops: (0, import_fields7.relationship)({ ref: "Shop", many: true, ...readOnly }),
    paused: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Kill switch: a paused agent can read nothing and propose nothing." } }),
    status: lifecycle(["active", "paused", "retired"]),
    oauthApp: (0, import_fields7.relationship)({ ref: "OAuthApp", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AuditEvent = (0, import_core7.list)({
  access: immutable("canReadAudit"),
  ui: { labelField: "eventType", listView: { initialColumns: ["seq", "at", "eventType", "entityType", "entityId", "actorUser"], initialSort: { field: "seq", direction: "DESC" } } },
  fields: {
    seq: (0, import_fields7.integer)({ isIndexed: "unique", validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: "unique", required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    actorAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    approver: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    reason: systemText(),
    before: (0, import_fields7.json)({ ...readOnly }),
    after: (0, import_fields7.json)({ ...readOnly }),
    metadata: (0, import_fields7.json)({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: "unique", required: true }),
    at: (0, import_fields7.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, ...readOnly })
  }
});
var CommandReceipt = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    command: (0, import_fields7.text)({ validation: { isRequired: true } }),
    principalKey: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestHash: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields7.json)(),
    responseCode: (0, import_fields7.text)(),
    responseBody: (0, import_fields7.json)(),
    recoveryPoint: (0, import_fields7.text)({ defaultValue: "completed" }),
    completedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" } }),
    ...trackingFields
  }
});
var OutboxEvent = (0, import_core7.list)({
  access: governed("canReadAudit"),
  ui: { listView: { initialColumns: ["topic", "status", "attempts", "nextAttemptAt", "aggregateType", "aggregateId"] } },
  fields: {
    topic: systemText({ indexed: true, required: true }),
    aggregateType: systemText({ required: true }),
    aggregateId: systemText({ indexed: true, required: true }),
    dedupeKey: systemText({ indexed: "unique", required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    status: lifecycle(["pending", "leased", "delivered", "failed", "dead"]),
    attempts: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    nextAttemptAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    leaseOwner: systemText(),
    leaseExpiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    lastError: systemText(),
    deliveredAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var Lease = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    owner: (0, import_fields7.text)({ validation: { isRequired: true } }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    expiresAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});
var WorkerSchedule = (0, import_core7.list)({
  access: governed("canReadAudit"),
  fields: {
    kind: systemText({ indexed: "unique", required: true }),
    intervalSeconds: (0, import_fields7.integer)({ ...readOnly }),
    nextRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    lastRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["idle", "running", "failed", "disabled"], "idle"),
    leaseKey: systemText(),
    lastError: systemText(),
    ...trackingFields
  }
});
var Sequence = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    nextValue: (0, import_fields7.integer)({ defaultValue: 1, validation: { isRequired: true } })
  }
});
var Notification = (0, import_core7.list)({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: permissions.canAccessDashboard, delete: () => false },
    filter: {
      query: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false,
      update: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false
    }
  },
  fields: {
    recipient: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    channel: choice(["in_app", "email"], "in_app"),
    template: systemText({ required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    status: lifecycle(["pending", "sent", "failed"]),
    sentAt: (0, import_fields7.timestamp)({ ...readOnly }),
    readAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var DOCUMENT_KINDS = [
  "inspection_photo",
  "inspection_video",
  "signature",
  "work_order",
  "invoice_pdf",
  "estimate_pdf",
  "call_recording",
  "transcript",
  "exemption_certificate",
  "supplier_invoice",
  "packing_slip",
  "third_party_estimate",
  "import_file",
  "export_file",
  "other"
];
var Document = (0, import_core7.list)({
  access: shopScoped(governed("canAccessDashboard")),
  ui: { labelField: "title" },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly }),
    title: systemText({ required: true }),
    kind: (0, import_fields7.select)({ type: "string", options: DOCUMENT_KINDS.map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "other", validation: { isRequired: true }, ...readOnly }),
    visibility: (0, import_fields7.select)({ type: "string", options: ["staff", "customer_link", "public"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "staff", validation: { isRequired: true }, ...readOnly }),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    bytes: (0, import_fields7.integer)({ ...readOnly }),
    documentVersion: (0, import_fields7.integer)({ defaultValue: 1, ...readOnly }),
    supersedes: (0, import_fields7.relationship)({ ref: "Document", ...readOnly }),
    retentionUntil: (0, import_fields7.calendarDay)({ ...readOnly }),
    ...trackingFields
  }
});
var Obligation = (0, import_core7.list)({
  access: shopScoped(governed("canAccessDashboard")),
  ui: { labelField: "kind", listView: { initialColumns: ["shop", "kind", "subjectType", "dueAt", "status"] } },
  fields: {
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly }),
    kind: (0, import_fields7.select)({
      type: "string",
      options: ["tire_registration", "teardown_reassembly", "core_return", "invoice_due", "exemption_expiry", "credential_expiry", "reauthorization_wait", "retention_purge"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      validation: { isRequired: true },
      ...readOnly
    }),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    dueAt: (0, import_fields7.timestamp)({ validation: { isRequired: true }, ...readOnly }),
    owner: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    ownerRole: systemText(),
    status: lifecycle(["open", "met", "waived", "breached"]),
    evidence: (0, import_fields7.json)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApprovalPolicy = (0, import_core7.list)({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageOrganization, update: () => false, delete: () => false } },
  ui: { labelField: "action" },
  fields: {
    action: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    description: (0, import_fields7.text)(),
    requiredPermission: (0, import_fields7.text)({ validation: { isRequired: true } }),
    minApprovals: (0, import_fields7.integer)({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: (0, import_fields7.integer)({ defaultValue: 1440 }),
    ...trackingFields
  }
});
var ApprovalRequest = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "action", listView: { initialColumns: ["action", "status", "targetList", "requestedBy", "createdAt", "expiresAt"] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    shop: (0, import_fields7.relationship)({ ref: "Shop", ...readOnly }),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    amountMinor: minor(),
    payload: (0, import_fields7.json)({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    requestedByAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    status: lifecycle(["pending", "approved", "rejected", "expired", "cancelled"]),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    consumedAt: (0, import_fields7.timestamp)({ ...readOnly, ui: { ...readOnly.ui, description: "When the approved action was carried out. An approval is used once." } }),
    decisions: (0, import_fields7.relationship)({ ref: "ApprovalDecision.request", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApprovalDecision = (0, import_core7.list)({
  access: immutable("canAccessDashboard"),
  fields: {
    request: (0, import_fields7.relationship)({ ref: "ApprovalRequest.decisions", ...readOnly }),
    decidedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    decision: (0, import_fields7.select)({ type: "string", options: ["approve", "reject"].map((value) => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly })
  }
});
var SecretBox = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    ciphertext: (0, import_fields7.text)({ validation: { isRequired: true } }),
    iv: (0, import_fields7.text)({ validation: { isRequired: true } }),
    authTag: (0, import_fields7.text)({ validation: { isRequired: true } }),
    keyVersion: (0, import_fields7.integer)({ defaultValue: 1 }),
    rotatedAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/policy.ts
var policy_exports = {};
__export(policy_exports, {
  FeePolicyVersion: () => FeePolicyVersion,
  FeeRule: () => FeeRule,
  JurisdictionPack: () => JurisdictionPack,
  JurisdictionPolicyVersion: () => JurisdictionPolicyVersion,
  LaborMatrixVersion: () => LaborMatrixVersion,
  LaborRateClass: () => LaborRateClass,
  LaborRateClassSetVersion: () => LaborRateClassSetVersion,
  PartsMatrixVersion: () => PartsMatrixVersion,
  ShopPolicyVersion: () => ShopPolicyVersion,
  TaxCategory: () => TaxCategory,
  TaxRule: () => TaxRule,
  TaxRuleSetVersion: () => TaxRuleSetVersion,
  WarrantyTerm: () => WarrantyTerm,
  WarrantyTermSetVersion: () => WarrantyTermSetVersion
});
var import_core8 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var sys2 = () => false;
var draftOnly = () => ({ status: { equals: "draft" } });
var versionAccess = (read = isSignedIn) => ({
  operation: { query: read, create: sys2, update: permissions.canManagePolicies, delete: sys2 },
  filter: { update: draftOnly }
});
var childAccess = (parent, read = isSignedIn) => ({
  operation: { query: read, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: permissions.canManagePolicies },
  filter: { update: () => ({ [parent]: { status: { equals: "draft" } } }), delete: () => ({ [parent]: { status: { equals: "draft" } } }) }
});
var childOfDraft = (entityType, parent, parentList) => ({
  ...auditedHooks(entityType),
  validateInput: async ({ operation, resolvedData, item, context, addValidationError }) => {
    if (operation !== "create" && operation !== "update") return;
    const parentId = resolvedData?.[parent]?.connect?.id ?? item?.[`${parent}Id`];
    if (!parentId) return addValidationError(`Choose the ${parent} this belongs to.`);
    const delegate2 = context.sudo().prisma[parentList[0].toLowerCase() + parentList.slice(1)];
    const row = await delegate2.findUnique({ where: { id: parentId }, select: { status: true } });
    if (row?.status !== "draft") addValidationError("This version is published. Make a new draft to change it.");
  }
});
var versionFields = () => ({
  versionNumber: (0, import_fields8.integer)({ validation: { isRequired: true }, ...readOnly }),
  status: lifecycle(["draft", "published", "retired"]),
  notes: (0, import_fields8.text)({ ui: { displayMode: "textarea", description: "What changed and why. Shown in the version history." } }),
  basedOnId: (0, import_fields8.text)({ ...readOnly, ui: { ...readOnly.ui, description: "The version this draft was copied from." } }),
  author: (0, import_fields8.relationship)({ ref: "User", ...readOnly }),
  publishedBy: (0, import_fields8.relationship)({ ref: "User", ...readOnly }),
  publishedAt: (0, import_fields8.timestamp)({ ...readOnly }),
  effectiveFrom: (0, import_fields8.timestamp)({ ...readOnly }),
  retiredAt: (0, import_fields8.timestamp)({ ...readOnly }),
  version: versionField(),
  ...trackingFields
});
var shopOf = () => (0, import_fields8.relationship)({ ref: "Shop", ...readOnly });
var versionUi = (extra = []) => ({ labelField: "versionNumber", listView: { initialColumns: ["versionNumber", ...extra, "status", "publishedAt", "author"] } });
var JurisdictionPack = (0, import_core8.list)({
  access: { operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManagePolicies, delete: sys2 } },
  hooks: auditedHooks("JurisdictionPack"),
  ui: { labelField: "name", listView: { initialColumns: ["code", "name", "verified"] } },
  fields: {
    code: (0, import_fields8.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z]{2}-[A-Z0-9]{1,3}$/, explanation: "Country and region, e.g. US-CA" } } }),
    name: (0, import_fields8.text)({ validation: { isRequired: true } }),
    country: (0, import_fields8.text)({ defaultValue: "US" }),
    region: (0, import_fields8.text)(),
    verified: (0, import_fields8.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Checked against the statute and regulator guidance. Unverified packs show a warning everywhere they are used." } }),
    sourceRefs: (0, import_fields8.json)({ defaultValue: [], ui: { description: "[{ title, url, note }] citations." } }),
    versions: (0, import_fields8.relationship)({ ref: "JurisdictionPolicyVersion.pack", many: true, ...readOnly }),
    ...trackingFields
  }
});
var JurisdictionPolicyVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("JurisdictionPolicyVersion"),
  ui: versionUi(["pack"]),
  fields: {
    pack: (0, import_fields8.relationship)({ ref: "JurisdictionPack.versions", ...readOnly }),
    estimateThresholdMinor: minor({ description: "Written estimate needed above this amount. Empty = every job (CA \xA73353)." }),
    writtenEstimateWaiverAllowed: (0, import_fields8.checkbox)({ defaultValue: false }),
    waiverFormText: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    allowedAuthorizationMethods: (0, import_fields8.json)({ defaultValue: [], ui: { description: "in_person_signature, written_form, oral_phone, electronic_link, fleet_portal, fleet_po" } }),
    authorizationEvidenceRules: (0, import_fields8.json)({ defaultValue: {}, ui: { description: "{ method: [required evidence fields] }" } }),
    toleranceRule: (0, import_fields8.json)({ defaultValue: { kind: "fixed", fixedMinor: "0", includesTax: true }, ui: { description: "{ kind: fixed|percent|max_of|min_of, percent, fixedMinor, capMinor, includesTax }: how far a final charge may exceed the authorized amount." } }),
    requireOdometerIn: (0, import_fields8.checkbox)({ defaultValue: true }),
    requireOdometerOut: (0, import_fields8.checkbox)({ defaultValue: true }),
    requireSignedWorkOrder: (0, import_fields8.checkbox)({ defaultValue: true }),
    requirePartCondition: (0, import_fields8.checkbox)({ defaultValue: true }),
    crashPartOemDefault: (0, import_fields8.checkbox)({ defaultValue: true }),
    shopSuppliesGenericAllowed: (0, import_fields8.checkbox)({ defaultValue: false, ui: { description: "A generic shop-supplies percentage fee. CA: not allowed." } }),
    replacedPartsOfferRequired: (0, import_fields8.checkbox)({ defaultValue: true }),
    replacedPartsOfferText: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    nonReturnableNoteText: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    teardownRules: (0, import_fields8.json)({ defaultValue: { required: true, maxReassemblyDaysDefault: 3, disclosureText: "" } }),
    designeeRules: (0, import_fields8.json)({ defaultValue: {} }),
    thirdPartyPayorNoticeText: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    towingSeparateAuthorization: (0, import_fields8.checkbox)({ defaultValue: true }),
    subletDisclosureRequired: (0, import_fields8.checkbox)({ defaultValue: true }),
    invoiceRequiredFields: (0, import_fields8.json)({ defaultValue: [] }),
    recordRetentionYears: (0, import_fields8.integer)({ defaultValue: 4, validation: { isRequired: true, min: 1, max: 30 } }),
    surchargeAllowed: (0, import_fields8.checkbox)({ defaultValue: false }),
    requiredNotices: (0, import_fields8.json)({ defaultValue: [], ui: { description: "[{ key, text, where: estimate|invoice|work_order }]" } }),
    ...versionFields()
  }
});
var TaxCategory = (0, import_core8.list)({
  access: { operation: { query: isSignedIn, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: sys2 } },
  hooks: auditedHooks("TaxCategory"),
  ui: { labelField: "name", listView: { initialColumns: ["code", "name"] } },
  fields: {
    code: (0, import_fields8.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[a-z][a-z0-9_]*$/, explanation: "lower_snake_case" } } }),
    name: (0, import_fields8.text)({ validation: { isRequired: true } }),
    description: (0, import_fields8.text)(),
    ...trackingFields
  }
});
var LaborRateClassSetVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("LaborRateClassSetVersion"),
  ui: versionUi(["shop"]),
  fields: { shop: shopOf(), classes: (0, import_fields8.relationship)({ ref: "LaborRateClass.set", many: true }), ...versionFields() }
});
var LaborRateClass = (0, import_core8.list)({
  access: childAccess("set"),
  hooks: childOfDraft("LaborRateClass", "set", "LaborRateClassSetVersion"),
  ui: { labelField: "name", listView: { initialColumns: ["set", "code", "name", "rateMinor", "isDefault"] } },
  fields: {
    set: (0, import_fields8.relationship)({ ref: "LaborRateClassSetVersion.classes" }),
    code: choice(["general", "diagnostic", "electrical", "european", "fleet", "warranty_internal"], "general"),
    name: (0, import_fields8.text)({ validation: { isRequired: true } }),
    rateMinor: minor({ required: true, description: "Price per hour in cents." }),
    taxCategory: (0, import_fields8.relationship)({ ref: "TaxCategory" }),
    isDefault: (0, import_fields8.checkbox)({ defaultValue: false }),
    ...trackingFields
  }
});
var LaborMatrixVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("LaborMatrixVersion"),
  ui: versionUi(["shop"]),
  fields: {
    shop: shopOf(),
    bands: (0, import_fields8.json)({ defaultValue: [], ui: { description: "[{ minCentiHours, maxCentiHours, rateMinor? | multiplier? }]" } }),
    appliesToClasses: (0, import_fields8.json)({ defaultValue: [] }),
    ...versionFields()
  }
});
var PartsMatrixVersion = (0, import_core8.list)({
  access: versionAccess(permissions.canSeeCost),
  hooks: auditedHooks("PartsMatrixVersion"),
  ui: versionUi(["shop"]),
  fields: {
    shop: shopOf(),
    tiers: (0, import_fields8.json)({ defaultValue: [], ui: { description: "[{ minCostMinor, maxCostMinor, multiplier }]: cost brackets and their markup multipliers." } }),
    categoryOverrides: (0, import_fields8.json)({ defaultValue: {} }),
    supplierOverrides: (0, import_fields8.json)({ defaultValue: {} }),
    marginFloorPct: pct({ defaultValue: "0.300000", description: "Pricing a part below this gross margin needs a manager (price.override)." }),
    ...versionFields()
  }
});
var FeePolicyVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("FeePolicyVersion"),
  ui: versionUi(["shop"]),
  fields: { shop: shopOf(), rules: (0, import_fields8.relationship)({ ref: "FeeRule.policy", many: true }), ...versionFields() }
});
var FeeRule = (0, import_core8.list)({
  access: childAccess("policy"),
  hooks: childOfDraft("FeeRule", "policy", "FeePolicyVersion"),
  ui: { labelField: "code", listView: { initialColumns: ["policy", "code", "kind", "base", "flatMinor", "perUnitMinor", "percent"] } },
  fields: {
    policy: (0, import_fields8.relationship)({ ref: "FeePolicyVersion.rules" }),
    code: choice(["shop_supplies_pct", "haz_waste", "ca_tire_fee", "ca_battery_fee", "battery_deposit", "env_fee", "diag_fee_credit"], "haz_waste"),
    kind: choice(["percent_of_base", "flat_per_ro", "per_unit"], "flat_per_ro"),
    base: choice(["labor", "parts", "labor_and_parts", "units_of_item_category"], "labor_and_parts"),
    percent: pct(),
    flatMinor: minor(),
    perUnitMinor: minor(),
    minMinor: minor(),
    maxMinor: minor(),
    itemCategory: (0, import_fields8.text)({ ui: { description: "For per-unit fees, e.g. tire_new or battery_lead_acid." } }),
    taxTreatment: choice(["follow_base", "taxable", "non_taxable"], "follow_base"),
    separatelyStated: (0, import_fields8.checkbox)({ defaultValue: true }),
    refundable: (0, import_fields8.checkbox)({ defaultValue: false }),
    refundWindowDays: (0, import_fields8.integer)({ validation: { min: 0 } }),
    invoiceText: (0, import_fields8.text)(),
    ...trackingFields
  }
});
var TaxRuleSetVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("TaxRuleSetVersion"),
  ui: versionUi(["shop"]),
  fields: {
    shop: shopOf(),
    rounding: choice(["per_line", "per_invoice_category"], "per_line"),
    rules: (0, import_fields8.relationship)({ ref: "TaxRule.ruleSet", many: true }),
    ...versionFields()
  }
});
var TaxRule = (0, import_core8.list)({
  access: childAccess("ruleSet"),
  hooks: childOfDraft("TaxRule", "ruleSet", "TaxRuleSetVersion"),
  ui: { labelField: "id", listView: { initialColumns: ["ruleSet", "category", "taxable", "rate"] } },
  fields: {
    ruleSet: (0, import_fields8.relationship)({ ref: "TaxRuleSetVersion.rules" }),
    category: (0, import_fields8.relationship)({ ref: "TaxCategory" }),
    taxable: (0, import_fields8.checkbox)({ defaultValue: true }),
    rate: pct({ defaultValue: "0.000000", description: "Combined state and district rate as a fraction: 0.0875 = 8.75%." }),
    coreChargeRule: choice(["taxable_always", "refund_refunds_tax"], "refund_refunds_tax"),
    warrantyDeductibleRule: choice(["none", "parts_share"], "none"),
    ...trackingFields
  }
});
var WarrantyTermSetVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("WarrantyTermSetVersion"),
  ui: versionUi(["shop"]),
  fields: { shop: shopOf(), terms: (0, import_fields8.relationship)({ ref: "WarrantyTerm.termSet", many: true }), ...versionFields() }
});
var WarrantyTerm = (0, import_core8.list)({
  access: childAccess("termSet"),
  hooks: childOfDraft("WarrantyTerm", "termSet", "WarrantyTermSetVersion"),
  ui: { labelField: "name", listView: { initialColumns: ["termSet", "code", "name", "months", "miles"] } },
  fields: {
    termSet: (0, import_fields8.relationship)({ ref: "WarrantyTermSetVersion.terms" }),
    code: (0, import_fields8.text)({ validation: { isRequired: true, match: { regex: /^[a-z][a-z0-9_]*$/, explanation: "lower_snake_case" } } }),
    name: (0, import_fields8.text)({ validation: { isRequired: true } }),
    months: (0, import_fields8.integer)({ validation: { isRequired: true, min: 0 } }),
    miles: (0, import_fields8.integer)({ validation: { isRequired: true, min: 0 } }),
    appliesTo: (0, import_fields8.json)({ defaultValue: [] }),
    invoiceText: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    ...trackingFields
  }
});
var ShopPolicyVersion = (0, import_core8.list)({
  access: versionAccess(),
  hooks: auditedHooks("ShopPolicyVersion"),
  ui: versionUi(["shop"]),
  fields: {
    shop: shopOf(),
    flagHoursAt: choice(["job_completed", "invoice_finalized"], "job_completed"),
    comebackPayRule: choice(["reverse", "keep"], "reverse"),
    allowConcurrentJobClocks: (0, import_fields8.checkbox)({ defaultValue: false }),
    requireQualityCheck: (0, import_fields8.checkbox)({ defaultValue: true }),
    diagnosisTrustThreshold: conf({ defaultValue: "0.7000", description: "Diagnosis confidence needed before a diagnosis-based job can be quoted (0 to 1)." }),
    authorizationLinkTtlHours: (0, import_fields8.integer)({ defaultValue: 72, validation: { isRequired: true, min: 1, max: 720 } }),
    promisedTimeRequired: (0, import_fields8.checkbox)({ defaultValue: true }),
    noShowGraceMinutes: (0, import_fields8.integer)({ defaultValue: 30, validation: { isRequired: true, min: 0, max: 240 } }),
    discountLimitPctByRole: (0, import_fields8.json)({ defaultValue: { seed_role_advisor: "0.10" } }),
    refundApprovalMinor: minor({ defaultValue: 0n }),
    creditMemoApprovalMinor: minor({ defaultValue: 5000n }),
    agentOrderLimitMinor: minor({ defaultValue: 0n, description: "Agents may not place parts orders above this. 0 = never." }),
    agentAutonomy: (0, import_fields8.json)({ defaultValue: {}, ui: { description: "Changing this needs a second person with canApproveAgentAutonomy to publish." } }),
    proposalConfirmGranularity: choice(["per_step", "per_plan"], "per_step"),
    declinedSafetyFollowUpPurpose: choice(["marketing", "transactional"], "marketing"),
    followUpCadenceDays: (0, import_fields8.json)({ defaultValue: [3, 30, 90] }),
    depositPolicy: (0, import_fields8.json)({ defaultValue: {} }),
    surchargePolicy: (0, import_fields8.json)({ defaultValue: { enabled: false } }),
    inspectionClockMode: choice(["job", "shift"], "job"),
    markupFactorDefault: fac({ defaultValue: "1.000000", description: "Reserved for the parts matrix fallback." }),
    ...versionFields()
  }
});

// features/keystone/models/customers.ts
var customers_exports = {};
__export(customers_exports, {
  BusinessAccount: () => BusinessAccount,
  ContactConsent: () => ContactConsent,
  Customer: () => Customer,
  CustomerContact: () => CustomerContact,
  CustomerMergeEvent: () => CustomerMergeEvent,
  ExternalReference: () => ExternalReference,
  OdometerReading: () => OdometerReading,
  PlateRegistration: () => PlateRegistration,
  RecallCheck: () => RecallCheck,
  Vehicle: () => Vehicle,
  VehicleDecode: () => VehicleDecode,
  VehicleOwnership: () => VehicleOwnership
});
var import_core9 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var import_core10 = require("@keystone-6/core");
var sys3 = () => false;
var readCustomers = anyOf("canReadRepairOrders", "canManageCustomers", "canReadCustomerPII");
var pii = { read: anyOf("canReadCustomerPII"), create: sys3, update: sys3 };
async function customerFilter({ session, context }) {
  const ids = sessionShopIds(session);
  if (ids === "all") return true;
  const org = await context.sudo().prisma.organizationSettings.findUnique({ where: { id: 1 }, select: { customerSharing: true } });
  if (org?.customerSharing !== "per_shop") return true;
  return { OR: [{ homeShop: { id: { in: ids } } }, { homeShop: null }] };
}
var Customer = (0, import_core9.list)({
  access: {
    operation: { query: readCustomers, create: permissions.canManageCustomers, update: permissions.canManageCustomers, delete: sys3 },
    filter: { query: customerFilter, update: customerFilter }
  },
  hooks: auditedHooks("Customer"),
  ui: { labelField: "displayName", listView: { initialColumns: ["displayName", "kind", "homeShop", "status", "createdAt"] } },
  fields: {
    kind: choice(["person", "business"], "person"),
    firstName: (0, import_fields9.text)(),
    lastName: (0, import_fields9.text)({ isIndexed: true }),
    companyName: (0, import_fields9.text)(),
    displayName: (0, import_fields9.text)({ isIndexed: true, ...readOnly, ui: { ...readOnly.ui, description: "Kept in step with the names by the server." } }),
    contacts: (0, import_fields9.relationship)({ ref: "CustomerContact.customer", many: true, ...readOnly }),
    addresses: (0, import_fields9.json)({ defaultValue: [], access: { read: anyOf("canReadCustomerPII"), create: permissions.canManageCustomers, update: permissions.canManageCustomers } }),
    preferredChannel: choice(["sms", "email", "phone"], "sms"),
    preferredLanguage: (0, import_fields9.text)({ defaultValue: "en" }),
    homeShop: (0, import_fields9.relationship)({ ref: "Shop" }),
    businessAccount: (0, import_fields9.relationship)({ ref: "BusinessAccount.customers" }),
    ownerships: (0, import_fields9.relationship)({ ref: "VehicleOwnership.customer", many: true, ...readOnly }),
    appointments: (0, import_fields9.relationship)({ ref: "Appointment.customer", many: true, ...readOnly }),
    tags: (0, import_fields9.json)({ defaultValue: [] }),
    notes: (0, import_fields9.text)({ ui: { displayMode: "textarea", description: "Staff only. Never shown to the customer." } }),
    marketingSource: (0, import_fields9.text)(),
    status: lifecycle(["active", "merged", "archived"]),
    mergedInto: (0, import_fields9.relationship)({ ref: "Customer", ...readOnly }),
    noShowCount: (0, import_fields9.integer)({ defaultValue: 0, ...readOnly }),
    portalUser: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var CustomerContact = (0, import_core9.list)({
  access: governed(["canReadRepairOrders", "canManageCustomers", "canReadCustomerPII"]),
  ui: { labelField: "label", listView: { initialColumns: ["customer", "kind", "label", "isPrimary", "status"] } },
  fields: {
    customer: (0, import_fields9.relationship)({ ref: "Customer.contacts", ...readOnly }),
    kind: fixedChoice(["mobile", "landline", "email"]),
    value: (0, import_fields9.text)({ access: pii, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } } }),
    valueHash: systemText({ indexed: true, required: true }),
    label: systemText(),
    isPrimary: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    verifiedAt: (0, import_fields9.timestamp)({ ...readOnly }),
    status: lifecycle(["active", "bounced", "invalid"]),
    consents: (0, import_fields9.relationship)({ ref: "ContactConsent.contact", many: true, ...readOnly }),
    ...trackingFields
  }
});
var ContactConsent = (0, import_core9.list)({
  access: immutable(["canManageCustomers", "canReadCustomerPII", "canMessageCustomers"]),
  ui: { listView: { initialColumns: ["contact", "channel", "purpose", "action", "method", "at"] } },
  fields: {
    contact: (0, import_fields9.relationship)({ ref: "CustomerContact.consents", ...readOnly }),
    channel: fixedChoice(["sms", "email", "voice"]),
    purpose: fixedChoice(["transactional", "marketing", "all"]),
    action: fixedChoice(["granted", "revoked"]),
    method: fixedChoice(["web_form", "in_person_form", "keyword_reply", "staff_recorded", "import", "classifier_review"]),
    evidence: (0, import_fields9.json)({ ...readOnly }),
    writtenConsent: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    recordedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    at: (0, import_fields9.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, ...readOnly })
  }
});
var CustomerMergeEvent = (0, import_core9.list)({
  access: immutable(["canManageCustomers", "canReadAudit"]),
  fields: {
    survivor: (0, import_fields9.relationship)({ ref: "Customer", ...readOnly }),
    merged: (0, import_fields9.relationship)({ ref: "Customer", ...readOnly }),
    movedCounts: (0, import_fields9.json)({ ...readOnly }),
    reason: systemText(),
    requestedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    approvedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    at: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly })
  }
});
var BusinessAccount = (0, import_core9.list)({
  access: { operation: { query: readCustomers, create: permissions.canManageCustomers, update: permissions.canManageCustomers, delete: sys3 } },
  hooks: auditedHooks("BusinessAccount"),
  ui: { labelField: "name", listView: { initialColumns: ["accountNumber", "name", "termsDays", "poRequired", "status"] } },
  fields: {
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    accountNumber: systemText({ indexed: "unique", required: true }),
    customers: (0, import_fields9.relationship)({ ref: "Customer.businessAccount", many: true }),
    termsDays: (0, import_fields9.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 120 }, ui: { description: "0 = due on receipt; 30 = Net 30." } }),
    creditLimitMinor: minor({ defaultValue: 0n }),
    poRequired: (0, import_fields9.checkbox)({ defaultValue: false }),
    taxExempt: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Set when an active exemption certificate is on file (Phase 6)." } }),
    billingMode: choice(["per_invoice", "statement_monthly"], "per_invoice"),
    holdAfterOverdueDays: (0, import_fields9.integer)({ defaultValue: 30, validation: { min: 1 } }),
    openBalanceMinor: minor({ defaultValue: 0n }),
    intermediary: choice(["none", "fleet_management_company"], "none"),
    intermediaryName: (0, import_fields9.text)(),
    status: lifecycle(["active", "prospect", "credit_hold", "closed"]),
    version: versionField(),
    ...trackingFields
  }
});
var Vehicle = (0, import_core9.list)({
  access: {
    operation: { query: anyOf("canReadRepairOrders", "canManageCustomers"), create: sys3, update: permissions.canManageCustomers, delete: sys3 }
  },
  hooks: auditedHooks("Vehicle"),
  ui: { labelField: "label", listView: { initialColumns: ["label", "vin", "vinValid", "lastOdometer", "status"] } },
  fields: {
    label: (0, import_fields9.virtual)({
      field: import_core10.graphql.field({
        type: import_core10.graphql.String,
        resolve: (item) => [item.year, item.make, item.model, item.trim].filter(Boolean).join(" ") || item.vin || "Vehicle"
      })
    }),
    vin: (0, import_fields9.text)({ isIndexed: true, ...readOnly, ui: { ...readOnly.ui, description: "Changed only through the vehicle command (normalised, check digit verified)." } }),
    vinValid: fixedChoice(["none", "valid", "check_digit_warning", "invalid_format"]),
    noVinReason: systemText(),
    year: (0, import_fields9.integer)({ validation: { min: 1900, max: 2100 } }),
    make: (0, import_fields9.text)(),
    model: (0, import_fields9.text)(),
    trim: (0, import_fields9.text)(),
    engine: (0, import_fields9.text)(),
    drivetrain: (0, import_fields9.text)(),
    transmission: (0, import_fields9.text)(),
    fuelType: (0, import_fields9.text)(),
    bodyClass: (0, import_fields9.text)(),
    color: (0, import_fields9.text)(),
    currentDecode: (0, import_fields9.relationship)({ ref: "VehicleDecode", ...readOnly }),
    decodes: (0, import_fields9.relationship)({ ref: "VehicleDecode.vehicle", many: true, ...readOnly }),
    recallChecks: (0, import_fields9.relationship)({ ref: "RecallCheck.vehicle", many: true, ...readOnly }),
    ownerships: (0, import_fields9.relationship)({ ref: "VehicleOwnership.vehicle", many: true, ...readOnly }),
    plates: (0, import_fields9.relationship)({ ref: "PlateRegistration.vehicle", many: true, ...readOnly }),
    odometerReadings: (0, import_fields9.relationship)({ ref: "OdometerReading.vehicle", many: true, ...readOnly }),
    appointments: (0, import_fields9.relationship)({ ref: "Appointment.vehicle", many: true, ...readOnly }),
    lastOdometer: (0, import_fields9.integer)({ ...readOnly }),
    lastOdometerUnit: choice(["mi", "km"], "mi"),
    tireSpec: (0, import_fields9.json)({ defaultValue: {}, ui: { description: "{ front, rear, staggered, tpms }" } }),
    maintenanceIntervals: (0, import_fields9.json)({ defaultValue: {} }),
    notes: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    status: lifecycle(["active", "sold", "scrapped", "merged"]),
    version: versionField(),
    ...trackingFields
  }
});
var VehicleDecode = (0, import_core9.list)({
  access: immutable(["canReadRepairOrders", "canManageCustomers"]),
  ui: { listView: { initialColumns: ["vehicle", "provider", "requestedVin", "errorCode", "fetchedAt"] } },
  fields: {
    vehicle: (0, import_fields9.relationship)({ ref: "Vehicle.decodes", ...readOnly }),
    provider: fixedChoice(["nhtsa_vpic", "fixture", "labor_guide", "parts_catalog", "manual"]),
    requestedVin: systemText({ indexed: true, required: true }),
    decoded: (0, import_fields9.json)({ ...readOnly }),
    errorCode: systemText(),
    errorText: systemText(),
    fetchedAt: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    fetchedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly })
  }
});
var VehicleOwnership = (0, import_core9.list)({
  access: governed(["canReadRepairOrders", "canManageCustomers"]),
  ui: { listView: { initialColumns: ["vehicle", "customer", "businessAccount", "role", "startedAt", "endedAt"] } },
  fields: {
    vehicle: (0, import_fields9.relationship)({ ref: "Vehicle.ownerships", ...readOnly }),
    customer: (0, import_fields9.relationship)({ ref: "Customer.ownerships", ...readOnly }),
    businessAccount: (0, import_fields9.relationship)({ ref: "BusinessAccount", ...readOnly }),
    role: fixedChoice(["owner", "driver", "lessee"]),
    startedAt: (0, import_fields9.calendarDay)({ ...readOnly }),
    endedAt: (0, import_fields9.calendarDay)({ ...readOnly }),
    ...trackingFields
  }
});
var PlateRegistration = (0, import_core9.list)({
  access: governed(["canReadRepairOrders", "canManageCustomers"]),
  ui: { labelField: "plate", listView: { initialColumns: ["vehicle", "state", "plate", "active", "lastSeenAt"] } },
  fields: {
    vehicle: (0, import_fields9.relationship)({ ref: "Vehicle.plates", ...readOnly }),
    plate: systemText({ required: true }),
    state: systemText({ required: true }),
    firstSeenAt: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    lastSeenAt: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    active: (0, import_fields9.checkbox)({ defaultValue: true, ...readOnly }),
    ...trackingFields
  }
});
var OdometerReading = (0, import_core9.list)({
  access: immutable(["canReadRepairOrders", "canManageCustomers"]),
  ui: { listView: { initialColumns: ["vehicle", "value", "unit", "source", "anomaly", "at"] } },
  fields: {
    vehicle: (0, import_fields9.relationship)({ ref: "Vehicle.odometerReadings", ...readOnly }),
    value: (0, import_fields9.integer)({ validation: { isRequired: true, min: 0 }, ...readOnly }),
    unit: fixedChoice(["mi", "km"]),
    source: fixedChoice(["ro_in", "ro_out", "customer", "import", "telematics"]),
    checkIn: (0, import_fields9.relationship)({ ref: "CheckIn", ...readOnly }),
    recordedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    at: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    accepted: (0, import_fields9.checkbox)({ defaultValue: true, ...readOnly }),
    anomaly: fixedChoice(["none", "lower_than_previous", "jump"]),
    overrideReason: systemText()
  }
});
var RecallCheck = (0, import_core9.list)({
  access: immutable(["canReadRepairOrders", "canManageCustomers"]),
  ui: { listView: { initialColumns: ["vehicle", "source", "campaignCount", "parkItAny", "checkedAt"] } },
  fields: {
    vehicle: (0, import_fields9.relationship)({ ref: "Vehicle.recallChecks", ...readOnly }),
    source: fixedChoice(["nhtsa_make_model_year", "fixture", "oem_vin"]),
    query: (0, import_fields9.json)({ ...readOnly }),
    campaigns: (0, import_fields9.json)({ ...readOnly }),
    campaignCount: (0, import_fields9.integer)({ defaultValue: 0, ...readOnly }),
    parkItAny: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "A campaign says do not drive, or park outside." } }),
    checkedAt: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    checkedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly })
  }
});
var ExternalReference = (0, import_core9.list)({
  access: governed(["canManageIntegrations", "canReadAudit"]),
  fields: {
    entityType: systemText({ required: true }),
    entityId: systemText({ indexed: true, required: true }),
    system: fixedChoice(["partstech", "motor", "alldata", "nexpart", "quickbooks", "stripe", "twilio", "carfax", "tekmetric_import", "shopmonkey_import"]),
    externalId: systemText({ required: true }),
    meta: (0, import_fields9.json)({ ...readOnly }),
    ...trackingFields
  }
});

// features/keystone/models/scheduling.ts
var scheduling_exports = {};
__export(scheduling_exports, {
  Appointment: () => Appointment,
  BookingHold: () => BookingHold,
  BookingRule: () => BookingRule,
  CheckIn: () => CheckIn
});
var import_core11 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var sys4 = () => false;
var readSchedule = anyOf("canReadRepairOrders", "canManageSchedule");
var BookingRule = (0, import_core11.list)({
  access: shopScoped({ operation: { query: readSchedule, create: permissions.canManageShops, update: permissions.canManageShops, delete: sys4 } }),
  hooks: auditedHooks("BookingRule"),
  ui: { labelField: "kind", listView: { initialColumns: ["shop", "kind", "value", "active"] } },
  fields: {
    shop: (0, import_fields10.relationship)({ ref: "Shop" }),
    kind: choice(["max_dropoffs_per_day", "waiter_slots_per_hour", "max_bay_hours_per_day", "no_waiters_after", "lead_time_hours", "slot_minutes"], "max_dropoffs_per_day"),
    value: (0, import_fields10.json)({ ui: { description: 'A whole number (count, hours or minutes); "HH:mm" for no_waiters_after; centi-hours for max_bay_hours_per_day.' } }),
    appliesToDays: (0, import_fields10.json)({ defaultValue: [], ui: { description: "Days of week 0-6 (Sunday 0). Empty = every open day." } }),
    active: (0, import_fields10.checkbox)({ defaultValue: true }),
    ...trackingFields
  }
});
var BookingHold = (0, import_core11.list)({
  access: shopScoped(governed(["canManageSchedule", "canReadRepairOrders"])),
  ui: { listView: { initialColumns: ["shop", "date", "slotStart", "kind", "status", "expiresAt"] } },
  fields: {
    shop: (0, import_fields10.relationship)({ ref: "Shop", ...readOnly }),
    date: (0, import_fields10.calendarDay)({ ...readOnly }),
    slotStart: (0, import_fields10.timestamp)({ ...readOnly }),
    kind: fixedChoice(["drop_off", "waiter"]),
    bayCentiHours: (0, import_fields10.integer)({ defaultValue: 0, ...readOnly }),
    tokenHash: systemText({ indexed: "unique", required: true }),
    source: fixedChoice(["staff", "storefront_api", "phone_agent", "sms_agent"]),
    expiresAt: (0, import_fields10.timestamp)({ ...readOnly }),
    status: lifecycle(["held", "consumed", "expired", "released"]),
    appointment: (0, import_fields10.relationship)({ ref: "Appointment", ...readOnly }),
    ...trackingFields
  }
});
var Appointment = (0, import_core11.list)({
  access: shopScoped({ operation: { query: readSchedule, create: sys4, update: permissions.canManageSchedule, delete: sys4 } }),
  hooks: auditedHooks("Appointment"),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "shop", "startsAt", "kind", "customer", "vehicle", "status"] } },
  fields: {
    shop: (0, import_fields10.relationship)({ ref: "Shop", ...readOnly }),
    reference: systemText({ indexed: "unique", required: true }),
    customer: (0, import_fields10.relationship)({ ref: "Customer.appointments", ...readOnly }),
    vehicle: (0, import_fields10.relationship)({ ref: "Vehicle.appointments", ...readOnly }),
    lead: (0, import_fields10.json)({ ...readOnly, ui: { ...readOnly.ui, description: "Name, phone and vehicle text when the customer is not on file yet." } }),
    date: (0, import_fields10.calendarDay)({ ...readOnly }),
    startsAt: (0, import_fields10.timestamp)({ ...readOnly }),
    endsAt: (0, import_fields10.timestamp)({ ...readOnly }),
    kind: fixedChoice(["drop_off", "waiter", "pickup_delivery", "mobile"]),
    requestedServices: (0, import_fields10.json)({ defaultValue: [], ...readOnly }),
    concernText: (0, import_fields10.text)({ ui: { displayMode: "textarea", description: "The customer's words." } }),
    estimatedCentiHours: centiHours({ defaultValue: 0 }),
    bay: (0, import_fields10.relationship)({ ref: "Bay" }),
    assignedTech: (0, import_fields10.relationship)({ ref: "User" }),
    source: fixedChoice(["staff", "storefront_api", "phone_agent", "sms_agent", "import"]),
    status: lifecycle(["requested", "confirmed", "arrived", "no_show", "cancelled"]),
    cancelReason: systemText(),
    checkIn: (0, import_fields10.relationship)({ ref: "CheckIn.appointment", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var CheckIn = (0, import_core11.list)({
  access: shopScoped(governed(["canReadRepairOrders", "canManageSchedule"])),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "shop", "vehicle", "customer", "promisedAt", "signedAt"] } },
  fields: {
    shop: (0, import_fields10.relationship)({ ref: "Shop", ...readOnly }),
    reference: systemText({ indexed: "unique", required: true }),
    appointment: (0, import_fields10.relationship)({ ref: "Appointment.checkIn", ...readOnly }),
    customer: (0, import_fields10.relationship)({ ref: "Customer", ...readOnly }),
    vehicle: (0, import_fields10.relationship)({ ref: "Vehicle", ...readOnly }),
    odometerIn: (0, import_fields10.relationship)({ ref: "OdometerReading", ...readOnly }),
    concerns: (0, import_fields10.json)({ defaultValue: [], ...readOnly }),
    keyTag: systemText(),
    waiter: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    promisedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    contactPreference: fixedChoice(["sms", "email", "phone"]),
    transportationNeed: fixedChoice(["none", "shuttle", "loaner", "rideshare"]),
    signatureMethod: fixedChoice(["in_person", "electronic_link"]),
    signerName: systemText(),
    signature: (0, import_fields10.json)({ ...readOnly, access: { read: anyOf("canReadCustomerPII", "canManageSchedule"), create: sys4, update: sys4 } }),
    signatureHash: systemText(),
    workOrderText: systemText(),
    workOrderHash: systemText(),
    signedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    valuablesNote: systemText(),
    recallWarning: (0, import_fields10.json)({ ...readOnly, ui: { ...readOnly.ui, description: "Possible recalls shown at check-in (do-not-drive campaigns in red)." } }),
    jurisdictionPolicyVersion: (0, import_fields10.relationship)({ ref: "JurisdictionPolicyVersion", ...readOnly }),
    at: (0, import_fields10.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    by: (0, import_fields10.relationship)({ ref: "User", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platform_exports,
  ...policy_exports,
  ...customers_exports,
  ...scheduling_exports
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(_root, { data }, context) {
  const session = context.session;
  if (!isSignedIn({ session })) throw new Error("Not authenticated");
  const allowed = /* @__PURE__ */ new Set(["email", "name", "password", "onboardingStatus"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  return context.db.User.updateOne({ where: { id: session.itemId }, data });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/mutations/op.ts
var import_graphql = require("graphql");

// features/keystone/lib/errors.ts
var DomainError = class extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
};
var isDomainError = (error) => error instanceof DomainError;
var Codes = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  STALE_STATE: "STALE_STATE",
  GUARD_FAILED: "GUARD_FAILED",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IN_PROGRESS: "IN_PROGRESS",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  SELF_APPROVAL: "SELF_APPROVAL",
  AGENT_CANNOT_APPROVE: "AGENT_CANNOT_APPROVE",
  APPROVAL_MISMATCH: "APPROVAL_MISMATCH",
  LEASE_LOST: "LEASE_LOST",
  STALE_FENCING_TOKEN: "STALE_FENCING_TOKEN",
  AUDIT_CHAIN_BROKEN: "AUDIT_CHAIN_BROKEN",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  AGENT_FORBIDDEN_ACTION: "AGENT_FORBIDDEN_ACTION",
  AUTHORIZATION_REQUIRED: "AUTHORIZATION_REQUIRED",
  REAUTHORIZATION_REQUIRED: "REAUTHORIZATION_REQUIRED",
  DISCLOSURE_MISSING: "DISCLOSURE_MISSING",
  CONSENT_BLOCKED: "CONSENT_BLOCKED",
  CREDENTIAL_REQUIRED: "CREDENTIAL_REQUIRED",
  CREDIT_HOLD: "CREDIT_HOLD",
  PO_REQUIRED: "PO_REQUIRED",
  TIN_REQUIRED: "TIN_REQUIRED",
  TRUST_GATE: "TRUST_GATE",
  POLICY_PUBLISHED: "POLICY_PUBLISHED",
  POLICY_UNVERIFIED: "POLICY_UNVERIFIED",
  ODOMETER_REGRESSION: "ODOMETER_REGRESSION",
  CAPACITY_FULL: "CAPACITY_FULL",
  HOLD_EXPIRED: "HOLD_EXPIRED",
  OUTSIDE_HOURS: "OUTSIDE_HOURS",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  SHOP_SUPPLIES_PROHIBITED: "SHOP_SUPPLIES_PROHIBITED",
  POLICY_INVALID: "POLICY_INVALID",
  POLICY_MISSING: "POLICY_MISSING",
  SIGNATURE_REQUIRED: "SIGNATURE_REQUIRED",
  ODOMETER_REQUIRED: "ODOMETER_REQUIRED",
  DUPLICATE: "DUPLICATE"
};

// features/keystone/mutations/op.ts
var UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i;
var SAFE_DETAIL_KEYS = /* @__PURE__ */ new Set(["currentStatus", "currentVersion", "to", "reason", "field", "problems", "replay", "ceilingMinor", "priceMinor", "authorizedMinor", "previous", "existingId"]);
var op = (fn) => async (root, args, context) => {
  try {
    return await fn(root, args, context);
  } catch (error) {
    if (error instanceof import_graphql.GraphQLError) throw error;
    if (isDomainError(error)) {
      const details = Object.fromEntries(Object.entries(error.details).filter(([key]) => SAFE_DETAIL_KEYS.has(key)));
      throw new import_graphql.GraphQLError(error.message, { extensions: { code: error.code, ...details } });
    }
    const message = typeof error?.message === "string" ? error.message : "";
    console.error("Operation failed:", message.slice(0, 300).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code;
    throw new import_graphql.GraphQLError(safe ? message : "Unable to complete the request. Please try again.", { extensions: { code: "KS_USER_INPUT_ERROR" } });
  }
};

// features/keystone/lib/actor.ts
function actorFromSession(session) {
  if (!session || !isSignedIn({ session })) throw new DomainError(Codes.NOT_AUTHORIZED, "Sign in to continue.");
  const role = session.data.role;
  const granted = new Set(role ? permissionNames.filter((name) => role[name] === true) : []);
  return { kind: "user", userId: session.itemId, name: session.data.name, permissions: granted };
}
function requirePermission(actor, ...anyOf2) {
  if (actor.kind === "system") return;
  if (actor.kind === "agent") throw new DomainError(Codes.NOT_AUTHORIZED, "Agents act only through their tool grants.");
  if (!anyOf2.some((permission) => actor.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf2.join(" or ")} permission.`);
  }
}
var principalKey = (actor) => actor.kind === "user" ? `user:${actor.userId}` : actor.kind === "agent" ? `agent:${actor.agentId}` : `system:${actor.name}`;
var actorUserId = (actor) => actor.kind === "user" ? actor.userId : null;
var actorAgentId = (actor) => actor.kind === "agent" ? actor.agentId : null;

// features/keystone/lib/idempotency.ts
var IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;
function assertIdempotencyKey(key) {
  if (typeof key !== "string" || !key.trim()) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, "An idempotency key is required.");
  if (!IDEMPOTENCY_KEY.test(key)) throw new DomainError(Codes.INVALID_INPUT, "The idempotency key must be 8 to 200 letters, digits or . _ : -");
}
async function claimReceipt(tx, input) {
  assertIdempotencyKey(input.key);
  await advisoryLock(tx, `command:${input.key}`);
  const existing = await tx.commandReceipt.findUnique({ where: { idempotencyKey: input.key } });
  if (!existing) return { replay: false };
  const requestHash = payloadHash(input.params);
  if (existing.command !== input.command || existing.principalKey !== input.principalKey || existing.requestHash !== requestHash) {
    throw new DomainError(Codes.IDEMPOTENCY_KEY_REUSED, "This idempotency key was already used for a different request.");
  }
  return { replay: true, responseBody: existing.responseBody };
}
async function writeReceipt(tx, input) {
  await tx.commandReceipt.create({
    data: {
      idempotencyKey: input.key,
      command: input.command,
      principalKey: input.principalKey,
      requestHash: payloadHash(input.params),
      requestParams: toJsonValue(canonicalize(input.params)),
      responseCode: "ok",
      responseBody: toJsonValue(input.response),
      recoveryPoint: "completed",
      completedAt: input.now
    }
  });
}

// features/keystone/lib/unitOfWork.ts
var UnitOfWork = class {
  constructor(tx, now, requestId) {
    this.tx = tx;
    this.now = now;
    this.requestId = requestId;
    this.audits = [];
    this.outbox = [];
  }
  audit(event) {
    this.audits.push({ requestId: this.requestId, ...event });
  }
  emit(message) {
    this.outbox.push(message);
  }
};
async function flushOutbox(tx, messages, now) {
  for (const message of messages) {
    const payload = toJsonValue(message.payload);
    const dedupeKey = message.dedupeKey ?? `${message.topic}:${message.aggregateType}:${message.aggregateId}:${sha256(canonicalJson(payload))}`;
    await tx.outboxEvent.upsert({
      where: { dedupeKey },
      create: {
        topic: message.topic,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        dedupeKey,
        payload,
        status: "pending",
        nextAttemptAt: message.availableAt ?? now
      },
      update: {}
    });
  }
}
async function runInTransaction(db, work, options = {}) {
  return db.$transaction(async (tx) => {
    if (options.actorKind) await tx.$executeRaw`SELECT set_config('app.actor_kind', ${options.actorKind}, true)`;
    const uow = new UnitOfWork(tx, options.now ?? /* @__PURE__ */ new Date(), options.requestId ?? null);
    const result = await work(uow);
    await flushOutbox(tx, uow.outbox, uow.now);
    await appendAuditEvents(tx, uow.audits, uow.now);
    return result;
  }, TRANSACTION_OPTIONS);
}

// features/keystone/lib/command.ts
var RETRYABLE = /deadlock detected|could not serialize|P2034|40P01|40001/i;
async function command(db, spec, work) {
  const principal = principalKey(spec.actor);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runInTransaction(db, async (uow) => {
        const receipt = await claimReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params });
        if (receipt.replay) return { replay: true, value: receipt.responseBody };
        const value = toJsonValue(await work(uow));
        await writeReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params, response: value, now: uow.now });
        return { replay: false, value };
      }, { requestId: spec.requestId ?? null, now: spec.now, actorKind: spec.actor.kind });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error?.code ?? "";
      if (attempt < 4 && (RETRYABLE.test(message) || RETRYABLE.test(code))) continue;
      throw error;
    }
  }
}

// features/integrations/vehicle-data/nhtsa.ts
var import_zod = require("zod");

// features/integrations/vehicle-data/vin.ts
var VALUES = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9
};
var WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
var VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
function normalizeVin(value) {
  return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}
function vinCheckDigit(vin2) {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const ch = vin2[i];
    const value = /\d/.test(ch) ? Number(ch) : VALUES[ch];
    if (value === void 0) throw new Error("VIN contains a character that is not allowed");
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}
function checkVin(value) {
  const vin2 = normalizeVin(value);
  if (!vin2) return { vin: null, validity: "none", message: "No VIN." };
  if (!VIN_PATTERN.test(vin2)) {
    return { vin: vin2, validity: "invalid_format", message: "A VIN has 17 letters and digits and never uses I, O or Q. Pre-1981 vehicles may have shorter numbers." };
  }
  const expected = vinCheckDigit(vin2);
  if (vin2[8] !== expected) {
    return { vin: vin2, validity: "check_digit_warning", message: `The check digit (9th character) should be ${expected}. Check the VIN against the door jamb or windshield plate; the visit can go ahead.` };
  }
  return { vin: vin2, validity: "valid", message: "VIN format and check digit are correct." };
}
function withCheckDigit(vin17) {
  const vin2 = normalizeVin(vin17);
  return `${vin2.slice(0, 8)}${vinCheckDigit(vin2)}${vin2.slice(9)}`;
}

// features/integrations/vehicle-data/nhtsa.ts
var VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended";
var RECALLS = "https://api.nhtsa.gov/recalls/recallsByVehicle";
var TIMEOUT_MS = 6e3;
var MAX_TEXT = 4e3;
var decodeSchema = import_zod.z.object({ Count: import_zod.z.number(), Results: import_zod.z.array(import_zod.z.record(import_zod.z.string(), import_zod.z.union([import_zod.z.string(), import_zod.z.number(), import_zod.z.null()]))).min(1) });
var nullableText = import_zod.z.string().nullish().transform((v) => v ?? "");
var nullableFlag = import_zod.z.boolean().nullish().transform((v) => v ?? false);
var recallSchema = import_zod.z.object({
  Count: import_zod.z.number(),
  results: import_zod.z.array(import_zod.z.object({
    Manufacturer: nullableText,
    NHTSACampaignNumber: import_zod.z.string(),
    parkIt: nullableFlag,
    parkOutSide: nullableFlag,
    overTheAirUpdate: nullableFlag,
    ReportReceivedDate: nullableText,
    Component: nullableText,
    Summary: nullableText,
    Consequence: nullableText,
    Remedy: nullableText,
    Notes: nullableText
  }).passthrough())
});
var clip = (text11) => text11.length > MAX_TEXT ? `${text11.slice(0, MAX_TEXT)}\u2026` : text11;
var present = (value) => {
  const text11 = value === null || value === void 0 ? "" : String(value).trim();
  return text11 && text11 !== "Not Applicable" ? text11 : void 0;
};
var int = (value) => {
  const text11 = present(value);
  return text11 && /^\d+$/.test(text11) ? Number(text11) : void 0;
};
function nhtsaDate(text11) {
  const m = text11.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : text11;
}
function parseDecode(vin2, body) {
  const parsed = decodeSchema.parse(body);
  const raw = Object.fromEntries(Object.entries(parsed.Results[0]).filter(([, v]) => v !== null && v !== "").map(([k, v]) => [k, String(v)]));
  return {
    vin: vin2,
    errorCode: raw.ErrorCode ?? "",
    errorText: clip(raw.ErrorText ?? ""),
    year: int(raw.ModelYear),
    make: present(raw.Make),
    makeId: int(raw.MakeID),
    model: present(raw.Model),
    modelId: int(raw.ModelID),
    trim: present(raw.Trim) ?? present(raw.Series),
    bodyClass: present(raw.BodyClass),
    driveType: present(raw.DriveType),
    engine: { cylinders: int(raw.EngineCylinders), displacementL: present(raw.DisplacementL), model: present(raw.EngineModel) },
    fuelTypePrimary: present(raw.FuelTypePrimary),
    electrificationLevel: present(raw.ElectrificationLevel),
    transmissionStyle: present(raw.TransmissionStyle),
    gvwr: present(raw.GVWR),
    vehicleType: present(raw.VehicleType),
    manufacturer: present(raw.Manufacturer),
    plantCountry: present(raw.PlantCountry),
    raw
  };
}
function parseRecalls(body) {
  return recallSchema.parse(body).results.map((r) => ({
    nhtsaCampaignNumber: r.NHTSACampaignNumber,
    manufacturer: r.Manufacturer,
    component: clip(r.Component),
    summary: clip(r.Summary),
    consequence: clip(r.Consequence),
    remedy: clip(r.Remedy),
    notes: r.Notes ? clip(r.Notes) : void 0,
    reportReceivedDate: nhtsaDate(r.ReportReceivedDate),
    parkIt: r.parkIt,
    parkOutSide: r.parkOutSide,
    overTheAirUpdate: r.overTheAirUpdate
  }));
}
var decodeHasErrors = (errorCode) => errorCode.split(",").map((s) => s.trim()).some((code) => code && code !== "0");
async function getJson(fetcher, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, code: res.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR", retryable: res.status === 429 || res.status >= 500, detail: `NHTSA answered ${res.status}` };
    return { ok: true, body: await res.json() };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return { ok: false, code: aborted ? "TIMEOUT" : "PROVIDER_UNAVAILABLE", retryable: true, detail: aborted ? "NHTSA did not answer within 6 seconds" : "NHTSA could not be reached" };
  } finally {
    clearTimeout(timer);
  }
}
function nhtsaAdapter(fetcher = globalThis.fetch) {
  return {
    key: "nhtsa",
    async decodeVin(vin2, modelYear) {
      const checked = checkVin(vin2);
      if (!checked.vin || checked.validity === "invalid_format") return { kind: "error", code: "INVALID_INPUT", retryable: false, detail: checked.message };
      const url = `${VPIC}/${encodeURIComponent(checked.vin)}?format=json${modelYear ? `&modelyear=${modelYear}` : ""}`;
      const res = await getJson(fetcher, url);
      if (!res.ok) return { kind: "error", code: res.code, retryable: res.retryable, detail: res.detail };
      try {
        return { kind: "ok", value: parseDecode(checked.vin, res.body) };
      } catch {
        return { kind: "error", code: "PROVIDER_SHAPE", retryable: false, detail: "NHTSA returned a response we could not read" };
      }
    },
    async recallsByVehicle(query) {
      const make = query.make.trim();
      const model = query.model.trim();
      if (!make || !model || !Number.isInteger(query.modelYear)) return { kind: "error", code: "INVALID_INPUT", retryable: false, detail: "Recalls need make, model and model year." };
      const params = new URLSearchParams({ make, model, modelYear: String(query.modelYear) });
      const res = await getJson(fetcher, `${RECALLS}?${params}`);
      if (!res.ok) return { kind: "error", code: res.code, retryable: res.retryable, detail: res.detail };
      try {
        return { kind: "ok", value: parseRecalls(res.body) };
      } catch {
        return { kind: "error", code: "PROVIDER_SHAPE", retryable: false, detail: "NHTSA returned a response we could not read" };
      }
    }
  };
}

// features/integrations/vehicle-data/fixtures/vpic-clean.json
var vpic_clean_default = { Count: 1, Message: "Results returned successfully. NOTE: Any missing decoded values should be interpreted as NHTSA does not have data on the specific variable. Missing value should NOT be interpreted as an indication that a feature or technology is unavailable for a vehicle.", SearchCriteria: "VIN(s): 1HGCV1F37JA000001", Results: [{ ABS: "Standard", ActiveSafetySysNote: "Traffic Sign Recognition", AdaptiveCruiseControl: "Standard", AdaptiveDrivingBeam: "Standard", AdaptiveHeadlights: "", AdditionalErrorText: "", AirBagLocCurtain: "All Rows", AirBagLocFront: "1st Row (Driver and Passenger)", AirBagLocKnee: "1st Row (Driver and Passenger)", AirBagLocSeatCushion: "", AirBagLocSide: "1st Row (Driver and Passenger)", AutoReverseSystem: "Standard", AutomaticPedestrianAlertingSound: "", AxleConfiguration: "", Axles: "2", BasePrice: "25780.00", BatteryA: "", BatteryA_to: "", BatteryCells: "", BatteryInfo: "", BatteryKWh: "", BatteryKWh_to: "", BatteryModules: "", BatteryPacks: "", BatteryType: "", BatteryV: "", BatteryV_to: "", BedLengthIN: "", BedType: "Not Applicable", BlindSpotIntervention: "", BlindSpotMon: "Standard", BodyCabType: "Not Applicable", BodyClass: "Sedan/Saloon", BrakeSystemDesc: "", BrakeSystemType: "", BusFloorConfigType: "Not Applicable", BusLength: "", BusType: "Not Applicable", CAN_AACN: "", CIB: "Standard", CashForClunkers: "", ChargerLevel: "", ChargerPowerKW: "", CombinedBrakingSystem: "", CoolingType: "Water", CurbWeightLB: "3428", CustomMotorcycleType: "Not Applicable", DaytimeRunningLight: "Standard", DestinationMarket: "", DisplacementCC: "1500.0", DisplacementCI: "91.53561614209", DisplacementL: "1.5", Doors: "4", DriveType: "4x2", DriverAssist: "", DynamicBrakeSupport: "Standard", EDR: "", ESC: "Standard", EVDriveUnit: "", ElectrificationLevel: "", EngineConfiguration: "In-Line", EngineCycles: "4", EngineCylinders: "4", EngineHP: "192", EngineHP_to: "", EngineKW: "", EngineManufacturer: "HONDA", EngineModel: "L15BE", EntertainmentSystem: "", ErrorCode: "0", ErrorText: "0 - VIN decoded clean. Check Digit (9th position) is correct", ForwardCollisionWarning: "Standard", FuelInjectionType: "", FuelTankMaterial: "", FuelTankType: "", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "", GCWR: "", GCWR_to: "", GVWR: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)", GVWR_to: "Class 1: 6,000 lb or less (2,722 kg or less)", KeylessIgnition: "Standard", LaneCenteringAssistance: "", LaneDepartureWarning: "Standard", LaneKeepSystem: "Standard", LowerBeamHeadlampLightSource: "", Make: "HONDA", MakeID: "474", Manufacturer: "AMERICAN HONDA MOTOR CO., INC.", ManufacturerId: "988", Model: "Accord", ModelID: "1861", ModelYear: "2018", MotorcycleChassisType: "Not Applicable", MotorcycleSuspensionType: "Not Applicable", NCSABodyType: "4-door sedan, hardtop", NCSAMake: "Honda", NCSAMapExcApprovedBy: "", NCSAMapExcApprovedOn: "", NCSAMappingException: "", NCSAModel: "Accord (Note: For Crosstour model years 2010 and 2011 only. For Crosstour model years 2012-2015, see vehicle model 37-405)", NCSANote: "", NonLandUse: "", Note: "Curb Weight: 3,131 to 3,428 lbs", OtherBusInfo: "", OtherEngineInfo: "Direct Fuel Injection", OtherMotorcycleInfo: "", OtherRestraintSystemInfo: "", OtherTrailerInfo: "", ParkAssist: "", PedestrianAutomaticEmergencyBraking: "", PlantCity: "MARYSVILLE", PlantCompanyName: "", PlantCountry: "UNITED STATES (USA)", PlantState: "OHIO", PossibleValues: "", Pretensioner: "", RearAutomaticEmergencyBraking: "", RearCrossTrafficAlert: "", RearVisibilitySystem: "Standard", SAEAutomationLevel: "", SAEAutomationLevel_to: "", SeatBeltsAll: "Manual", SeatRows: "2", Seats: "5", SemiautomaticHeadlampBeamSwitching: "Standard", Series: "", Series2: "", SteeringLocation: "Left-Hand Drive (LHD)", SuggestedVIN: "", TPMS: "Indirect", TopSpeedMPH: "155", TrackWidth: "", TractionControl: "Standard", TrailerBodyType: "Not Applicable", TrailerLength: "", TrailerType: "Not Applicable", TransmissionSpeeds: "", TransmissionStyle: "Continuously Variable Transmission (CVT)", Trim: "Sport", Trim2: "", Turbo: "Yes", VIN: "1HGCV1F37JA000001", ValveTrainDesign: "Dual Overhead Cam (DOHC)", VehicleDescriptor: "1HGCV1F3*JA", VehicleType: "PASSENGER CAR", WheelBaseLong: "", WheelBaseShort: "111.40", WheelBaseType: "", WheelSizeFront: "19", WheelSizeRear: "19", WheelieMitigation: "", Wheels: "4", Windows: "" }] };

// features/integrations/vehicle-data/fixtures/vpic-check-digit.json
var vpic_check_digit_default = { Count: 1, Message: "Results returned successfully. NOTE: Any missing decoded values should be interpreted as NHTSA does not have data on the specific variable. Missing value should NOT be interpreted as an indication that a feature or technology is unavailable for a vehicle.", SearchCriteria: "VIN(s): 1HGCV1F34JA000001", Results: [{ ABS: "Standard", ActiveSafetySysNote: "Traffic Sign Recognition", AdaptiveCruiseControl: "Standard", AdaptiveDrivingBeam: "Standard", AdaptiveHeadlights: "", AdditionalErrorText: "", AirBagLocCurtain: "All Rows", AirBagLocFront: "1st Row (Driver and Passenger)", AirBagLocKnee: "1st Row (Driver and Passenger)", AirBagLocSeatCushion: "", AirBagLocSide: "1st Row (Driver and Passenger)", AutoReverseSystem: "Standard", AutomaticPedestrianAlertingSound: "", AxleConfiguration: "", Axles: "2", BasePrice: "25780.00", BatteryA: "", BatteryA_to: "", BatteryCells: "", BatteryInfo: "", BatteryKWh: "", BatteryKWh_to: "", BatteryModules: "", BatteryPacks: "", BatteryType: "", BatteryV: "", BatteryV_to: "", BedLengthIN: "", BedType: "Not Applicable", BlindSpotIntervention: "", BlindSpotMon: "Standard", BodyCabType: "Not Applicable", BodyClass: "Sedan/Saloon", BrakeSystemDesc: "", BrakeSystemType: "", BusFloorConfigType: "Not Applicable", BusLength: "", BusType: "Not Applicable", CAN_AACN: "", CIB: "Standard", CashForClunkers: "", ChargerLevel: "", ChargerPowerKW: "", CombinedBrakingSystem: "", CoolingType: "Water", CurbWeightLB: "3428", CustomMotorcycleType: "Not Applicable", DaytimeRunningLight: "Standard", DestinationMarket: "", DisplacementCC: "1500.0", DisplacementCI: "91.53561614209", DisplacementL: "1.5", Doors: "4", DriveType: "4x2", DriverAssist: "", DynamicBrakeSupport: "Standard", EDR: "", ESC: "Standard", EVDriveUnit: "", ElectrificationLevel: "", EngineConfiguration: "In-Line", EngineCycles: "4", EngineCylinders: "4", EngineHP: "192", EngineHP_to: "", EngineKW: "", EngineManufacturer: "HONDA", EngineModel: "L15BE", EntertainmentSystem: "", ErrorCode: "1", ErrorText: "1 - Check Digit (9th position) does not calculate properly", ForwardCollisionWarning: "Standard", FuelInjectionType: "", FuelTankMaterial: "", FuelTankType: "", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "", GCWR: "", GCWR_to: "", GVWR: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)", GVWR_to: "Class 1: 6,000 lb or less (2,722 kg or less)", KeylessIgnition: "Standard", LaneCenteringAssistance: "", LaneDepartureWarning: "Standard", LaneKeepSystem: "Standard", LowerBeamHeadlampLightSource: "", Make: "HONDA", MakeID: "474", Manufacturer: "AMERICAN HONDA MOTOR CO., INC.", ManufacturerId: "988", Model: "Accord", ModelID: "1861", ModelYear: "2018", MotorcycleChassisType: "Not Applicable", MotorcycleSuspensionType: "Not Applicable", NCSABodyType: "4-door sedan, hardtop", NCSAMake: "Honda", NCSAMapExcApprovedBy: "", NCSAMapExcApprovedOn: "", NCSAMappingException: "", NCSAModel: "Accord (Note: For Crosstour model years 2010 and 2011 only. For Crosstour model years 2012-2015, see vehicle model 37-405)", NCSANote: "", NonLandUse: "", Note: "Curb Weight: 3,131 to 3,428 lbs", OtherBusInfo: "", OtherEngineInfo: "Direct Fuel Injection", OtherMotorcycleInfo: "", OtherRestraintSystemInfo: "", OtherTrailerInfo: "", ParkAssist: "", PedestrianAutomaticEmergencyBraking: "", PlantCity: "MARYSVILLE", PlantCompanyName: "", PlantCountry: "UNITED STATES (USA)", PlantState: "OHIO", PossibleValues: "", Pretensioner: "", RearAutomaticEmergencyBraking: "", RearCrossTrafficAlert: "", RearVisibilitySystem: "Standard", SAEAutomationLevel: "", SAEAutomationLevel_to: "", SeatBeltsAll: "Manual", SeatRows: "2", Seats: "5", SemiautomaticHeadlampBeamSwitching: "Standard", Series: "", Series2: "", SteeringLocation: "Left-Hand Drive (LHD)", SuggestedVIN: "", TPMS: "Indirect", TopSpeedMPH: "155", TrackWidth: "", TractionControl: "Standard", TrailerBodyType: "Not Applicable", TrailerLength: "", TrailerType: "Not Applicable", TransmissionSpeeds: "", TransmissionStyle: "Continuously Variable Transmission (CVT)", Trim: "Sport", Trim2: "", Turbo: "Yes", VIN: "1HGCV1F34JA000001", ValveTrainDesign: "Dual Overhead Cam (DOHC)", VehicleDescriptor: "1HGCV1F3*JA", VehicleType: "PASSENGER CAR", WheelBaseLong: "", WheelBaseShort: "111.40", WheelBaseType: "", WheelSizeFront: "19", WheelSizeRear: "19", WheelieMitigation: "", Wheels: "4", Windows: "" }] };

// features/integrations/vehicle-data/fixtures/vpic-unknown.json
var vpic_unknown_default = { Count: 1, Message: "Results returned successfully. NOTE: Any missing decoded values should be interpreted as NHTSA does not have data on the specific variable. Missing value should NOT be interpreted as an indication that a feature or technology is unavailable for a vehicle.", SearchCriteria: "VIN(s): ZZZZZZZZZZZZZZZZZ", Results: [{ ABS: "", ActiveSafetySysNote: "", AdaptiveCruiseControl: "", AdaptiveDrivingBeam: "", AdaptiveHeadlights: "", AdditionalErrorText: "Invalid character(s): 9:Z, 10:Z, 14:Z, 15:Z, 16:Z, 17:Z.", AirBagLocCurtain: "", AirBagLocFront: "", AirBagLocKnee: "", AirBagLocSeatCushion: "", AirBagLocSide: "", AutoReverseSystem: "", AutomaticPedestrianAlertingSound: "", AxleConfiguration: "", Axles: "", BasePrice: "", BatteryA: "", BatteryA_to: "", BatteryCells: "", BatteryInfo: "", BatteryKWh: "", BatteryKWh_to: "", BatteryModules: "", BatteryPacks: "", BatteryType: "", BatteryV: "", BatteryV_to: "", BedLengthIN: "", BedType: "", BlindSpotIntervention: "", BlindSpotMon: "", BodyCabType: "", BodyClass: "", BrakeSystemDesc: "", BrakeSystemType: "", BusFloorConfigType: "", BusLength: "", BusType: "", CAN_AACN: "", CIB: "", CashForClunkers: "", ChargerLevel: "", ChargerPowerKW: "", CombinedBrakingSystem: "", CoolingType: "", CurbWeightLB: "", CustomMotorcycleType: "", DaytimeRunningLight: "", DestinationMarket: "", DisplacementCC: "", DisplacementCI: "", DisplacementL: "", Doors: "", DriveType: "", DriverAssist: "", DynamicBrakeSupport: "", EDR: "", ESC: "", EVDriveUnit: "", ElectrificationLevel: "", EngineConfiguration: "", EngineCycles: "", EngineCylinders: "", EngineHP: "", EngineHP_to: "", EngineKW: "", EngineManufacturer: "", EngineModel: "", EntertainmentSystem: "", ErrorCode: "1,7,11,400", ErrorText: "1 - Check Digit (9th position) does not calculate properly; 7 - Manufacturer is not registered with NHTSA for sale or importation in the U.S. for use on U.S roads; Please contact the manufacturer directly for more information; 11 - Incorrect Model Year - Position 10 does not match valid model year codes (I, O, Q, U, Z, 0). Decoded data may not be accurate.; 400 - Invalid Characters Present", ForwardCollisionWarning: "", FuelInjectionType: "", FuelTankMaterial: "", FuelTankType: "", FuelTypePrimary: "", FuelTypeSecondary: "", GCWR: "", GCWR_to: "", GVWR: "", GVWR_to: "", KeylessIgnition: "", LaneCenteringAssistance: "", LaneDepartureWarning: "", LaneKeepSystem: "", LowerBeamHeadlampLightSource: "", Make: "", MakeID: "", Manufacturer: "", ManufacturerId: "", Model: "", ModelID: "", ModelYear: "", MotorcycleChassisType: "", MotorcycleSuspensionType: "", NCSABodyType: "", NCSAMake: "", NCSAMapExcApprovedBy: "", NCSAMapExcApprovedOn: "", NCSAMappingException: "", NCSAModel: "", NCSANote: "", NonLandUse: "", Note: "", OtherBusInfo: "", OtherEngineInfo: "", OtherMotorcycleInfo: "", OtherRestraintSystemInfo: "", OtherTrailerInfo: "", ParkAssist: "", PedestrianAutomaticEmergencyBraking: "", PlantCity: "", PlantCompanyName: "", PlantCountry: "", PlantState: "", PossibleValues: "", Pretensioner: "", RearAutomaticEmergencyBraking: "", RearCrossTrafficAlert: "", RearVisibilitySystem: "", SAEAutomationLevel: "", SAEAutomationLevel_to: "", SeatBeltsAll: "", SeatRows: "", Seats: "", SemiautomaticHeadlampBeamSwitching: "", Series: "", Series2: "", SteeringLocation: "", SuggestedVIN: "ZZZZZZZZ!!ZZZ!!!!", TPMS: "", TopSpeedMPH: "", TrackWidth: "", TractionControl: "", TrailerBodyType: "", TrailerLength: "", TrailerType: "", TransmissionSpeeds: "", TransmissionStyle: "", Trim: "", Trim2: "", Turbo: "", VIN: "ZZZZZZZZZZZZZZZZZ", ValveTrainDesign: "", VehicleDescriptor: "ZZZZZZZZ*ZZ", VehicleType: "", WheelBaseLong: "", WheelBaseShort: "", WheelBaseType: "", WheelSizeFront: "", WheelSizeRear: "", WheelieMitigation: "", Wheels: "", Windows: "" }] };

// features/integrations/vehicle-data/fixtures/recalls-accord-2018.json
var recalls_accord_2018_default = { Count: 6, Message: "Results returned successfully", results: [{ Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "20V314000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "28/05/2020", Component: "FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP", Summary: "Honda (American Honda Motor Co.) is recalling certain 2018-2019 Acura NSX, 2019 Acura RDX, RLX and RLX Sport Hybrid, 2018-2019 Honda Accord, Civic Hatchback, Civic Type R and HR-V, 2019-2020 Insight and 2019 Fit vehicles.  The low-pressure fuel pump inside the fuel tank may fail.", Consequence: "If the fuel pump fails, the engine can stall while driving, increasing the risk of a crash.", Remedy: "Honda will notify owners and dealers will replace the fuel pump assembly, free of charge.  The recall began July 22, 2020.  Owners may contact Honda customer service at 1-888-234-2138.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.safercar.gov.", ModelYear: "2018", Make: "HONDA", Model: "ACCORD" }, { Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "20V771000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "10/12/2020", Component: "ELECTRICAL SYSTEM:BODY CONTROL MODULE:SOFTWARE", Summary: 'Honda (American Honda Motor Co.) is recalling certain 2018-2020 Accord Sedan, Accord Hybrid, and 2019-2020 Insight vehicles.  A software error may cause intermittent or continuous disruptions in communication between the Body Control Module (BCM) and other components.  This may result in malfunctions of various systems such as the windshield wipers and defroster, rearview camera, exterior lights, audible warning of a stopped vehicle, and power window operation.  As such, these vehicles fail to comply with the requirements of Federal Motor Vehicle Safety Standard (FMVSS) number 103, "Windshield Defrosting and Defogging Systems" and number 111, "Rear Visibility" as well as FMVSS numbers 104, 108, 114, 118, and 305.', Consequence: "Various system malfunctions such as inoperative windshield wipers, defroster, rearview camera, or exterior lighting can increase the risk of a crash.", Remedy: "Honda will notify owners, and dealers will update the BCM software, free of charge.  The recall is expected to begin February 22, 2021.  Owners may contact Honda customer service at 1-888-234-2138.  Honda's number for this recall is X95.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.safercar.gov.", ModelYear: "2018", Make: "HONDA", Model: "ACCORD" }, { Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "18V629000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "13/09/2018", Component: "BACK OVER PREVENTION: SENSING SYSTEM: CAMERA", Summary: 'Honda (American Honda Motor Co.) is recalling certain 2018 Honda Accord and 2019 Honda Insight vehicles.  In certain scenarios, the back-up camera center display may not function properly.  As such, these vehicles fail to comply with the requirements of Federal Motor Vehicle Safety Standard (FMVSS) number 111, "Rearview Mirrors."', Consequence: "If the rearview camera display does not show what is behind the vehicle, it can increase the risk of a crash.", Remedy: "Honda will notify owners, and dealers will reprogram the display audio unit software, free of charge.  The recall began October 30, 2018.  Owners may contact Honda customer service at 1-888-234-2138.  Honda's numbers for this recall are K2G and V2F.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.safercar.gov.", ModelYear: "2018", Make: "HONDA", Model: "ACCORD" }, { Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "23V158000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "09/03/2023", Component: "SEAT BELTS:FRONT:BUCKLE ASSEMBLY", Summary: "Honda (American Honda Motor Co.) is recalling certain 2017-2020 CR-V, 2018-2019 Accord and Accord Hybrid, 2018-2020 Odyssey, 2019 Insight, and 2019-2020 Acura RDX vehicles.  A manufacturing issue with the front seat belts may cause the seat belt buckle channel to interfere with the release button, preventing the seat belt buckle from latching.", Consequence: "An unlatched seat belt cannot properly restrain the seat occupant during a crash, increasing their risk of injury.", Remedy: "Dealers will replace the driver and front passenger seat belt buckle release buttons or the buckle assemblies as necessary, free of charge.  Owner notification letters were mailed April 18, 2023.  Owners may contact Honda customer service at 1-888-234-2138.  Honda's numbers for this recall are NDA, QDB, BDC, MDD, LD9. TDF, FDG, ODH, YDI, ZDE.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.nhtsa.gov.", ModelYear: "2018", Make: "HONDA", Model: "ACCORD" }, { Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "23V858000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "19/12/2023", Component: "FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP", Summary: "Honda (American Honda Motor Co.) is recalling certain 2013-2023 Honda Accord, Civic Coupe, Civic Sedan, Civic Hatchback, Civic Type R, CR-V, HR-V, Ridgeline, Odyssey, Acura ILX, MDX, MDX Hybrid, RDX, RLX, TLX, 2019-2022 Honda Insight, Passport, 2020 Honda CR-V Hybrid, 2018-2019 Honda Clarity PHEV, Fit, and 2015-2020 Honda Accord Hybrid, Pilot, Acura NSX vehicles.  The fuel pump inside the fuel tank may fail.", Consequence: "Fuel pump failure can cause an engine stall while driving, increasing the risk of a crash.", Remedy: "Dealers will replace the fuel pump module, free of charge.  Owner letters were mailed September 6, 2024.  Owners may contact Honda customer service at 1-888-234-2138.  Honda's numbers for this recall are KGC and KGD.  This recall is an expansion of NHTSA recall numbers 21V-215 and 20V-314.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.nhtsa.gov.", ModelYear: "2018", Make: "HONDA", Model: "ACCORD" }, { Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "26V332000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "22/05/2026", Component: "AIR BAGS:SENSOR:OCCUPANT CLASSIFICATION:FRONT PASSENGER", Summary: "Honda (American Honda Motor Co.) is recalling certain 2018-2021, 2023 Acura TLX, 2019-2024 RDX, 2017-2020, 2022-2026 MDX, 2017-2021, 2023, 2025 Honda Ridgeline, 2017-2022 Pilot, 2019-2021 Passport, 2018-2026 Odyssey, 2019-2022 Insight, 2019-2021 HR-V, 2018-2020 Fit, 2020-2022 CR-V Hybrid, 2017-2022 CR-V, 2017-2018, 2021 Civic Type R, 2017-2021 Civic hatchback, 2016-2020 Civic coupe, 2016-2022 Civic, 2017-2022 Accord Hybrid, and 2016-2022 Accord vehicles. The front passenger seat weight sensor may crack and short circuit, which can cause the air bags to deploy unintentionally during a crash.", Consequence: "Air bags that deploy unintentionally during a crash increase the risk of injury.", Remedy: "Dealers will replace the seat weight sensors, free of charge. Owner notification letters were mailed July 7, 2026. Owners may contact Honda's customer service at 1-888-234-2138. Honda's numbers for this recall are BOL, WO9, OOA, WOM, XOH, NOC, POD, BOE, UOF, POB, EOG, AOI, QO8, TOJ, DO7, and SOK. This recall expands previous NHTSA recall number 24V064. Vehicle Identification Numbers (VINs) involved in this recall will be searchable on NHTSA.gov beginning May 29, 2026.", Notes: null, ModelYear: "2018", Make: "HONDA", Model: "ACCORD" }] };

// features/integrations/vehicle-data/fixtures/recalls-park-outside.json
var recalls_park_outside_default = { Count: 4, Message: "Results returned successfully", results: [{ Manufacturer: "Kia Motors America", NHTSACampaignNumber: "18V907000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, NHTSAActionNumber: "DP18003", ReportReceivedDate: "19/12/2018", Component: "FUEL SYSTEM, GASOLINE:DELIVERY:HOSES, LINES/PIPING, AND FITTINGS", Summary: "Kia Motors America (Kia) is recalling certain 2011-2017 Optima, 2012-2017 Sorento and 2011-2018 Sportage vehicles that previously received an engine replacement under recall number 17V-224, warranty, or the Knock Sensor Detection System (KSDS) Product Improvement Campaign.  The high pressure fuel pipe that connects to the fuel pump outlet may have been damaged, misaligned or improperly torqued during the engine replacement procedure, possibly causing a fuel leak.", Consequence: "A fuel leak in the presence of an ignition source can increase the risk of a fire.", Remedy: "Kia has notified owners, and dealers will inspect and replace the fuel pipe, as necessary, free of charge.  The recall began January 17, 2019.  Owners may contact Kia customer service at 1-800-333-4542.  Kia's number for this recall is SC172.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.safercar.gov.", ModelYear: "2017", Make: "KIA", Model: "SPORTAGE" }, { Manufacturer: "Kia Motors America", NHTSACampaignNumber: "21V137000", parkIt: false, parkOutSide: true, overTheAirUpdate: false, ReportReceivedDate: "04/03/2021", Component: "SERVICE BRAKES, HYDRAULIC:ANTILOCK/TRACTION CONTROL/ELECTRONIC LIMITED SLIP:CONTROL UNIT/MODULE", Summary: "Kia Motors America (Kia) is recalling certain 2017-2021 Sportage and Cadenza vehicles.  The electrical circuit in the Hydraulic Electronic Control Unit (HECU) may short-circuit, which can cause a fire in the engine compartment.", Consequence: "An engine compartment fire can increase the risk of injury.", Remedy: "Owners are advised to park outside and away from structures as a precaution until the recall repair is complete.  Kia will notify owners, and dealers will replace certain fuses in the electrical junction box.  Vehicles equipped with an electronic parking brake (EPB) will also receive a HECU software update.  Repairs will be performed free of charge.  The recall began on April 30, 2021.  Owners may contact Kia customer service at 1-800-333-4542.  Kia's number for this recall is SC206.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.safercar.gov.", ModelYear: "2017", Make: "KIA", Model: "SPORTAGE" }, { Manufacturer: "Kia Motors America", NHTSACampaignNumber: "16V862000", parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: "30/11/2016", Component: "TRAILER HITCHES", Summary: 'Kia Motors America (Kia) is recalling certain model year 2016-2017 Sorento vehicles manufactured October 27, 2014, to August 25, 2016, and 2017 Sportage vehicles manufactured December 10, 2015, to August 26, 2016.  The affected vehicles are equipped with an accessory trailer hitch wiring harness that, due to a malfunction of the tow hitch module, may result in the trailer brake lights being constantly illuminated.  As such, these vehicles fail to comply with the requirements of Federal Motor Vehicle Safety Standard (FMVSS) number 108, " Lamps, Reflective Devices, and Associated Equipment."', Consequence: "If the trailer brake lights stay illuminated while being used, other drivers may be confused, increasing the risk of a crash.", Remedy: "Kia will notify owners, and dealers will replace the trailer tow hitch harness, free of charge.  The recall began January 18, 2017.  Owners may contact Kia customer service at 1-800-333-4542.  Kia's number for this recall is SC142.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.safercar.gov.", ModelYear: "2017", Make: "KIA", Model: "SPORTAGE" }, { Manufacturer: "Kia America, Inc.", NHTSACampaignNumber: "22V703000", parkIt: false, parkOutSide: true, overTheAirUpdate: false, ReportReceivedDate: "19/09/2022", Component: "TRAILER HITCHES", Summary: "Kia America, Inc. (Kia) is recalling certain 2016-2022 Sorento, 2021-2022 Sorento Hybrid (HEV), 2022-2023 Sorento Plug-In Hybrid (PHEV), and 2017-2022 Sportage vehicles equipped with a tow hitch harness installed as original equipment, or purchased as an accessory through a Kia dealership.  Debris and moisture accumulation on the tow hitch harness module printed circuit board (PCB) may cause an electrical short, which can result in a fire.", Consequence: "A fire while parked or driving can increase the risk of injury.", Remedy: "Owners are advised to park outside and away from structures until the recall repair is complete.  Dealers will inspect the vehicle, and, as necessary, replace the fuse and/or tow hitch harness module, free of charge.  Owner notification letters were mailed August 11, 2023.  Owners may contact Kia customer service at 1-800-333-4542.  Kia's number for this recall is SC249.", Notes: "Owners may also contact the National Highway Traffic Safety Administration Vehicle Safety Hotline at 1-888-327-4236 (TTY 1-800-424-9153), or go to www.nhtsa.gov.", ModelYear: "2017", Make: "KIA", Model: "SPORTAGE" }] };

// features/integrations/vehicle-data/fixtures/recalls-none.json
var recalls_none_default = { Count: 0, Message: "Results returned successfully", results: [] };

// features/integrations/vehicle-data/fixtures/index.ts
var FIXTURE_VINS = { clean: "1HGCV1F37JA000001", checkDigit: "1HGCV1F34JA000001" };
var fixtureFetcher = async (url) => {
  const u = new URL(url);
  let body = recalls_none_default;
  if (u.hostname === "vpic.nhtsa.dot.gov") {
    const vin2 = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    body = vin2 === FIXTURE_VINS.clean ? vpic_clean_default : vin2 === FIXTURE_VINS.checkDigit ? vpic_check_digit_default : vpic_unknown_default;
  } else {
    const make = u.searchParams.get("make")?.toLowerCase();
    const model = u.searchParams.get("model")?.toLowerCase();
    const year = u.searchParams.get("modelYear");
    if (make === "honda" && model === "accord" && year === "2018") body = recalls_accord_2018_default;
    else if (make === "kia" && model === "sportage" && year === "2017") body = recalls_park_outside_default;
  }
  return { ok: true, status: 200, json: async () => structuredClone(body) };
};
function fixtureAdapter() {
  return { ...nhtsaAdapter(fixtureFetcher), key: "fixture" };
}

// features/keystone/lib/cas.ts
var COLUMN = /^[a-z][A-Za-z0-9]*$/;
async function lockRow(tx, model, id) {
  const rows = await tx.$queryRawUnsafe(`SELECT id FROM ${tableName(model)} WHERE id = $1 FOR UPDATE`, id);
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, `${model} not found.`, { model, id });
  const row = await delegateOf(tx, model).findUnique({ where: { id } });
  return row;
}
async function transition(uow, spec) {
  const statusField = spec.statusField ?? "status";
  if (!COLUMN.test(statusField)) throw new Error("Invalid status field");
  const row = await lockRow(uow.tx, spec.model, spec.id);
  const currentStatus = String(row[statusField]);
  const currentVersion = Number(row.version);
  if (spec.expectedVersion !== void 0 && spec.expectedVersion !== null && spec.expectedVersion !== currentVersion) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  if (!spec.from.includes(currentStatus)) {
    throw new DomainError(Codes.INVALID_TRANSITION, `${spec.model} can't move from ${currentStatus} to ${spec.to}.`, { currentStatus, currentVersion, to: spec.to });
  }
  if (spec.guard) await spec.guard(row);
  const extra = typeof spec.data === "function" ? await spec.data(row) : spec.data ?? {};
  const result = await delegateOf(uow.tx, spec.model).updateMany({
    where: { id: spec.id, version: currentVersion, [statusField]: { in: [...spec.from] } },
    data: { ...extra, [statusField]: spec.to, version: { increment: 1 } }
  });
  if (result.count !== 1) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  uow.audit({
    eventType: spec.eventType,
    entityType: spec.model,
    entityId: spec.id,
    actorUserId: actorUserId(spec.actor),
    actorAgentId: actorAgentId(spec.actor),
    approverId: spec.approverId ?? null,
    reason: spec.reason ?? null,
    before: { [statusField]: currentStatus, version: currentVersion },
    after: { [statusField]: spec.to, version: currentVersion + 1, ...extra },
    metadata: { ...spec.metadata ?? {}, ...spec.actor.kind === "system" ? { system: spec.actor.name } : {} }
  });
  return await delegateOf(uow.tx, spec.model).findUnique({ where: { id: spec.id } });
}
function auditCreate(uow, actor, model, id, eventType, after, extra = {}) {
  uow.audit({
    eventType,
    entityType: model,
    entityId: id,
    actorUserId: actorUserId(actor),
    actorAgentId: actorAgentId(actor),
    reason: extra.reason ?? null,
    after,
    metadata: { ...extra.metadata ?? {}, ...actor.kind === "system" ? { system: actor.name } : {} }
  });
}

// lib/zonedTime.ts
var zoneParts = (timeZone, at) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
function zonedDate(timeZone, at) {
  const p = zoneParts(timeZone, typeof at === "number" ? at : at.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}
function wallClockInstant(timeZone, date2, hhmm) {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  let guess = Date.parse(`${date2}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  for (let i = 0; i < 3; i += 1) {
    const p = zoneParts(timeZone, guess);
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    const target = Date.UTC(Number(date2.slice(0, 4)), Number(date2.slice(5, 7)) - 1, Number(date2.slice(8, 10)), h, m);
    const diff = target - local;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

// features/keystone/lib/calendar.ts
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function assertDate(date2) {
  if (!DATE.test(date2) || Number.isNaN(Date.parse(`${date2}T00:00:00Z`))) throw new Error(`Invalid date ${date2}`);
}
function assertHours(hours) {
  for (const h of hours) {
    if (!Number.isInteger(h.dow) || h.dow < 0 || h.dow > 6) throw new Error(`Invalid weekday ${h.dow}`);
    if (!HHMM.test(h.open) || !HHMM.test(h.close) || h.open >= h.close) throw new Error(`Invalid hours ${h.open}-${h.close}`);
  }
  if (new Set(hours.map((h) => h.dow)).size !== hours.length) throw new Error("One opening window per weekday");
}
function addDays(date2, days) {
  assertDate(date2);
  const t = Date.parse(`${date2}T12:00:00Z`) + days * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}
var weekday = (date2) => (/* @__PURE__ */ new Date(`${date2}T12:00:00Z`)).getUTCDay();
function covered(calendar, date2) {
  if (date2 > calendar.coverageThrough) throw new Error(`${calendar.code} has no verified schedule for ${date2}`);
}
function hoursOn(calendar, date2) {
  assertDate(date2);
  covered(calendar, date2);
  if (calendar.closures.has(date2)) return null;
  const special = calendar.specialHours.get(date2);
  if (special) return special;
  const regular = calendar.weeklyHours.find((h) => h.dow === weekday(date2));
  return regular ? { open: regular.open, close: regular.close } : null;
}
function isBusinessDay(calendar, date2) {
  return hoursOn(calendar, date2) !== null;
}
function nextBusinessDay(calendar, date2) {
  let d2 = addDays(date2, 1);
  while (!isBusinessDay(calendar, d2)) d2 = addDays(d2, 1);
  return d2;
}
function localDate(calendar, at) {
  return zonedDate(calendar.timeZone, at);
}
function zonedInstant(timeZone, date2, hhmm) {
  assertDate(date2);
  return wallClockInstant(timeZone, date2, hhmm);
}
var isoDate = (d2) => typeof d2 === "string" ? d2.slice(0, 10) : d2.toISOString().slice(0, 10);
function fromRows(code, timeZone, calendar, exceptions) {
  const weeklyHours = Array.isArray(calendar.weeklyHours) ? calendar.weeklyHours : [];
  assertHours(weeklyHours);
  if (!calendar.coverageThrough) throw new Error(`${code} calendar has no coverage date`);
  const closures = /* @__PURE__ */ new Set();
  const specialHours = /* @__PURE__ */ new Map();
  for (const e of exceptions) {
    const date2 = isoDate(e.date);
    if (e.closed) closures.add(date2);
    else if (e.open && e.close) {
      assertHours([{ dow: 0, open: e.open, close: e.close }]);
      specialHours.set(date2, { open: e.open, close: e.close });
    }
  }
  return { code, timeZone, weeklyHours, closures, specialHours, coverageThrough: isoDate(calendar.coverageThrough) };
}

// features/keystone/lib/sequence.ts
var import_node_crypto4 = require("node:crypto");
async function nextReference(tx, prefix, now = /* @__PURE__ */ new Date(), width = 6) {
  if (!/^[A-Z]{2,5}$/.test(prefix)) throw new Error("Reference prefix must be 2-5 capital letters");
  const key = `${prefix}-${now.getUTCFullYear()}`;
  await advisoryLock(tx, `sequence:${key}`);
  const row = await tx.sequence.upsert({ where: { key }, create: { key, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const value = row.nextValue - 1;
  return `${key}-${String(value).padStart(width, "0")}`;
}
async function nextShopReference(tx, prefix, shopCode, now = /* @__PURE__ */ new Date(), width = 6) {
  if (!/^[A-Z]{2,5}$/.test(prefix) || !/^[A-Z]{2,5}$/.test(shopCode)) throw new Error("Reference prefix and shop code must be 2-5 capital letters");
  const key = `${prefix}-${shopCode}-${now.getUTCFullYear()}`;
  await advisoryLock(tx, `sequence:${key}`);
  const row = await tx.sequence.upsert({ where: { key }, create: { key, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  return `${key}-${String(row.nextValue - 1).padStart(width, "0")}`;
}

// features/keystone/lib/customers.ts
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeContact(kind, value) {
  const text11 = String(value ?? "").trim();
  if (kind === "email") {
    const email3 = text11.toLowerCase();
    if (!EMAIL.test(email3) || email3.length > 254) throw new DomainError(Codes.INVALID_INPUT, `${text11.slice(0, 60)} is not an email address.`, { field: "value" });
    return email3;
  }
  const digits = text11.replace(/[^\d+]/g, "");
  let e164 = "";
  if (/^\+\d{8,15}$/.test(digits)) e164 = digits;
  else if (/^\d{10}$/.test(digits)) e164 = `+1${digits}`;
  else if (/^1\d{10}$/.test(digits)) e164 = `+${digits}`;
  if (!e164) throw new DomainError(Codes.INVALID_INPUT, `${text11.slice(0, 30)} is not a phone number. Use 10 digits or +country code.`, { field: "value" });
  return e164;
}
var contactHash = (kind, normalized) => sha256(`${kind === "email" ? "email" : "phone"}:${normalized}`);
function displayNameOf(input) {
  const person = [input.firstName, input.lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return (input.kind === "business" ? input.companyName?.trim() || person : person || input.companyName?.trim()) || "Unnamed customer";
}
var maskPhone = (e164) => `\u2022\u2022\u2022-\u2022\u2022\u2022-${e164.slice(-4)}`;
var maskEmail = (email3) => `${email3[0]}\u2022\u2022\u2022@${email3.split("@")[1]}`;
var contactLabel = (kind, value) => kind === "email" ? maskEmail(value) : maskPhone(value);
async function findByContacts(tx, contacts, excludeCustomerId) {
  if (!contacts.length) return [];
  const hashes = contacts.map((c) => contactHash(c.kind, c.normalized));
  return tx.customerContact.findMany({
    where: { valueHash: { in: hashes }, status: "active", customer: { status: "active", ...excludeCustomerId ? { id: { not: excludeCustomerId } } : {} } },
    select: { customerId: true, kind: true, label: true }
  });
}
var clean = (value, max = 120) => {
  const text11 = String(value ?? "").trim();
  if (text11.length > max) throw new DomainError(Codes.INVALID_INPUT, `Keep this under ${max} characters.`);
  return text11;
};
async function upsertCustomer(uow, actor, input) {
  const { tx } = uow;
  const kind = input.kind ?? "person";
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  const companyName = clean(input.companyName, 200);
  if (kind === "person" && !firstName && !lastName) throw new DomainError(Codes.INVALID_INPUT, "Enter a first or last name.", { field: "lastName" });
  if (kind === "business" && !companyName) throw new DomainError(Codes.INVALID_INPUT, "Enter the company name.", { field: "companyName" });
  const contacts = (input.contacts ?? []).map((c) => ({ ...c, normalized: normalizeContact(c.kind, c.value) }));
  const seen = /* @__PURE__ */ new Set();
  for (const c of contacts) {
    const key = contactHash(c.kind, c.normalized);
    if (seen.has(key)) throw new DomainError(Codes.INVALID_INPUT, "The same contact is listed twice.", { field: "contacts" });
    seen.add(key);
  }
  for (const key of [...seen].sort()) await advisoryLock(tx, `contact:${key}`);
  if (!input.allowDuplicate) {
    const clash = await findByContacts(tx, contacts, input.id ?? void 0);
    if (clash.length) throw new DomainError(Codes.DUPLICATE, "A customer with this phone number or email already exists. Open that customer, or confirm this is a different person.", { existingId: clash[0].customerId, field: "contacts" });
  }
  const displayName = displayNameOf({ kind, firstName, lastName, companyName });
  const fields = {
    kind,
    firstName,
    lastName,
    companyName,
    displayName,
    homeShopId: input.homeShopId ?? null,
    preferredChannel: input.preferredChannel ?? "sms",
    notes: clean(input.notes, 4e3)
  };
  let customerId2;
  if (input.id) {
    const row = await lockRow(tx, "Customer", input.id);
    if (row.status !== "active") throw new DomainError(Codes.INVALID_TRANSITION, `This customer is ${row.status}.`, { currentStatus: row.status });
    if (input.expectedVersion !== void 0 && input.expectedVersion !== null && input.expectedVersion !== row.version) throw new DomainError(Codes.STALE_STATE, "This customer changed since you loaded it. Reload and try again.", { currentVersion: row.version });
    await tx.customer.update({ where: { id: input.id }, data: { ...fields, version: { increment: 1 } } });
    uow.audit({ eventType: "customer.updated", entityType: "Customer", entityId: input.id, actorUserId: actorUserId(actor), before: { displayName: row.displayName, homeShopId: row.homeShopId, preferredChannel: row.preferredChannel }, after: { displayName, homeShopId: fields.homeShopId, preferredChannel: fields.preferredChannel } });
    customerId2 = input.id;
  } else {
    const created = await tx.customer.create({ data: { ...input.createId ? { id: input.createId } : {}, ...fields, status: "active" } });
    auditCreate(uow, actor, "Customer", created.id, "customer.created", { displayName, kind, homeShopId: fields.homeShopId, contacts: contacts.length });
    customerId2 = created.id;
  }
  const added = [];
  for (const c of contacts) added.push(await addContactRow(uow, actor, customerId2, c));
  return { id: customerId2, displayName, contactIds: added.map((a) => a.id) };
}
async function addContactRow(uow, actor, customerId2, c) {
  const { tx } = uow;
  const valueHash = contactHash(c.kind, c.normalized);
  const existing = await tx.customerContact.findFirst({ where: { customerId: customerId2, kind: c.kind, valueHash } });
  if (existing) return existing;
  if (c.isPrimary) await tx.customerContact.updateMany({ where: { customerId: customerId2, kind: c.kind === "email" ? "email" : { in: ["mobile", "landline"] }, isPrimary: true }, data: { isPrimary: false } });
  const hasPrimary = await tx.customerContact.count({ where: { customerId: customerId2, isPrimary: true, kind: c.kind === "email" ? "email" : { in: ["mobile", "landline"] } } });
  const row = await tx.customerContact.create({
    data: { customerId: customerId2, kind: c.kind, value: c.normalized, valueHash, label: c.label?.trim() || contactLabel(c.kind, c.normalized), isPrimary: c.isPrimary ?? hasPrimary === 0, status: "active" }
  });
  auditCreate(uow, actor, "CustomerContact", row.id, "customer.contact_added", { customerId: customerId2, kind: c.kind, label: row.label });
  return row;
}
async function addContact(uow, actor, customerId2, contact, allowDuplicate = false) {
  const normalized = normalizeContact(contact.kind, contact.value);
  await advisoryLock(uow.tx, `contact:${contactHash(contact.kind, normalized)}`);
  const customer = await uow.tx.customer.findUnique({ where: { id: customerId2 }, select: { status: true } });
  if (!customer) throw new DomainError(Codes.NOT_FOUND, "Customer not found.");
  if (customer.status !== "active") throw new DomainError(Codes.INVALID_TRANSITION, `This customer is ${customer.status}.`);
  if (!allowDuplicate) {
    const clash = await findByContacts(uow.tx, [{ kind: contact.kind, normalized }], customerId2);
    if (clash.length) throw new DomainError(Codes.DUPLICATE, "Another customer already has this contact.", { existingId: clash[0].customerId, field: "value" });
  }
  return addContactRow(uow, actor, customerId2, { ...contact, normalized });
}
var CHANNEL_FOR = { mobile: ["sms", "voice"], landline: ["voice"], email: ["email"] };
async function recordConsent(uow, actor, input) {
  const { tx, now } = uow;
  const contact = await tx.customerContact.findUnique({ where: { id: input.contactId }, select: { id: true, kind: true, customerId: true } });
  if (!contact) throw new DomainError(Codes.NOT_FOUND, "Contact not found.");
  if (!CHANNEL_FOR[contact.kind].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, `A ${contact.kind} contact can't take ${input.channel} consent.`, { field: "channel" });
  if (!["transactional", "marketing", "all"].includes(input.purpose) || !["granted", "revoked"].includes(input.action)) throw new DomainError(Codes.INVALID_INPUT, "Choose a purpose and whether consent was granted or revoked.");
  const marketing = input.purpose === "marketing" || input.purpose === "all";
  if (input.action === "granted" && marketing && input.channel !== "email" && !input.writtenConsent) {
    throw new DomainError(Codes.CONSENT_BLOCKED, "Marketing texts and calls need written consent (a signed form or a web form with the consent wording). Record how it was given.", { field: "writtenConsent" });
  }
  if (input.method === "classifier_review" && input.action === "granted") throw new DomainError(Codes.CONSENT_BLOCKED, "Consent can be revoked from a message, but never granted by a classifier.");
  const previous = await tx.contactConsent.findFirst({ where: { contactId: contact.id }, orderBy: { at: "desc" }, select: { at: true } });
  const at = previous?.at && previous.at.getTime() >= now.getTime() ? new Date(previous.at.getTime() + 1) : now;
  const row = await tx.contactConsent.create({
    data: {
      contactId: contact.id,
      channel: input.channel,
      purpose: input.purpose,
      action: input.action,
      method: input.method,
      writtenConsent: input.writtenConsent ?? false,
      evidence: { ...input.evidence ?? {}, recordedBy: actorUserId(actor) },
      recordedById: actorUserId(actor),
      at
    }
  });
  auditCreate(uow, actor, "ContactConsent", row.id, `consent.${input.action}`, { contactId: contact.id, customerId: contact.customerId, channel: input.channel, purpose: input.purpose, method: input.method });
  return { id: row.id };
}
async function createBusinessAccount(uow, actor, input) {
  const name = clean(input.name, 200);
  if (!name) throw new DomainError(Codes.INVALID_INPUT, "Enter the account name.", { field: "name" });
  const termsDays = input.termsDays ?? 0;
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 120) throw new DomainError(Codes.INVALID_INPUT, "Terms must be 0 to 120 days.", { field: "termsDays" });
  const accountNumber = await nextReference(uow.tx, "ACCT", uow.now, 5);
  const row = await uow.tx.businessAccount.create({ data: { ...input.createId ? { id: input.createId } : {}, name, accountNumber, termsDays, poRequired: input.poRequired ?? false, creditLimitMinor: input.creditLimitMinor ?? 0n, billingMode: input.billingMode ?? "per_invoice", status: "active" } });
  auditCreate(uow, actor, "BusinessAccount", row.id, "business_account.created", { name, accountNumber, termsDays });
  return { id: row.id, accountNumber };
}

// features/keystone/lib/scheduling.ts
var import_node_crypto5 = require("node:crypto");
var HOLD_TTL_MINUTES = 10;
var ACTIVE = ["requested", "confirmed", "arrived"];
async function loadShopCalendar(tx, shopId) {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, code: true, timeZone: true, status: true, calendarId: true } });
  if (!shop) throw new DomainError(Codes.NOT_FOUND, "Shop not found.");
  if (shop.status !== "active") throw new DomainError(Codes.INVALID_TRANSITION, `${shop.code} is ${shop.status} and takes no bookings.`);
  if (!shop.calendarId) throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} has no opening hours yet. Set them under Shops.`);
  const row = await tx.shopCalendar.findUniqueOrThrow({ where: { id: shop.calendarId } });
  const exceptions = await tx.shopCalendarException.findMany({ where: { calendarId: row.id } });
  return { shop, calendar: fromRows(shop.code, shop.timeZone, row, exceptions) };
}
var dow = (date2) => (/* @__PURE__ */ new Date(`${date2}T12:00:00Z`)).getUTCDay();
var HHMM2 = /^([01]\d|2[0-3]):[0-5]\d$/;
async function capacityRules(tx, shopId, date2) {
  const found = await tx.bookingRule.findMany({ where: { shopId, active: true }, orderBy: { createdAt: "asc" } });
  const daySpecific = (r) => Array.isArray(r.appliesToDays) && r.appliesToDays.length ? 1 : 0;
  const rows = [...found].sort((a, b) => daySpecific(a) - daySpecific(b));
  const rules2 = { maxDropoffsPerDay: null, waiterSlotsPerHour: null, maxBayCentiHoursPerDay: null, noWaitersAfter: null, leadTimeHours: 0, slotMinutes: 30 };
  for (const r of rows) {
    const days = Array.isArray(r.appliesToDays) ? r.appliesToDays : [];
    if (days.length && !days.includes(dow(date2))) continue;
    const n = typeof r.value === "number" ? r.value : /^\d+$/.test(String(r.value)) ? Number.parseInt(String(r.value), 10) : Number.NaN;
    switch (r.kind) {
      case "max_dropoffs_per_day":
        if (Number.isInteger(n) && n >= 0) rules2.maxDropoffsPerDay = n;
        break;
      case "waiter_slots_per_hour":
        if (Number.isInteger(n) && n >= 0) rules2.waiterSlotsPerHour = n;
        break;
      case "max_bay_hours_per_day":
        if (Number.isInteger(n) && n >= 0) rules2.maxBayCentiHoursPerDay = n;
        break;
      case "no_waiters_after":
        if (typeof r.value === "string" && HHMM2.test(r.value)) rules2.noWaitersAfter = r.value;
        break;
      case "lead_time_hours":
        if (Number.isInteger(n) && n >= 0) rules2.leadTimeHours = n;
        break;
      case "slot_minutes":
        if ([10, 15, 20, 30, 60].includes(n)) rules2.slotMinutes = n;
        break;
    }
  }
  return rules2;
}
var localHHMM = (calendar, at) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: calendar.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
};
async function placeSlot(tx, request, now) {
  const { shop, calendar } = await loadShopCalendar(tx, request.shopId);
  if (!Number.isInteger(request.estimatedCentiHours) || request.estimatedCentiHours < 0 || request.estimatedCentiHours > 4e3) throw new DomainError(Codes.INVALID_INPUT, "Estimated time must be 0 to 40 hours.", { field: "estimatedCentiHours" });
  if (Number.isNaN(request.startsAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, "Choose a date and time.", { field: "startsAt" });
  const date2 = localDate(calendar, request.startsAt);
  let hours;
  try {
    hours = hoursOn(calendar, date2);
  } catch (error) {
    throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} has no confirmed hours for ${date2} yet. Extend the calendar under Shops.`, { reason: error.message });
  }
  if (!hours) throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} is closed on ${date2}.`);
  const opensAt = zonedInstant(calendar.timeZone, date2, hours.open);
  const closesAt = zonedInstant(calendar.timeZone, date2, hours.close);
  const t = request.startsAt.getTime();
  if (t < opensAt.getTime() || t >= closesAt.getTime()) throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} is open ${hours.open}-${hours.close} on ${date2}.`);
  const rules2 = await capacityRules(tx, shop.id, date2);
  if ((t - opensAt.getTime()) % (rules2.slotMinutes * 6e4) !== 0) throw new DomainError(Codes.INVALID_INPUT, `Appointments start on ${rules2.slotMinutes}-minute slots from opening (${hours.open}).`, { field: "startsAt" });
  if (t < now.getTime() - 5 * 6e4) throw new DomainError(Codes.INVALID_INPUT, "That time has passed.", { field: "startsAt" });
  if (request.source !== "staff" && t < now.getTime() + rules2.leadTimeHours * 36e5) throw new DomainError(Codes.CAPACITY_FULL, `Online and phone bookings need ${rules2.leadTimeHours} hours' notice. Call the shop for something sooner.`);
  if (request.kind === "waiter" && rules2.noWaitersAfter && localHHMM(calendar, request.startsAt) >= rules2.noWaitersAfter) throw new DomainError(Codes.CAPACITY_FULL, `Waiter appointments start before ${rules2.noWaitersAfter}. Book a drop-off instead.`);
  const hourStart = zonedInstant(calendar.timeZone, date2, `${localHHMM(calendar, request.startsAt).slice(0, 2)}:00`);
  return { shop, calendar, date: date2, hours, opensAt, closesAt, rules: rules2, hourStart, hourEnd: new Date(hourStart.getTime() + 36e5) };
}
var dateOnly = (date2) => /* @__PURE__ */ new Date(`${date2}T00:00:00Z`);
async function usage(tx, shopId, date2, now, exclude = {}) {
  const day2 = dateOnly(date2);
  const appointments = await tx.appointment.findMany({
    where: { shopId, date: day2, status: { in: ACTIVE }, ...exclude.appointmentId ? { id: { not: exclude.appointmentId } } : {} },
    select: { id: true, kind: true, startsAt: true, estimatedCentiHours: true }
  });
  const holds = await tx.bookingHold.findMany({
    where: { shopId, date: day2, status: "held", expiresAt: { gt: now }, ...exclude.holdId ? { id: { not: exclude.holdId } } : {} },
    select: { id: true, kind: true, slotStart: true, bayCentiHours: true }
  });
  return [
    ...appointments.map((a) => ({ kind: a.kind, at: a.startsAt, centiHours: a.estimatedCentiHours ?? 0 })),
    ...holds.map((h) => ({ kind: h.kind, at: h.slotStart, centiHours: h.bayCentiHours ?? 0 }))
  ];
}
async function assertCapacity(tx, request, now, exclude = {}) {
  const slot = await placeSlot(tx, request, now);
  const used = await usage(tx, slot.shop.id, slot.date, now, exclude);
  const { rules: rules2 } = slot;
  if (request.kind === "drop_off" && rules2.maxDropoffsPerDay !== null) {
    const count = used.filter((u) => u.kind === "drop_off").length;
    if (count >= rules2.maxDropoffsPerDay) throw new DomainError(Codes.CAPACITY_FULL, `${slot.date} is full for drop-offs (${rules2.maxDropoffsPerDay} a day). Choose another day.`);
  }
  if (request.kind === "waiter" && rules2.waiterSlotsPerHour !== null) {
    const count = used.filter((u) => u.kind === "waiter" && u.at >= slot.hourStart && u.at < slot.hourEnd).length;
    if (count >= rules2.waiterSlotsPerHour) throw new DomainError(Codes.CAPACITY_FULL, `The waiter slots for that hour are taken (${rules2.waiterSlotsPerHour} an hour). Choose another time.`);
  }
  if (rules2.maxBayCentiHoursPerDay !== null) {
    const total = used.reduce((sum, u) => sum + u.centiHours, 0) + request.estimatedCentiHours;
    if (total > rules2.maxBayCentiHoursPerDay) throw new DomainError(Codes.CAPACITY_FULL, `${slot.date} has no bay time left for a ${request.estimatedCentiHours / 100} h job. Choose another day.`);
  }
  return slot;
}
var capacityKey = (shopId, date2) => `capacity:${shopId}:${date2}`;
async function lockCapacity(uow, shopId, startsAt) {
  const { calendar } = await loadShopCalendar(uow.tx, shopId);
  const date2 = localDate(calendar, startsAt);
  await advisoryLock(uow.tx, capacityKey(shopId, date2));
  return date2;
}
async function placeHold(uow, actor, request) {
  await lockCapacity(uow, request.shopId, request.startsAt);
  const slot = await assertCapacity(uow.tx, request, uow.now);
  const token = (0, import_node_crypto5.randomBytes)(24).toString("base64url");
  const expiresAt = new Date(uow.now.getTime() + HOLD_TTL_MINUTES * 6e4);
  const row = await uow.tx.bookingHold.create({
    data: { shopId: request.shopId, date: dateOnly(slot.date), slotStart: request.startsAt, kind: request.kind === "waiter" ? "waiter" : "drop_off", bayCentiHours: request.estimatedCentiHours, tokenHash: sha256(token), source: request.source === "import" ? "staff" : request.source, expiresAt, status: "held" }
  });
  auditCreate(uow, actor, "BookingHold", row.id, "booking.hold_placed", { shopId: request.shopId, date: slot.date, kind: request.kind, expiresAt });
  return { holdId: row.id, token, expiresAt };
}
async function bookAppointment(uow, actor, input) {
  const { tx, now } = uow;
  if (!input.customerId && !input.lead?.name?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Choose the customer, or enter a name and phone number for a new one.", { field: "customerId" });
  if (input.vehicleId && input.customerId) {
    const owned = await tx.vehicleOwnership.count({ where: { vehicleId: input.vehicleId, customerId: input.customerId, endedAt: null } });
    if (!owned) throw new DomainError(Codes.INVALID_INPUT, "This vehicle isn't linked to this customer. Link it first.", { field: "vehicleId" });
  }
  const concernText = (input.concernText ?? "").trim().slice(0, 2e3) || null;
  const request = { shopId: input.shopId, startsAt: input.startsAt, kind: input.kind, estimatedCentiHours: input.estimatedCentiHours ?? 100, source: input.source };
  await lockCapacity(uow, input.shopId, input.startsAt);
  let hold = null;
  if (input.holdToken) {
    const found = await tx.bookingHold.findUnique({ where: { tokenHash: sha256(input.holdToken) } });
    if (!found || found.shopId !== input.shopId) throw new DomainError(Codes.HOLD_EXPIRED, "That slot hold was not found. Choose the time again.");
    if (found.status !== "held" || found.expiresAt <= now) throw new DomainError(Codes.HOLD_EXPIRED, "The slot hold expired. Choose the time again.");
    if (found.slotStart.getTime() !== input.startsAt.getTime()) throw new DomainError(Codes.HOLD_EXPIRED, "The hold is for a different time. Choose the time again.");
    hold = found;
  }
  const slot = await assertCapacity(tx, request, now, hold ? { holdId: hold.id } : {});
  const reference = await nextShopReference(tx, "APT", slot.shop.code, now);
  const endsAt = new Date(input.startsAt.getTime() + Math.max(30, Math.ceil(request.estimatedCentiHours * 60 / 100)) * 6e4);
  const status = input.confirm ? "confirmed" : "requested";
  const row = await tx.appointment.create({
    data: {
      shopId: input.shopId,
      reference,
      customerId: input.customerId ?? null,
      vehicleId: input.vehicleId ?? null,
      lead: input.lead ? { name: input.lead.name.trim().slice(0, 120), phone: input.lead.phone?.trim().slice(0, 30) ?? null, vehicle: input.lead.vehicle?.trim().slice(0, 120) ?? null } : void 0,
      date: dateOnly(slot.date),
      startsAt: input.startsAt,
      endsAt,
      kind: input.kind,
      requestedServices: (input.requestedServices ?? []).slice(0, 20),
      concernText: concernText ?? "",
      estimatedCentiHours: request.estimatedCentiHours,
      source: input.source,
      status,
      bayId: input.bayId ?? null
    }
  });
  if (hold) await tx.bookingHold.update({ where: { id: hold.id }, data: { status: "consumed", appointmentId: row.id } });
  auditCreate(uow, actor, "Appointment", row.id, "appointment.requested", { reference, shopId: input.shopId, startsAt: input.startsAt, kind: input.kind, source: input.source, status, holdId: hold?.id ?? null });
  uow.emit({ topic: "appointment.requested", aggregateType: "Appointment", aggregateId: row.id, payload: { reference, shopId: input.shopId, startsAt: input.startsAt.toISOString(), status }, dedupeKey: `appointment.requested:${row.id}` });
  if (status === "confirmed") emitConfirmation(uow, row.id, reference);
  return { id: row.id, reference, status, date: slot.date };
}
function emitConfirmation(uow, appointmentId, reference) {
  uow.emit({ topic: "message.appointment_confirmation", aggregateType: "Appointment", aggregateId: appointmentId, payload: { reference, purpose: "transactional" }, dedupeKey: `appointment.confirmed:${appointmentId}` });
}
async function confirmAppointment(uow, actor, id, expectedVersion) {
  const row = await transition(uow, {
    model: "Appointment",
    id,
    from: ["requested"],
    to: "confirmed",
    expectedVersion,
    actor,
    eventType: "appointment.confirmed",
    guard: (r) => {
      if (!r.customerId) throw new DomainError(Codes.GUARD_FAILED, "Add the customer to the appointment before confirming it.");
    }
  });
  emitConfirmation(uow, id, row.reference);
  return { id, status: "confirmed" };
}
async function rescheduleAppointment(uow, actor, input) {
  const { tx, now } = uow;
  const current = await tx.appointment.findUnique({ where: { id: input.id }, select: { shopId: true, startsAt: true } });
  if (!current) throw new DomainError(Codes.NOT_FOUND, "Appointment not found.");
  const { calendar } = await loadShopCalendar(tx, current.shopId);
  const dates = [.../* @__PURE__ */ new Set([localDate(calendar, current.startsAt), localDate(calendar, input.startsAt)])].sort();
  for (const date2 of dates) await advisoryLock(tx, capacityKey(current.shopId, date2));
  const row = await lockRow(tx, "Appointment", input.id);
  if (!["requested", "confirmed"].includes(row.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A ${row.status} appointment can't be moved.`, { currentStatus: row.status });
  if (input.expectedVersion !== void 0 && input.expectedVersion !== null && row.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, "This appointment changed since you loaded it. Reload and try again.", { currentVersion: row.version });
  const kind = input.kind ?? row.kind;
  const slot = await assertCapacity(tx, { shopId: row.shopId, startsAt: input.startsAt, kind, estimatedCentiHours: row.estimatedCentiHours ?? 0, source: "staff" }, now, { appointmentId: row.id });
  const endsAt = new Date(input.startsAt.getTime() + (row.endsAt.getTime() - row.startsAt.getTime()));
  await tx.appointment.update({ where: { id: row.id }, data: { startsAt: input.startsAt, endsAt, date: dateOnly(slot.date), kind, version: { increment: 1 } } });
  uow.audit({ eventType: "appointment.rescheduled", entityType: "Appointment", entityId: row.id, actorUserId: actorUserId(actor), before: { startsAt: row.startsAt, kind: row.kind }, after: { startsAt: input.startsAt, kind } });
  uow.emit({ topic: "message.appointment_rescheduled", aggregateType: "Appointment", aggregateId: row.id, payload: { reference: row.reference, startsAt: input.startsAt.toISOString(), purpose: "transactional" }, dedupeKey: `appointment.rescheduled:${row.id}:${row.version + 1}` });
  return { id: row.id, date: slot.date };
}
async function cancelAppointment(uow, actor, input) {
  const reason = input.reason?.trim();
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, "Say why the appointment is cancelled.", { field: "reason" });
  const row = await transition(uow, { model: "Appointment", id: input.id, from: ["requested", "confirmed"], to: "cancelled", expectedVersion: input.expectedVersion, actor, eventType: "appointment.cancelled", reason, data: { cancelReason: reason.slice(0, 300) } });
  uow.emit({ topic: "appointment.cancelled", aggregateType: "Appointment", aggregateId: input.id, payload: { reference: row.reference }, dedupeKey: `appointment.cancelled:${input.id}` });
  return { id: input.id, status: "cancelled" };
}
async function graceMinutes(tx, shopId) {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { shopPolicyId: true } });
  const policy = shop?.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId }, select: { noShowGraceMinutes: true } }) : null;
  return policy?.noShowGraceMinutes ?? 30;
}
async function markNoShow(uow, actor, input) {
  const { tx, now } = uow;
  const current = await tx.appointment.findUnique({ where: { id: input.id }, select: { shopId: true } });
  if (!current) throw new DomainError(Codes.NOT_FOUND, "Appointment not found.");
  const grace = await graceMinutes(tx, current.shopId);
  const row = await transition(uow, {
    model: "Appointment",
    id: input.id,
    from: ["requested", "confirmed"],
    to: "no_show",
    expectedVersion: input.expectedVersion,
    actor,
    eventType: "appointment.no_show",
    guard: (r) => {
      const due = r.startsAt.getTime() + grace * 6e4;
      if (now.getTime() < due) throw new DomainError(Codes.GUARD_FAILED, `Wait until ${grace} minutes after the start time before marking a no-show.`);
    }
  });
  if (row.customerId) await tx.customer.update({ where: { id: row.customerId }, data: { noShowCount: { increment: 1 } } });
  return { id: input.id, status: "no_show" };
}

// features/keystone/lib/vehicles.ts
var text10 = (value, max = 80) => {
  const t = String(value ?? "").trim();
  if (t.length > max) throw new DomainError(Codes.INVALID_INPUT, `Keep this under ${max} characters.`);
  return t;
};
var PLATE = /^[A-Z0-9 -]{1,10}$/;
var STATE = /^[A-Z]{2}$/;
async function upsertVehicle(uow, actor, input) {
  const { tx, now } = uow;
  const rawVin = text10(input.vin, 40);
  const vin2 = rawVin ? normalizeVin(rawVin) : null;
  const check = checkVin(vin2);
  if (vin2 && check.validity === "invalid_format") throw new DomainError(Codes.INVALID_INPUT, check.message, { field: "vin" });
  const noVinReason = vin2 ? "" : text10(input.noVinReason, 200);
  if (!vin2 && !noVinReason && !input.id) throw new DomainError(Codes.INVALID_INPUT, "Enter the VIN, or say why there is none (e.g. a trailer or a pre-1981 vehicle).", { field: "vin" });
  const year = input.year ?? null;
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > now.getUTCFullYear() + 2)) throw new DomainError(Codes.INVALID_INPUT, "Enter a model year such as 2018.", { field: "year" });
  const fields = { year, make: text10(input.make), model: text10(input.model), trim: text10(input.trim), engine: text10(input.engine, 120), color: text10(input.color, 40) };
  let id;
  let existing = false;
  if (vin2) await advisoryLock(tx, `vin:${vin2}`);
  if (input.id) {
    const row = await lockRow(tx, "Vehicle", input.id);
    if (input.expectedVersion !== void 0 && input.expectedVersion !== null && row.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, "This vehicle changed since you loaded it. Reload and try again.", { currentVersion: row.version });
    if (vin2 && vin2 !== row.vin) {
      const other = await tx.vehicle.findFirst({ where: { vin: vin2, status: "active", id: { not: input.id } }, select: { id: true } });
      if (other) throw new DomainError(Codes.DUPLICATE, "Another vehicle already has this VIN. Merge them instead.", { existingId: other.id, field: "vin" });
    }
    const data = { ...fields, ...vin2 ? { vin: vin2, vinValid: check.validity } : {}, version: { increment: 1 } };
    await tx.vehicle.update({ where: { id: input.id }, data });
    uow.audit({ eventType: "vehicle.updated", entityType: "Vehicle", entityId: input.id, actorUserId: actorUserId(actor), before: { vin: row.vin, year: row.year, make: row.make, model: row.model }, after: { vin: vin2 ?? row.vin, ...fields } });
    id = input.id;
  } else {
    const found = vin2 ? await tx.vehicle.findFirst({ where: { vin: vin2, status: "active" }, select: { id: true } }) : null;
    if (found) {
      id = found.id;
      existing = true;
    } else {
      const row = await tx.vehicle.create({ data: { ...input.createId ? { id: input.createId } : {}, ...fields, vin: vin2 ?? "", vinValid: check.validity, noVinReason, status: "active" } });
      auditCreate(uow, actor, "Vehicle", row.id, "vehicle.created", { vin: vin2, vinValid: check.validity, ...fields });
      id = row.id;
    }
  }
  if (input.customerId || input.businessAccountId) await linkOwner(uow, actor, id, { customerId: input.customerId ?? null, businessAccountId: input.businessAccountId ?? null });
  if (input.plate?.plate) await recordPlate(uow, actor, id, input.plate);
  return { id, existing, vinCheck: check };
}
async function linkOwner(uow, actor, vehicleId2, owner) {
  const { tx, now } = uow;
  if (!owner.customerId && !owner.businessAccountId) throw new DomainError(Codes.INVALID_INPUT, "Choose a customer or an account.");
  const today = now.toISOString().slice(0, 10);
  const current = await tx.vehicleOwnership.findMany({ where: { vehicleId: vehicleId2, role: "owner", endedAt: null } });
  const same = current.find((o) => o.customerId === owner.customerId && o.businessAccountId === owner.businessAccountId);
  if (same) return { id: same.id, changed: false };
  for (const o of current) await tx.vehicleOwnership.update({ where: { id: o.id }, data: { endedAt: /* @__PURE__ */ new Date(`${today}T00:00:00Z`) } });
  const row = await tx.vehicleOwnership.create({ data: { vehicleId: vehicleId2, customerId: owner.customerId, businessAccountId: owner.businessAccountId, role: "owner", startedAt: /* @__PURE__ */ new Date(`${today}T00:00:00Z`) } });
  auditCreate(uow, actor, "VehicleOwnership", row.id, "vehicle.owner_linked", { vehicleId: vehicleId2, ...owner, endedPrevious: current.map((o) => o.id) });
  return { id: row.id, changed: true };
}
async function recordPlate(uow, actor, vehicleId2, input) {
  const plate = String(input.plate ?? "").trim().toUpperCase();
  const state = String(input.state ?? "").trim().toUpperCase();
  if (!PLATE.test(plate)) throw new DomainError(Codes.INVALID_INPUT, "Plates are up to 10 letters and digits.", { field: "plate" });
  if (!STATE.test(state)) throw new DomainError(Codes.INVALID_INPUT, "Use the two-letter state code, e.g. CA.", { field: "state" });
  const { tx, now } = uow;
  const existing = await tx.plateRegistration.findFirst({ where: { vehicleId: vehicleId2, plate, state } });
  if (existing) {
    await tx.plateRegistration.update({ where: { id: existing.id }, data: { lastSeenAt: now, active: true } });
    return { id: existing.id };
  }
  await tx.plateRegistration.updateMany({ where: { vehicleId: vehicleId2, active: true }, data: { active: false } });
  const row = await tx.plateRegistration.create({ data: { vehicleId: vehicleId2, plate, state, firstSeenAt: now, lastSeenAt: now, active: true } });
  auditCreate(uow, actor, "PlateRegistration", row.id, "vehicle.plate_recorded", { vehicleId: vehicleId2, plate, state });
  return { id: row.id };
}
var JUMP = 15e4;
async function recordOdometer(uow, actor, input) {
  const { tx, now } = uow;
  if (!Number.isInteger(input.value) || input.value < 0 || input.value > 2e6) throw new DomainError(Codes.INVALID_INPUT, "Enter the odometer as a whole number.", { field: "odometer" });
  const vehicle = await lockRow(tx, "Vehicle", input.vehicleId);
  const unit = input.unit ?? vehicle.lastOdometerUnit ?? "mi";
  const previous = vehicle.lastOdometer;
  const comparable = previous !== null && unit === vehicle.lastOdometerUnit;
  let anomaly = "none";
  const reason = text10(input.overrideReason, 300);
  if (comparable && input.value < previous) {
    if (!reason) throw new DomainError(Codes.ODOMETER_REGRESSION, `The odometer reads lower than last time (${previous.toLocaleString("en-US")} ${unit}). Check it, or give a reason (cluster replaced, unit mix-up).`, { previous, field: "odometer" });
    anomaly = "lower_than_previous";
  } else if (comparable && input.value - previous > JUMP) anomaly = "jump";
  const row = await tx.odometerReading.create({
    data: { vehicleId: input.vehicleId, value: input.value, unit, source: input.source, checkInId: input.checkInId ?? null, recordedById: actorUserId(actor), at: now, accepted: true, anomaly, overrideReason: reason }
  });
  await tx.vehicle.update({ where: { id: input.vehicleId }, data: { lastOdometer: input.value, lastOdometerUnit: unit, version: { increment: 1 } } });
  auditCreate(uow, actor, "OdometerReading", row.id, "vehicle.odometer_recorded", { vehicleId: input.vehicleId, value: input.value, unit, previous, anomaly }, { reason });
  return { id: row.id, anomaly, previous };
}
async function storeDecode(uow, actor, vehicleId2, v, observedAt, fixture) {
  const { tx } = uow;
  const vehicle = await lockRow(tx, "Vehicle", vehicleId2);
  const errorCodes = v.errorCode.split(",").map((c) => c.trim()).filter(Boolean);
  const { raw: _raw, ...kept } = v;
  const row = await tx.vehicleDecode.create({
    data: {
      vehicleId: vehicleId2,
      provider: fixture ? "fixture" : "nhtsa_vpic",
      requestedVin: v.vin,
      decoded: toJsonValue(kept),
      errorCode: v.errorCode ?? "",
      errorText: v.errorText?.slice(0, 2e3) ?? "",
      fetchedAt: observedAt,
      fetchedById: actorUserId(actor)
    }
  });
  const fill = {};
  const set = (field, value) => {
    if ((vehicle[field] === null || vehicle[field] === "") && value !== null && value !== void 0 && value !== "") fill[field] = value;
  };
  if (!decodeHasErrors(v.errorCode) || errorCodes.every((c) => c === "0" || c === "1")) {
    const engine = [v.engine?.displacementL ? `${v.engine.displacementL}L` : null, v.engine?.cylinders ? `${v.engine.cylinders}-cyl` : null, v.engine?.model].filter(Boolean).join(" ");
    set("year", v.year);
    set("make", v.make);
    set("model", v.model);
    set("trim", v.trim);
    set("engine", engine || null);
    set("drivetrain", v.driveType);
    set("transmission", v.transmissionStyle);
    set("fuelType", v.fuelTypePrimary);
    set("bodyClass", v.bodyClass);
  }
  await tx.vehicle.update({ where: { id: vehicleId2 }, data: { ...fill, currentDecodeId: row.id, version: { increment: 1 } } });
  auditCreate(uow, actor, "VehicleDecode", row.id, "vehicle.decoded", { vehicleId: vehicleId2, provider: row.provider, errorCode: v.errorCode, filled: Object.keys(fill) });
  return { id: row.id, filled: Object.keys(fill), errorCode: v.errorCode };
}
async function storeRecallCheck(uow, actor, vehicleId2, query, campaigns, observedAt, fixture) {
  const parkItAny = campaigns.some((c) => c.parkIt || c.parkOutSide);
  const row = await uow.tx.recallCheck.create({
    data: {
      vehicleId: vehicleId2,
      source: fixture ? "fixture" : "nhtsa_make_model_year",
      query,
      campaigns: toJsonValue(campaigns),
      campaignCount: campaigns.length,
      parkItAny,
      checkedAt: observedAt,
      checkedById: actorUserId(actor)
    }
  });
  auditCreate(uow, actor, "RecallCheck", row.id, "vehicle.recalls_checked", { vehicleId: vehicleId2, campaignCount: campaigns.length, parkItAny, source: row.source });
  return { id: row.id, campaignCount: campaigns.length, parkItAny };
}
async function vehicleForLookup(tx, vehicleId2) {
  const v = await tx.vehicle.findUnique({ where: { id: vehicleId2 }, select: { id: true, vin: true, year: true, make: true, model: true, status: true } });
  if (!v) throw new DomainError(Codes.NOT_FOUND, "Vehicle not found.");
  return v;
}

// features/keystone/seed/customers.ts
var vin = (prefix, yearCode, plant, serial) => withCheckDigit(`${prefix}0${yearCode}${plant}${String(serial).padStart(6, "0")}`);
var V = {
  accord18: (n, extra = {}) => ({ vin: n === 1 ? FIXTURE_VINS.clean : vin("1HGCV1F3", "J", "A", 100 + n), year: 2018, make: "Honda", model: "Accord", trim: "LX", odometer: 61200 + n * 731, ...extra }),
  camry16: (n) => ({ vin: vin("4T1BF1FK", "G", "U", 200 + n), year: 2016, make: "Toyota", model: "Camry", trim: "SE", odometer: 98400 + n * 913 }),
  f150_19: (n) => ({ vin: vin("1FTEW1E5", "K", "F", 300 + n), year: 2019, make: "Ford", model: "F-150", trim: "XLT", odometer: 74050 + n * 1207 }),
  model3_20: (n) => ({ vin: vin("5YJ3E1EA", "L", "F", 400 + n), year: 2020, make: "Tesla", model: "Model 3", trim: "Standard Range Plus", odometer: 41900 + n * 517 }),
  bmw328_14: (n) => ({ vin: vin("WBA3A5C5", "E", "J", 500 + n), year: 2014, make: "BMW", model: "328i", odometer: 121300 + n * 640 }),
  sienna12: (n) => ({ vin: vin("5TDKK3DC", "C", "S", 600 + n), year: 2012, make: "Toyota", model: "Sienna", trim: "LE", odometer: 156700 + n * 388 }),
  sportage17: (n) => ({ vin: vin("KNDPM3AC", "H", "7", 700 + n), year: 2017, make: "Kia", model: "Sportage", trim: "LX", odometer: 88900 + n * 455 }),
  civic21: (n) => ({ vin: vin("2HGFC2F5", "M", "H", 800 + n), year: 2021, make: "Honda", model: "Civic", trim: "Sport", odometer: 33100 + n * 702 }),
  rav4_19: (n) => ({ vin: vin("2T3P1RFV", "K", "W", 900 + n), year: 2019, make: "Toyota", model: "RAV4", trim: "XLE", odometer: 58300 + n * 377 }),
  silverado15: (n) => ({ vin: vin("3GCUKREC", "F", "G", 1e3 + n), year: 2015, make: "Chevrolet", model: "Silverado 1500", trim: "LT", odometer: 142800 + n * 991 }),
  outback18: (n) => ({ vin: vin("4S4BSANC", "J", "3", 1100 + n), year: 2018, make: "Subaru", model: "Outback", trim: "2.5i Premium", odometer: 79500 + n * 288 }),
  a4_17: (n) => ({ vin: vin("WAUENAF4", "H", "N", 1200 + n), year: 2017, make: "Audi", model: "A4", trim: "Premium", odometer: 87600 + n * 503 }),
  odyssey20: (n) => ({ vin: vin("5FNRL6H7", "L", "B", 1300 + n), year: 2020, make: "Honda", model: "Odyssey", trim: "EX-L", odometer: 52700 + n * 619 }),
  wrangler16: (n) => ({ vin: vin("1C4BJWDG", "G", "L", 1400 + n), year: 2016, make: "Jeep", model: "Wrangler Unlimited", trim: "Sahara", odometer: 104200 + n * 822 }),
  prius13: (n) => ({ vin: vin("JTDKN3DU", "D", "5", 1500 + n), year: 2013, make: "Toyota", model: "Prius", trim: "Two", odometer: 187400 + n * 260 })
};
var CUSTOMERS = [
  { first: "Maria", last: "Gonzalez", shop: "nga", consent: "marketing", vehicles: [V.accord18(1, { color: "Lunar Silver", plate: "8ABC123" })], notes: "Prefers texts. Usually waits for oil changes." },
  { first: "James", last: "Whitaker", shop: "nga", consent: "transactional", vehicles: [V.camry16(1)] },
  { first: "Linda", last: "Nguyen", shop: "nga", consent: "stopped", email: true, vehicles: [V.sienna12(1)], notes: "Replied STOP to texts. Email only." },
  { first: "Robert", last: "Okafor", shop: "nga", consent: "transactional", vehicles: [V.f150_19(1), V.camry16(2)] },
  { first: "Patricia", last: "Lindqvist", shop: "nga", consent: "marketing", vehicles: [V.bmw328_14(1)] },
  { first: "Michael", last: "Brennan", shop: "nga", consent: "transactional", vehicles: [V.model3_20(1)] },
  { first: "Jennifer", last: "Castillo", shop: "nga", consent: "transactional", vehicles: [V.sportage17(1)], notes: "Kia Sportage: open recall with a park-outside warning." },
  { first: "David", last: "Kowalski", shop: "nga", consent: "none", vehicles: [V.silverado15(1)] },
  { first: "Elizabeth", last: "Moreno", shop: "nga", consent: "marketing", vehicles: [V.rav4_19(1)] },
  { first: "William", last: "Tanaka", shop: "nga", consent: "transactional", vehicles: [V.a4_17(1)] },
  { first: "Barbara", last: "Fitzgerald", shop: "nga", consent: "email_only", email: true, vehicles: [V.outback18(1)] },
  { first: "Richard", last: "Haddad", shop: "nga", consent: "transactional", vehicles: [V.wrangler16(1)] },
  { first: "Susan", last: "Abernathy", shop: "nga", consent: "transactional", vehicles: [V.odyssey20(1)] },
  { first: "Joseph", last: "Delacroix", shop: "nga", consent: "marketing", vehicles: [V.prius13(1)] },
  { first: "Jessica", last: "Romero", shop: "nga", consent: "transactional", vehicles: [V.civic21(1)] },
  { first: "Thomas", last: "Sorensen", shop: "nga", consent: "transactional", vehicles: [V.accord18(2)] },
  { first: "Sarah", last: "Mbeki", shop: "nga", consent: "transactional", vehicles: [V.camry16(3)] },
  { first: "Charles", last: "Ferreira", shop: "nga", consent: "none", vehicles: [V.f150_19(2)] },
  { first: "Karen", last: "Iwasaki", shop: "nga", consent: "marketing", vehicles: [V.bmw328_14(2)] },
  { first: "Christopher", last: "Novak", shop: "nga", consent: "transactional", vehicles: [V.model3_20(2)] },
  { first: "Nancy", last: "Barrios", shop: "nga", consent: "transactional", vehicles: [V.sienna12(2)] },
  { first: "Daniel", last: "Achterberg", shop: "nga", consent: "transactional", vehicles: [V.a4_17(2)] },
  { first: "Lisa", last: "Petrosyan", shop: "nga", consent: "email_only", email: true, vehicles: [V.rav4_19(2)] },
  { first: "Matthew", last: "Oyelaran", shop: "nga", consent: "transactional", vehicles: [V.outback18(2)] },
  { first: "Betty", last: "Villanueva", shop: "nga", consent: "transactional", vehicles: [V.prius13(2)] },
  { first: "Anthony", last: "Gallagher", shop: "nga", consent: "marketing", vehicles: [V.silverado15(2)] },
  { first: "Margaret", last: "Chen", shop: "nga", consent: "transactional", vehicles: [V.odyssey20(2)] },
  { first: "Mark", last: "Esposito", shop: "nga", consent: "transactional", vehicles: [V.wrangler16(2)] },
  { first: "Sandra", last: "Kaur", shop: "ngt", consent: "transactional", vehicles: [V.civic21(2)] },
  { first: "Donald", last: "Reyes", shop: "ngt", consent: "marketing", vehicles: [V.f150_19(3)] },
  { first: "Ashley", last: "Brandt", shop: "ngt", consent: "transactional", vehicles: [V.rav4_19(3)] },
  { first: "Steven", last: "Mwangi", shop: "ngt", consent: "transactional", vehicles: [V.camry16(4)] },
  { first: "Kimberly", last: "Lund", shop: "ngt", consent: "none", vehicles: [V.outback18(3)] },
  { first: "Paul", last: "Arroyo", shop: "ngt", consent: "transactional", vehicles: [V.silverado15(3)] },
  { first: "Emily", last: "Rasmussen", shop: "ngt", consent: "marketing", vehicles: [V.model3_20(3)] },
  { first: "Andrew", last: "Takahashi", shop: "ngt", consent: "transactional", vehicles: [V.accord18(3)] },
  { first: "Donna", last: "Ellison", shop: "ngt", consent: "transactional", vehicles: [V.sienna12(3)] },
  { first: "Joshua", last: "Obi", shop: "ngt", consent: "transactional", vehicles: [V.wrangler16(3)] },
  { first: "Michelle", last: "Vasquez", shop: "ngt", consent: "email_only", email: true, vehicles: [V.civic21(3)] },
  { first: "Kevin", last: "Duarte", shop: "ngt", consent: "transactional", vehicles: [V.sportage17(2)] }
];
var VANS = [
  ...Array.from({ length: 7 }, (_, i) => ({ vin: vin("1GCWGAFP", "K", "1", 2e3 + i), year: 2019, make: "Chevrolet", model: "Express 2500", trim: "Cargo", color: "White", plate: `CVP${String(i + 1).padStart(3, "0")}`, odometer: 96e3 + i * 6350 })),
  ...Array.from({ length: 5 }, (_, i) => ({ vin: vin("1FTBR1C8", "L", "K", 2100 + i), year: 2020, make: "Ford", model: "Transit 250", trim: "Cargo", color: "White", plate: `CVP${String(i + 8).padStart(3, "0")}`, odometer: 71e3 + i * 5120 }))
];
var LIBRARY_VEHICLES = [
  { vin: vin("1FMCU0F6", "N", "U", 3001), year: 2022, make: "Ford", model: "Escape", trim: "SE Hybrid", color: "White", plate: "E123456", odometer: 28400 },
  { vin: vin("1FTBR1C8", "N", "K", 3002), year: 2022, make: "Ford", model: "Transit 250", trim: "Bookmobile", color: "Blue", plate: "E123457", odometer: 19900 }
];
var FLEETS = [
  { id: "seed_acct_cvp", customerId: "seed_cust_fleet_cvp", name: "Capital Valley Plumbing", termsDays: 30, poRequired: true, creditLimitMinor: 1500000n, billingMode: "statement_monthly", email: "fleet@capitalvalleyplumbing.com", phone: "+19165550190", shop: "nga", vehicles: VANS, note: "Net 30, PO required. Approvers: $750 (fleet coordinator) and $3,000 (operations manager) - fleet approval rules arrive in Phase 6." },
  { id: "seed_acct_sacl", customerId: "seed_cust_fleet_sacl", name: "Sac County Library Services", termsDays: 30, poRequired: false, creditLimitMinor: 500000n, billingMode: "per_invoice", email: "facilities@sacramentocountylibrary.org", phone: "+19165550191", shop: "nga", vehicles: LIBRARY_VEHICLES, note: "Government account. Tax-exempt certificate on file in Phase 6." }
];
var BOOKING_RULES = {
  nga: [["slot_minutes", 30], ["max_dropoffs_per_day", 18], ["waiter_slots_per_hour", 2], ["max_bay_hours_per_day", 5700], ["no_waiters_after", "15:00"], ["lead_time_hours", 2]],
  ngt: [["slot_minutes", 30], ["max_dropoffs_per_day", 14], ["waiter_slots_per_hour", 3], ["max_bay_hours_per_day", 4e3], ["no_waiters_after", "16:00"], ["lead_time_hours", 1]]
};
var SHOP_ID = { nga: "seed_shop_nga", ngt: "seed_shop_ngt" };
var phone = (n) => `+19165550${100 + n}`;
var MAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "comcast.net", "sbcglobal.net"];
var email = (c, i) => `${c.first}.${c.last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@" + MAIL_DOMAINS[i % MAIL_DOMAINS.length];
var customerId = (i) => `seed_cust_${String(i + 1).padStart(2, "0")}`;
var vehicleId = (owner, j) => `seed_veh_${owner.replace(/^seed_cust_/, "")}_${j + 1}`;
async function seedBookingRules(uow, actor) {
  let created = 0;
  for (const [shop, rules2] of Object.entries(BOOKING_RULES)) {
    if (!await uow.tx.shop.findUnique({ where: { id: SHOP_ID[shop] }, select: { id: true } })) continue;
    for (const [kind, value] of rules2) {
      const id = `seed_rule_${shop}_${kind}`;
      if (await uow.tx.bookingRule.findUnique({ where: { id } })) continue;
      await uow.tx.bookingRule.create({ data: { id, shopId: SHOP_ID[shop], kind, value, appliesToDays: [], active: true } });
      auditCreate(uow, actor, "BookingRule", id, "booking_rule.created", { shopId: SHOP_ID[shop], kind, value }, { metadata: { seed: true } });
      created += 1;
    }
  }
  return created;
}
var RECALL_FIXTURES = [{ make: "Honda", model: "Accord", year: 2018 }, { make: "Kia", model: "Sportage", year: 2017 }];
async function seedVehicleData(uow, actor, vehicleId2, v) {
  const fixtures = fixtureAdapter();
  if (v.vin === FIXTURE_VINS.clean && !await uow.tx.vehicleDecode.count({ where: { vehicleId: vehicleId2 } })) {
    const decoded = await fixtures.decodeVin(v.vin);
    if (decoded.kind === "ok") await storeDecode(uow, actor, vehicleId2, decoded.value, uow.now, true);
  }
  if (RECALL_FIXTURES.some((f) => f.make === v.make && f.model === v.model && f.year === v.year) && !await uow.tx.recallCheck.count({ where: { vehicleId: vehicleId2 } })) {
    const query = { make: v.make, model: v.model, modelYear: v.year };
    const recalls = await fixtures.recallsByVehicle(query);
    if (recalls.kind === "ok") await storeRecallCheck(uow, actor, vehicleId2, query, recalls.value, uow.now, true);
  }
}
async function seedRecordedVehicleData(uow, actor) {
  const before = await uow.tx.recallCheck.count() + await uow.tx.vehicleDecode.count();
  const vehicles = await uow.tx.vehicle.findMany({ where: { id: { startsWith: "seed_veh_" }, OR: [{ vin: FIXTURE_VINS.clean }, ...RECALL_FIXTURES.map((f) => ({ make: f.make, model: f.model, year: f.year }))] }, select: { id: true, vin: true, make: true, model: true, year: true } });
  for (const v of vehicles) await seedVehicleData(uow, actor, v.id, { vin: v.vin, make: v.make, model: v.model, year: v.year ?? 0 });
  return await uow.tx.recallCheck.count() + await uow.tx.vehicleDecode.count() - before;
}
async function seedVehicle(uow, actor, id, v, owner) {
  if (await uow.tx.vehicle.findUnique({ where: { id }, select: { id: true } })) return false;
  const { id: savedId } = await upsertVehicle(uow, actor, {
    createId: id,
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim ?? "",
    color: v.color ?? "",
    customerId: owner.customerId ?? null,
    businessAccountId: owner.businessAccountId ?? null,
    plate: v.plate ? { plate: v.plate, state: "CA" } : null
  });
  await recordOdometer(uow, actor, { vehicleId: savedId, value: v.odometer, source: "import" });
  await seedVehicleData(uow, actor, savedId, v);
  return true;
}
async function seedCustomers(uow, actor, from = 0, to = CUSTOMERS.length) {
  const created = { customers: 0, vehicles: 0, consents: 0 };
  for (let i = from; i < Math.min(to, CUSTOMERS.length); i += 1) {
    const c = CUSTOMERS[i];
    const id = customerId(i);
    if (!await uow.tx.shop.findUnique({ where: { id: SHOP_ID[c.shop] }, select: { id: true } })) continue;
    if (!await uow.tx.customer.findUnique({ where: { id }, select: { id: true } })) {
      const contacts = [{ kind: "mobile", value: phone(i), isPrimary: true }, ...c.email || c.consent === "marketing" || i % 3 === 0 ? [{ kind: "email", value: email(c, i), isPrimary: true }] : []];
      await upsertCustomer(uow, actor, {
        createId: id,
        firstName: c.first,
        lastName: c.last,
        homeShopId: SHOP_ID[c.shop],
        notes: c.notes ?? "",
        preferredChannel: c.consent === "stopped" || c.consent === "email_only" ? "email" : "sms",
        contacts
      });
      created.customers += 1;
      const rows = await uow.tx.customerContact.findMany({ where: { customerId: id }, select: { id: true, kind: true } });
      const mobile = rows.find((r) => r.kind === "mobile");
      const mail = rows.find((r) => r.kind === "email");
      const grant = async (contactId, channel, purpose, written) => {
        await recordConsent(uow, actor, { contactId, channel, purpose, action: "granted", method: written ? "in_person_form" : "staff_recorded", writtenConsent: written, evidence: { source: "Northgate check-in form", seed: true } });
        created.consents += 1;
      };
      if (c.consent !== "none" && c.consent !== "email_only") await grant(mobile.id, "sms", "transactional", false);
      if (c.consent === "marketing") await grant(mobile.id, "sms", "marketing", true);
      if (mail && c.consent !== "none") await grant(mail.id, "email", "transactional", false);
      if (mail && c.consent === "marketing") await grant(mail.id, "email", "marketing", false);
      if (c.consent === "stopped") {
        await recordConsent(uow, actor, { contactId: mobile.id, channel: "sms", purpose: "all", action: "revoked", method: "keyword_reply", evidence: { keyword: "STOP", seed: true } });
        created.consents += 1;
      }
    }
    for (const [j, v] of c.vehicles.entries()) if (await seedVehicle(uow, actor, vehicleId(id, j), v, { customerId: id })) created.vehicles += 1;
  }
  return created;
}
async function seedFleets(uow, actor) {
  const created = { accounts: 0, vehicles: 0 };
  for (const f of FLEETS) {
    if (!await uow.tx.businessAccount.findUnique({ where: { id: f.id }, select: { id: true } })) {
      await createBusinessAccount(uow, actor, { createId: f.id, name: f.name, termsDays: f.termsDays, poRequired: f.poRequired, creditLimitMinor: f.creditLimitMinor, billingMode: f.billingMode });
      created.accounts += 1;
    }
    if (!await uow.tx.customer.findUnique({ where: { id: f.customerId }, select: { id: true } })) {
      await upsertCustomer(uow, actor, {
        createId: f.customerId,
        kind: "business",
        companyName: f.name,
        homeShopId: SHOP_ID[f.shop],
        preferredChannel: "email",
        notes: f.note,
        contacts: [{ kind: "email", value: f.email, isPrimary: true }, { kind: "landline", value: f.phone, isPrimary: true }]
      });
      await uow.tx.customer.update({ where: { id: f.customerId }, data: { businessAccountId: f.id, version: { increment: 1 } } });
      auditCreate(uow, actor, "Customer", f.customerId, "customer.business_account_linked", { businessAccountId: f.id }, { metadata: { seed: true } });
      const mail = await uow.tx.customerContact.findFirst({ where: { customerId: f.customerId, kind: "email" }, select: { id: true } });
      if (mail) await recordConsent(uow, actor, { contactId: mail.id, channel: "email", purpose: "transactional", action: "granted", method: "staff_recorded", evidence: { source: "Fleet agreement", seed: true } });
    }
    for (const [j, v] of f.vehicles.entries()) if (await seedVehicle(uow, actor, `seed_veh_${f.id.replace(/^seed_acct_/, "")}_${String(j + 1).padStart(2, "0")}`, v, { businessAccountId: f.id })) created.vehicles += 1;
  }
  return created;
}
async function seedAppointments(uow, actor) {
  const { tx, now } = uow;
  if (await tx.appointment.count({ where: { customerId: { startsWith: "seed_cust_" } } })) return 0;
  const plan = [
    { shop: "nga", dayOffset: 0, at: "07:30", kind: "drop_off", customer: 0, services: ["Oil and filter change", "Tire rotation"], concern: "", hours: 100, confirm: true },
    { shop: "nga", dayOffset: 0, at: "08:00", kind: "drop_off", customer: 6, services: ["Recall check"], concern: "Recall letter came in the mail. Also a check engine light since last week.", hours: 150, confirm: true },
    { shop: "nga", dayOffset: 0, at: "09:00", kind: "waiter", customer: 1, services: ["Oil and filter change"], concern: "", hours: 75, confirm: true },
    { shop: "nga", dayOffset: 0, at: "10:30", kind: "drop_off", customer: 4, services: ["Brake inspection"], concern: "Grinding noise from the front when braking.", hours: 200, confirm: false },
    { shop: "nga", dayOffset: 1, at: "08:00", kind: "drop_off", customer: 3, services: ["60k service"], concern: "", hours: 300, confirm: true },
    { shop: "nga", dayOffset: 1, at: "13:00", kind: "drop_off", customer: 9, services: ["Diagnosis"], concern: "Coolant smell after driving; temperature gauge reads normal.", hours: 150, confirm: false },
    { shop: "ngt", dayOffset: 0, at: "08:30", kind: "waiter", customer: 28, services: ["Four new tires", "Alignment"], concern: "", hours: 150, confirm: true },
    { shop: "ngt", dayOffset: 1, at: "10:00", kind: "waiter", customer: 29, services: ["Oil and filter change"], concern: "", hours: 50, confirm: false }
  ];
  let created = 0;
  for (const p of plan) {
    const shopId = SHOP_ID[p.shop];
    const customer = customerId(p.customer);
    const vehicle = await tx.vehicleOwnership.findFirst({ where: { customerId: customer, endedAt: null }, select: { vehicleId: true } });
    if (!vehicle) continue;
    const { calendar } = await loadShopCalendar(tx, shopId);
    let date2 = nextBusinessDay(calendar, now.toISOString().slice(0, 10));
    for (let k = 0; k < p.dayOffset; k += 1) date2 = nextBusinessDay(calendar, date2);
    const startsAt = zonedInstant(calendar.timeZone, date2, p.at);
    await bookAppointment(uow, actor, {
      shopId,
      startsAt,
      kind: p.kind,
      estimatedCentiHours: p.hours,
      customerId: customer,
      vehicleId: vehicle.vehicleId,
      concernText: p.concern,
      requestedServices: p.services,
      source: "staff",
      confirm: p.confirm
    });
    created += 1;
  }
  return created;
}

// features/keystone/seed/northgate.ts
var ORG = {
  legalName: "Northgate Auto Group LLC",
  displayName: "Northgate Auto Group",
  defaultTimeZone: "America/Los_Angeles"
};
var WEEKDAY = (open, close, saturday) => [
  ...[1, 2, 3, 4, 5].map((dow2) => ({ dow: dow2, open, close })),
  ...saturday ? [{ dow: 6, open: saturday[0], close: saturday[1] }] : []
];
var SHOPS = [
  {
    id: "seed_shop_nga",
    code: "NGA",
    name: "Northgate Auto Care",
    legalName: "Northgate Auto Group LLC",
    addressLine1: "2215 Northgate Blvd",
    city: "Sacramento",
    region: "CA",
    postalCode: "95833",
    phone: "+19165550142",
    email: "service@northgateautocare.com",
    registrations: { barArd: "ARD-000000", epaId: "CAR000000000", sellerPermit: "SR-XX-000-000000", tireFeeAccount: "TF-000000" },
    weeklyHours: WEEKDAY("07:30", "18:00", ["08:00", "14:00"]),
    bays: [
      ...Array.from({ length: 6 }, (_, i) => ({ code: `B${i + 1}`, name: `Bay ${i + 1}`, kind: "general" })),
      { code: "B7", name: "Bay 7 (heavy lift)", kind: "lift_heavy" },
      { code: "AL1", name: "Alignment", kind: "alignment" }
    ]
  },
  {
    id: "seed_shop_ngt",
    code: "NGT",
    name: "Northgate Tire & Lube",
    legalName: "Northgate Auto Group LLC",
    addressLine1: "480 Galleria Way",
    city: "Roseville",
    region: "CA",
    postalCode: "95678",
    phone: "+19165550178",
    email: "roseville@northgateautocare.com",
    registrations: { barArd: "ARD-000001", epaId: "CAR000000001", sellerPermit: "SR-XX-000-000001", tireFeeAccount: "TF-000001" },
    weeklyHours: WEEKDAY("08:00", "18:00", ["08:00", "16:00"]),
    bays: [
      { code: "T1", name: "Tire bay 1", kind: "tire" },
      { code: "T2", name: "Tire bay 2", kind: "tire" },
      { code: "AL1", name: "Alignment", kind: "alignment" },
      { code: "QL1", name: "Quick lube 1", kind: "quick_lube" },
      { code: "QL2", name: "Quick lube 2", kind: "quick_lube" }
    ]
  }
];
var SHOP_CLOSURES = [
  ["2026-11-26", "Thanksgiving"],
  ["2026-12-25", "Christmas Day"],
  ["2027-01-01", "New Year's Day"],
  ["2027-05-31", "Memorial Day"],
  ["2027-07-05", "Independence Day (observed)"],
  ["2027-09-06", "Labor Day"],
  ["2027-11-25", "Thanksgiving"],
  ["2027-12-24", "Christmas Eve"],
  ["2027-12-31", "New Year's Eve"]
];
var CALENDAR_COVERAGE_THROUGH = "2027-12-31";
var STAFF_BASE = ["canAccessDashboard", "canSeeOtherPeople", "canReadRepairOrders"];
var COUNTER = ["canManageCustomers", "canReadCustomerPII", "canManageSchedule", "canWriteRepairOrders", "canSendEstimates", "canRecordAuthorizations", "canPriceJobs", "canFinalizeInvoices", "canTakePayments", "canCloseDay", "canMessageCustomers", "canManageTireRegistrations"];
var ROLES = [
  {
    id: "seed_role_owner",
    name: "Owner",
    description: "Everything in the organisation, including approvals of last resort.",
    permissions: [
      ...STAFF_BASE,
      ...COUNTER,
      "canEditOtherPeople",
      "canManagePeople",
      "canManageRoles",
      "canManageOnboarding",
      "canManagePayments",
      "canIssueRefunds",
      "canReadAudit",
      "canManageOrganization",
      "canManageShops",
      "canManageIntegrations",
      "canAccessAllShops",
      "canManagePolicies",
      "canPublishPolicies",
      "canApproveMerge",
      "canApproveReopen",
      "canApproveRelease",
      "canPerformInspections",
      "canDiagnose",
      "canOverrideTrustGate",
      "canApprovePriceOverride",
      "canApproveDiscount",
      "canSeeCost",
      "canManageParts",
      "canOrderParts",
      "canReceiveParts",
      "canApproveSupplierInvoice",
      "canApproveStockAdjustment",
      "canApproveCoreWriteOff",
      "canManageTime",
      "canApproveTime",
      "canClosePayPeriod",
      "canReadTechPay",
      "canApproveRefund",
      "canApproveWriteOff",
      "canApproveCredit",
      "canApproveCreditMemo",
      "canReadFinancials",
      "canManageComebacks",
      "canApproveGoodwill",
      "canManageCampaigns",
      "canManageAgents",
      "canConfirmProposals",
      "canApproveAgentAutonomy",
      "canReadReports"
    ]
  },
  {
    id: "seed_role_manager",
    name: "Shop Manager",
    description: "Runs a shop: drafts policy, approves discounts, overrides, write-offs and time.",
    permissions: [
      ...STAFF_BASE,
      ...COUNTER,
      "canManagePeople",
      "canIssueRefunds",
      "canReadAudit",
      "canManageShops",
      "canManagePolicies",
      "canApproveMerge",
      "canApproveReopen",
      "canApproveRelease",
      "canOverrideTrustGate",
      "canApprovePriceOverride",
      "canApproveDiscount",
      "canSeeCost",
      "canManageParts",
      "canOrderParts",
      "canApproveSupplierInvoice",
      "canApproveStockAdjustment",
      "canApproveCoreWriteOff",
      "canManageTime",
      "canApproveTime",
      "canClosePayPeriod",
      "canReadTechPay",
      "canApproveRefund",
      "canApproveWriteOff",
      "canApproveCredit",
      "canApproveCreditMemo",
      "canReadFinancials",
      "canManageComebacks",
      "canApproveGoodwill",
      "canManageAgents",
      "canConfirmProposals",
      "canReadReports"
    ]
  },
  { id: "seed_role_advisor", name: "Service Advisor", description: "Front counter: customers, appointments, ROs, estimates, authorizations, invoices and payments. No cost view.", permissions: [...STAFF_BASE, ...COUNTER, "canConfirmProposals", "canReadReports"] },
  { id: "seed_role_lead_tech", name: "Lead Technician", description: "Dispatch, quality checks and the team clocks.", permissions: [...STAFF_BASE, "canPerformInspections", "canDiagnose", "canClockSelf", "canManageTime", "canWriteRepairOrders", "canReadReports"] },
  { id: "seed_role_tech", name: "Technician", description: "Assigned jobs, inspections, diagnosis and own clocks. No customer financials.", permissions: ["canAccessDashboard", "canReadRepairOrders", "canPerformInspections", "canDiagnose", "canClockSelf"] },
  { id: "seed_role_parts", name: "Parts Manager", description: "Suppliers, quotes, orders, receiving, stock, cores and supplier invoices.", permissions: [...STAFF_BASE, "canManageParts", "canOrderParts", "canReceiveParts", "canSeeCost", "canManageTireRegistrations", "canReadReports"] },
  { id: "seed_role_bookkeeper", name: "Bookkeeper", description: "Payments, AR, statements, day close and accounting exports.", permissions: [...STAFF_BASE, "canTakePayments", "canCloseDay", "canFinalizeInvoices", "canReadFinancials", "canSeeCost", "canReadTechPay", "canManagePayments", "canReadCustomerPII", "canReadReports"] },
  { id: "seed_role_marketing", name: "Marketing", description: "Templates, consent-gated campaigns and reviews. No RO edits.", permissions: ["canAccessDashboard", "canManageCampaigns", "canMessageCustomers", "canReadReports"] },
  { id: "seed_role_auditor", name: "Auditor", description: "Read-only and time-boxed by the user access expiry.", permissions: [...STAFF_BASE, "canReadAudit", "canReadFinancials", "canReadCustomerPII", "canReadReports", "canAccessAllShops"] },
  { id: "seed_role_portal", name: "Customer Portal", description: "Storefront API session only; no dashboard.", permissions: [], dashboard: false },
  { id: "seed_role_fleet", name: "Fleet Approver", description: "Fleet portal API session only; no dashboard.", permissions: [], dashboard: false }
];
var shopBoth = ["seed_shop_nga", "seed_shop_ngt"];
var email2 = (local) => `${local}@northgateautocare.com`;
var STAFF = [
  { id: "seed_user_whitfield", name: "Dana Whitfield", email: email2("dana.whitfield"), title: "Owner", roleId: "seed_role_owner", kind: "staff", shops: shopBoth },
  { id: "seed_user_ortega", name: "Marcus Ortega", email: email2("marcus.ortega"), title: "Shop Manager, Northgate Auto Care", roleId: "seed_role_manager", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_shah", name: "Priya Shah", email: email2("priya.shah"), title: "Service Advisor", roleId: "seed_role_advisor", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_becker", name: "Tom Becker", email: email2("tom.becker"), title: "Service Advisor", roleId: "seed_role_advisor", kind: "staff", shops: ["seed_shop_ngt"] },
  { id: "seed_user_ramirez", name: "Luis Ramirez", email: email2("luis.ramirez"), title: "Lead Technician (ASE A1-A8, EPA 609)", roleId: "seed_role_lead_tech", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_tran", name: "Kevin Tran", email: email2("kevin.tran"), title: "Technician", roleId: "seed_role_tech", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_morgan", name: "Aisha Morgan", email: email2("aisha.morgan"), title: "Technician", roleId: "seed_role_tech", kind: "staff", shops: ["seed_shop_ngt"] },
  { id: "seed_user_holloway", name: "Jake Holloway", email: email2("jake.holloway"), title: "Technician (EPA 609 expired)", roleId: "seed_role_tech", kind: "staff", shops: ["seed_shop_nga"] },
  { id: "seed_user_delgado", name: "Rosa Delgado", email: email2("rosa.delgado"), title: "Parts Manager", roleId: "seed_role_parts", kind: "staff", shops: shopBoth },
  { id: "seed_user_park", name: "Helen Park", email: email2("helen.park"), title: "Bookkeeper", roleId: "seed_role_bookkeeper", kind: "staff", shops: shopBoth },
  { id: "seed_user_ito", name: "Sam Ito", email: email2("sam.ito"), title: "Marketing", roleId: "seed_role_marketing", kind: "staff", shops: shopBoth },
  { id: "seed_user_auditor", name: "L. Navarro", email: "l.navarro@navarrocpa.com", title: "CPA, Navarro & Co (guest)", roleId: "seed_role_auditor", kind: "auditor", shops: [], accessDays: 30 }
];
var AGENTS = [
  { id: "seed_agent_front_desk", name: "Front Desk Assistant", kind: "llm_agent", ownerId: "seed_user_ortega", shops: shopBoth },
  { id: "seed_agent_parts_runner", name: "Parts Runner", kind: "llm_agent", ownerId: "seed_user_delgado", shops: shopBoth },
  { id: "seed_agent_diag_helper", name: "Diag Helper", kind: "llm_agent", ownerId: "seed_user_ramirez", shops: ["seed_shop_nga"] }
];
var APPROVAL_POLICIES = [
  { action: "policy.publish", description: "Publish a policy version (jurisdiction, labor, parts, fees, tax, warranty, shop policy).", requiredPermission: "canPublishPolicies", expiresAfterMinutes: 3 * 1440 },
  { action: "customer.merge", description: "Merge two customer records.", requiredPermission: "canApproveMerge", expiresAfterMinutes: 1440 },
  { action: "ro.reopen", description: "Reopen an invoiced or closed repair order.", requiredPermission: "canApproveReopen", expiresAfterMinutes: 240 },
  { action: "vehicle.release_with_balance", description: "Release a vehicle with an unpaid balance.", requiredPermission: "canApproveRelease", expiresAfterMinutes: 240 },
  { action: "price.override", description: "Price a line below the margin floor.", requiredPermission: "canApprovePriceOverride", expiresAfterMinutes: 240 },
  { action: "discount.over_limit", description: "Discount above the requester's role limit.", requiredPermission: "canApproveDiscount", expiresAfterMinutes: 240 },
  { action: "trust_gate.override", description: "Send a diagnosis-based job below the confidence threshold.", requiredPermission: "canOverrideTrustGate", expiresAfterMinutes: 240 },
  { action: "supplier_invoice.approve", description: "Approve a supplier invoice for payment.", requiredPermission: "canApproveSupplierInvoice", expiresAfterMinutes: 3 * 1440 },
  { action: "stock.adjust", description: "Post a cycle-count variance or stock adjustment.", requiredPermission: "canApproveStockAdjustment", expiresAfterMinutes: 1440 },
  { action: "core.write_off", description: "Write off an uncredited core.", requiredPermission: "canApproveCoreWriteOff", expiresAfterMinutes: 1440 },
  { action: "time.correction", description: "Correct a clock entry.", requiredPermission: "canApproveTime", expiresAfterMinutes: 3 * 1440 },
  { action: "pay_period.close", description: "Close a pay period.", requiredPermission: "canClosePayPeriod", expiresAfterMinutes: 1440 },
  { action: "refund.issue", description: "Refund a customer payment.", requiredPermission: "canApproveRefund", expiresAfterMinutes: 240, thresholdMinor: 0n },
  { action: "invoice.write_off", description: "Write off an invoice balance.", requiredPermission: "canApproveWriteOff", expiresAfterMinutes: 1440 },
  { action: "credit_memo.issue", description: "Issue a credit memo above the threshold.", requiredPermission: "canApproveCreditMemo", expiresAfterMinutes: 1440, thresholdMinor: 5000n },
  { action: "account.credit_hold_release", description: "Release a business account from credit hold or extend credit.", requiredPermission: "canApproveCredit", expiresAfterMinutes: 1440 },
  { action: "day.reopen", description: "Reopen a closed business day.", requiredPermission: "canApproveRefund", expiresAfterMinutes: 240 },
  { action: "goodwill.approve", description: "No-charge comeback outside coverage.", requiredPermission: "canApproveGoodwill", expiresAfterMinutes: 1440 },
  { action: "agent_grant.activate", description: "Activate a tool grant for an AI agent.", requiredPermission: "canApproveAgentAutonomy", expiresAfterMinutes: 1440 },
  { action: "agent.autonomy", description: "Change agent autonomy for an action class.", requiredPermission: "canApproveAgentAutonomy", expiresAfterMinutes: 1440 },
  { action: "org.controls", description: "Change organisation-wide agent controls.", requiredPermission: "canApproveAgentAutonomy", expiresAfterMinutes: 1440 },
  { action: "role.assign_approval", description: "Give a person a role that can approve.", requiredPermission: "canManageRoles", expiresAfterMinutes: 1440 }
];

// features/keystone/seed/platform.ts
var UNUSABLE_PASSWORD_HASH = "$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya";
var day = (date2) => /* @__PURE__ */ new Date(`${date2}T00:00:00Z`);
async function seedOrgPlatform(uow, actor) {
  const { tx, now } = uow;
  const created = { organization: 0, shops: 0, bays: 0, calendarExceptions: 0, roles: 0, staff: 0, memberships: 0, agents: 0, approvalPolicies: 0 };
  if (!await tx.organizationSettings.findUnique({ where: { id: 1 } })) {
    await tx.organizationSettings.create({ data: { id: 1, ...ORG } });
    auditCreate(uow, actor, "OrganizationSettings", "1", "organization.created", ORG, { metadata: { seed: true } });
    created.organization += 1;
  }
  for (const shop of SHOPS) {
    if (await tx.shop.findFirst({ where: { OR: [{ id: shop.id }, { code: shop.code }] } })) continue;
    const { bays, weeklyHours, ...fields } = shop;
    const calendar = await tx.shopCalendar.create({
      data: { id: `${shop.id}_calendar`, name: `${shop.name} hours`, weeklyHours, coverageThrough: day(CALENDAR_COVERAGE_THROUGH) }
    });
    await tx.shop.create({ data: { ...fields, registrations: fields.registrations, timeZone: ORG.defaultTimeZone, isPublished: false, calendarId: calendar.id } });
    await tx.shopCalendarException.createMany({ data: SHOP_CLOSURES.map(([date2, reason]) => ({ calendarId: calendar.id, date: day(date2), closed: true, reason })) });
    await tx.bay.createMany({ data: bays.map((bay) => ({ id: `${shop.id}_${bay.code.toLowerCase()}`, shopId: shop.id, code: bay.code, name: bay.name, kind: bay.kind, active: true })) });
    auditCreate(uow, actor, "Shop", shop.id, "shop.created", { code: shop.code, name: shop.name, bays: bays.length, region: shop.region }, { metadata: { seed: true } });
    created.shops += 1;
    created.bays += bays.length;
    created.calendarExceptions += SHOP_CLOSURES.length;
  }
  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  const newRoles = ROLES.filter((role) => !haveRoles.has(role.id));
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map((role) => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map((name) => [name, role.permissions.includes(name)])) })) });
    for (const role of newRoles) auditCreate(uow, actor, "Role", role.id, "role.created", { name: role.name, permissions: role.permissions }, { metadata: { seed: true } });
    created.roles = newRoles.length;
  }
  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map((p) => p.id) } }, { email: { in: STAFF.map((p) => p.email) } }] }, select: { id: true, email: true } });
  const newStaff = STAFF.filter((person) => !haveUsers.some((u) => u.id === person.id || u.email === person.email));
  if (newStaff.length) {
    await tx.user.createMany({
      data: newStaff.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        title: person.title,
        password: UNUSABLE_PASSWORD_HASH,
        kind: person.kind,
        roleId: person.roleId,
        accessExpiresAt: person.accessDays ? new Date(now.getTime() + person.accessDays * 864e5) : null,
        onboardingStatus: "dismissed"
      }))
    });
    for (const person of newStaff) auditCreate(uow, actor, "User", person.id, "user.created", { name: person.name, title: person.title, role: person.roleId, kind: person.kind, shops: person.shops }, { metadata: { seed: true } });
    created.staff = newStaff.length;
    const memberships = newStaff.flatMap((person) => person.shops.map((shopId, i) => ({ id: `${person.id}_${shopId}`, userId: person.id, shopId, isDefault: i === 0, status: "active", startedAt: now })));
    if (memberships.length) {
      await tx.shopMembership.createMany({ data: memberships });
      created.memberships = memberships.length;
    }
  }
  for (const agent of AGENTS) {
    if (await tx.agentIdentity.findFirst({ where: { OR: [{ id: agent.id }, { name: agent.name }] } })) continue;
    await tx.agentIdentity.create({ data: { id: agent.id, name: agent.name, kind: agent.kind, ownerId: agent.ownerId, status: "active", shops: { connect: agent.shops.map((id) => ({ id })) } } });
    auditCreate(uow, actor, "AgentIdentity", agent.id, "agent.created", { name: agent.name, owner: agent.ownerId, autonomy: "propose_only" }, { metadata: { seed: true } });
    created.agents += 1;
  }
  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map((p) => p.action));
  for (const policy of APPROVAL_POLICIES.filter((p) => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes, thresholdMinor: policy.thresholdMinor ?? null } });
    auditCreate(uow, actor, "ApprovalPolicy", row.id, "approval_policy.created", { action: policy.action, requiredPermission: policy.requiredPermission }, { metadata: { seed: true } });
    created.approvalPolicies += 1;
  }
  return created;
}

// features/keystone/lib/ceiling.ts
var PCT = /^(0(\.\d{1,6})?|1(\.0{1,6})?)$/;
var big = (value, field) => {
  if (value === null || value === void 0) throw new DomainError(Codes.INVALID_INPUT, `Tolerance rule needs ${field}.`, { field });
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new DomainError(Codes.INVALID_INPUT, `${field} must be whole cents.`, { field });
};
function parseToleranceRule(input) {
  const r = input ?? {};
  const kind = r.kind;
  if (kind !== "fixed" && kind !== "percent" && kind !== "max_of" && kind !== "min_of") throw new DomainError(Codes.INVALID_INPUT, "Tolerance kind must be fixed, percent, max_of or min_of.", { field: "kind" });
  if (typeof r.includesTax !== "boolean") throw new DomainError(Codes.INVALID_INPUT, "Tolerance rule must say whether it includes tax.", { field: "includesTax" });
  const rule2 = { kind, includesTax: r.includesTax };
  if (kind !== "fixed") {
    if (typeof r.percent !== "string" || !PCT.test(r.percent)) throw new DomainError(Codes.INVALID_INPUT, 'Tolerance percent must be a decimal fraction from 0 to 1, e.g. "0.10".', { field: "percent" });
    rule2.percent = r.percent;
  }
  if (kind !== "percent") rule2.fixedMinor = big(r.fixedMinor, "fixedMinor").toString();
  if (r.capMinor !== void 0 && r.capMinor !== null) rule2.capMinor = big(r.capMinor, "capMinor").toString();
  if (rule2.fixedMinor !== void 0 && BigInt(rule2.fixedMinor) < 0n) throw new DomainError(Codes.INVALID_INPUT, "fixedMinor cannot be negative.", { field: "fixedMinor" });
  return rule2;
}
var percentOf = (amountMinor, percent) => BigInt(toScale(dec(amountMinor).times(dec(percent)), 0));
function toleranceMinor(ruleInput, authorizedMinor) {
  if (authorizedMinor < 0n) throw new DomainError(Codes.INVALID_INPUT, "Authorized amount cannot be negative.");
  const rule2 = parseToleranceRule(ruleInput);
  let value;
  switch (rule2.kind) {
    case "fixed":
      value = BigInt(rule2.fixedMinor);
      break;
    case "percent":
      value = percentOf(authorizedMinor, rule2.percent);
      break;
    case "max_of": {
      const p = percentOf(authorizedMinor, rule2.percent);
      const f = BigInt(rule2.fixedMinor);
      value = p > f ? p : f;
      break;
    }
    case "min_of": {
      const p = percentOf(authorizedMinor, rule2.percent);
      const f = BigInt(rule2.fixedMinor);
      value = p < f ? p : f;
      break;
    }
  }
  if (rule2.capMinor !== void 0 && rule2.capMinor !== null && value > BigInt(rule2.capMinor)) value = BigInt(rule2.capMinor);
  return value;
}
var chargeCeilingMinor = (rule2, authorizedMinor) => authorizedMinor + toleranceMinor(rule2, authorizedMinor);
function assertWithinCeiling(input) {
  const rule2 = parseToleranceRule(input.rule);
  const compared = input.priceMinor + (rule2.includesTax ? input.taxMinor ?? 0n : 0n);
  const ceiling = chargeCeilingMinor(rule2, input.authorizedMinor);
  if (compared > ceiling) {
    throw new DomainError(Codes.REAUTHORIZATION_REQUIRED, `This job would cost more than the customer authorized (ceiling ${ceiling} cents, now ${compared}). Send a revised estimate and record a new authorization.`, {
      jobId: input.jobId ?? null,
      authorizedMinor: input.authorizedMinor.toString(),
      ceilingMinor: ceiling.toString(),
      priceMinor: compared.toString()
    });
  }
  return { ceilingMinor: ceiling, comparedMinor: compared };
}

// features/keystone/lib/approvalAppliers.ts
var appliers = /* @__PURE__ */ new Map();
function registerApplier(action, apply, options = {}) {
  if (appliers.has(action)) throw new Error(`Applier for ${action} already registered`);
  appliers.set(action, { apply, applyOnApprove: options.applyOnApprove ?? true });
}
function applierFor(action) {
  return appliers.get(action) ?? null;
}

// features/keystone/lib/separationOfDuties.ts
var SELF_APPROVAL_MESSAGE = "You can't approve your own request.";
var AGENT_APPROVAL_MESSAGE = "An agent can propose but never approve.";
function assertCanDecide(actor, requesterUserId, requesterAgentOwnerId, strictAgentOwner = true) {
  if (actor.kind !== "user") throw new DomainError(Codes.AGENT_CANNOT_APPROVE, AGENT_APPROVAL_MESSAGE);
  if (requesterUserId && requesterUserId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, SELF_APPROVAL_MESSAGE);
  if (strictAgentOwner && requesterAgentOwnerId && requesterAgentOwnerId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a proposal made by your own agent.");
}

// features/keystone/lib/approval.ts
async function requestApproval(uow, actor, input) {
  const policy = await uow.tx.approvalPolicy.findUnique({ where: { action: input.action } });
  const requiredPermission = policy?.requiredPermission ?? input.requiredPermission;
  const minutes = input.expiresInMinutes ?? policy?.expiresAfterMinutes ?? 1440;
  const created = await uow.tx.approvalRequest.create({
    data: {
      action: input.action,
      summary: input.summary ?? "",
      targetList: input.targetList,
      targetId: input.targetId,
      payload: toJsonValue(input.payload),
      payloadHash: payloadHash(input.payload),
      requiredPermission,
      requestedById: actorUserId(actor),
      requestedByAgentId: actorAgentId(actor),
      status: "pending",
      expiresAt: new Date(uow.now.getTime() + minutes * 6e4)
    }
  });
  uow.audit({ eventType: "approval.requested", entityType: "ApprovalRequest", entityId: created.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { action: input.action, targetList: input.targetList, targetId: input.targetId, payloadHash: created.payloadHash, requiredPermission } });
  uow.emit({ topic: "notify.approval", aggregateType: "ApprovalRequest", aggregateId: created.id, payload: { action: input.action, requiredPermission }, dedupeKey: `notify.approval:${created.id}` });
  return created;
}
async function decideApproval(uow, actor, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  let agentOwnerId = null;
  if (request.requestedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: request.requestedByAgentId }, select: { ownerId: true } });
    agentOwnerId = agent?.ownerId ?? null;
  }
  assertCanDecide(actor, request.requestedById, agentOwnerId, input.strictAgentOwner ?? true);
  if (actor.kind !== "user" || !actor.permissions.has(request.requiredPermission)) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `Deciding this needs the ${request.requiredPermission} permission.`);
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) {
    await transition(uow, { model: "ApprovalRequest", id: input.requestId, from: ["pending"], to: "expired", actor, eventType: "approval.expired" });
    throw new DomainError(Codes.GUARD_FAILED, "This approval request has expired.");
  }
  const to = input.decision === "approve" ? "approved" : "rejected";
  const updated = await transition(uow, {
    model: "ApprovalRequest",
    id: input.requestId,
    from: ["pending"],
    to,
    expectedVersion: input.expectedVersion,
    actor,
    eventType: `approval.${to}`,
    reason: input.reason ?? null,
    approverId: actor.userId
  });
  await uow.tx.approvalDecision.create({ data: { requestId: input.requestId, decidedById: actor.userId, decision: input.decision, reason: input.reason ?? "", at: uow.now } });
  return updated;
}
async function consumeApproval(uow, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  if (request.status !== "approved") throw new DomainError(Codes.APPROVAL_REQUIRED, "This action needs an approved request.");
  if (request.consumedAt) throw new DomainError(Codes.APPROVAL_MISMATCH, "This approval was already used.");
  if (request.action !== input.action || request.targetList !== input.targetList || request.targetId !== input.targetId || request.payloadHash !== payloadHash(input.payload)) {
    throw new DomainError(Codes.APPROVAL_MISMATCH, "The approval was given for a different action or payload.");
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The approval has expired.");
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: input.requestId, decision: "approve" }, orderBy: { at: "desc" } });
  await uow.tx.approvalRequest.update({ where: { id: input.requestId }, data: { consumedAt: uow.now, version: { increment: 1 } } });
  uow.audit({ eventType: "approval.consumed", entityType: "ApprovalRequest", entityId: input.requestId, approverId: decision?.decidedById ?? null, after: { action: input.action, targetId: input.targetId } });
  return { approverId: decision?.decidedById ?? null };
}

// features/keystone/lib/policy.ts
var META = /* @__PURE__ */ new Set(["id", "versionNumber", "status", "notes", "basedOnId", "authorId", "publishedById", "publishedAt", "effectiveFrom", "retiredAt", "version", "createdAt", "updatedAt", "packId", "shopId"]);
var POLICY_KINDS = {
  jurisdiction: {
    model: "JurisdictionPolicyVersion",
    delegate: "jurisdictionPolicyVersion",
    head: "packId",
    pointer: "jurisdictionPolicyId",
    label: "Jurisdiction rules",
    fields: ["estimateThresholdMinor", "writtenEstimateWaiverAllowed", "waiverFormText", "allowedAuthorizationMethods", "authorizationEvidenceRules", "toleranceRule", "requireOdometerIn", "requireOdometerOut", "requireSignedWorkOrder", "requirePartCondition", "crashPartOemDefault", "shopSuppliesGenericAllowed", "replacedPartsOfferRequired", "replacedPartsOfferText", "nonReturnableNoteText", "teardownRules", "designeeRules", "thirdPartyPayorNoticeText", "towingSeparateAuthorization", "subletDisclosureRequired", "invoiceRequiredFields", "recordRetentionYears", "surchargeAllowed", "requiredNotices"]
  },
  shop_policy: {
    model: "ShopPolicyVersion",
    delegate: "shopPolicyVersion",
    head: "shopId",
    pointer: "shopPolicyId",
    label: "Shop policy",
    fields: ["flagHoursAt", "comebackPayRule", "allowConcurrentJobClocks", "requireQualityCheck", "diagnosisTrustThreshold", "authorizationLinkTtlHours", "promisedTimeRequired", "noShowGraceMinutes", "discountLimitPctByRole", "refundApprovalMinor", "creditMemoApprovalMinor", "agentOrderLimitMinor", "agentAutonomy", "proposalConfirmGranularity", "declinedSafetyFollowUpPurpose", "followUpCadenceDays", "depositPolicy", "surchargePolicy", "inspectionClockMode", "markupFactorDefault"]
  },
  labor_rates: {
    model: "LaborRateClassSetVersion",
    delegate: "laborRateClassSetVersion",
    head: "shopId",
    pointer: "laborRateClassSetId",
    label: "Labor rates",
    children: { model: "LaborRateClass", delegate: "laborRateClass", fk: "setId", relation: "classes" },
    fields: []
  },
  labor_matrix: { model: "LaborMatrixVersion", delegate: "laborMatrixVersion", head: "shopId", pointer: "laborMatrixId", label: "Labor matrix", fields: ["bands", "appliesToClasses"] },
  parts_matrix: { model: "PartsMatrixVersion", delegate: "partsMatrixVersion", head: "shopId", pointer: "partsMatrixId", label: "Parts matrix", fields: ["tiers", "categoryOverrides", "supplierOverrides", "marginFloorPct"] },
  fees: {
    model: "FeePolicyVersion",
    delegate: "feePolicyVersion",
    head: "shopId",
    pointer: "feePolicyId",
    label: "Fees",
    children: { model: "FeeRule", delegate: "feeRule", fk: "policyId", relation: "rules" },
    fields: []
  },
  tax: {
    model: "TaxRuleSetVersion",
    delegate: "taxRuleSetVersion",
    head: "shopId",
    pointer: "taxRuleSetId",
    label: "Sales tax",
    children: { model: "TaxRule", delegate: "taxRule", fk: "ruleSetId", relation: "rules" },
    fields: ["rounding"]
  },
  warranty: {
    model: "WarrantyTermSetVersion",
    delegate: "warrantyTermSetVersion",
    head: "shopId",
    pointer: "warrantyTermSetId",
    label: "Warranty",
    children: { model: "WarrantyTerm", delegate: "warrantyTerm", fk: "termSetId", relation: "terms" },
    fields: []
  }
};
function kindOf(value) {
  if (typeof value === "string" && value in POLICY_KINDS) return value;
  throw new DomainError(Codes.INVALID_INPUT, `Unknown policy kind ${String(value).slice(0, 40)}.`, { field: "kind" });
}
var d = (tx, name) => tx[name];
var childBody = (row, fk) => Object.fromEntries(Object.entries(row).filter(([k]) => !META.has(k) && k !== fk && k !== "id"));
async function policyContent(tx, kind, versionId) {
  const spec = POLICY_KINDS[kind];
  const row = await d(tx, spec.delegate).findUnique({ where: { id: versionId } });
  if (!row) throw new DomainError(Codes.NOT_FOUND, `${spec.label} version not found.`);
  const body = Object.fromEntries(Object.entries(row).filter(([k]) => !META.has(k)));
  if (spec.children) {
    const rows = await d(tx, spec.children.delegate).findMany({ where: { [spec.children.fk]: versionId } });
    const children = rows.map((r) => childBody(r, spec.children.fk)).map((r) => toJsonValue(r));
    children.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
    body[spec.children.relation] = children;
  }
  return { row, content: toJsonValue(body) };
}
var contentHash = (content) => sha256(canonicalJson(content));
function diffContent(before, after) {
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(before ?? {}), ...Object.keys(after)])].sort();
  return keys.filter((key) => canonicalJson((before ?? {})[key] ?? null) !== canonicalJson(after[key] ?? null)).map((key) => ({ field: key, before: (before ?? {})[key] ?? null, after: after[key] ?? null }));
}
var AUTH_METHODS = ["in_person_signature", "written_form", "oral_phone", "electronic_link", "fleet_portal", "fleet_po"];
var AUTONOMY = ["off", "propose_only", "auto_within_policy"];
var AGENT_FORBIDDEN = ["record_authorization", "authorization.record", "approve", "publish_policy"];
var isFraction = (value) => {
  try {
    const v = dec(String(value));
    return v.gte(0) && v.lte(1);
  } catch {
    return false;
  }
};
var isCents = (value) => value !== null && value !== void 0 && /^\d+$/.test(String(value));
async function validatePolicy(tx, kind, row, content) {
  const problems = [];
  switch (kind) {
    case "jurisdiction": {
      try {
        parseToleranceRule(content.toleranceRule);
      } catch (e) {
        problems.push(`Tolerance rule: ${e.message}`);
      }
      const methods = content.allowedAuthorizationMethods;
      if (!Array.isArray(methods) || !methods.length) problems.push("List at least one allowed authorization method.");
      else for (const m of methods) if (!AUTH_METHODS.includes(m)) problems.push(`Unknown authorization method ${m}.`);
      if (!Number.isInteger(content.recordRetentionYears) || content.recordRetentionYears < 1) problems.push("Record retention must be at least one year.");
      if (!Array.isArray(content.requiredNotices)) problems.push("Required notices must be a list.");
      else for (const n of content.requiredNotices) if (!n?.key || !n?.text || !["estimate", "invoice", "work_order"].includes(n?.where)) problems.push(`Notice ${n?.key ?? "?"} needs key, text and where (estimate, invoice or work_order).`);
      break;
    }
    case "shop_policy": {
      if (!isFraction(content.diagnosisTrustThreshold)) problems.push("Diagnosis trust threshold must be between 0 and 1.");
      if (!isCents(content.agentOrderLimitMinor)) problems.push("Agent order limit must be whole cents, 0 or more.");
      const autonomy = content.agentAutonomy ?? {};
      if (typeof autonomy !== "object" || Array.isArray(autonomy)) problems.push("Agent autonomy must be an object of action class \u2192 off, propose_only or auto_within_policy.");
      else for (const [action, mode] of Object.entries(autonomy)) {
        if (AGENT_FORBIDDEN.includes(action) && mode !== "off") throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, `Agents can never ${action.replace(/[._]/g, " ")}. A customer's "yes" to an agent becomes a staff callback task.`, { field: "agentAutonomy" });
        if (!AUTONOMY.includes(String(mode))) problems.push(`Agent autonomy for ${action} must be off, propose_only or auto_within_policy.`);
      }
      const limits = content.discountLimitPctByRole ?? {};
      for (const [role, value] of Object.entries(limits)) if (!isFraction(value)) problems.push(`Discount limit for ${role} must be a fraction from 0 to 1.`);
      break;
    }
    case "labor_rates": {
      const classes = content.classes ?? [];
      if (!classes.length) problems.push("Add at least one labor rate class.");
      if (classes.filter((c) => c.isDefault).length !== 1) problems.push("Exactly one labor rate class must be the default.");
      for (const c of classes) if (!isCents(c.rateMinor) || BigInt(c.rateMinor) <= 0n) problems.push(`${c.name ?? c.code}: the hourly rate must be more than zero.`);
      break;
    }
    case "labor_matrix": {
      if (!Array.isArray(content.bands)) problems.push("Bands must be a list.");
      break;
    }
    case "parts_matrix": {
      const tiers = Array.isArray(content.tiers) ? content.tiers : [];
      if (!tiers.length) problems.push("Add at least one cost tier.");
      let previousMax = null;
      for (const [i, t] of tiers.entries()) {
        if (!isCents(t.minCostMinor) || t.maxCostMinor !== null && t.maxCostMinor !== void 0 && !isCents(t.maxCostMinor)) {
          problems.push(`Tier ${i + 1}: costs must be whole cents.`);
          continue;
        }
        try {
          if (dec(String(t.multiplier)).lt(1)) problems.push(`Tier ${i + 1}: the multiplier must be at least 1.`);
        } catch {
          problems.push(`Tier ${i + 1}: the multiplier must be a decimal such as "1.85".`);
        }
        const min = BigInt(t.minCostMinor);
        if (previousMax !== null && min !== previousMax) problems.push(`Tier ${i + 1} must start where tier ${i} ends.`);
        previousMax = t.maxCostMinor === null || t.maxCostMinor === void 0 ? null : BigInt(t.maxCostMinor);
        if (previousMax !== null && previousMax <= min) problems.push(`Tier ${i + 1}: the upper bound must be above the lower bound.`);
      }
      if (!isFraction(content.marginFloorPct)) problems.push("Margin floor must be a fraction from 0 to 1.");
      break;
    }
    case "fees": {
      const shop = row.shopId ? await tx.shop.findUnique({ where: { id: row.shopId }, select: { jurisdictionPolicyId: true } }) : null;
      const law = shop?.jurisdictionPolicyId ? await tx.jurisdictionPolicyVersion.findUnique({ where: { id: shop.jurisdictionPolicyId }, select: { shopSuppliesGenericAllowed: true } }) : null;
      for (const r of content.rules ?? []) {
        if (r.code === "shop_supplies_pct" && law && !law.shopSuppliesGenericAllowed) {
          throw new DomainError(Codes.SHOP_SUPPLIES_PROHIBITED, "This state's rules don't allow a generic shop-supplies percentage. Charge supplies as itemised parts instead.", { field: "rules" });
        }
        if (r.kind === "percent_of_base" && !isFraction(r.percent)) problems.push(`${r.code}: percent must be a fraction from 0 to 1.`);
        if (r.kind === "flat_per_ro" && !isCents(r.flatMinor)) problems.push(`${r.code}: a flat fee needs an amount in cents.`);
        if (r.kind === "per_unit" && (!isCents(r.perUnitMinor) || !r.itemCategory)) problems.push(`${r.code}: a per-unit fee needs an amount and an item category.`);
        if (r.refundable && !(Number.isInteger(r.refundWindowDays) && r.refundWindowDays > 0)) problems.push(`${r.code}: a refundable deposit needs a refund window in days.`);
      }
      break;
    }
    case "tax": {
      const rules2 = content.rules ?? [];
      if (!rules2.length) problems.push("Add at least one tax rule.");
      for (const r of rules2) {
        if (!r.categoryId) problems.push("Every tax rule needs a category.");
        let rate;
        try {
          rate = dec(String(r.rate));
        } catch {
          problems.push('Tax rates must be decimals such as "0.0875".');
          continue;
        }
        if (rate.lt(0) || rate.gte(1)) problems.push("A tax rate must be a fraction from 0 to under 1 (0.0875 = 8.75%).");
        if (!r.taxable && !rate.isZero()) problems.push("A non-taxable category must have a zero rate.");
      }
      break;
    }
    case "warranty": {
      if (!(content.terms ?? []).length) problems.push("Add at least one warranty term.");
      break;
    }
  }
  if (problems.length) throw new DomainError(Codes.POLICY_INVALID, problems[0], { problems });
}
async function headLock(tx, kind, headId) {
  await advisoryLock(tx, `policy:${kind}:${headId}`);
}
async function latestPublished(tx, kind, headId) {
  const spec = POLICY_KINDS[kind];
  return d(tx, spec.delegate).findFirst({ where: { [spec.head]: headId, status: "published" }, orderBy: { versionNumber: "desc" } });
}
async function createDraft(uow, actor, kind, headId) {
  const spec = POLICY_KINDS[kind];
  const { tx } = uow;
  const head = spec.head === "packId" ? await tx.jurisdictionPack.findUnique({ where: { id: headId } }) : await tx.shop.findUnique({ where: { id: headId } });
  if (!head) throw new DomainError(Codes.NOT_FOUND, spec.head === "packId" ? "Jurisdiction pack not found." : "Shop not found.");
  await headLock(tx, kind, headId);
  const open = await d(tx, spec.delegate).findFirst({ where: { [spec.head]: headId, status: "draft" } });
  if (open) return { id: open.id, versionNumber: open.versionNumber, existing: true };
  const last = await d(tx, spec.delegate).findFirst({ where: { [spec.head]: headId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
  const base = await latestPublished(tx, kind, headId);
  const data = { [spec.head]: headId, versionNumber: (last?.versionNumber ?? 0) + 1, status: "draft", authorId: actorUserId(actor), basedOnId: base?.id ?? null };
  if (base) for (const field of spec.fields) data[field] = base[field];
  const created = await d(tx, spec.delegate).create({ data });
  if (base && spec.children) {
    const rows = await d(tx, spec.children.delegate).findMany({ where: { [spec.children.fk]: base.id } });
    for (const r of rows) {
      const copy = Object.fromEntries(Object.entries(r).filter(([k]) => !["id", "createdAt", "updatedAt"].includes(k)));
      await d(tx, spec.children.delegate).create({ data: { ...copy, [spec.children.fk]: created.id } });
    }
  }
  auditCreate(uow, actor, spec.model, created.id, "policy.draft_created", { kind, headId, versionNumber: created.versionNumber, basedOn: base?.id ?? null });
  return { id: created.id, versionNumber: created.versionNumber, existing: false };
}
async function requestPublish(uow, actor, kind, versionId, expectedVersion) {
  const spec = POLICY_KINDS[kind];
  const { tx } = uow;
  const row = await lockRow(tx, spec.model, versionId);
  if (row.status !== "draft") throw new DomainError(Codes.POLICY_PUBLISHED, "This version is already published. Make a new draft to change it.", { currentStatus: row.status });
  if (row.version !== expectedVersion) throw new DomainError(Codes.STALE_STATE, "This draft changed since you loaded it. Reload and try again.", { currentVersion: row.version });
  const { content } = await policyContent(tx, kind, versionId);
  await validatePolicy(tx, kind, row, content);
  const headId = row[spec.head];
  const published = await latestPublished(tx, kind, headId);
  const before = published ? (await policyContent(tx, kind, published.id)).content : null;
  const changes = diffContent(before, content);
  if (published && !changes.length) throw new DomainError(Codes.INVALID_INPUT, "This draft is the same as the published version.");
  const autonomyChanged = kind === "shop_policy" && changes.some((c) => c.field === "agentAutonomy" || c.field === "agentOrderLimitMinor");
  const payload = { kind, versionId, contentHash: contentHash(content), baseVersion: row.version };
  const requiredPermission = autonomyChanged ? "canApproveAgentAutonomy" : "canPublishPolicies";
  const others = await tx.user.count({ where: { id: { not: actorUserId(actor) ?? "" }, role: { [requiredPermission]: true }, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: uow.now } }] } });
  if (others === 0 && actor.kind === "user" && actor.permissions.has(requiredPermission)) {
    const result = await applyPublish(uow, actor, payload, { solo: true });
    return { published: true, ...result };
  }
  const request = await requestApproval(uow, actor, {
    action: autonomyChanged ? "agent.autonomy" : "policy.publish",
    targetList: spec.model,
    targetId: versionId,
    payload,
    requiredPermission,
    summary: `Publish ${spec.label} v${row.versionNumber}: ${changes.length} change${changes.length === 1 ? "" : "s"} (${changes.slice(0, 6).map((c) => c.field).join(", ")}${changes.length > 6 ? ", \u2026" : ""})`
  });
  return { published: false, approvalRequestId: request.id };
}
async function applyPublish(uow, actor, payload, options = {}) {
  const kind = kindOf(payload.kind);
  const spec = POLICY_KINDS[kind];
  const { tx, now } = uow;
  const row = await lockRow(tx, spec.model, payload.versionId);
  const headId = row[spec.head];
  await headLock(tx, kind, headId);
  if (row.status !== "draft") throw new DomainError(Codes.POLICY_PUBLISHED, "This version was already published or retired.", { currentStatus: row.status });
  if (row.version !== payload.baseVersion) throw new DomainError(Codes.STALE_STATE, "The draft changed after it was approved. Ask for approval again.", { currentVersion: row.version });
  const { content } = await policyContent(tx, kind, payload.versionId);
  if (contentHash(content) !== payload.contentHash) throw new DomainError(Codes.APPROVAL_MISMATCH, "The draft content changed after it was approved. Ask for approval again.");
  await validatePolicy(tx, kind, row, content);
  const previous = await latestPublished(tx, kind, headId);
  if (previous) await d(tx, spec.delegate).update({ where: { id: previous.id }, data: { status: "retired", retiredAt: now, version: { increment: 1 } } });
  await d(tx, spec.delegate).update({ where: { id: payload.versionId }, data: { status: "published", publishedAt: now, effectiveFrom: now, publishedById: actorUserId(actor), version: { increment: 1 } } });
  const shops = spec.head === "packId" ? await tx.shop.findMany({ where: { jurisdictionPackId: headId }, select: { id: true } }) : [{ id: headId }];
  for (const shop of shops) await tx.shop.update({ where: { id: shop.id }, data: { [spec.pointer]: payload.versionId, version: { increment: 1 } } });
  uow.audit({
    eventType: "policy.published",
    entityType: spec.model,
    entityId: payload.versionId,
    actorUserId: actorUserId(actor),
    approverId: options.approverId ?? null,
    before: previous ? { publishedVersionId: previous.id, versionNumber: previous.versionNumber } : null,
    after: { versionNumber: row.versionNumber, contentHash: payload.contentHash, shops: shops.map((s) => s.id) },
    metadata: { kind, solo: options.solo ?? false }
  });
  uow.emit({ topic: "policy.published", aggregateType: spec.model, aggregateId: payload.versionId, payload: { kind, headId, versionNumber: row.versionNumber }, dedupeKey: `policy.published:${payload.versionId}` });
  return { versionId: payload.versionId, versionNumber: row.versionNumber, retiredVersionId: previous?.id ?? null, shops: shops.length };
}
var publishApplier = async (uow, actor, request) => applyPublish(uow, actor, request.payload, { approverId: actor.kind === "user" ? actor.userId : null });
registerApplier("policy.publish", publishApplier);
registerApplier("agent.autonomy", publishApplier);
async function shopLaw(tx, shopId) {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, code: true, jurisdictionPolicyId: true, jurisdictionPackId: true, shopPolicyId: true } });
  if (!shop) throw new DomainError(Codes.NOT_FOUND, "Shop not found.");
  if (!shop.jurisdictionPolicyId) throw new DomainError(Codes.POLICY_MISSING, `${shop.code} has no published jurisdiction rules. Publish them under Settings \u2192 Policies first.`);
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: shop.jurisdictionPolicyId } });
  const pack = await tx.jurisdictionPack.findUniqueOrThrow({ where: { id: law.packId } });
  const shopPolicy = shop.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId } }) : null;
  return { shop, law, pack, shopPolicy, verified: pack.verified };
}

// features/keystone/seed/policy.ts
var SOURCES_CA = [
  { title: "16 CCR \xA7\xA73353-3358 (Bureau of Automotive Repair)", url: "https://www.bar.ca.gov/", note: "Estimates, authorization, invoices, replaced parts. Fetched 2026-11-07." },
  { title: "CDTFA Publication 25 (June 2026)", url: "https://www.cdtfa.ca.gov/formspubs/pub25.pdf", note: "Labor not taxable; tire and battery fees; deposit; 1.5% retained." },
  { title: "CDTFA sales and use tax rates effective 2026-10-01", url: "https://www.cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm", note: "Sacramento 8.750%, Roseville 7.750%." },
  { title: "CDTFA special taxes and fees rates", url: "https://www.cdtfa.ca.gov/taxes-and-fees/special-taxes-and-fees-tax-rates/", note: "Tire fee $1.75 (2005); California battery fee $2.00 (2022-04-01)." }
];
var CA_NOTICES = [
  { key: "estimate_right", where: "work_order", text: "You are entitled to a written estimate before work begins. We will not do any work, or charge more than the estimate, without your consent." },
  { key: "estimate_right", where: "estimate", text: "This is a written estimate. We will not do work that is not listed here, or charge more than the total shown, unless you authorize it first." },
  { key: "part_condition", where: "invoice", text: "Each part is identified as new, used, rebuilt or reconditioned. Crash parts are identified as OEM or non-OEM." },
  { key: "registration", where: "invoice", text: "Licensed by the Bureau of Automotive Repair. Automotive Repair Dealer registration number shown above." }
];
var BASE_LAW = {
  allowedAuthorizationMethods: ["in_person_signature", "written_form", "oral_phone", "electronic_link", "fleet_portal", "fleet_po"],
  authorizationEvidenceRules: { oral_phone: ["personName", "phoneNumber", "at", "amountMinor", "staffUserId"], electronic_link: ["ip", "userAgent", "consentText", "at"] },
  requireOdometerIn: true,
  requireOdometerOut: true,
  requireSignedWorkOrder: true,
  requirePartCondition: true,
  crashPartOemDefault: true,
  replacedPartsOfferRequired: true,
  replacedPartsOfferText: "You may ask for your replaced parts back when you authorize the work, except parts returned under a warranty or core exchange.",
  nonReturnableNoteText: "Parts returned under warranty or core exchange can be inspected here on request.",
  teardownRules: { required: true, maxReassemblyDaysDefault: 3, disclosureText: "If you decline the repair after teardown, we will reassemble the vehicle within the time shown, for the reassembly charge shown." },
  designeeRules: { allowed: true, evidence: ["name", "relationship", "contact"] },
  thirdPartyPayorNoticeText: "Your insurer or warranty company may pay part of this repair. You remain responsible for any amount they do not pay.",
  towingSeparateAuthorization: true,
  subletDisclosureRequired: true,
  invoiceRequiredFields: ["registrationNumber", "odometerIn", "odometerOut", "partCondition", "laborDescription", "subtotalParts", "subtotalLabor", "tax"],
  surchargeAllowed: false
};
var PACKS = [
  {
    code: "US-CA",
    name: "California",
    region: "CA",
    verified: true,
    sourceRefs: SOURCES_CA,
    law: { ...BASE_LAW, estimateThresholdMinor: null, writtenEstimateWaiverAllowed: false, toleranceRule: { kind: "fixed", fixedMinor: "0", includesTax: true }, shopSuppliesGenericAllowed: false, recordRetentionYears: 4, requiredNotices: CA_NOTICES, notes: "California: written estimate for every job; no charge above the authorized amount." }
  },
  {
    code: "US-FL",
    name: "Florida",
    region: "FL",
    verified: false,
    sourceRefs: [{ title: "Fla. Stat. \xA7\xA7559.904-.909", note: "From the RepairWorth state dataset; not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: 15000n, writtenEstimateWaiverAllowed: true, waiverFormText: "I do not want a written estimate.", toleranceRule: { kind: "max_of", percent: "0.10", fixedMinor: "1000", capMinor: "5000", includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 1, requiredNotices: [] }
  },
  {
    code: "US-IL",
    name: "Illinois",
    region: "IL",
    verified: false,
    sourceRefs: [{ title: "815 ILCS 306", note: "From the RepairWorth state dataset; not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: 10000n, writtenEstimateWaiverAllowed: true, toleranceRule: { kind: "percent", percent: "0.10", includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [] }
  },
  {
    code: "US-MI",
    name: "Michigan",
    region: "MI",
    verified: false,
    sourceRefs: [{ title: "MCL 257.1332", note: "From the RepairWorth state dataset; not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: "min_of", percent: "0.10", fixedMinor: "5000", includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [] }
  },
  {
    code: "US-NY",
    name: "New York",
    region: "NY",
    verified: false,
    sourceRefs: [{ title: "VTL \xA7\xA7398-c, 398-d; 15 NYCRR 82", note: "From the RepairWorth state dataset; not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: "fixed", fixedMinor: "0", includesTax: true }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [] }
  },
  {
    code: "US-OH",
    name: "Ohio",
    region: "OH",
    verified: false,
    sourceRefs: [{ title: "OAC 109:4-3-13", note: "From the RepairWorth state dataset; not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: 5000n, writtenEstimateWaiverAllowed: true, toleranceRule: { kind: "percent", percent: "0.10", includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 1, requiredNotices: [] }
  },
  {
    code: "US-WA",
    name: "Washington",
    region: "WA",
    verified: false,
    sourceRefs: [{ title: "RCW 46.71.025", note: "From the RepairWorth state dataset; not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: "percent", percent: "0.10", includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 3, requiredNotices: [] }
  },
  {
    code: "US-TX",
    name: "Texas",
    region: "TX",
    verified: false,
    sourceRefs: [{ title: "Occ. Code ch. 2304", note: "Covers body (non-mechanical) repair only; mechanical repair follows shop policy. Not yet re-verified." }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: "fixed", fixedMinor: "0", includesTax: true }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [], notes: "No statewide mechanical repair estimate rule; the strictest setting (no tolerance) is the default." }
  }
];
var TAX_CATEGORIES = [
  { code: "labor_repair", name: "Repair labor", description: "Labor to repair or install. Not taxable in California." },
  { code: "labor_fabrication", name: "Fabrication labor", description: "Labor to make a new part. Taxable in California." },
  { code: "parts", name: "Parts", description: "Tangible parts sold. Taxable." },
  { code: "tires", name: "Tires", description: "New tires. Taxable (the tire fee is not)." },
  { code: "fee_tire", name: "California tire fee", description: "Separately stated, not taxable." },
  { code: "fee_battery", name: "California battery fee", description: "Separately stated, not taxable." },
  { code: "battery_deposit", name: "Battery deposit", description: "Refundable deposit. Taxable; the tax is not refunded with the deposit." },
  { code: "sublet_labor", name: "Sublet labor", description: "Labor bought from another shop and resold. Follows the labor rule." },
  { code: "diagnostic", name: "Diagnostic labor", description: "Diagnosis time. Labor." }
];
var TAXABLE = { labor_repair: false, labor_fabrication: true, parts: true, tires: true, fee_tire: false, fee_battery: false, battery_deposit: true, sublet_labor: false, diagnostic: false };
var SHOP_POLICY = [
  {
    id: "seed_shop_nga",
    code: "NGA",
    taxRate: "0.087500",
    rates: [
      { code: "general", name: "General repair", rateMinor: 16500n, isDefault: true },
      { code: "diagnostic", name: "Diagnostic", rateMinor: 18500n },
      { code: "electrical", name: "Electrical", rateMinor: 18500n },
      { code: "european", name: "European", rateMinor: 19500n },
      { code: "fleet", name: "Fleet", rateMinor: 15000n }
    ]
  },
  {
    id: "seed_shop_ngt",
    code: "NGT",
    taxRate: "0.077500",
    rates: [
      { code: "general", name: "General repair", rateMinor: 14500n, isDefault: true },
      { code: "diagnostic", name: "Diagnostic", rateMinor: 16500n },
      { code: "fleet", name: "Fleet", rateMinor: 13500n }
    ]
  }
];
var PARTS_TIERS = [
  { minCostMinor: "0", maxCostMinor: "1000", multiplier: "2.500000" },
  { minCostMinor: "1000", maxCostMinor: "5000", multiplier: "2.000000" },
  { minCostMinor: "5000", maxCostMinor: "15000", multiplier: "1.750000" },
  { minCostMinor: "15000", maxCostMinor: "50000", multiplier: "1.500000" },
  { minCostMinor: "50000", maxCostMinor: null, multiplier: "1.350000" }
];
var BATTERY_DEPOSIT_PLACEHOLDER_MINOR = 1200n;
var delegate = (uow, name) => uow.tx[name];
async function seedVersion(uow, actor, kind, headId, id, fields, children = []) {
  const spec = POLICY_KINDS[kind];
  if (await delegate(uow, spec.delegate).findFirst({ where: { [spec.head]: headId, status: { in: ["published", "retired"] } }, select: { id: true } })) return false;
  if (!await delegate(uow, spec.delegate).findUnique({ where: { id }, select: { id: true } })) {
    await delegate(uow, spec.delegate).create({ data: { id, [spec.head]: headId, versionNumber: 1, status: "draft", notes: String(fields.notes ?? "Seeded"), ...Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "notes")) } });
    for (const [i, child] of children.entries()) await delegate(uow, spec.children.delegate).create({ data: { id: `${id}_${i + 1}`, ...child, [spec.children.fk]: id } });
    auditCreate(uow, actor, spec.model, id, "policy.draft_created", { kind, headId, versionNumber: 1 }, { metadata: { seed: true } });
  }
  const row = await delegate(uow, spec.delegate).findUnique({ where: { id } });
  const { content } = await policyContent(uow.tx, kind, id);
  await applyPublish(uow, actor, { kind, versionId: id, contentHash: contentHash(content), baseVersion: row.version });
  return true;
}
async function seedJurisdictions(uow, actor) {
  const { tx } = uow;
  const created = { packs: 0, taxCategories: 0, versions: 0 };
  for (const pack of PACKS) {
    const id = `seed_pack_${pack.region.toLowerCase()}`;
    if (!await tx.jurisdictionPack.findFirst({ where: { OR: [{ id }, { code: pack.code }] } })) {
      await tx.jurisdictionPack.create({ data: { id, code: pack.code, name: pack.name, region: pack.region, country: "US", verified: pack.verified, sourceRefs: pack.sourceRefs } });
      auditCreate(uow, actor, "JurisdictionPack", id, "policy.pack_created", { code: pack.code, verified: pack.verified }, { metadata: { seed: true } });
      created.packs += 1;
    }
    const packId = (await tx.jurisdictionPack.findUniqueOrThrow({ where: { code: pack.code } })).id;
    if (pack.code === "US-CA") {
      await tx.shop.updateMany({ where: { region: "CA", jurisdictionPackId: null }, data: { jurisdictionPackId: packId } });
    }
    if (await seedVersion(uow, actor, "jurisdiction", packId, `${id}_v1`, pack.law)) created.versions += 1;
  }
  for (const cat of TAX_CATEGORIES) {
    if (await tx.taxCategory.findUnique({ where: { code: cat.code } })) continue;
    await tx.taxCategory.create({ data: { id: `seed_tax_${cat.code}`, ...cat } });
    created.taxCategories += 1;
  }
  return created;
}
async function seedShopPolicy(uow, actor, shopId) {
  const { tx } = uow;
  const created = { versions: 0 };
  const shop = SHOP_POLICY.find((s) => s.id === shopId);
  if (!shop || !await tx.shop.findUnique({ where: { id: shop.id }, select: { id: true } })) return created;
  const categories = Object.fromEntries((await tx.taxCategory.findMany({ select: { id: true, code: true } })).map((c) => [c.code, c.id]));
  {
    const v = (kind) => `${shop.id}_${kind}_v1`;
    const results = [
      await seedVersion(uow, actor, "shop_policy", shop.id, v("policy"), {
        notes: "Agents propose only; parts orders by agents are off ($0 limit).",
        agentAutonomy: { "booking.propose": "propose_only", "message.draft": "propose_only", "parts.quote": "propose_only", "diagnosis.run": "propose_only", record_authorization: "off" }
      }),
      await seedVersion(
        uow,
        actor,
        "labor_rates",
        shop.id,
        v("labor"),
        { notes: "Posted hourly rates." },
        shop.rates.map((r) => ({ code: r.code, name: r.name, rateMinor: r.rateMinor, isDefault: Boolean(r.isDefault), taxCategoryId: categories[r.code === "diagnostic" ? "diagnostic" : "labor_repair"] }))
      ),
      await seedVersion(uow, actor, "labor_matrix", shop.id, v("labor_matrix"), { notes: "No labor matrix: book hours at the class rate.", bands: [], appliesToClasses: [] }),
      await seedVersion(uow, actor, "parts_matrix", shop.id, v("parts"), { notes: "Five-tier cost-plus matrix; 30% margin floor.", tiers: PARTS_TIERS, categoryOverrides: { tires: "1.250000" }, supplierOverrides: {}, marginFloorPct: "0.300000" }),
      await seedVersion(uow, actor, "fees", shop.id, v("fees"), { notes: "California tire and battery fees (CDTFA). Battery deposit amount: placeholder rate (BUILD-PLAN \xA78 V2)." }, [
        { code: "ca_tire_fee", kind: "per_unit", base: "units_of_item_category", perUnitMinor: 175n, itemCategory: "tire_new", taxTreatment: "non_taxable", separatelyStated: true, refundable: false, invoiceText: "California tire fee" },
        { code: "ca_battery_fee", kind: "per_unit", base: "units_of_item_category", perUnitMinor: 200n, itemCategory: "battery_lead_acid", taxTreatment: "non_taxable", separatelyStated: true, refundable: false, invoiceText: "California battery fee" },
        { code: "battery_deposit", kind: "per_unit", base: "units_of_item_category", perUnitMinor: BATTERY_DEPOSIT_PLACEHOLDER_MINOR, itemCategory: "battery_lead_acid", taxTreatment: "taxable", separatelyStated: true, refundable: true, refundWindowDays: 45, invoiceText: "Battery deposit (refunded when a used battery is returned within 45 days) - placeholder rate" }
      ]),
      await seedVersion(
        uow,
        actor,
        "tax",
        shop.id,
        v("tax"),
        { notes: `CDTFA combined rate for ${shop.code === "NGA" ? "Sacramento" : "Roseville"}, effective 2026-10-01.`, rounding: "per_line" },
        Object.entries(TAXABLE).map(([code, taxable]) => ({ categoryId: categories[code], taxable, rate: taxable ? shop.taxRate : "0.000000", coreChargeRule: "refund_refunds_tax", warrantyDeductibleRule: code === "parts" ? "parts_share" : "none" }))
      ),
      await seedVersion(uow, actor, "warranty", shop.id, v("warranty"), { notes: "Nationwide 24 months / 24,000 miles on parts and labor." }, [
        { code: "standard", name: "24 months / 24,000 miles", months: 24, miles: 24e3, appliesTo: ["parts", "labor"], invoiceText: "Parts and labor are warranted for 24 months or 24,000 miles, whichever comes first." },
        { code: "tires", name: "Tire road hazard 12 months", months: 12, miles: 12e3, appliesTo: ["tires"], invoiceText: "Road hazard coverage for 12 months or 12,000 miles." }
      ])
    ];
    created.versions += results.filter(Boolean).length;
  }
  return created;
}

// features/keystone/mutations/setup.ts
var CUSTOMER_BATCH = 5;
function northgateSteps(actor, scope = "all") {
  const steps = [
    { name: "platform", run: (uow) => seedOrgPlatform(uow, actor) },
    { name: "jurisdictions", run: (uow) => seedJurisdictions(uow, actor) },
    ...SHOP_POLICY.map((shop) => ({ name: `policy_${shop.code.toLowerCase()}`, run: (uow) => seedShopPolicy(uow, actor, shop.id) })),
    { name: "booking_rules", run: async (uow) => ({ bookingRules: await seedBookingRules(uow, actor) }) }
  ];
  if (scope === "spine") return steps;
  for (let from = 0; from < CUSTOMERS.length; from += CUSTOMER_BATCH) {
    steps.push({ name: `customers_${from}`, run: (uow) => seedCustomers(uow, actor, from, from + CUSTOMER_BATCH) });
  }
  steps.push({ name: "fleets", run: async (uow) => {
    const r = await seedFleets(uow, actor);
    return { fleetAccounts: r.accounts, fleetVehicles: r.vehicles };
  } });
  steps.push({ name: "vehicle_data", run: async (uow) => ({ vehicleData: await seedRecordedVehicleData(uow, actor) }) });
  steps.push({ name: "appointments", run: async (uow) => ({ appointments: await seedAppointments(uow, actor) }) });
  return steps;
}
var add = (total, part) => {
  for (const [k, v] of Object.entries(part)) total[k] = (total[k] ?? 0) + v;
  return total;
};
async function loadNorthgateSetup(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOnboarding");
  const created = {};
  let replay = true;
  if (args.scope && !["spine", "all"].includes(args.scope)) throw new DomainError(Codes.INVALID_INPUT, "Scope is spine or all.", { field: "scope" });
  for (const step of northgateSteps(actor, args.scope ?? "all")) {
    const result = await command(context.prisma, { name: `setup.load_northgate.${step.name}`, actor, idempotencyKey: `${args.idempotencyKey}:${step.name}`, params: {} }, step.run);
    replay &&= result.replay;
    add(created, result.value);
  }
  return { replay, created };
}

// features/keystone/mutations/audit.ts
async function verifyAuditChain2(_root, _args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canReadAudit");
  return verifyAuditChain(context.prisma);
}

// features/keystone/lib/orgControls.ts
var KEYS = ["strictAgentOwnerSoD", "customerSharing", "retentionYearsOverride"];
function validateOrgControls(input) {
  const keys = Object.keys(input ?? {});
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, "Nothing to change.");
  const out = {};
  for (const key of keys) if (!KEYS.includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not an organisation control.`, { field: key });
  if (input.strictAgentOwnerSoD !== void 0) {
    if (typeof input.strictAgentOwnerSoD !== "boolean") throw new DomainError(Codes.INVALID_INPUT, "strictAgentOwnerSoD must be true or false.");
    out.strictAgentOwnerSoD = input.strictAgentOwnerSoD;
  }
  if (input.customerSharing !== void 0) {
    if (input.customerSharing !== "shared_all_shops" && input.customerSharing !== "per_shop") throw new DomainError(Codes.INVALID_INPUT, "customerSharing must be shared_all_shops or per_shop.", { field: "customerSharing" });
    out.customerSharing = input.customerSharing;
  }
  if (input.retentionYearsOverride !== void 0) {
    const years = input.retentionYearsOverride;
    if (years !== null && (!Number.isSafeInteger(years) || years < 1 || years > 30)) throw new DomainError(Codes.INVALID_INPUT, "retentionYearsOverride must be a whole number of years from 1 to 30, or empty.", { field: "retentionYearsOverride" });
    out.retentionYearsOverride = years;
  }
  return out;
}
async function requestOrgControlsChange(uow, actor, input, reason) {
  const changes = validateOrgControls(input);
  const org = await uow.tx.organizationSettings.findUnique({ where: { id: 1 } });
  if (!org) throw new DomainError(Codes.NOT_FOUND, "Organisation settings are not set up yet.");
  return requestApproval(uow, actor, {
    action: "org.controls",
    targetList: "OrganizationSettings",
    targetId: "1",
    payload: { changes, baseVersion: org.version },
    requiredPermission: "canApproveAgentAutonomy",
    summary: `Change organisation controls: ${Object.keys(changes).join(", ")}${reason ? ` (${reason})` : ""}`
  });
}
registerApplier("org.controls", async (uow, actor, request) => {
  const [org] = await uow.tx.$queryRaw`SELECT version FROM "OrganizationSettings" WHERE id = 1 FOR UPDATE`;
  if (!org) throw new DomainError(Codes.NOT_FOUND, "Organisation settings are not set up yet.");
  const { changes, baseVersion } = request.payload;
  if (org.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, "Organisation settings changed after this was approved. Request the change again.", { currentVersion: org.version });
  const before = await uow.tx.organizationSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true, customerSharing: true, retentionYearsOverride: true } });
  const updated = await uow.tx.organizationSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...changes, version: { increment: 1 } } });
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "Organisation settings changed while applying.");
  uow.audit({ eventType: "org.controls_changed", entityType: "OrganizationSettings", entityId: "1", actorUserId: actor.kind === "user" ? actor.userId : null, before, after: changes });
  return { applied: Object.keys(changes) };
});

// features/keystone/mutations/approvals.ts
async function decideApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  if (args.decision !== "approve" && args.decision !== "reject") throw new DomainError(Codes.INVALID_INPUT, "Decision must be approve or reject.");
  if (args.decision === "reject" && !args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why you are rejecting it.", { field: "reason" });
  const result = await command(context.prisma, { name: "approval.decide", actor, idempotencyKey: args.idempotencyKey, params: { requestId: args.requestId, decision: args.decision, reason: args.reason ?? "", expectedVersion: args.expectedVersion } }, async (uow) => {
    const org = await uow.tx.organizationSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true } });
    const decided = await decideApproval(uow, actor, { requestId: args.requestId, decision: args.decision, reason: args.reason ?? void 0, expectedVersion: args.expectedVersion, strictAgentOwner: org?.strictAgentOwnerSoD ?? true });
    let applied = null;
    const registration = applierFor(String(decided.action));
    if (args.decision === "approve" && registration?.applyOnApprove) {
      const request = await uow.tx.approvalRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      await consumeApproval(uow, { requestId: request.id, action: request.action, targetList: request.targetList, targetId: request.targetId, payload: request.payload });
      applied = await registration.apply(uow, actor, request);
    }
    return { id: decided.id, status: decided.status, applied };
  });
  return { replay: result.replay, ...result.value };
}
async function cancelApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  const result = await command(context.prisma, { name: "approval.cancel", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const row = await transition(uow, {
      model: "ApprovalRequest",
      id: args.requestId,
      from: ["pending"],
      to: "cancelled",
      expectedVersion: args.expectedVersion,
      actor,
      eventType: "approval.cancelled",
      reason: args.reason ?? null,
      guard: (request) => {
        if (actor.kind !== "user" || request.requestedById !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Only the person who asked can withdraw a request.");
      }
    });
    return { id: row.id, status: row.status };
  });
  return { replay: result.replay, ...result.value };
}
async function requestOrgControls(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOrganization", "canManageAgents");
  if (!args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the controls should change.", { field: "reason" });
  const result = await command(context.prisma, { name: "org.controls.request", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const request = await requestOrgControlsChange(uow, actor, args.changes, args.reason.trim());
    return { id: request.id, status: request.status };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/lib/checkIn.ts
function workOrderText(input) {
  const lines = [
    `${input.legalName} (${input.shopName})`,
    input.registrations?.barArd ? `Automotive Repair Dealer registration ${String(input.registrations.barArd)}` : null,
    "",
    "You asked us to look at:",
    ...input.concerns.map((c, i) => `${i + 1}. ${c}`),
    "",
    input.odometer !== null && input.odometer !== void 0 ? `Odometer in: ${input.odometer.toLocaleString("en-US")}` : null,
    input.promisedAt ? `Promised: ${input.promisedAt.toLocaleString("en-US", { timeZone: input.timeZone, dateStyle: "medium", timeStyle: "short" })}` : null,
    "",
    ...input.notices.filter((n) => n.where === "work_order").map((n) => n.text),
    input.replacedPartsOfferText ?? null
  ];
  return lines.filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
var MAX_STROKES = 400;
function checkSignature(signature) {
  if (!signature) return null;
  const signerName = String(signature.signerName ?? "").trim();
  if (!signerName || signerName.length > 120) throw new DomainError(Codes.SIGNATURE_REQUIRED, "Enter the name of the person signing.", { field: "signerName" });
  const strokes = Array.isArray(signature.strokes) ? signature.strokes : [];
  if (strokes.length > MAX_STROKES || strokes.some((s) => !Array.isArray(s) || s.length > 2e3 || s.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))) {
    throw new DomainError(Codes.INVALID_INPUT, "The signature could not be read. Clear it and sign again.", { field: "signature" });
  }
  const points = strokes.reduce((n, s) => n + s.length, 0);
  if (points < 8 && !signature.typedAcknowledgement) throw new DomainError(Codes.SIGNATURE_REQUIRED, "Ask the customer to sign in the box.", { field: "signature" });
  if (!["in_person", "electronic_link"].includes(signature.method)) throw new DomainError(Codes.INVALID_INPUT, "Choose how the work order was signed.");
  return { method: signature.method, signerName, strokes: strokes.map((s) => s.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])), typedAcknowledgement: Boolean(signature.typedAcknowledgement) };
}
async function checkInVehicle(uow, actor, input) {
  const { tx, now } = uow;
  const { shop, law, shopPolicy } = await shopLaw(tx, input.shopId);
  const full = await tx.shop.findUniqueOrThrow({ where: { id: input.shopId }, select: { code: true, name: true, legalName: true, registrations: true, timeZone: true } });
  const concerns = (input.concerns ?? []).map((c) => String(c).trim()).filter(Boolean).map((c) => c.slice(0, 500));
  if (!concerns.length) throw new DomainError(Codes.INVALID_INPUT, "Write down at least one concern in the customer's words.", { field: "concerns" });
  if (concerns.length > 20) throw new DomainError(Codes.INVALID_INPUT, "Twenty concerns at most. Group related ones.", { field: "concerns" });
  if (law.requireOdometerIn && !input.odometer) throw new DomainError(Codes.ODOMETER_REQUIRED, "Record the odometer reading. This state requires it on the invoice.", { field: "odometer" });
  const promisedRequired = shopPolicy?.promisedTimeRequired ?? true;
  if (promisedRequired && !input.promisedAt) throw new DomainError(Codes.INVALID_INPUT, "Give the customer a promised time.", { field: "promisedAt" });
  if (input.promisedAt && input.promisedAt.getTime() <= now.getTime()) throw new DomainError(Codes.INVALID_INPUT, "The promised time must be later than now.", { field: "promisedAt" });
  const signature = checkSignature(input.signature);
  if (law.requireSignedWorkOrder && !signature) throw new DomainError(Codes.SIGNATURE_REQUIRED, "The customer must sign the work order before work starts.", { field: "signature" });
  const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, status: true } });
  if (!customer || customer.status !== "active") throw new DomainError(Codes.NOT_FOUND, "Customer not found.");
  const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true, status: true } });
  if (!vehicle || vehicle.status !== "active") throw new DomainError(Codes.NOT_FOUND, "Vehicle not found.");
  await advisoryLock(tx, `checkin:${input.vehicleId}`);
  const open = await tx.checkIn.findFirst({ where: { vehicleId: input.vehicleId, shopId: input.shopId, at: { gt: new Date(now.getTime() - 12 * 36e5) } }, select: { reference: true } });
  if (open) throw new DomainError(Codes.DUPLICATE, `This vehicle was checked in ${open.reference} in the last 12 hours.`);
  const reference = await nextShopReference(tx, "CI", shop.code, now);
  const notices = Array.isArray(law.requiredNotices) ? law.requiredNotices : [];
  const text11 = workOrderText({
    shopName: full.name,
    legalName: full.legalName,
    registrations: full.registrations ?? {},
    concerns,
    notices,
    replacedPartsOfferText: law.replacedPartsOfferRequired ? law.replacedPartsOfferText : null,
    promisedAt: input.promisedAt ?? null,
    odometer: input.odometer?.value ?? null,
    timeZone: full.timeZone
  });
  const latestRecall = await tx.recallCheck.findFirst({ where: { vehicleId: input.vehicleId }, orderBy: { checkedAt: "desc" }, select: { id: true, campaignCount: true, parkItAny: true, checkedAt: true, campaigns: true } });
  const recallWarning = latestRecall && latestRecall.campaignCount > 0 ? { recallCheckId: latestRecall.id, count: latestRecall.campaignCount, doNotDrive: latestRecall.parkItAny, checkedAt: latestRecall.checkedAt, campaigns: (latestRecall.campaigns ?? []).slice(0, 10).map((c) => ({ number: c.nhtsaCampaignNumber, component: c.component, parkIt: c.parkIt, parkOutSide: c.parkOutSide })) } : null;
  const row = await tx.checkIn.create({
    data: {
      shopId: input.shopId,
      reference,
      ...input.appointmentId ? { appointment: { connect: { id: input.appointmentId } } } : {},
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      concerns,
      keyTag: input.keyTag?.trim().slice(0, 20) ?? "",
      waiter: input.waiter ?? false,
      promisedAt: input.promisedAt ?? null,
      contactPreference: input.contactPreference ?? "sms",
      transportationNeed: input.transportationNeed ?? "none",
      signatureMethod: signature?.method ?? "in_person",
      signerName: signature?.signerName ?? "",
      signature: signature ?? void 0,
      signatureHash: signature ? sha256(canonicalJson(signature)) : "",
      workOrderText: text11,
      workOrderHash: sha256(text11),
      signedAt: signature ? now : null,
      valuablesNote: input.valuablesNote?.trim().slice(0, 500) ?? "",
      recallWarning: recallWarning ?? void 0,
      jurisdictionPolicyVersionId: law.id,
      at: now,
      byId: actorUserId(actor)
    }
  });
  let odometer = null;
  if (input.odometer) {
    odometer = await recordOdometer(uow, actor, { vehicleId: input.vehicleId, value: input.odometer.value, unit: input.odometer.unit, source: "ro_in", overrideReason: input.odometer.overrideReason, checkInId: row.id });
    await tx.checkIn.update({ where: { id: row.id }, data: { odometerInId: odometer.id } });
  }
  if (input.appointmentId) {
    await transition(uow, {
      model: "Appointment",
      id: input.appointmentId,
      from: ["requested", "confirmed"],
      to: "arrived",
      actor,
      eventType: "appointment.arrived",
      guard: (a) => {
        if (a.shopId !== input.shopId) throw new DomainError(Codes.INVALID_INPUT, "The appointment is at another shop.");
        if (a.vehicleId && a.vehicleId !== input.vehicleId) throw new DomainError(Codes.INVALID_INPUT, "The appointment is for another vehicle.");
      },
      data: { customerId: input.customerId, vehicleId: input.vehicleId }
    });
  }
  auditCreate(uow, actor, "CheckIn", row.id, "vehicle.checked_in", { reference, shopId: input.shopId, vehicleId: input.vehicleId, appointmentId: input.appointmentId ?? null, workOrderHash: sha256(text11), signed: Boolean(signature), odometerAnomaly: odometer?.anomaly ?? null, recallWarning: Boolean(recallWarning), lawVersion: law.id });
  uow.emit({ topic: "vehicle.checked_in", aggregateType: "CheckIn", aggregateId: row.id, payload: { reference, shopId: input.shopId }, dedupeKey: `checkin:${row.id}` });
  return { id: row.id, reference, recallWarning, odometerAnomaly: odometer?.anomaly ?? null };
}

// features/integrations/vehicle-data/index.ts
function vehicleData() {
  return process.env.VEHICLE_DATA_PROVIDER === "fixture" ? fixtureAdapter() : nhtsaAdapter();
}

// features/keystone/mutations/phase1.ts
var KINDS = ["drop_off", "waiter", "pickup_delivery", "mobile"];
function requireShop(context, shopId) {
  if (typeof shopId !== "string" || !shopId) throw new DomainError(Codes.INVALID_INPUT, "Choose a shop.", { field: "shopId" });
  const ids = sessionShopIds(context.session);
  if (ids !== "all" && !ids.includes(shopId)) throw new DomainError(Codes.NOT_AUTHORIZED, "You don't work at this shop.");
  return shopId;
}
var date = (value, field) => {
  const d2 = new Date(String(value ?? ""));
  if (Number.isNaN(d2.getTime())) throw new DomainError(Codes.INVALID_INPUT, "Enter a valid date and time.", { field });
  return d2;
};
var run = async (context, actor, name, idempotencyKey, params, work) => {
  const result = await command(context.prisma, { name, actor, idempotencyKey, params }, work);
  return { replay: result.replay, ...result.value };
};
async function createPolicyDraft(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManagePolicies");
  const kind = kindOf(args.kind);
  if (kind !== "jurisdiction") requireShop(context, args.headId);
  return run(context, actor, "policy.draft", args.idempotencyKey, args, (uow) => createDraft(uow, actor, kind, args.headId));
}
async function publishPolicyVersion(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManagePolicies", "canPublishPolicies");
  const kind = kindOf(args.kind);
  return run(context, actor, "policy.publish", args.idempotencyKey, args, (uow) => requestPublish(uow, actor, kind, args.versionId, args.expectedVersion));
}
async function saveCustomer(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers");
  if (args.input?.homeShopId) requireShop(context, args.input.homeShopId);
  const { createId: _ignored, serviceTextConsent, ...input } = args.input ?? {};
  return run(context, actor, "customer.save", args.idempotencyKey, args.input, async (uow) => {
    const saved = await upsertCustomer(uow, actor, input);
    if (serviceTextConsent) {
      const index = (input.contacts ?? []).findIndex((c) => c.kind === "mobile");
      if (index >= 0 && saved.contactIds[index]) await recordConsent(uow, actor, { contactId: saved.contactIds[index], channel: "sms", purpose: "transactional", action: "granted", method: "staff_recorded", evidence: { note: "Verbal agreement at the counter" } });
    }
    return saved;
  });
}
async function addCustomerContact(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers");
  return run(context, actor, "customer.contact.add", args.idempotencyKey, args, async (uow) => {
    const row = await addContact(uow, actor, args.customerId, args.contact, Boolean(args.allowDuplicate));
    return { id: row.id };
  });
}
async function recordContactConsent(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers", "canMessageCustomers");
  return run(context, actor, "customer.consent", args.idempotencyKey, args.input, (uow) => recordConsent(uow, actor, args.input));
}
async function saveBusinessAccount(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers");
  return run(context, actor, "business_account.create", args.idempotencyKey, args, (uow) => createBusinessAccount(uow, actor, { name: args.name, termsDays: args.termsDays ?? 0, poRequired: args.poRequired ?? false }));
}
async function saveVehicle(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers", "canWriteRepairOrders");
  const { createId: _ignored, ...input } = args.input ?? {};
  return run(context, actor, "vehicle.save", args.idempotencyKey, input, (uow) => upsertVehicle(uow, actor, input));
}
async function linkVehicleOwner(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers");
  return run(context, actor, "vehicle.owner", args.idempotencyKey, args, (uow) => linkOwner(uow, actor, args.vehicleId, { customerId: args.customerId ?? null, businessAccountId: args.businessAccountId ?? null }));
}
async function recordOdometerReading(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canWriteRepairOrders", "canManageCustomers");
  return run(context, actor, "vehicle.odometer", args.idempotencyKey, args, (uow) => recordOdometer(uow, actor, { vehicleId: args.vehicleId, value: args.value, unit: args.unit ?? void 0, source: "customer", overrideReason: args.overrideReason }));
}
async function decodeVehicleVin(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageCustomers", "canWriteRepairOrders");
  const vehicle = await vehicleForLookup(context.prisma, args.vehicleId);
  const vin2 = checkVin(vehicle.vin);
  if (!vin2.vin || vin2.validity === "invalid_format" || vin2.validity === "none") throw new DomainError(Codes.INVALID_INPUT, "This vehicle has no VIN to decode.", { field: "vin" });
  const adapter = vehicleData();
  const observedAt = /* @__PURE__ */ new Date();
  const result = await adapter.decodeVin(vin2.vin, vehicle.year ?? void 0);
  if (result.kind === "error") throw new DomainError(Codes.PROVIDER_UNAVAILABLE, result.retryable ? "NHTSA did not answer. Try again in a minute, or enter the details by hand." : "NHTSA could not decode this VIN. Check it, or enter the details by hand.", { reason: result.code });
  return run(context, actor, "vehicle.decode", args.idempotencyKey, { vehicleId: args.vehicleId, vin: vin2.vin }, (uow) => storeDecode(uow, actor, args.vehicleId, result.value, observedAt, adapter.key === "fixture"));
}
async function checkVehicleRecalls(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canReadRepairOrders");
  const vehicle = await vehicleForLookup(context.prisma, args.vehicleId);
  if (!vehicle.make || !vehicle.model || !vehicle.year) throw new DomainError(Codes.INVALID_INPUT, "Add the year, make and model (or decode the VIN) first.");
  const query = { make: vehicle.make, model: vehicle.model, modelYear: vehicle.year };
  const adapter = vehicleData();
  const observedAt = /* @__PURE__ */ new Date();
  const result = await adapter.recallsByVehicle(query);
  if (result.kind === "error") throw new DomainError(Codes.PROVIDER_UNAVAILABLE, "NHTSA recalls did not answer. Try again in a minute.", { reason: result.code });
  return run(context, actor, "vehicle.recalls", args.idempotencyKey, { vehicleId: args.vehicleId, ...query }, (uow) => storeRecallCheck(uow, actor, args.vehicleId, query, result.value, observedAt, adapter.key === "fixture"));
}
var kindArg = (value) => {
  if (!KINDS.includes(value)) throw new DomainError(Codes.INVALID_INPUT, "Choose drop-off, waiter, pickup or mobile.", { field: "kind" });
  return value;
};
async function holdAppointmentSlot(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageSchedule");
  const shopId = requireShop(context, args.shopId);
  return run(context, actor, "appointment.hold", args.idempotencyKey, args, (uow) => placeHold(uow, actor, { shopId, startsAt: date(args.startsAt, "startsAt"), kind: kindArg(args.kind), estimatedCentiHours: args.estimatedCentiHours ?? 100, source: "staff" }));
}
async function bookShopAppointment(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageSchedule");
  const shopId = requireShop(context, args.shopId);
  return run(context, actor, "appointment.book", args.idempotencyKey, args, (uow) => bookAppointment(uow, actor, {
    shopId,
    startsAt: date(args.startsAt, "startsAt"),
    kind: kindArg(args.kind),
    estimatedCentiHours: args.estimatedCentiHours ?? 100,
    customerId: args.customerId ?? null,
    vehicleId: args.vehicleId ?? null,
    lead: args.lead ?? null,
    concernText: args.concernText ?? null,
    requestedServices: args.requestedServices ?? [],
    source: "staff",
    holdToken: args.holdToken ?? null,
    confirm: Boolean(args.confirm)
  }));
}
async function appointmentShop(context, id) {
  const row = await context.prisma.appointment.findUnique({ where: { id }, select: { shopId: true } });
  if (!row) throw new DomainError(Codes.NOT_FOUND, "Appointment not found.");
  return requireShop(context, row.shopId);
}
async function transitionAppointment(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageSchedule");
  await appointmentShop(context, args.id);
  return run(context, actor, `appointment.${args.to}`, args.idempotencyKey, args, (uow) => {
    switch (args.to) {
      case "confirmed":
        return confirmAppointment(uow, actor, args.id, args.expectedVersion);
      case "cancelled":
        return cancelAppointment(uow, actor, { id: args.id, reason: args.reason ?? "", expectedVersion: args.expectedVersion });
      case "no_show":
        return markNoShow(uow, actor, { id: args.id, expectedVersion: args.expectedVersion });
      case "rescheduled":
        return rescheduleAppointment(uow, actor, { id: args.id, startsAt: date(args.startsAt, "startsAt"), expectedVersion: args.expectedVersion });
      default:
        throw new DomainError(Codes.INVALID_INPUT, "Choose confirm, reschedule, cancel or no-show. Arrival happens at check-in.");
    }
  });
}
async function checkInShopVehicle(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canWriteRepairOrders");
  const shopId = requireShop(context, args.input?.shopId);
  if (args.input.appointmentId) {
    const shopOfAppointment = await appointmentShop(context, args.input.appointmentId);
    if (shopOfAppointment !== shopId) throw new DomainError(Codes.INVALID_INPUT, "The appointment is at another shop.");
  }
  const input = { ...args.input, shopId, promisedAt: args.input.promisedAt ? date(args.input.promisedAt, "promisedAt") : null };
  return run(context, actor, "vehicle.check_in", args.idempotencyKey, args.input, (uow) => checkInVehicle(uow, actor, input));
}
async function checkAuthorizedCeiling(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canReadRepairOrders");
  const shopId = requireShop(context, args.shopId);
  const whole = (v, field) => {
    if (typeof v !== "string" || !/^\d{1,15}$/.test(v)) throw new DomainError(Codes.INVALID_INPUT, "Amounts are whole cents.", { field });
    return BigInt(v);
  };
  const shop = await context.prisma.shop.findUnique({ where: { id: shopId }, select: { jurisdictionPolicyId: true } });
  if (!shop?.jurisdictionPolicyId) throw new DomainError(Codes.POLICY_MISSING, "This shop has no published jurisdiction rules.");
  const law = await context.prisma.jurisdictionPolicyVersion.findUnique({ where: { id: shop.jurisdictionPolicyId }, select: { toleranceRule: true, id: true } });
  const result = assertWithinCeiling({ rule: law.toleranceRule, authorizedMinor: whole(args.authorizedMinor, "authorizedMinor"), priceMinor: whole(args.priceMinor, "priceMinor"), taxMinor: args.taxMinor ? whole(args.taxMinor, "taxMinor") : 0n });
  return { ok: true, ceilingMinor: result.ceilingMinor.toString(), comparedMinor: result.comparedMinor.toString(), policyVersionId: law.id };
}

// features/keystone/mutations/index.ts
var graphql2 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql2`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        checkAuthorizedCeiling(shopId: ID!, authorizedMinor: String!, priceMinor: String!, taxMinor: String): JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadNorthgateSetup(idempotencyKey: String!, scope: String): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestOrgControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
        createPolicyDraft(kind: String!, headId: ID!, idempotencyKey: String!): JSON
        publishPolicyVersion(kind: String!, versionId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        saveCustomer(input: JSON!, idempotencyKey: String!): JSON
        addCustomerContact(customerId: ID!, contact: JSON!, allowDuplicate: Boolean, idempotencyKey: String!): JSON
        recordContactConsent(input: JSON!, idempotencyKey: String!): JSON
        saveBusinessAccount(name: String!, termsDays: Int, poRequired: Boolean, idempotencyKey: String!): JSON
        saveVehicle(input: JSON!, idempotencyKey: String!): JSON
        linkVehicleOwner(vehicleId: ID!, customerId: ID, businessAccountId: ID, idempotencyKey: String!): JSON
        recordOdometerReading(vehicleId: ID!, value: Int!, unit: String, overrideReason: String, idempotencyKey: String!): JSON
        decodeVehicleVin(vehicleId: ID!, idempotencyKey: String!): JSON
        checkVehicleRecalls(vehicleId: ID!, idempotencyKey: String!): JSON
        holdAppointmentSlot(shopId: ID!, startsAt: String!, kind: String!, estimatedCentiHours: Int, idempotencyKey: String!): JSON
        bookShopAppointment(shopId: ID!, startsAt: String!, kind: String!, estimatedCentiHours: Int, customerId: ID, vehicleId: ID, lead: JSON, concernText: String, requestedServices: [String!], holdToken: String, confirm: Boolean, idempotencyKey: String!): JSON
        transitionAppointment(id: ID!, to: String!, expectedVersion: Int!, reason: String, startsAt: String, idempotencyKey: String!): JSON
        checkInShopVehicle(input: JSON!, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        verifyAuditChain: op(verifyAuditChain2),
        checkAuthorizedCeiling: op(checkAuthorizedCeiling)
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        loadNorthgateSetup: op(loadNorthgateSetup),
        decideApprovalRequest: op(decideApprovalRequest),
        cancelApprovalRequest: op(cancelApprovalRequest),
        requestOrgControls: op(requestOrgControls),
        createPolicyDraft: op(createPolicyDraft),
        publishPolicyVersion: op(publishPolicyVersion),
        saveCustomer: op(saveCustomer),
        addCustomerContact: op(addCustomerContact),
        recordContactConsent: op(recordContactConsent),
        saveBusinessAccount: op(saveBusinessAccount),
        saveVehicle: op(saveVehicle),
        linkVehicleOwner: op(linkVehicleOwner),
        recordOdometerReading: op(recordOdometerReading),
        decodeVehicleVin: op(decodeVehicleVin),
        checkVehicleRecalls: op(checkVehicleRecalls),
        holdAppointmentSlot: op(holdAppointmentSlot),
        bookShopAppointment: op(bookShopAppointment),
        transitionAppointment: op(transitionAppointment),
        checkInShopVehicle: op(checkInShopVehicle)
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id)
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}

// features/keystone/prismaConstraints.ts
var COMPOUND_UNIQUES = {
  ShopCalendarException: ['@@unique([calendarId, date], map: "ShopCalendarException_calendar_date_key")'],
  ShopMembership: ['@@unique([userId, shopId], map: "ShopMembership_user_shop_key")'],
  Bay: ['@@unique([shopId, code], map: "Bay_shop_code_key")'],
  // Phase 0 indexes, declared here so later migrations keep them.
  AuditEvent: ['@@index([entityType, entityId, at], map: "AuditEvent_entity_idx")'],
  Obligation: ['@@index([status, dueAt], map: "Obligation_due_idx")'],
  // Policy versions (SCHEMA §2): one number per head.
  JurisdictionPolicyVersion: ['@@unique([packId, versionNumber], map: "JurisdictionPolicyVersion_pack_number_key")'],
  LaborRateClassSetVersion: ['@@unique([shopId, versionNumber], map: "LaborRateClassSetVersion_shop_number_key")'],
  LaborMatrixVersion: ['@@unique([shopId, versionNumber], map: "LaborMatrixVersion_shop_number_key")'],
  PartsMatrixVersion: ['@@unique([shopId, versionNumber], map: "PartsMatrixVersion_shop_number_key")'],
  FeePolicyVersion: ['@@unique([shopId, versionNumber], map: "FeePolicyVersion_shop_number_key")'],
  TaxRuleSetVersion: ['@@unique([shopId, versionNumber], map: "TaxRuleSetVersion_shop_number_key")'],
  WarrantyTermSetVersion: ['@@unique([shopId, versionNumber], map: "WarrantyTermSetVersion_shop_number_key")'],
  ShopPolicyVersion: ['@@unique([shopId, versionNumber], map: "ShopPolicyVersion_shop_number_key")'],
  LaborRateClass: ['@@unique([setId, code], map: "LaborRateClass_set_code_key")'],
  TaxRule: ['@@unique([ruleSetId, categoryId], map: "TaxRule_set_category_key")'],
  WarrantyTerm: ['@@unique([termSetId, code], map: "WarrantyTerm_set_code_key")'],
  // Customers and vehicles (SCHEMA §3, §20).
  CustomerContact: ['@@unique([customerId, kind, valueHash], map: "CustomerContact_customer_kind_hash_key")'],
  Customer: ['@@index([lastName, firstName], map: "Customer_name_idx")'],
  PlateRegistration: ['@@index([state, plate], map: "PlateRegistration_state_plate_idx")'],
  ExternalReference: ['@@unique([system, entityType, externalId], map: "ExternalReference_system_entity_external_key")', '@@index([entityType, entityId], map: "ExternalReference_entity_idx")'],
  OdometerReading: ['@@index([vehicleId, at], map: "OdometerReading_vehicle_at_idx")'],
  ContactConsent: ['@@index([contactId, channel, purpose, at], map: "ContactConsent_latest_idx")'],
  RecallCheck: ['@@index([vehicleId, checkedAt], map: "RecallCheck_vehicle_at_idx")'],
  // Scheduling (SCHEMA §4).
  Appointment: ['@@index([shopId, startsAt], map: "Appointment_shop_starts_idx")', '@@index([shopId, date, status], map: "Appointment_shop_date_status_idx")'],
  BookingHold: ['@@index([shopId, date, status], map: "BookingHold_shop_date_status_idx")']
};
function addDatabaseConstraints(schema) {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`);
    const model = schema.match(pattern)?.[0];
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`);
    const missing = directives.filter((directive) => !model.includes(directive));
    if (!missing.length) continue;
    schema = schema.replace(model, model.replace(/\n\}$/, `
${missing.map((directive) => `  ${directive}`).join("\n")}
}`));
  }
  return schema;
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Owner / Admin",
          // Every permission except break-glass, which is never granted by default.
          ...Object.fromEntries(permissionNames.filter((name) => name !== "canBreakGlass").map((name) => [name, true]))
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    kind
    accessExpiresAt
    role {
      id
      name
      ${permissionNames.join("\n      ")}
    }
    memberships(where: { status: { equals: "active" } }) {
      status
      shop { id }
    }
  `
});
var keystone_default = withAuth(
  (0, import_core13.config)({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaSchema: addDatabaseConstraints
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => isSignedIn({ session }) && session?.data.role?.canAccessDashboard === true
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions((0, import_session.statelessSessions)(sessionConfig)),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
