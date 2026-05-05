#!/bin/bash
OUT="c:/project_github/kodo-agent-export/frontend/public/design-previews"

slugs=(
  claude mistral.ai elevenlabs ollama together.ai opencode.ai minimax voltagent cohere x.ai
  linear.app vercel cursor supabase raycast warp expo hashicorp sentry mintlify
  resend replicate composio posthog stripe coinbase revolut wise binance mastercard
  kraken apple airbnb spotify nike starbucks meta tesla bmw bmw-m ferrari
  lamborghini bugatti renault spacex figma framer webflow miro airtable clay
  theverge wired ibm intercom superhuman nvidia playstation mongodb sanity lovable
  clickhouse vodafone notion cal zapier runwayml notion pinterest shopify
)

for slug in "${slugs[@]}"; do
  safe="${slug//\./-}"
  out_file="$OUT/${safe}.html"
  if [ -f "$out_file" ]; then
    echo "SKIP $slug (exists)"
    continue
  fi
  echo "Scraping $slug..."
  firecrawl scrape "https://getdesign.md/design-md/${slug}/preview" --format rawHtml --wait-for 2000 -o "$out_file" 2>&1
  echo "Done: $slug -> ${safe}.html"
  sleep 1
done

echo "All done!"
