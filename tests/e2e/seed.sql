DELETE FROM repository_scan_state;
DELETE FROM project_products;
DELETE FROM projects;

INSERT INTO projects (
  slug,
  owner,
  repo,
  repo_url,
  repo_creation_order,
  repo_created_at,
  homepage_url,
  branch,
  wrangler_path,
  wrangler_format,
  readme_markdown,
  readme_preview_markdown,
  preview_image_url,
  first_seen_at,
  last_seen_at
) VALUES
  (
    'adewale/demoscene',
    'adewale',
    'demoscene',
    'https://github.com/adewale/demoscene',
    410,
    '2026-04-21T15:48:24.000Z',
    'https://demoscene.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# demoscene

Card-oriented feed for Cloudflare projects.

[Watch demo](https://www.loom.com/share/demoscene-preview)',
    'Card-oriented feed for Cloudflare projects.',
    'https://images.example.com/demoscene.png',
    '2026-04-21T15:48:24.000Z',
    '2026-04-22T09:00:00.000Z'
  ),
  (
    'adewale/edge-dashboard-kit',
    'adewale',
    'edge-dashboard-kit',
    'https://github.com/adewale/edge-dashboard-kit',
    402,
    '2026-04-20T18:12:00.000Z',
    'https://dashboard.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Edge Dashboard Kit

Realtime operations dashboard for Workers apps.',
    'Realtime operations dashboard for Workers apps.',
    'https://images.example.com/edge-dashboard-kit.png',
    '2026-04-20T18:12:00.000Z',
    '2026-04-22T08:30:00.000Z'
  ),
  (
    'craigsdennis/booth-duty',
    'craigsdennis',
    'booth-duty',
    'https://github.com/craigsdennis/booth-duty',
    398,
    '2026-04-18T07:06:50.000Z',
    'https://booth-duty.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Booth Duty

Voice-first event demo with prize flow.

[Watch demo](https://www.loom.com/share/booth-duty)',
    'Voice-first event demo with prize flow.',
    'https://images.example.com/booth-duty.png',
    '2026-04-18T07:06:50.000Z',
    '2026-04-22T08:15:00.000Z'
  ),
  (
    'craigsdennis/remote-mcp-starter',
    'craigsdennis',
    'remote-mcp-starter',
    'https://github.com/craigsdennis/remote-mcp-starter',
    391,
    '2026-04-17T11:42:00.000Z',
    'https://remote-mcp.example.com',
    'main',
    'wrangler.jsonc',
    'jsonc',
    '# Remote MCP Starter

Reference worker for remote MCP endpoints.',
    'Reference worker for remote MCP endpoints.',
    NULL,
    '2026-04-17T11:42:00.000Z',
    '2026-04-22T08:10:00.000Z'
  ),
  (
    'megaconfidence/web2kindle',
    'megaconfidence',
    'web2kindle',
    'https://github.com/megaconfidence/web2kindle',
    384,
    '2026-04-16T10:22:00.000Z',
    'https://web2kindle.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Web2Kindle

Send long-form articles to Kindle with one click.',
    'Send long-form articles to Kindle with one click.',
    'https://images.example.com/web2kindle.png',
    '2026-04-16T10:22:00.000Z',
    '2026-04-22T08:05:00.000Z'
  ),
  (
    'megaconfidence/bookworm-think-agent',
    'megaconfidence',
    'bookworm-think-agent',
    'https://github.com/megaconfidence/bookworm-think-agent',
    380,
    '2026-04-15T16:35:00.000Z',
    NULL,
    'main',
    'wrangler.jsonc',
    'jsonc',
    '# Bookworm Think Agent

Reading agent that annotates and summarizes docs.',
    'Reading agent that annotates and summarizes docs.',
    NULL,
    '2026-04-15T16:35:00.000Z',
    '2026-04-22T08:00:00.000Z'
  ),
  (
    'fayazara/fixtures',
    'fayazara',
    'fixtures',
    'https://github.com/fayazara/fixtures',
    376,
    '2026-04-14T07:41:03.000Z',
    'https://fixtures.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Fixtures

Minimal starter for React, Hono, and Workers.',
    'Minimal starter for React, Hono, and Workers.',
    'https://images.example.com/fixtures.png',
    '2026-04-14T07:41:03.000Z',
    '2026-04-22T07:55:00.000Z'
  ),
  (
    'jillesme/worker-notes',
    'jillesme',
    'worker-notes',
    'https://github.com/jillesme/worker-notes',
    372,
    '2026-04-13T09:00:00.000Z',
    'https://notes.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Worker Notes

Tiny note-taking app backed by D1 and Durable Objects.',
    'Tiny note-taking app backed by D1 and Durable Objects.',
    NULL,
    '2026-04-13T09:00:00.000Z',
    '2026-04-22T07:50:00.000Z'
  ),
  (
    'lauragift21/agents-deck',
    'lauragift21',
    'agents-deck',
    'https://github.com/lauragift21/agents-deck',
    368,
    '2026-04-12T11:22:00.000Z',
    'https://agents-deck.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Agents Deck

Slide-driven showcase for agent demos and links.',
    'Slide-driven showcase for agent demos and links.',
    'https://images.example.com/agents-deck.png',
    '2026-04-12T11:22:00.000Z',
    '2026-04-22T07:45:00.000Z'
  ),
  (
    'kristianfreeman/domainmcp',
    'kristianfreeman',
    'domainmcp',
    'https://github.com/kristianfreeman/domainmcp',
    360,
    '2026-04-11T14:45:00.000Z',
    NULL,
    'main',
    'wrangler.jsonc',
    'jsonc',
    '# domainmcp

DNS and domain automation with Workers and MCP.',
    'DNS and domain automation with Workers and MCP.',
    NULL,
    '2026-04-11T14:45:00.000Z',
    '2026-04-22T07:40:00.000Z'
  ),
  (
    'harshil1712/agentic-inbox',
    'harshil1712',
    'agentic-inbox',
    'https://github.com/harshil1712/agentic-inbox',
    356,
    '2026-04-10T21:40:25.000Z',
    'https://agentic-inbox.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Agentic Inbox

Self-hosted inbox with AI assistance and email routing.',
    'Self-hosted inbox with AI assistance and email routing.',
    'https://images.example.com/agentic-inbox.png',
    '2026-04-10T21:40:25.000Z',
    '2026-04-22T07:35:00.000Z'
  ),
  (
    'yusukebe/hono-workers-lab',
    'yusukebe',
    'hono-workers-lab',
    'https://github.com/yusukebe/hono-workers-lab',
    351,
    '2026-04-09T13:18:00.000Z',
    'https://hono-lab.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# Hono Workers Lab

Kitchen sink playground for Hono patterns on Workers.',
    'Kitchen sink playground for Hono patterns on Workers.',
    NULL,
    '2026-04-09T13:18:00.000Z',
    '2026-04-22T07:30:00.000Z'
  ),
  (
    'jamesqquick/ai-car-runner',
    'jamesqquick',
    'ai-car-runner',
    'https://github.com/jamesqquick/ai-car-runner',
    346,
    '2026-04-08T19:56:10.000Z',
    'https://ai-car-runner.example.com',
    'main',
    'wrangler.toml',
    'toml',
    '# AI Car Runner

Endless runner built with Workers, D1, and Durable Objects.',
    'Endless runner built with Workers, D1, and Durable Objects.',
    'https://images.example.com/ai-car-runner.png',
    '2026-04-08T19:56:10.000Z',
    '2026-04-22T07:25:00.000Z'
  ),
  (
    'zeke/edge-inventory-demo',
    'zeke',
    'edge-inventory-demo',
    'https://github.com/zeke/edge-inventory-demo',
    340,
    '2026-04-07T12:05:00.000Z',
    NULL,
    'main',
    'wrangler.toml',
    'toml',
    '# Edge Inventory Demo

Warehouse stock tracker with queue-backed updates.',
    'Warehouse stock tracker with queue-backed updates.',
    NULL,
    '2026-04-07T12:05:00.000Z',
    '2026-04-22T07:20:00.000Z'
  );

INSERT INTO project_products (project_slug, product_key, product_label) VALUES
  ('adewale/demoscene', 'workers', 'Workers'),
  ('adewale/demoscene', 'd1', 'D1'),
  ('adewale/edge-dashboard-kit', 'workers', 'Workers'),
  ('adewale/edge-dashboard-kit', 'realtime', 'Realtime'),
  ('adewale/edge-dashboard-kit', 'analytics-engine', 'Analytics Engine'),
  ('craigsdennis/booth-duty', 'workers', 'Workers'),
  ('craigsdennis/booth-duty', 'd1', 'D1'),
  ('craigsdennis/booth-duty', 'voice', 'Voice'),
  ('craigsdennis/booth-duty', 'agents', 'Agents'),
  ('craigsdennis/remote-mcp-starter', 'workers', 'Workers'),
  ('craigsdennis/remote-mcp-starter', 'agents', 'Agents'),
  ('megaconfidence/web2kindle', 'workers', 'Workers'),
  ('megaconfidence/web2kindle', 'browser-run', 'Browser Rendering'),
  ('megaconfidence/bookworm-think-agent', 'workers', 'Workers'),
  ('megaconfidence/bookworm-think-agent', 'agents', 'Agents'),
  ('megaconfidence/bookworm-think-agent', 'ai', 'Workers AI'),
  ('fayazara/fixtures', 'workers', 'Workers'),
  ('fayazara/fixtures', 'd1', 'D1'),
  ('jillesme/worker-notes', 'workers', 'Workers'),
  ('jillesme/worker-notes', 'd1', 'D1'),
  ('jillesme/worker-notes', 'durable-objects', 'Durable Objects'),
  ('lauragift21/agents-deck', 'workers', 'Workers'),
  ('lauragift21/agents-deck', 'agents', 'Agents'),
  ('kristianfreeman/domainmcp', 'workers', 'Workers'),
  ('kristianfreeman/domainmcp', 'hyperdrive', 'Hyperdrive'),
  ('harshil1712/agentic-inbox', 'workers', 'Workers'),
  ('harshil1712/agentic-inbox', 'r2', 'R2'),
  ('harshil1712/agentic-inbox', 'durable-objects', 'Durable Objects'),
  ('harshil1712/agentic-inbox', 'agents', 'Agents'),
  ('yusukebe/hono-workers-lab', 'workers', 'Workers'),
  ('yusukebe/hono-workers-lab', 'kv', 'KV'),
  ('jamesqquick/ai-car-runner', 'workers', 'Workers'),
  ('jamesqquick/ai-car-runner', 'd1', 'D1'),
  ('jamesqquick/ai-car-runner', 'durable-objects', 'Durable Objects'),
  ('jamesqquick/ai-car-runner', 'ai', 'Workers AI'),
  ('zeke/edge-inventory-demo', 'workers', 'Workers'),
  ('zeke/edge-inventory-demo', 'queues', 'Queues');
