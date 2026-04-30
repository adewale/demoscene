# Cloudflare Product → Lucide Icon Mapping

A mapping of Cloudflare developer-platform products to [Lucide](https://lucide.dev) icon names, as used in the `demoscene` project.

| Product | Key | Lucide Icon | Description | Docs |
| --- | --- | --- | --- | --- |
| Workers | `workers` | `Cpu` | Deploy serverless code globally on the Cloudflare edge. | [↗](https://developers.cloudflare.com/workers/) |
| Pages | `pages` | `FileText` | Deploy full-stack apps and static sites on Cloudflare Pages. | [↗](https://developers.cloudflare.com/pages/) |
| D1 | `d1` | `Database` | Use Cloudflare's serverless SQL database at the edge. | [↗](https://developers.cloudflare.com/d1/) |
| KV | `kv` | `Key` | Serve globally distributed key-value data with low latency. | [↗](https://developers.cloudflare.com/kv/) |
| R2 | `r2` | `Archive` | Store and serve objects with zero egress fees. | [↗](https://developers.cloudflare.com/r2/) |
| Durable Objects | `durable-objects` | `Lock` | Keep strongly consistent state close to your Worker logic. | [↗](https://developers.cloudflare.com/durable-objects/) |
| Queues | `queues` | `ListOrdered` | Move async work through managed message queues. | [↗](https://developers.cloudflare.com/queues/) |
| Workflows | `workflows` | `Workflow` | Orchestrate durable multi-step jobs with Workflows. | [↗](https://developers.cloudflare.com/workflows/) |
| Vectorize | `vectorize` | `Radar` | Search vector embeddings with Cloudflare Vectorize. | [↗](https://developers.cloudflare.com/vectorize/) |
| Workers AI | `ai` | `Brain` | Run AI models close to users with Workers AI. | [↗](https://developers.cloudflare.com/workers-ai/) |
| AI Gateway | `ai-gateway` | `Network` | Observe, cache, and control AI traffic with AI Gateway. | [↗](https://developers.cloudflare.com/ai-gateway/) |
| Browser Run | `browser-run` | `Monitor` | Automate headless browsers on Cloudflare with Browser Run. | [↗](https://developers.cloudflare.com/browser-run/) |
| Containers | `containers` | `Boxes` | Run serverless containers alongside Workers on Cloudflare. | [↗](https://developers.cloudflare.com/containers/) |
| Hyperdrive | `hyperdrive` | `Rocket` | Connect Workers to external databases with Hyperdrive. | [↗](https://developers.cloudflare.com/hyperdrive/) |
| Cloudflare Images | `images` | `Image` | Transform, optimize, and deliver images with Cloudflare Images. | [↗](https://developers.cloudflare.com/images/) |
| Email Workers | `email` | `Mail` | Send and receive email from Workers with Email Workers. | [↗](https://developers.cloudflare.com/email-routing/email-workers/) |
| Analytics Engine | `analytics-engine` | `ChartColumn` | Query analytics datasets from Workers with Analytics Engine. | [↗](https://developers.cloudflare.com/analytics/analytics-engine/) |
| Workers for Platforms | `workers-for-platforms` | `AppWindow` | Build multi-tenant Worker platforms with dispatch namespaces. | [↗](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/) |
| Secret Store | `secret-store` | `Vault` | Store reusable account-level secrets with Secrets Store. | [↗](https://developers.cloudflare.com/secrets-store/) |
| Realtime | `realtime` | `Radio` | Build real-time video and voice experiences with Cloudflare Realtime. | [↗](https://developers.cloudflare.com/realtime/) |
| Stream | `stream` | `Play` | Upload, encode, and deliver live and on-demand video with Stream. | [↗](https://developers.cloudflare.com/stream/) |
| Voice | `voice` | `AudioLines` | Add programmable voice experiences with Cloudflare's realtime stack. | [↗](https://developers.cloudflare.com/realtime/) |
| Sandboxes | `sandboxes` | `SquareDashed` | Run untrusted code in isolated environments with the Sandbox SDK. | [↗](https://developers.cloudflare.com/sandbox/) |
| Agents | `agents` | `Bot` | Build stateful AI agents on Cloudflare with the Agents SDK. | [↗](https://developers.cloudflare.com/agents/) |

## JSON

```json
[
  { "key": "workers", "label": "Workers", "icon": "Cpu" },
  { "key": "pages", "label": "Pages", "icon": "FileText" },
  { "key": "d1", "label": "D1", "icon": "Database" },
  { "key": "kv", "label": "KV", "icon": "Key" },
  { "key": "r2", "label": "R2", "icon": "Archive" },
  { "key": "durable-objects", "label": "Durable Objects", "icon": "Lock" },
  { "key": "queues", "label": "Queues", "icon": "ListOrdered" },
  { "key": "workflows", "label": "Workflows", "icon": "Workflow" },
  { "key": "vectorize", "label": "Vectorize", "icon": "Radar" },
  { "key": "ai", "label": "Workers AI", "icon": "Brain" },
  { "key": "ai-gateway", "label": "AI Gateway", "icon": "Network" },
  { "key": "browser-run", "label": "Browser Run", "icon": "Monitor" },
  { "key": "containers", "label": "Containers", "icon": "Boxes" },
  { "key": "hyperdrive", "label": "Hyperdrive", "icon": "Rocket" },
  { "key": "images", "label": "Cloudflare Images", "icon": "Image" },
  { "key": "email", "label": "Email Workers", "icon": "Mail" },
  { "key": "analytics-engine", "label": "Analytics Engine", "icon": "ChartColumn" },
  { "key": "workers-for-platforms", "label": "Workers for Platforms", "icon": "AppWindow" },
  { "key": "secret-store", "label": "Secret Store", "icon": "Vault" },
  { "key": "realtime", "label": "Realtime", "icon": "Radio" },
  { "key": "stream", "label": "Stream", "icon": "Play" },
  { "key": "voice", "label": "Voice", "icon": "AudioLines" },
  { "key": "sandboxes", "label": "Sandboxes", "icon": "SquareDashed" },
  { "key": "agents", "label": "Agents", "icon": "Bot" }
]
```

Source: [`src/lib/cloudflare-products.ts`](https://github.com/adewale/demoscene/blob/main/src/lib/cloudflare-products.ts)
