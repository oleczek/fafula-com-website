import { defineConfig } from 'astro/config';

// fafula.com v2 — dark, swarm hero. Fully static so crawlers see all content.
export default defineConfig({
  site: 'https://fafula.com',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
});
