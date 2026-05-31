#!/bin/bash
# v0.2.1 — Automated release audit. Run before every publish.
# Usage: bash scripts/release-audit.sh
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}PASS${NC} $1"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}FAIL${NC} $1"
    FAIL=$((FAIL+1))
  fi
}

echo "=== multiarena Release Audit ==="
echo ""

# ── Code ──────────────────────────────────────────────────────
echo "── Code ──"

npm run build > /dev/null 2>&1
check "TypeScript build (tsc)"

npm --prefix web run build > /dev/null 2>&1
check "Web build (Vite)"

npx vitest run --reporter=dot > /dev/null 2>&1
check "Main tests"

npm --prefix web run test -- --reporter=dot > /dev/null 2>&1
check "Web tests"

# ── Package ───────────────────────────────────────────────────
echo "── Package ──"

VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
echo "  Version: $VERSION"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
check "Version format valid"

PACK_COUNT=$(npm pack --dry-run 2>/dev/null | grep -c "notice")
[ "$PACK_COUNT" -gt 0 ]
check "npm pack succeeds"

npm pack --dry-run 2>/dev/null | grep -q "README.md"
check "README.md in package"

npm pack --dry-run 2>/dev/null | grep -q "CHANGELOG.md"
check "CHANGELOG.md in package"

npm pack --dry-run 2>/dev/null | grep -q "USER_GUIDE.md"
check "USER_GUIDE.md in package"

npm pack --dry-run 2>/dev/null | grep -q "web/dist/"
check "web/dist/ in package"

! npm pack --dry-run 2>/dev/null | grep -q "src/"
check "src/ NOT in package"

! npm pack --dry-run 2>/dev/null | grep -q "test/"
check "test/ NOT in package"

# ── Git ───────────────────────────────────────────────────────
echo "── Git ──"

[ -z "$(git status --porcelain)" ]
check "Working tree clean"

git ls-files --error-unmatch .gitignore > /dev/null 2>&1
check ".gitignore exists"

grep -q "^dist/" .gitignore
check "dist/ in .gitignore"

grep -q "^\.env$" .gitignore
check ".env in .gitignore"

# ── Documentation ─────────────────────────────────────────────
echo "── Documentation ──"

grep -q "## v$VERSION" CHANGELOG.md
check "CHANGELOG.md has v$VERSION entry"

grep -q "## v$VERSION" CHANGELOG_CN.md
check "CHANGELOG_CN.md has v$VERSION entry"

grep -q "### 关键升级" CHANGELOG.md
check "CHANGELOG.md v$VERSION uses three-section format"

grep -q "### 关键升级" CHANGELOG_CN.md
check "CHANGELOG_CN.md v$VERSION uses three-section format"

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo -e "${GREEN}READY FOR RELEASE${NC}" || echo -e "${RED}FIX BEFORE RELEASE${NC}"
exit $FAIL
