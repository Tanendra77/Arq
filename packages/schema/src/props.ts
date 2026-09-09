import { z } from "zod";

export const NODE_TYPES = [
  "broker", "queue", "topic", "app", "consumer", "publisher",
  "mesh", "gateway", "store", "external", "shape",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_KINDS = [
  "publish", "subscribe", "bind", "bridge", "dmr", "replication", "request-reply", "generic",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const GROUP_KINDS = ["region", "dc", "vpc", "cluster", "zone", "generic"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

const AppProps = z.object({
  language: z.string().optional(),
  protocol: z.enum(["SMF", "JCSMP", "MQTT", "AMQP", "REST", "JMS"]).optional(),
}).strict();

export const NODE_PROP_SCHEMAS = {
  broker: z.object({
    vpn: z.string().optional(),
    role: z.enum(["primary", "backup", "monitor"]).optional(),
    deployment: z.enum(["software", "appliance", "cloud"]).optional(),
  }).strict(),
  queue: z.object({
    accessType: z.enum(["exclusive", "non-exclusive"]).optional(),
    durable: z.boolean().default(true),
  }).strict(),
  topic: z.object({ qos: z.enum(["direct", "guaranteed"]).optional() }).strict(),
  app: AppProps,
  consumer: AppProps,
  publisher: AppProps,
  mesh: z.object({ clusterName: z.string().optional() }).strict(),
  gateway: z.object({ protocol: z.enum(["REST", "MQTT", "AMQP"]).optional() }).strict(),
  store: z.object({ kind: z.enum(["database", "cache", "object-store", "filesystem"]).optional() }).strict(),
  external: z.object({ vendor: z.string().optional() }).strict(),
  shape: z.record(z.string()),
} as const satisfies Record<NodeType, z.ZodTypeAny>;

const NoProps = z.object({}).strict();
const QosProps = z.object({ qos: z.enum(["direct", "guaranteed"]).optional() }).strict();

export const EDGE_PROP_SCHEMAS = {
  publish: QosProps,
  subscribe: QosProps,
  bind: NoProps,
  bridge: NoProps,
  dmr: NoProps,
  replication: z.object({ mode: z.enum(["sync", "async"]).optional() }).strict(),
  "request-reply": NoProps,
  generic: NoProps,
} as const satisfies Record<EdgeKind, z.ZodTypeAny>;
