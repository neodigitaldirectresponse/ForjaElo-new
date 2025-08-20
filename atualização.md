#!/usr/bin/env bash
set -Eeuo pipefail

# {OBJETIVO_CENTRAL}: 01 — Setup CI Playwright para extensão rodando verde (24h)

EXT_DIR="${EXT_DIR:-./extension}"
export DEBIAN_FRONTEND=noninteractive

retry() { for i in 1 2 3; do "$@" && return 0 || { echo "retry $i/3"; sleep $((i*2)); }; done; return 1; }

# 1) Atualiza índices
retry apt-get update

# 2) Instala pacotes base (com detecção de t64)
install_pkg() { apt-get install -y --no-install-recommends "$@" ; }

# Mapas com/sem t64
PKGS_COMMON="curl ca-certificates git unzip xz-utils jq fonts-liberation \
  libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libxkbcommon0 libpango-1.0-0 libxshmfence1 xvfb"

# Tenta com t64; se falhar, tenta sem t64
try_with_t64() {
  install_pkg $PKGS_COMMON libasound2t64 libcups2t64 libatk-bridge2.0-0t64 || \
  install_pkg $PKGS_COMMON libasound2 libcups2 libatk-bridge2.0-0
}

retry try_with_t64

# 3) Limpa possíveis configs de proxy do npm que geram warn
npm config delete proxy || true
npm config delete https-proxy || true

# 4) Projeto Node: cria se não existir
[ -f package.json ] || { npm init -y; npm pkg set type="module"; }

# 5) Test stack: Playwright + Chromium empacotado (sem snap)
npm i -D @playwright/test playwright
npx playwright install --with-deps chromium

# 6) Smoke test (cria se não houver)
mkdir -p tests
[ -f tests/smoke.spec.ts ] || cat > tests/smoke.spec.ts <<'TS'
import { test, expect, chromium } from '@playwright/test';
test('carrega página com extensão', async () => {
  const EXT = process.env.EXT_DIR || './extension';
  const ctx = await chromium.launchPersistentContext('tmp-user', {
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const page = await ctx.newPage();
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/i);
  await ctx.close();
});
TS

# 7) Scripts npm úteis
npm set-script test "playwright test" || true
npm set-script test:smoke "playwright test tests/smoke.spec.ts" || true

echo "✅ Setup OK. Para rodar: EXT_DIR=${EXT_DIR} npm run test:smoke"
